"""
Retinal Biomarker Extraction Module

Uses OpenCV image processing to extract vascular biomarkers from retinal images:
  - Vessel density: blood vessel area / total retinal area
  - Vessel tortuosity: vessel curve complexity
  - Vessel width: average vascular width
  - Arteriovenous ratio (AVR): approximate ratio of arteriole to venule widths
  - Microvascular changes: composite score

Pipeline:
  1. Green channel extraction (best contrast for vessels)
  2. CLAHE enhancement
  3. Frangi vesselness filter for vessel segmentation
  4. Morphological skeleton for tortuosity / width measurement
"""

import numpy as np
import cv2
from typing import Dict


def extract_green_channel(image: np.ndarray) -> np.ndarray:
    """Extract the green channel — highest contrast for retinal vessels."""
    if len(image.shape) == 3:
        return image[:, :, 1]
    return image


ANALYSIS_SIZE = 768  # longest side used for vessel analysis (keeps Frangi fast and scale-consistent)


def resize_for_analysis(image_bgr: np.ndarray) -> np.ndarray:
    """Downscale large fundus photos so measurements are comparable across cameras."""
    h, w = image_bgr.shape[:2]
    scale = ANALYSIS_SIZE / max(h, w)
    if scale >= 1:
        return image_bgr
    return cv2.resize(image_bgr, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)


def fundus_mask(image_bgr: np.ndarray, erode_px: int = 6) -> np.ndarray:
    """
    Binary mask of the circular fundus field of view (255 inside, 0 outside).

    The rim is eroded so the bright FOV edge is not mistaken for a vessel.
    """
    red = image_bgr[:, :, 2] if image_bgr.ndim == 3 else image_bgr
    _, mask = cv2.threshold(red, 20, 255, cv2.THRESH_BINARY)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((15, 15), np.uint8))
    if erode_px > 0:
        mask = cv2.erode(mask, np.ones((erode_px * 2 + 1, erode_px * 2 + 1), np.uint8))
        # The fundus disc is often clipped by the frame; drop the frame margin too.
        mask[:erode_px, :] = 0
        mask[-erode_px:, :] = 0
        mask[:, :erode_px] = 0
        mask[:, -erode_px:] = 0
    return mask


def vesselness_map(image_bgr: np.ndarray, fov: np.ndarray | None = None) -> np.ndarray:
    """Normalised (0-1) Frangi vesselness response restricted to the fundus field of view."""
    from skimage.filters import frangi

    green = extract_green_channel(image_bgr)
    green = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(green)
    vessels = frangi(green, sigmas=range(1, 5), black_ridges=True)
    if fov is None:
        fov = fundus_mask(image_bgr)
    vessels[fov == 0] = 0
    # Normalise by a high percentile instead of the max so one bright artefact
    # does not suppress the whole vessel tree.
    inside = vessels[fov > 0]
    ref = np.percentile(inside, 99.5) if inside.size else vessels.max()
    return np.clip(vessels / (ref + 1e-8), 0, 1)


def segment_vessels(image_bgr: np.ndarray, fov: np.ndarray | None = None) -> np.ndarray:
    """
    Segment retinal blood vessels using Frangi vesselness filter.

    Returns a binary vessel mask (255 = vessel, 0 = background).
    """
    vessels = vesselness_map(image_bgr, fov)
    vessels = (vessels > 0.12).astype(np.uint8) * 255

    # Morphological cleanup: close small gaps, then drop isolated specks
    # (component area filter keeps thin vessels that MORPH_OPEN would erase).
    vessels = cv2.morphologyEx(vessels, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
    n, labels, stats, _ = cv2.connectedComponentsWithStats(vessels, connectivity=8)
    min_area = max(20, int(vessels.size * 0.00015))
    keep = np.zeros(n, dtype=bool)
    keep[1:] = stats[1:, cv2.CC_STAT_AREA] >= min_area
    return (keep[labels] * 255).astype(np.uint8)


def compute_vessel_density(vessel_mask: np.ndarray, fov: np.ndarray | None = None) -> float:
    """Vessel area / retinal field-of-view area (black background excluded)."""
    area = np.count_nonzero(fov) if fov is not None else vessel_mask.size
    if area == 0:
        return 0.0
    return float(np.count_nonzero(vessel_mask)) / area


def compute_vessel_width(vessel_mask: np.ndarray) -> float:
    """Average vessel width in pixels via distance transform on the skeleton."""
    skeleton = cv2.ximgproc.thinning(vessel_mask) if hasattr(cv2, 'ximgproc') else vessel_mask
    dist = cv2.distanceTransform(vessel_mask, cv2.DIST_L2, 5)
    if np.count_nonzero(skeleton) == 0:
        return 0.0
    return float(dist[skeleton > 0].mean())


def compute_tortuosity(vessel_mask: np.ndarray) -> float:
    """
    Mean distance-metric tortuosity (arc length / chord length) of vessel segments.

    The vessel mask is skeletonised, split into unbranched segments by removing
    branch points, and for every segment with two end points the centreline
    arc length is divided by the straight-line distance between its ends.
    A straight vessel scores 1.0. Returns the length-weighted mean (>= 1.0).
    """
    from skimage.morphology import skeletonize

    skel = skeletonize(vessel_mask > 0).astype(np.uint8)
    if skel.sum() == 0:
        return 1.0

    kernel = np.array([[1, 1, 1], [1, 0, 1], [1, 1, 1]], np.float32)
    neighbours = cv2.filter2D(skel, -1, kernel, borderType=cv2.BORDER_CONSTANT)
    branch = ((skel == 1) & (neighbours >= 3)).astype(np.uint8)
    branch = cv2.dilate(branch, np.ones((3, 3), np.uint8))
    segments = skel & (1 - branch)

    n, labels, stats, _ = cv2.connectedComponentsWithStats(segments, connectivity=8)
    seg_neighbours = cv2.filter2D(segments, -1, kernel, borderType=cv2.BORDER_CONSTANT)
    orth = np.array([[0, 1, 0], [1, 0, 1], [0, 1, 0]], np.float32)
    orth_n = cv2.filter2D(segments, -1, orth, borderType=cv2.BORDER_CONSTANT)

    total, weight = 0.0, 0.0
    for i in range(1, n):
        if stats[i, cv2.CC_STAT_AREA] < 15:
            continue
        x0, y0 = stats[i, cv2.CC_STAT_LEFT], stats[i, cv2.CC_STAT_TOP]
        w, h = stats[i, cv2.CC_STAT_WIDTH], stats[i, cv2.CC_STAT_HEIGHT]
        ys, xs = np.nonzero(labels[y0:y0 + h, x0:x0 + w] == i)
        ys, xs = ys + y0, xs + x0
        ends = [(y, x) for y, x in zip(ys, xs) if seg_neighbours[y, x] == 1]
        if len(ends) != 2:
            continue
        chord = float(np.hypot(ends[0][0] - ends[1][0], ends[0][1] - ends[1][1]))
        if chord < 10:
            continue
        # Arc length: orthogonal steps count 1, diagonal steps sqrt(2) (each edge seen twice)
        o = orth_n[ys, xs].sum() / 2.0
        d = (seg_neighbours[ys, xs].sum() - orth_n[ys, xs].sum()) / 2.0
        arc = o + d * np.sqrt(2)
        total += max(arc / chord, 1.0) * arc
        weight += arc
    return float(total / weight) if weight > 0 else 1.0


def compute_avr(vessel_mask: np.ndarray, width: float) -> float:
    """
    Approximate arteriovenous ratio.
    In a full implementation this requires artery/vein classification; here
    we approximate from the width distribution.
    """
    dist = cv2.distanceTransform(vessel_mask, cv2.DIST_L2, 5)
    widths = dist[vessel_mask > 0]
    if len(widths) == 0:
        return 0.7
    # Thinner vessels ~ arteries, thicker ~ veins
    median_w = np.median(widths)
    artery_w = widths[widths < median_w].mean() if np.any(widths < median_w) else median_w
    vein_w = widths[widths >= median_w].mean() if np.any(widths >= median_w) else median_w
    if vein_w == 0:
        return 0.7
    return float(np.clip(artery_w / vein_w, 0.3, 1.0))


def extract_biomarkers(image_bgr: np.ndarray) -> Dict[str, float]:
    """
    Extract all retinal vascular biomarkers from a fundus image.

    Returns:
        {
            "vessel_density": float (0-1),
            "vessel_thickness": float (0-1 normalized),
            "tortuosity": float (0-1 normalized),
            "arteriovenous_ratio": float (0.3-1.0),
            "microvascular_changes": float (0-1)
        }
    """
    image_bgr = resize_for_analysis(image_bgr)
    fov = fundus_mask(image_bgr)
    vessel_mask = segment_vessels(image_bgr, fov)

    vessel_density = compute_vessel_density(vessel_mask, fov)
    width_px = compute_vessel_width(vessel_mask)
    tortuosity_raw = compute_tortuosity(vessel_mask)
    avr = compute_avr(vessel_mask, width_px)

    # Normalize to 0-1 ranges
    vessel_thickness = float(np.clip(width_px / 5.0, 0, 1))
    # Retinal segment tortuosity is typically 1.0-1.2: map 1.0 -> 0 and 1.2+ -> 1
    tortuosity = float(np.clip((tortuosity_raw - 1.0) / 0.2, 0, 1))

    microvascular_changes = float(np.clip(
        0.2 + (1 - vessel_density) * 0.4 + tortuosity * 0.3 + abs(avr - 0.7) * 0.3,
        0, 1
    ))

    return {
        "vessel_density": round(float(vessel_density), 3),
        "vessel_thickness": round(vessel_thickness, 3),
        "tortuosity": round(tortuosity, 3),
        "arteriovenous_ratio": round(avr, 3),
        "microvascular_changes": round(microvascular_changes, 3),
    }

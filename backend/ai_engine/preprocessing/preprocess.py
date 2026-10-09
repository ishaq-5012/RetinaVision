"""
Image Preprocessing Module for CardioVisionAI

Pipeline:
  1. Read retinal fundus image
  2. Remove black borders (crop to non-zero region)
  3. Resize to 224×224
  4. Apply CLAHE contrast enhancement on L channel of LAB
  5. Gaussian noise removal
  6. Normalize pixel values to 0-1
  7. Convert to TensorFlow tensor format (1, 224, 224, 3)

Usage:
  tensor = preprocess_image("path/to/fundus.jpg")
"""

import numpy as np
import cv2
from typing import Tuple

TARGET_SIZE = (224, 224)


def remove_black_borders(image: np.ndarray) -> np.ndarray:
    """Crop to the bounding box of non-zero pixels."""
    if len(image.shape) == 3:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    else:
        gray = image
    _, thresh = cv2.threshold(gray, 10, 255, cv2.THRESH_BINARY)
    coords = cv2.findNonZero(thresh)
    if coords is None:
        return image
    x, y, w, h = cv2.boundingRect(coords)
    return image[y:y + h, x:x + w]


def apply_clahe(image: np.ndarray) -> np.ndarray:
    """Apply CLAHE on the L channel of LAB color space."""
    lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    l = clahe.apply(l)
    merged = cv2.merge((l, a, b))
    return cv2.cvtColor(merged, cv2.COLOR_LAB2BGR)


def denoise(image: np.ndarray) -> np.ndarray:
    """Gaussian filtering for noise removal."""
    return cv2.GaussianBlur(image, (3, 3), 0)


def preprocess_image(image_path: str) -> np.ndarray:
    """
    Full preprocessing pipeline.

    Returns a float32 numpy array of shape (1, 224, 224, 3), normalized 0-1.
    """
    image = cv2.imread(image_path)
    if image is None:
        raise ValueError(f"Could not read image: {image_path}")

    image = remove_black_borders(image)
    image = cv2.resize(image, TARGET_SIZE, interpolation=cv2.INTER_AREA)
    image = apply_clahe(image)
    image = denoise(image)
    image = image.astype(np.float32) / 255.0
    # Add batch dimension: (1, 224, 224, 3)
    return np.expand_dims(image, axis=0)


def preprocess_array(image_bgr: np.ndarray) -> np.ndarray:
    """Preprocess an in-memory BGR array (same pipeline, no file I/O)."""
    image = remove_black_borders(image_bgr)
    image = cv2.resize(image, TARGET_SIZE, interpolation=cv2.INTER_AREA)
    image = apply_clahe(image)
    image = denoise(image)
    image = image.astype(np.float32) / 255.0
    return np.expand_dims(image, axis=0)


def assess_image_quality(image_bgr: np.ndarray) -> dict:
    """
    Objective OpenCV image-quality checks for a fundus photograph.

    Measures (inside the circular field of view):
      - sharpness: variance of the Laplacian of the green channel
      - brightness: mean intensity of the green channel
      - contrast: standard deviation of the green channel
      - field_coverage: fraction of the frame occupied by the fundus

    Returns {"label": "good" | "acceptable" | "poor", "issues": [...], "metrics": {...}}.
    """
    from ai_engine.biomarkers.extraction import fundus_mask, resize_for_analysis

    img = resize_for_analysis(image_bgr)
    fov = fundus_mask(img, erode_px=6)
    green = img[:, :, 1] if img.ndim == 3 else img
    inside = fov > 0
    coverage = float(inside.mean())

    if inside.sum() < 1000:
        return {
            "label": "poor",
            "issues": ["No retinal field of view detected - image may not be a fundus photograph."],
            "metrics": {"sharpness": 0.0, "brightness": 0.0, "contrast": 0.0, "field_coverage": round(coverage, 3)},
        }

    lap = cv2.Laplacian(green, cv2.CV_64F)
    sharpness = float(lap[inside].var())
    brightness = float(green[inside].mean())
    contrast = float(green[inside].std())

    issues = []
    if sharpness < 4:
        issues.append("Image appears blurred (low edge detail).")
    if brightness < 35:
        issues.append("Image is underexposed (too dark).")
    elif brightness > 200:
        issues.append("Image is overexposed (too bright).")
    if contrast < 12:
        issues.append("Low contrast between vessels and background.")
    if coverage < 0.25:
        issues.append("Retina occupies a small part of the frame.")

    label = "good" if not issues else "acceptable" if len(issues) == 1 else "poor"
    return {
        "label": label,
        "issues": issues,
        "metrics": {
            "sharpness": round(sharpness, 2),
            "brightness": round(brightness, 1),
            "contrast": round(contrast, 1),
            "field_coverage": round(coverage, 3),
        },
    }

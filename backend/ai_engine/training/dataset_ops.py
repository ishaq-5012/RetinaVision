"""Shared dataset scanning: loads labels, checks integrity and gathers stats.

Used by the standalone scripts `validate_dataset.py` (pre-training sanity check)
and `dataset_stats.py` (statistics report). Pure pandas/OpenCV - no TF import,
so it is fast to run on large datasets.
"""

from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np
import pandas as pd

from ai_engine.training.config import CLASS_NAMES, LABEL_MAP
from ai_engine.training.dataset_io import IMAGE_EXTENSIONS, _parse_label


def _is_corrupt(image: np.ndarray | None) -> bool:
    if image is None:
        return True
    if image.ndim != 3 or image.shape[2] != 3:
        return True
    if image.shape[0] < 4 or image.shape[1] < 4:
        return True
    return False


def _read_image(path: Path):
    """Read an image as BGR (3-channel). Returns None when unreadable."""
    try:
        return cv2.imread(str(path), cv2.IMREAD_COLOR)
    except Exception:
        return None


def scan_dataset(data_dir: Path) -> dict:
    """Scan a CardioVisionAI dataset directory and report integrity issues.

    Detects: missing image files, unreadable/corrupt images, empty labels,
    unparsable labels, duplicate filenames, unknown subfolders and per-class
    counts with an imbalance ratio. Also records average resolution.

    Returns a report dict (JSON-serializable).
    """
    data_dir = Path(data_dir)
    images_dir = data_dir / "images"
    labels_csv = data_dir / "labels.csv"

    report = {
        "data_dir": str(data_dir),
        "mode": "csv" if labels_csv.exists() else "subfolders",
        "total_images": 0,
        "images_per_class": {name: 0 for name in CLASS_NAMES},
        "avg_width": 0.0,
        "avg_height": 0.0,
        "corrupted": [],
        "missing_files": [],
        "missing_labels": [],
        "invalid_labels": [],
        "duplicates": [],
        "unknown_folders": [],
        "imbalance_ratio": 1.0,
    }

    widths, heights = [], []
    seen_filenames: dict[str, int] = {}
    per_class: dict[int, int] = {i: 0 for i in range(len(CLASS_NAMES))}

    def _check_file(path: Path) -> bool:
        """File-level checks (exists, decodable). Returns True if readable."""
        if not path.exists():
            report["missing_files"].append(str(path))
            return False
        seen_filenames[str(path)] = seen_filenames.get(str(path), 0) + 1
        img = _read_image(path)
        if _is_corrupt(img):
            report["corrupted"].append(str(path))
            return False
        heights.append(img.shape[0])
        widths.append(img.shape[1])
        return True

    if labels_csv.exists():
        try:
            df = pd.read_csv(labels_csv)
        except Exception as exc:  # noqa: BLE001
            report["corrupted"].append(f"labels.csv unreadable: {exc}")
            return report
        for _, row in df.iterrows():
            filename = str(row.get("filename", "")).strip()
            raw_label = row.get("label")
            if not filename:
                report["missing_labels"].append({"filename": "", "reason": "empty filename"})
                continue
            path = images_dir / filename
            ok = _check_file(path)
            if pd.isna(raw_label) or str(raw_label).strip() == "":
                report["missing_labels"].append({"filename": filename, "reason": "empty label"})
                continue
            try:
                label_idx = _parse_label(raw_label)
            except ValueError:
                report["invalid_labels"].append({"filename": filename, "label": str(raw_label)})
                continue
            if not ok:
                continue
            report["total_images"] += 1
            per_class[label_idx] = per_class.get(label_idx, 0) + 1
    else:
        if not images_dir.exists():
            report["missing_files"].append(str(images_dir))
            return report
        for label_dir in sorted(images_dir.iterdir()):
            if not label_dir.is_dir():
                continue
            try:
                label_idx = _parse_label(label_dir.name)
            except ValueError:
                report["unknown_folders"].append(str(label_dir))
                continue
            for f in sorted(label_dir.iterdir()):
                if f.suffix.lower() not in IMAGE_EXTENSIONS:
                    continue
                if _check_file(f):
                    report["total_images"] += 1
                    per_class[label_idx] = per_class.get(label_idx, 0) + 1

    report["duplicates"] = [name for name, count in seen_filenames.items() if count > 1]
    for idx, count in per_class.items():
        report["images_per_class"][CLASS_NAMES[idx]] = count

    if widths:
        report["avg_width"] = round(float(np.mean(widths)), 1)
        report["avg_height"] = round(float(np.mean(heights)), 1)

    counts = [c for c in per_class.values() if c > 0]
    if counts:
        report["imbalance_ratio"] = round(max(counts) / min(counts), 2)

    return report


def summarize_scan(report: dict) -> str:
    """Return a human-readable summary of a scan report."""
    lines = [
        f"Dataset:        {report['data_dir']}",
        f"Mode:           {report['mode']}",
        f"Total images:   {report['total_images']}",
        f"Per class:      {report['images_per_class']}",
        f"Avg resolution: {report['avg_width']} x {report['avg_height']}",
        f"Corrupted:      {len(report['corrupted'])}",
        f"Missing files:  {len(report['missing_files'])}",
        f"Missing labels: {len(report['missing_labels'])}",
        f"Invalid labels: {len(report['invalid_labels'])}",
        f"Duplicates:     {len(report['duplicates'])}",
        f"Unknown folders:{len(report['unknown_folders'])}",
        f"Imbalance ratio:{report['imbalance_ratio']}",
    ]
    return "\n".join(lines)

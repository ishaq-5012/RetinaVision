"""Validate a labelled dataset before training.

Checks:
  - Missing labels (empty cells / unparsable values)
  - Invalid image paths (referenced files that do not exist)
  - Duplicate records (same filename listed more than once)
  - Corrupted images (unreadable / wrong shape)
  - Class imbalance (per-class counts + imbalance ratio)

Usage (from backend/):

    python -m ai_engine.training.validate_dataset [--data-dir dataset] [--report validation_report.json]

Exit codes:
    0 - dataset OK (warnings only)
    1 - fatal errors found (do not train)
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from ai_engine.training.config import DEFAULT_DATA_DIR, CLASS_NAMES
from ai_engine.training.dataset_ops import scan_dataset, summarize_scan

IMBALANCE_WARN_THRESHOLD = 3.0
MIN_PER_CLASS_WARN = 10


def build_validation_report(scan: dict) -> dict:
    """Turn a raw scan into a validation verdict."""
    issues = []
    fatal = []

    if scan["missing_files"]:
        fatal.append(f"{len(scan['missing_files'])} referenced image file(s) do not exist.")
    if scan["missing_labels"]:
        fatal.append(f"{len(scan['missing_labels'])} record(s) have a missing/empty label.")
    if scan["invalid_labels"]:
        fatal.append(f"{len(scan['invalid_labels'])} record(s) have an unparsable label.")
    if scan["corrupted"]:
        fatal.append(f"{len(scan['corrupted'])} image(s) could not be decoded / are corrupt.")
    if scan["duplicates"]:
        fatal.append(f"{len(scan['duplicates'])} duplicate filename(s) found.")

    if scan["unknown_folders"]:
        issues.append(f"{len(scan['unknown_folders'])} unknown subfolder(s) ignored: {scan['unknown_folders'][:3]}")

    if scan["total_images"] == 0:
        fatal.append("No valid images found.")

    counts = {k: v for k, v in scan["images_per_class"].items() if v > 0}
    min_count = min(counts.values()) if counts else 0
    for name in CLASS_NAMES:
        if scan["images_per_class"][name] == 0:
            issues.append(f"Class '{name}' has no images.")
    if counts and min_count < MIN_PER_CLASS_WARN:
        issues.append(
            f"Smallest class has only {min_count} images (recommend >= {MIN_PER_CLASS_WARN} per class)."
        )
    if scan["imbalance_ratio"] >= IMBALANCE_WARN_THRESHOLD:
        issues.append(
            f"Class imbalance ratio {scan['imbalance_ratio']} exceeds {IMBALANCE_WARN_THRESHOLD}. "
            "Class weighting will be applied during training."
        )

    report = {
        **scan,
        "imbalance_warn_threshold": IMBALANCE_WARN_THRESHOLD,
        "min_per_class_warn": MIN_PER_CLASS_WARN,
        "issues": issues,
        "fatal_errors": fatal,
        "status": "FAIL" if fatal else ("WARN" if issues else "OK"),
    }
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate a labelled dataset before training.")
    parser.add_argument("--data-dir", default=str(DEFAULT_DATA_DIR))
    parser.add_argument("--report", default=None, help="Where to write validation_report.json (default: <data-dir>/validation_report.json).")
    args = parser.parse_args()

    data_dir = Path(args.data_dir)
    report_path = Path(args.report) if args.report else (data_dir / "validation_report.json")

    scan = scan_dataset(data_dir)
    report = build_validation_report(scan)

    print(summarize_scan(scan))
    print("\n--- Validation ---")
    for msg in report["fatal_errors"]:
        print(f"  [FATAL] {msg}")
    for msg in report["issues"]:
        print(f"  [WARN ] {msg}")
    print(f"Status: {report['status']}")

    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"Validation report -> {report_path}")

    if report["status"] == "FAIL":
        print("\nDataset is NOT ready for training. Fix the FATAL issues above.")
        raise SystemExit(1)
    print("\nDataset OK. Proceed to preprocessing / split / training.")


if __name__ == "__main__":
    main()

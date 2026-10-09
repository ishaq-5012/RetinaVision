"""Print dataset statistics for a labelled dataset.

Displays:
  - Total images
  - Images per class
  - Average resolution
  - Corrupted files
  - Missing labels / missing files / duplicates

Usage (from backend/):

    python -m ai_engine.training.dataset_stats [--data-dir dataset] [--report dataset_stats.json]
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from ai_engine.training.config import DEFAULT_DATA_DIR
from ai_engine.training.dataset_ops import scan_dataset, summarize_scan


def main() -> None:
    parser = argparse.ArgumentParser(description="Print dataset statistics.")
    parser.add_argument("--data-dir", default=str(DEFAULT_DATA_DIR))
    parser.add_argument("--report", default=None, help="Where to write dataset_stats.json (default: <data-dir>/dataset_stats.json).")
    args = parser.parse_args()

    data_dir = Path(args.data_dir)
    report_path = Path(args.report) if args.report else (data_dir / "dataset_stats.json")

    scan = scan_dataset(data_dir)

    print("\n=== CardioVisionAI Dataset Statistics ===\n")
    print(summarize_scan(scan))

    counts = {k: v for k, v in scan["images_per_class"].items() if v > 0}
    if counts:
        total = sum(counts.values())
        print("\nPer-class share:")
        for name, count in sorted(counts.items(), key=lambda kv: -kv[1]):
            print(f"  {name:<14} {count:>6}  ({count / total * 100:.1f}%)")

    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(scan, indent=2), encoding="utf-8")
    print(f"\nStatistics report -> {report_path}")


if __name__ == "__main__":
    main()

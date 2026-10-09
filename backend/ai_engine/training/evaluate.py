"""Full evaluation: metrics + confusion matrix + ROC curves + report.

Usage (from backend/):

    python -m ai_engine.training.evaluate [--checkpoint path/to/model.keras]

Outputs (in training_output/):
    evaluation_report.json
    plots/confusion_matrix.png
    plots/roc_curves.png
"""

from __future__ import annotations

import argparse

import numpy as np
import tensorflow as tf
from tensorflow import keras

from ai_engine.training.config import TrainingConfig
from ai_engine.training.dataset import build_datasets
from ai_engine.training.utils import (
    compute_metrics,
    save_confusion_matrix,
    save_json_report,
    save_roc_curves,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Evaluate a trained model.")
    parser.add_argument("--data-dir", default=None)
    parser.add_argument("--output-dir", default=None, help="Where to write the report and plots.")
    parser.add_argument("--checkpoint", default=None, help=".keras file (default: best_model.keras)")
    parser.add_argument("--batch-size", type=int, default=None)
    parser.add_argument("--use-clinical", action="store_true")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    cfg = TrainingConfig()
    if args.data_dir:
        cfg.data_dir = args.data_dir
    if args.output_dir:
        cfg.output_dir = args.output_dir
    if args.batch_size:
        cfg.batch_size = args.batch_size
    if args.use_clinical:
        cfg.use_clinical = True
    cfg.resolve_paths()

    model_path = args.checkpoint or str(cfg.best_model_path)
    model = keras.models.load_model(model_path)
    print(f"Loaded model from {model_path}")

    _, val_ds, test_ds, metadata = build_datasets(cfg)
    class_names = metadata["class_names"]

    for split_name, ds in (("validation", val_ds), ("test", test_ds)):
        y_true, y_probs = [], []
        for x, y in ds:
            y_probs.extend(model.predict(x, verbose=0).tolist())
            y_true.extend(y.numpy().tolist())
        y_true = np.array(y_true)
        y_probs = np.array(y_probs)

        report = compute_metrics(y_true, y_probs, class_names)
        report["split"] = split_name
        report["samples"] = int(len(y_true))
        print(f"\n=== {split_name} (n={len(y_true)}) ===")
        print(f"Accuracy: {report['accuracy']}  Macro F1: {report['macro_f1']}")
        print(report["classification_report"])

        save_confusion_matrix(y_true, y_probs, class_names, cfg.plots_dir / f"confusion_matrix_{split_name}.png")
        save_roc_curves(y_true, y_probs, class_names, cfg.plots_dir / f"roc_curves_{split_name}.png")

        combined_path = cfg.report_path
        if combined_path.exists():
            import json as _json

            combined = _json.loads(combined_path.read_text(encoding="utf-8"))
        else:
            combined = {}
        combined[f"{split_name}"] = report
        save_json_report(combined, combined_path)

    print(f"\nReport saved -> {cfg.report_path}")
    print(f"Plots saved   -> {cfg.plots_dir}")


if __name__ == "__main__":
    main()

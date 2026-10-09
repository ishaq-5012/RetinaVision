"""Validate a trained model on the validation (and test) splits.

Usage (from backend/):

    python -m ai_engine.training.validate [--checkpoint path/to/model.keras]
"""

from __future__ import annotations

import argparse

import numpy as np
import tensorflow as tf
from tensorflow import keras

from ai_engine.training.config import TrainingConfig
from ai_engine.training.dataset import build_datasets
from ai_engine.training.utils import compute_metrics


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Validate a trained model.")
    parser.add_argument("--data-dir", default=None)
    parser.add_argument("--output-dir", default=None, help="Where training artifacts live (defaults to training_output).")
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

    for name, ds in (("Validation", val_ds), ("Test", test_ds)):
        y_true, y_probs = [], []
        for x, y in ds:
            probs = model.predict(x, verbose=0)
            y_true.extend(y.numpy().tolist())
            y_probs.extend(probs.tolist())
        report = compute_metrics(
            np.array(y_true), np.array(y_probs), metadata["class_names"]
        )
        print(f"\n=== {name} split ===")
        print(f"Accuracy:        {report['accuracy']}")
        print(f"Macro Precision: {report['macro_precision']}")
        print(f"Macro Recall:    {report['macro_recall']}")
        print(f"Macro F1:        {report['macro_f1']}")
        print(report["classification_report"])


if __name__ == "__main__":
    main()

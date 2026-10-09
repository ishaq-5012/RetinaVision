"""Training entry point for the CardioVisionAI retinal risk model.

Usage (from backend/):

    python -m ai_engine.training.train --data-dir dataset

Loads optional overrides from `ai_engine/training/config.yaml` (or --config).
CLI flags always win over YAML values.

Artifacts (in training_output/):
    history.json                 per-epoch metrics
    training_report.json         consolidated metrics + timing + model size
    TRAINING_REPORT.md           human-readable report
    checkpoints/best_model.keras best epoch checkpoint only
    model.keras / model.h5 / saved_model/
    logs/                        TensorBoard logs
    plots/                       confusion matrix + ROC curves (test)
    gradcam/                     Grad-CAM samples on validation images
    ai_engine/models/efficientnet_model.h5   deployable (auto-loaded by the API)

Callbacks: TensorBoard, EarlyStopping, ReduceLROnPlateau, ModelCheckpoint
(save_best_only), CSVLogger. Uses the stratified 70/15/15 split from
dataset/splits/ when present (see split_dataset.py), otherwise splits on the fly.
"""

from __future__ import annotations

import argparse
import json
import os
import random
import time
from dataclasses import asdict
from pathlib import Path

import numpy as np
import tensorflow as tf
from tensorflow import keras

os.environ["TF_CPP_MIN_LOG_LEVEL"] = "2"

from ai_engine.training.config import DEFAULT_CONFIG_PATH, TrainingConfig  # noqa: E402
from ai_engine.training.dataset import build_datasets  # noqa: E402
from ai_engine.training.export import export_model  # noqa: E402
from ai_engine.training.model import compile_model, build_model  # noqa: E402
from ai_engine.training import utils  # noqa: E402


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train the CardioVisionAI retinal risk model.")
    parser.add_argument("--config", default=None, help="YAML config overrides (default: training/config.yaml).")
    parser.add_argument("--data-dir", default=None, help="Path to the labelled dataset folder.")
    parser.add_argument("--output-dir", default=None, help="Artifact output directory.")
    parser.add_argument("--image-size", type=int, default=None)
    parser.add_argument("--batch-size", type=int, default=None)
    parser.add_argument("--epochs", type=int, default=None)
    parser.add_argument("--learning-rate", type=float, default=None)
    parser.add_argument("--optimizer", default=None, help="adam | adamw | sgd")
    parser.add_argument("--val-split", type=float, default=None)
    parser.add_argument("--test-split", type=float, default=None)
    parser.add_argument("--seed", type=int, default=None)
    parser.add_argument("--weights", default=None, help="imagenet or None.")
    parser.add_argument("--train-backbone", action="store_true")
    parser.add_argument("--fine-tune-layers", type=int, default=None, help="Unfreeze the last N backbone layers.")
    parser.add_argument("--no-augment", action="store_true")
    parser.add_argument("--no-class-weights", action="store_true")
    parser.add_argument("--use-clinical", action="store_true")
    parser.add_argument("--preprocessed", action="store_true", help="Data is already preprocessed (dataset/processed).")
    parser.add_argument("--no-deploy", action="store_true", help="Do not write the deployable .h5 into ai_engine/models/.")
    parser.add_argument("--no-gradcam", action="store_true", help="Skip post-training Grad-CAM samples.")
    parser.add_argument("--label-smoothing", type=float, default=None)
    parser.add_argument("--early-stopping-patience", type=int, default=None)
    parser.add_argument("--reduce-lr-patience", type=int, default=None)
    parser.add_argument("--resume", default=None, help="Path to a checkpoint .keras to resume from.")
    return parser.parse_args()


def apply_args(cfg: TrainingConfig, args: argparse.Namespace) -> None:
    overrides = {
        "data_dir": args.data_dir,
        "output_dir": args.output_dir,
        "image_size": args.image_size,
        "batch_size": args.batch_size,
        "epochs": args.epochs,
        "learning_rate": args.learning_rate,
        "optimizer": args.optimizer,
        "val_split": args.val_split,
        "test_split": args.test_split,
        "seed": args.seed,
        "weights": args.weights,
        "fine_tune_layers": args.fine_tune_layers,
        "label_smoothing": args.label_smoothing,
        "early_stopping_patience": args.early_stopping_patience,
        "reduce_lr_patience": args.reduce_lr_patience,
        "resume_checkpoint": args.resume,
    }
    for key, value in overrides.items():
        if value is not None:
            if key == "weights" and str(value).lower() in ("none", "random"):
                value = None
            setattr(cfg, key, value)
    if args.train_backbone:
        cfg.train_backbone = True
    if args.no_augment:
        cfg.augment = False
    if args.no_class_weights:
        cfg.use_class_weights = False
    if args.use_clinical:
        cfg.use_clinical = True
    if args.preprocessed:
        cfg.preprocessed = True


def _evaluate_test(model, test_ds, class_names, cfg) -> tuple[dict, list[list[int]], str, str]:
    """Predict on the test set and produce metrics, confusion matrix + plots."""
    y_true, y_probs = [], []
    for x, y in test_ds:
        y_probs.extend(model.predict(x, verbose=0).tolist())
        y_true.extend(y.numpy().tolist())
    y_true = np.array(y_true)
    y_probs = np.array(y_probs)

    metrics = utils.compute_metrics(y_true, y_probs, class_names)
    cm = utils.confusion_matrix_values(y_true, y_probs, class_names)
    cm_path = cfg.plots_dir / "confusion_matrix_test.png"
    roc_path = cfg.plots_dir / "roc_curves_test.png"
    utils.save_confusion_matrix(y_true, y_probs, class_names, cm_path)
    utils.save_roc_curves(y_true, y_probs, class_names, roc_path)
    return metrics, cm, str(cm_path), str(roc_path)


def main() -> None:
    args = parse_args()
    cfg = TrainingConfig()

    config_path = Path(args.config) if args.config else DEFAULT_CONFIG_PATH
    if config_path.exists():
        cfg.apply_yaml(config_path)
        print(f"Loaded config overrides from {config_path}")
    apply_args(cfg, args)
    cfg.resolve_paths()

    random.seed(cfg.seed)
    np.random.seed(cfg.seed)
    tf.random.set_seed(cfg.seed)

    train_ds, val_ds, test_ds, metadata = build_datasets(cfg)

    if cfg.resume_checkpoint:
        model = keras.models.load_model(cfg.resume_checkpoint)
        print(f"Resumed from {cfg.resume_checkpoint}")
    else:
        model = build_model(cfg)
    compile_model(model, cfg)
    model.summary()

    callbacks = [
        keras.callbacks.TensorBoard(log_dir=str(cfg.logs_dir), histogram_freq=1),
        keras.callbacks.EarlyStopping(
            monitor="val_loss", patience=cfg.early_stopping_patience,
            restore_best_weights=True, verbose=1,
        ),
        keras.callbacks.ReduceLROnPlateau(
            monitor="val_loss", factor=cfg.reduce_lr_factor,
            patience=cfg.reduce_lr_patience, min_lr=cfg.min_lr, verbose=1,
        ),
        keras.callbacks.ModelCheckpoint(
            filepath=str(cfg.best_model_path), monitor="val_accuracy",
            save_best_only=True, save_weights_only=False, mode="max", verbose=1,
        ),
        keras.callbacks.CSVLogger(str(cfg.output_dir / "training_log.csv")),
    ]

    class_weight = metadata["class_weights"]
    t0 = time.time()
    history = model.fit(
        train_ds,
        validation_data=val_ds,
        epochs=cfg.epochs,
        initial_epoch=cfg.initial_epoch,
        steps_per_epoch=metadata["steps_per_epoch"],
        validation_steps=metadata["validation_steps"],
        callbacks=callbacks,
        class_weight=class_weight,
        verbose=1,
    )
    train_seconds = time.time() - t0

    cfg.history_path.write_text(json.dumps(history.history, indent=2), encoding="utf-8")
    print(f"Saved history -> {cfg.history_path}")

    t1 = time.time()
    test_metrics = None
    if metadata["test_samples"] > 0:
        test_metrics, cm, cm_path, roc_path = _evaluate_test(model, test_ds, metadata["class_names"], cfg)
        print("Test metrics:", {k: v for k, v in test_metrics.items() if k != "classification_report"})
    validation_seconds = time.time() - t1

    artifacts = export_model(cfg, deploy=not args.no_deploy)

    if not args.no_gradcam:
        from ai_engine.training.gradcam_samples import generate_gradcam_samples

        generate_gradcam_samples(cfg, seed=cfg.seed)

    # --- Consolidated training report ---
    model_sizes = {
        "best_model.keras": utils.format_file_size(cfg.best_model_path),
        "model.keras": utils.format_file_size(cfg.output_dir / "model.keras"),
        "model.h5": utils.format_file_size(cfg.output_dir / "model.h5"),
        "saved_model": sum(utils.format_file_size(p) for p in Path(cfg.output_dir / "saved_model").rglob("*")) if (cfg.output_dir / "saved_model").exists() else 0,
        "deploy_h5": utils.format_file_size(Path(artifacts.get("deploy_h5", ""))) if artifacts.get("deploy_h5") else 0,
    }
    report = utils.build_training_report(
        metrics=test_metrics or {},
        cm=cm if metadata["test_samples"] > 0 else [],
        class_names=metadata["class_names"],
        history=history.history,
        train_seconds=train_seconds,
        validation_seconds=validation_seconds,
        artifacts={**artifacts, "confusion_matrix": cm_path, "roc_curves": roc_path},
        model_sizes_bytes=model_sizes,
        config={k: (str(v) if isinstance(v, Path) else v) for k, v in asdict(cfg).items()},
    )
    report["status"] = "completed"
    report["metadata"] = metadata
    cfg.training_report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    utils.save_markdown_report(report, cfg.markdown_report_path)
    print(f"Training report -> {cfg.training_report_path}")
    print(f"Markdown report -> {cfg.markdown_report_path}")

    print("\nTraining complete.")
    print(f"Class distribution (train): {metadata['class_counts']}")
    print(f"Best model: {cfg.best_model_path}")
    print("View training curves: tensorboard --logdir", cfg.logs_dir)


if __name__ == "__main__":
    main()

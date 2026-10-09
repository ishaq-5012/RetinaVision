"""Export the trained model to .keras, SavedModel and the deployable .h5.

The deployable .h5 is written to backend/ai_engine/models/efficientnet_model.h5,
the exact path the FastAPI inference backend loads automatically at prediction
time (real EfficientNetB3 + real Grad-CAM path).
"""

from __future__ import annotations

import shutil
from pathlib import Path

import tensorflow as tf
from tensorflow import keras

from ai_engine.training.config import DEPLOY_MODEL_PATH, TrainingConfig
from ai_engine.training.model import build_model, get_last_conv_layer


def export_model(cfg: TrainingConfig, model_path: Path | None = None, deploy: bool = True) -> dict:
    """Export a trained model into all deployable formats.

    Args:
        cfg: training config (used for output paths).
        model_path: path to a trained .keras file (defaults to best_model.keras).
        deploy: also write the deployable .h5 into ai_engine/models/.

    Returns:
        dict of exported artifact paths.
    """
    cfg.resolve_paths()
    src = Path(model_path) if model_path else cfg.best_model_path
    if not src.exists():
        raise FileNotFoundError(f"No trained model found at {src}. Train first.")

    trained = keras.models.load_model(str(src))

    inputs = trained.inputs
    if len(inputs) != 1:
        raise ValueError(
            "The deployed backend loads a single-image-input model. Train with "
            "--use-clinical disabled to export for deployment."
        )
    if get_last_conv_layer(trained) not in {l.name for l in trained.layers}:
        raise ValueError("Model is missing the 'top_conv' layer required for Grad-CAM.")

    # Keras 3's legacy HDF5 saver deep-copies the model, which fails on models
    # restored with full training state. Rebuild a clean single-input model from
    # the training config and copy the trained weights over instead.
    model = build_model(cfg)
    if len(model.get_weights()) != len(trained.get_weights()):
        raise ValueError(
            "Architecture mismatch between the checkpoint and the training config. "
            "Train and export with the same --image-size / --use-clinical settings."
        )
    model.set_weights(trained.get_weights())

    keras_file = cfg.output_dir / "model.keras"
    model.save(str(keras_file))

    h5_file = cfg.output_dir / "model.h5"
    model.save(str(h5_file))

    saved_model_dir = cfg.output_dir / "saved_model"
    model.export(str(saved_model_dir))

    artifacts = {
        "keras": str(keras_file),
        "h5": str(h5_file),
        "saved_model": str(saved_model_dir),
    }
    if deploy:
        DEPLOY_MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
        model.save(str(DEPLOY_MODEL_PATH))
        artifacts["deploy_h5"] = str(DEPLOY_MODEL_PATH)
    for key, value in artifacts.items():
        print(f"Exported {key}: {value}")
    if deploy:
        print("INFO: inference backend will now use the real trained model automatically.")
    return artifacts


def install_existing_model(src: Path) -> Path:
    """Convenience: copy an already-trained .keras/.h5 into the deploy path."""
    src = Path(src)
    if not src.exists():
        raise FileNotFoundError(src)
    DEPLOY_MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(src, DEPLOY_MODEL_PATH)
    print(f"Installed {src} -> {DEPLOY_MODEL_PATH}")
    return DEPLOY_MODEL_PATH

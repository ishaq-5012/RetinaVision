"""Generate Grad-CAM visualizations for random validation images.

Run automatically at the end of `train.py` (disable with --no-gradcam), or
standalone:

    python -m ai_engine.training.gradcam_samples [--data-dir dataset] [--output-dir training_output]

Outputs (in training_output/gradcam/):
    <name>_original.png / <name>_heatmap.png / <name>_overlay.png
    index.json
"""

from __future__ import annotations

import argparse
import json
import random
from pathlib import Path

import cv2
import numpy as np
import tensorflow as tf
from tensorflow import keras

from ai_engine.training.config import DEFAULT_OUTPUT_DIR, TrainingConfig
from ai_engine.training.dataset import build_datasets
from ai_engine.training.gradcam import generate_gradcam, overlay_heatmap
from ai_engine.training.model import get_last_conv_layer
from ai_engine.training.preprocessing import to_model_input


def generate_gradcam_samples(
    cfg: TrainingConfig,
    checkpoint: str | None = None,
    n_samples: int = 4,
    seed: int = 42,
) -> list[dict]:
    """Pick random validation images, predict, and save Grad-CAM visualizations."""
    cfg.resolve_paths()
    model_path = checkpoint or str(cfg.best_model_path)
    if not Path(model_path).exists():
        print(f"SKIP Grad-CAM samples: no trained model at {model_path}")
        return []
    model = keras.models.load_model(model_path)
    _ = get_last_conv_layer(model)

    _, val_ds, _, metadata = build_datasets(cfg)
    if metadata["val_samples"] == 0:
        print("SKIP Grad-CAM samples: no validation split.")
        return []

    sample_paths = [row["path"] for row in _collect_paths(cfg, "val")]
    rng = random.Random(seed)
    selected = sample_paths
    if len(selected) > n_samples:
        selected = rng.sample(selected, n_samples)

    out_dir = cfg.output_dir / "gradcam"
    out_dir.mkdir(parents=True, exist_ok=True)
    results = []

    for path in selected:
        image_bgr = cv2.imread(str(path), cv2.IMREAD_COLOR)
        if image_bgr is None:
            continue
        rgb = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)
        tensor = to_model_input(rgb)
        probs = model.predict(tensor, verbose=0)[0]
        class_idx = int(np.argmax(probs))
        heatmap = generate_gradcam(model, tensor, class_idx)

        stem = Path(path).stem
        cv2.imwrite(str(out_dir / f"{stem}_original.png"), image_bgr)
        cv2.imwrite(
            str(out_dir / f"{stem}_heatmap.png"),
            cv2.applyColorMap(np.uint8(255 * heatmap), cv2.COLORMAP_JET),
        )
        cv2.imwrite(str(out_dir / f"{stem}_overlay.png"), overlay_heatmap(image_bgr, heatmap))

        results.append({
            "image": str(path),
            "predicted_class": metadata["class_names"][class_idx],
            "confidence": round(float(probs[class_idx]), 4),
            "probabilities": [round(float(p), 4) for p in probs],
            "original": str(out_dir / f"{stem}_original.png"),
            "heatmap": str(out_dir / f"{stem}_heatmap.png"),
            "overlay": str(out_dir / f"{stem}_overlay.png"),
        })
        print(f"  Grad-CAM {stem}: {results[-1]['predicted_class']} ({results[-1]['confidence']})")

    (out_dir / "index.json").write_text(json.dumps(results, indent=2), encoding="utf-8")
    print(f"Grad-CAM samples -> {out_dir} ({len(results)} images)")
    return results


def _collect_paths(cfg: TrainingConfig, split: str) -> list[dict]:
    """Return sample rows for a split by reading the split CSVs directly."""
    import pandas as pd

    if cfg.split_dir is not None:
        split_dir = Path(cfg.split_dir)
    else:
        split_dir = Path(cfg.data_dir) / "splits"
    csv = split_dir / f"{split}.csv"
    if csv.exists():
        df = pd.read_csv(csv)
        return df.to_dict(orient="records")
    return _split_from_dataset(cfg)


def _split_from_dataset(cfg: TrainingConfig) -> list[dict]:
    """Fallback: recompute a split using the same seed (small mismatch acceptable)."""
    from ai_engine.training.dataset import _split, load_labels

    df = load_labels(cfg.data_dir)
    _, val_df, _ = _split(df, cfg)
    return val_df.to_dict(orient="records")


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate Grad-CAM samples for validation images.")
    parser.add_argument("--data-dir", default=None)
    parser.add_argument("--output-dir", default=str(DEFAULT_OUTPUT_DIR))
    parser.add_argument("--checkpoint", default=None, help=".keras file (default: best_model.keras)")
    parser.add_argument("--samples", type=int, default=4)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    cfg = TrainingConfig()
    if args.data_dir:
        cfg.data_dir = args.data_dir
    cfg.output_dir = args.output_dir
    generate_gradcam_samples(cfg, checkpoint=args.checkpoint, n_samples=args.samples, seed=args.seed)


if __name__ == "__main__":
    main()

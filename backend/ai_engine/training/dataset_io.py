"""Pure-pandas dataset I/O (no TensorFlow dependency).

Loads labels, parses class names, encodes clinical rows and reads pre-computed
stratified split CSVs. Intentionally free of TensorFlow so that data-prep
scripts (validate_dataset, dataset_stats, preprocess_dataset, split_dataset)
stay fast and robust, even on machines where importing TF is slow or flaky.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

from ai_engine.training.config import LABEL_MAP

IMAGE_EXTENSIONS = (".jpg", ".jpeg", ".png", ".bmp")

CLINICAL_COLUMNS = [
    "age", "gender", "height_cm", "weight_kg", "systolic_bp", "diastolic_bp",
    "heart_rate", "smoking_status", "diabetes_history",
    "family_cardiac_history", "cholesterol_mgdl",
]


def _parse_label(raw) -> int:
    if isinstance(raw, (int, np.integer)):
        return int(raw)
    value = str(raw).strip().lower()
    if value in LABEL_MAP:
        return LABEL_MAP[value]
    try:
        parsed = int(value)
        if 0 <= parsed <= 2:
            return parsed
    except ValueError:
        pass
    raise ValueError(f"Cannot parse label {raw!r}. Use low/moderate/high or 0/1/2.")


def load_labels(data_dir) -> pd.DataFrame:
    """Return a DataFrame with `filename`, `label` (int) and clinical columns."""
    data_dir = Path(data_dir)
    images_dir = data_dir / "images"
    labels_csv = data_dir / "labels.csv"

    if labels_csv.exists():
        df = pd.read_csv(labels_csv)
        if "filename" not in df.columns or "label" not in df.columns:
            raise ValueError("labels.csv must contain 'filename' and 'label' columns.")
        df["label"] = df["label"].apply(_parse_label)
        df["path"] = df["filename"].apply(lambda f: str(images_dir / f))
    else:
        rows = []
        for label_dir in sorted(images_dir.iterdir()):
            if not label_dir.is_dir():
                continue
            label = _parse_label(label_dir.name)
            for f in sorted(label_dir.iterdir()):
                if f.suffix.lower() in IMAGE_EXTENSIONS:
                    rows.append({"filename": f.name, "label": label, "path": str(f)})
        if not rows:
            raise FileNotFoundError(
                f"No images found in {images_dir}. Add labelled images or a labels.csv."
            )
        df = pd.DataFrame(rows)

    missing = [p for p in df["path"] if not Path(p).exists()]
    if missing:
        raise FileNotFoundError(f"{len(missing)} image(s) referenced by labels do not exist, e.g. {missing[0]}")

    clinical_cols = [c for c in CLINICAL_COLUMNS if c in df.columns]
    if clinical_cols:
        df["has_clinical"] = True
    else:
        df["has_clinical"] = False
        df = df[["filename", "label", "path", "has_clinical"]]
    return df.reset_index(drop=True)


def encode_clinical_row(row) -> np.ndarray:
    """Encode a clinical row into a normalized 10-dim vector (matches inference)."""
    from ai_engine.clinical_model import encode_clinical_features

    def _bool(v):
        if isinstance(v, (bool, np.bool_)):
            return bool(v)
        if isinstance(v, (int, float, np.number)):
            return bool(v)
        return str(v).strip().lower() in ("1", "true", "yes")

    data = {
        "age": int(row.get("age", 45) or 45),
        "gender": str(row.get("gender", "male") or "male").lower(),
        "height_cm": float(row.get("height_cm", 170) or 170),
        "weight_kg": float(row.get("weight_kg", 70) or 70),
        "systolic_bp": int(row.get("systolic_bp", 120) or 120),
        "diastolic_bp": int(row.get("diastolic_bp", 80) or 80),
        "heart_rate": int(row.get("heart_rate", 72) or 72),
        "smoking_status": str(row.get("smoking_status", "never") or "never").lower(),
        "diabetes_history": _bool(row.get("diabetes_history", False)),
        "family_cardiac_history": _bool(row.get("family_cardiac_history", False)),
        "cholesterol_mgdl": float(row.get("cholesterol_mgdl", 180) or 180),
    }
    return encode_clinical_features(data)


def load_split(split_dir, data_dir=None) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """Load pre-computed stratified train/val/test CSVs (written by split_dataset.py).

    Each split CSV contains the columns of labels.csv plus a `path` column.
    """
    split_dir = Path(split_dir)
    data_dir = Path(data_dir) if data_dir else None
    parts = {}
    for name in ("train", "val", "test"):
        csv = split_dir / f"{name}.csv"
        if not csv.exists():
            raise FileNotFoundError(f"Split file not found: {csv}. Run split_dataset.py first.")
        df = pd.read_csv(csv)
        if "path" not in df.columns:
            df["path"] = df["filename"].apply(lambda f: str(data_dir / "images" / f))
        if "has_clinical" not in df.columns:
            df["has_clinical"] = any(c in df.columns for c in CLINICAL_COLUMNS)
        parts[name] = df.reset_index(drop=True)
    return parts["train"], parts["val"], parts["test"]

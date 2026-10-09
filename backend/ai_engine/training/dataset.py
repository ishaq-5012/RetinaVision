"""TensorFlow dataset loader for labelled retinal fundus data.

Supports two input layouts under `data_dir`:

1. CSV mode:
       data_dir/
         images/<filename>.jpg
         labels.csv        (filename,label[, clinical columns])

2. Subfolder mode:
       data_dir/
         images/low/<img>.jpg
         images/moderate/<img>.jpg
         images/high/<img>.jpg
     (or numeric folders 0/1/2)

Labels are mapped to ints via config.LABEL_MAP (low/moderate/high or 0/1/2).
Data is split into train / validation / test with stratification by label, or
loaded from pre-computed split CSVs (see split_dataset.py).

Pure pandas loading/splitting logic lives in dataset_io.py (no TF import).
"""

from __future__ import annotations

import math
import random
from pathlib import Path

import numpy as np
import pandas as pd
import tensorflow as tf

from ai_engine.training.augmentation import augment_uint8, normalize
from ai_engine.training.config import LABEL_MAP, TrainingConfig
from ai_engine.training.dataset_io import (
    CLINICAL_COLUMNS,
    IMAGE_EXTENSIONS,
    _parse_label,
    encode_clinical_row,
    load_labels,
    load_split,
)
from ai_engine.training.preprocessing import preprocess_uint8

LABEL_MAP  # re-exported for compatibility
IMAGE_EXTENSIONS
CLINICAL_COLUMNS


def _load_sample(path: str, label: int, clinical: np.ndarray | None, cfg: TrainingConfig, do_augment: bool):
    def _read(img_bytes):
        raw = tf.io.decode_image(img_bytes, channels=3, expand_animations=False)
        raw = tf.ensure_shape(raw, [None, None, 3])
        if cfg.preprocessed:
            return np.ascontiguousarray(raw.numpy())
        return preprocess_uint8(raw.numpy(), cfg.image_size)

    raw = tf.io.read_file(path)
    image = tf.numpy_function(_read, [raw], tf.uint8)
    image = tf.ensure_shape(image, [cfg.image_size, cfg.image_size, 3])
    if do_augment:
        image = augment_uint8(
            image,
            horizontal_flip=cfg.aug_horizontal_flip,
            vertical_flip=cfg.aug_vertical_flip,
            rotation_90=cfg.aug_rotation_90,
            brightness_delta=cfg.aug_brightness_delta,
            contrast_delta=cfg.aug_contrast_delta,
        )
    image = normalize(image)
    label = tf.cast(label, tf.int32)
    if cfg.use_clinical:
        return (image, tf.cast(clinical, tf.float32)), label
    return image, label


def _make_dataset(df: pd.DataFrame, cfg: TrainingConfig, do_augment: bool, shuffle: bool) -> tf.data.Dataset:
    paths = df["path"].tolist()
    labels = df["label"].tolist()
    clinicals = df.apply(encode_clinical_row, axis=1).tolist() if cfg.use_clinical else [None] * len(df)

    def gen():
        for p, l, c in zip(paths, labels, clinicals):
            yield p, int(l), (c if c is not None else np.zeros(10, dtype=np.float32))

    ds = tf.data.Dataset.from_generator(
        gen,
        output_signature=(
            tf.TensorSpec(shape=(), dtype=tf.string),
            tf.TensorSpec(shape=(), dtype=tf.int32),
            tf.TensorSpec(shape=(10,), dtype=tf.float32),
        ),
    )
    if shuffle:
        ds = ds.shuffle(buffer_size=len(df), seed=cfg.seed)
    ds = ds.map(
        lambda p, l, c: _load_sample(p, l, c, cfg, do_augment),
        num_parallel_calls=tf.data.AUTOTUNE,
    )
    if cfg.cache and not do_augment:
        ds = ds.cache()
    ds = ds.batch(cfg.batch_size, drop_remainder=False).prefetch(tf.data.AUTOTUNE)
    return ds


def _split_dir_for(cfg: TrainingConfig) -> Path | None:
    if cfg.split_dir is not None:
        return cfg.split_dir
    default = Path(cfg.data_dir) / "splits"
    return default if default.exists() else None


def _split(df: pd.DataFrame, cfg: TrainingConfig):
    df = df.sample(frac=1.0, random_state=cfg.seed).reset_index(drop=True)
    n_test = int(len(df) * cfg.test_split)
    n_val = int(len(df) * cfg.val_split)
    test_df = df.iloc[:n_test]
    val_df = df.iloc[n_test:n_test + n_val]
    train_df = df.iloc[n_test + n_val:]
    for name, part in (("train", train_df), ("val", val_df), ("test", test_df)):
        if part.empty:
            raise ValueError(f"Split '{name}' is empty. Dataset too small or splits too aggressive.")
    return train_df, val_df, test_df


def class_weights(train_df: pd.DataFrame, cfg: TrainingConfig) -> dict[int, float]:
    counts = train_df["label"].value_counts()
    total = counts.sum()
    return {int(k): round(total / (len(counts) * v), 4) for k, v in counts.items()}


def build_datasets(cfg: TrainingConfig):
    """Build train / validation / test tf.data.Datasets.

    Returns:
        (train_ds, val_ds, test_ds, metadata) where metadata is a dict with
        class counts, class names and (optionally) computed class weights.
    """
    cfg.resolve_paths()
    df = load_labels(cfg.data_dir)
    if cfg.use_clinical and not df["has_clinical"].any():
        raise ValueError("--use-clinical was set but no clinical columns found in the dataset.")

    split_dir = _split_dir_for(cfg)
    if split_dir is not None:
        train_df, val_df, test_df = load_split(split_dir, cfg.data_dir)
    else:
        train_df, val_df, test_df = _split(df, cfg)

    train_ds = _make_dataset(train_df, cfg, do_augment=cfg.augment, shuffle=True)
    val_ds = _make_dataset(val_df, cfg, do_augment=False, shuffle=False)
    test_ds = _make_dataset(test_df, cfg, do_augment=False, shuffle=False)

    counts = train_df["label"].value_counts().to_dict()
    weights = class_weights(train_df, cfg) if cfg.use_class_weights else None
    bs = max(1, cfg.batch_size)

    metadata = {
        "total_samples": int(len(df)),
        "train_samples": int(len(train_df)),
        "val_samples": int(len(val_df)),
        "test_samples": int(len(test_df)),
        "steps_per_epoch": math.ceil(len(train_df) / bs),
        "validation_steps": math.ceil(len(val_df) / bs),
        "test_steps": math.ceil(len(test_df) / bs),
        "class_counts": {int(k): int(v) for k, v in counts.items()},
        "class_names": cfg.class_names,
        "class_weights": weights,
    }
    return train_ds, val_ds, test_ds, metadata

"""Stratified train/validation/test split (70 / 15 / 15 by default).

Writes CSV manifests to <data-dir>/splits/ so every training/eval run uses the
exact same split:

    splits/train.csv
    splits/val.csv
    splits/test.csv

Each CSV carries the labels.csv columns plus a `path` column.

Usage (from backend/):

    python -m ai_engine.training.split_dataset [--data-dir dataset]
        [--val-split 0.15] [--test-split 0.15] [--seed 42]

Once the split exists, training automatically consumes it
(delete splits/ to re-split with a new seed).
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import pandas as pd
from sklearn.model_selection import train_test_split

from ai_engine.training.config import CLASS_NAMES, DEFAULT_DATA_DIR
from ai_engine.training.dataset_io import load_labels

SPLIT_SUBDIR = "splits"


def stratified_split(df: pd.DataFrame, val_split: float, test_split: float, seed: int):
    """Split into train/val/test keeping class proportions (stratified).

    Falls back to a plain random split when a class is too rare for
    stratification (fewer than 2 members).
    """
    try:
        train_df, rest = train_test_split(
            df, test_size=val_split + test_split, stratify=df["label"], random_state=seed
        )
        val_df, test_df = train_test_split(
            rest,
            test_size=test_split / (val_split + test_split),
            stratify=rest["label"],
            random_state=seed,
        )
    except ValueError:
        print("WARN: a class is too small for strict stratification; using random split.")
        train_df, rest = train_test_split(df, test_size=val_split + test_split, random_state=seed)
        val_df, test_df = train_test_split(rest, test_size=test_split / (val_split + test_split), random_state=seed)

    for name, part in (("train", train_df), ("val", val_df), ("test", test_df)):
        if part.empty:
            raise ValueError(f"Split '{name}' is empty. Dataset too small or splits too aggressive.")
    return train_df.reset_index(drop=True), val_df.reset_index(drop=True), test_df.reset_index(drop=True)


def main() -> None:
    parser = argparse.ArgumentParser(description="Stratified train/val/test split (70/15/15).")
    parser.add_argument("--data-dir", default=str(DEFAULT_DATA_DIR))
    parser.add_argument("--out-dir", default=None, help="Default: <data-dir>/splits")
    parser.add_argument("--val-split", type=float, default=0.15)
    parser.add_argument("--test-split", type=float, default=0.15)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    if args.val_split + args.test_split >= 0.9:
        raise ValueError("val_split + test_split must leave >= 10% for training.")

    data_dir = Path(args.data_dir)
    out_dir = Path(args.out_dir) if args.out_dir else (data_dir / SPLIT_SUBDIR)
    out_dir.mkdir(parents=True, exist_ok=True)

    df = load_labels(data_dir)
    train_df, val_df, test_df = stratified_split(df, args.val_split, args.test_split, args.seed)

    split_meta = {
        "source": str(data_dir),
        "seed": args.seed,
        "val_split": args.val_split,
        "test_split": args.test_split,
        "sizes": {
            "total": int(len(df)),
            "train": int(len(train_df)),
            "val": int(len(val_df)),
            "test": int(len(test_df)),
        },
        "per_class": {
            "train": train_df["label"].value_counts().to_dict(),
            "val": val_df["label"].value_counts().to_dict(),
            "test": test_df["label"].value_counts().to_dict(),
        },
    }
    (out_dir / "split_report.json").write_text(json.dumps(split_meta, indent=2), encoding="utf-8")

    for name, part in (("train", train_df), ("val", val_df), ("test", test_df)):
        csv = out_dir / f"{name}.csv"
        cols = [c for c in part.columns if c != "has_clinical"]
        part[cols].to_csv(csv, index=False)
        print(f"{name:<6} -> {csv}  ({len(part)} samples)")

    print("\nPer-class distribution:")
    for label_idx, label_name in enumerate(CLASS_NAMES):
        row = (
            f"  {label_name:<14} "
            f"train={(train_df['label'] == label_idx).sum()}  "
            f"val={(val_df['label'] == label_idx).sum()}  "
            f"test={(test_df['label'] == label_idx).sum()}"
        )
        print(row)
    print(f"\nSplit report -> {out_dir / 'split_report.json'}")


if __name__ == "__main__":
    main()

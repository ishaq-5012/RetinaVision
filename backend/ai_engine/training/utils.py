"""Metrics, plots and report helpers for model evaluation."""

from __future__ import annotations

import json
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
    roc_curve,
)


def compute_metrics(y_true: np.ndarray, y_probs: np.ndarray, class_names: list[str]) -> dict:
    """Compute accuracy, macro/weighted precision-recall-F1 and per-class metrics."""
    y_pred = np.argmax(y_probs, axis=1)
    report = {
        "accuracy": round(float(accuracy_score(y_true, y_pred)), 4),
        "macro_precision": round(float(precision_score(y_true, y_pred, average="macro", zero_division=0)), 4),
        "macro_recall": round(float(recall_score(y_true, y_pred, average="macro", zero_division=0)), 4),
        "macro_f1": round(float(f1_score(y_true, y_pred, average="macro", zero_division=0)), 4),
        "weighted_f1": round(float(f1_score(y_true, y_pred, average="weighted", zero_division=0)), 4),
        "classification_report": classification_report(y_true, y_pred, labels=list(range(len(class_names))), target_names=class_names, zero_division=0),
    }
    per_class_metrics = {}
    for i, name in enumerate(class_names):
        per_class_metrics[name] = {
            "precision": round(float(precision_score(y_true, y_pred, labels=[i], average="micro", zero_division=0)), 4),
            "recall": round(float(recall_score(y_true, y_pred, labels=[i], average="micro", zero_division=0)), 4),
            "f1": round(float(f1_score(y_true, y_pred, labels=[i], average="micro", zero_division=0)), 4),
        }
    report["per_class_metrics"] = per_class_metrics

    per_class_auc = {}
    auc_values = []
    for i, name in enumerate(class_names):
        try:
            auc = roc_auc_score((y_true == i).astype(int), y_probs[:, i])
        except ValueError:
            auc = float("nan")
        per_class_auc[name] = {"auc": round(float(auc), 4)}
        if not np.isnan(auc):
            auc_values.append(auc)
    report["per_class_auc"] = per_class_auc
    report["roc_auc_macro"] = round(float(np.mean(auc_values)), 4) if auc_values else None
    return report


def save_confusion_matrix(y_true: np.ndarray, y_probs: np.ndarray, class_names: list[str], path: Path) -> None:
    """Save a confusion-matrix heatmap PNG."""
    y_pred = np.argmax(y_probs, axis=1)
    cm = confusion_matrix(y_true, y_pred, labels=list(range(len(class_names))))
    fig, ax = plt.subplots(figsize=(7, 6))
    im = ax.imshow(cm, interpolation="nearest", cmap=plt.cm.Blues)
    ax.figure.colorbar(im, ax=ax)
    ax.set(xticks=list(range(len(class_names))), yticks=list(range(len(class_names))),
           xticklabels=class_names, yticklabels=class_names,
           xlabel="Predicted", ylabel="Actual", title="Confusion Matrix")
    for i in range(cm.shape[0]):
        for j in range(cm.shape[1]):
            ax.text(j, i, str(cm[i, j]), ha="center", va="center",
                    color="white" if cm[i, j] > cm.max() / 2 else "black")
    fig.tight_layout()
    fig.savefig(str(path), dpi=150)
    plt.close(fig)


def save_roc_curves(y_true: np.ndarray, y_probs: np.ndarray, class_names: list[str], path: Path) -> None:
    """Save one-vs-rest ROC curves PNG."""
    fig, ax = plt.subplots(figsize=(7, 6))
    y_true_bin = np.zeros((len(y_true), len(class_names)), dtype=int)
    for i in range(len(y_true)):
        y_true_bin[i, y_true[i]] = 1
    for i, name in enumerate(class_names):
        fpr, tpr, _ = roc_curve(y_true_bin[:, i], y_probs[:, i])
        try:
            auc = roc_auc_score(y_true_bin[:, i], y_probs[:, i])
        except ValueError:
            auc = float("nan")
        ax.plot(fpr, tpr, label=f"{name} (AUC={auc:.3f})")
    ax.plot([0, 1], [0, 1], "k--", linewidth=0.8)
    ax.set(xlabel="False Positive Rate", ylabel="True Positive Rate", title="ROC Curves (one-vs-rest)")
    ax.legend(loc="lower right")
    fig.tight_layout()
    fig.savefig(str(path), dpi=150)
    plt.close(fig)


def save_json_report(report: dict, path: Path) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, indent=2), encoding="utf-8")


def confusion_matrix_values(y_true: np.ndarray, y_probs: np.ndarray, class_names: list[str]) -> list[list[int]]:
    """Return the confusion matrix as a nested list (rows = true, cols = predicted)."""
    y_pred = np.argmax(y_probs, axis=1)
    cm = confusion_matrix(y_true, y_pred, labels=list(range(len(class_names))))
    return cm.astype(int).tolist()


def build_training_report(
    *,
    metrics: dict,
    cm: list[list[int]],
    class_names: list[str],
    history: dict,
    train_seconds: float,
    validation_seconds: float,
    artifacts: dict,
    model_sizes_bytes: dict,
    config: dict,
) -> dict:
    """Assemble the consolidated post-training report (JSON-serializable)."""
    epochs_trained = len(history.get("accuracy", []))
    report = {
        "metrics": metrics,
        "confusion_matrix": cm,
        "class_names": class_names,
        "history_summary": {
            "epochs_trained": epochs_trained,
            "best_val_accuracy": round(max(history.get("val_accuracy", [0])), 4),
            "best_val_loss": round(min(history.get("val_loss", [0])), 4),
            "final_train_accuracy": round(history.get("accuracy", [0])[-1], 4),
            "final_val_accuracy": round(history.get("val_accuracy", [0])[-1], 4) if history.get("val_accuracy") else None,
        },
        "timing_seconds": {
            "training": round(train_seconds, 2),
            "validation": round(validation_seconds, 2),
            "total": round(train_seconds + validation_seconds, 2),
        },
        "model_size_bytes": model_sizes_bytes,
        "artifacts": artifacts,
        "config": config,
    }
    return report


def save_markdown_report(report: dict, path: Path) -> None:
    """Render the training report as a Markdown document."""
    m = report["metrics"]
    lines = [
        "# CardioVisionAI Training Report",
        "",
        f"- Status: {report.get('status', 'completed')}",
        f"- Epochs trained: {report['history_summary']['epochs_trained']}",
        f"- Best validation accuracy: {report['history_summary']['best_val_accuracy']}",
        f"- Best validation loss: {report['history_summary']['best_val_loss']}",
        "",
        "## Metrics",
        "",
        "| Metric | Value |",
        "| --- | --- |",
        f"| Accuracy | {m.get('accuracy')} |",
        f"| Macro Precision | {m.get('macro_precision')} |",
        f"| Macro Recall | {m.get('macro_recall')} |",
        f"| Macro F1 | {m.get('macro_f1')} |",
        f"| Weighted F1 | {m.get('weighted_f1')} |",
        f"| ROC AUC (macro ovr) | {m.get('roc_auc_macro', 'n/a')} |",
        "",
        "### Per-class metrics",
        "",
        "| Class | Precision | Recall | F1 | ROC AUC |",
        "| --- | --- | --- | --- | --- |",
    ]
    per_class = m.get("per_class_metrics", {})
    aucs = m.get("per_class_auc", {})
    for name in report["class_names"]:
        pc = per_class.get(name, {})
        lines.append(
            f"| {name} | {pc.get('precision', 'n/a')} | {pc.get('recall', 'n/a')} | "
            f"{pc.get('f1', 'n/a')} | {aucs.get(name, {}).get('auc', 'n/a')} |"
        )

    lines += [
        "",
        "## Confusion Matrix (rows = actual, cols = predicted)",
        "",
        "```",
        f"    {'   '.join(report['class_names'])}",
    ]
    for row, name in zip(report["confusion_matrix"], report["class_names"]):
        lines.append(f"{name[:5]:<5} {row}")
    lines += [
        "```",
        "",
        "## Timing",
        "",
        f"- Training time: {report['timing_seconds']['training']} s",
        f"- Validation time: {report['timing_seconds']['validation']} s",
        f"- Total: {report['timing_seconds']['total']} s",
        "",
        "## Model size",
        "",
    ]
    for key, size in report["model_size_bytes"].items():
        lines.append(f"- {key}: {size / 1024 / 1024:.2f} MB")
    lines += ["", "## Artifacts", ""]
    for key, value in report["artifacts"].items():
        lines.append(f"- {key}: `{value}`")

    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def format_file_size(path) -> int:
    """Return file size in bytes, or 0 if the path does not exist."""
    p = Path(path)
    return p.stat().st_size if p.exists() else 0

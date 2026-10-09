"""Training configuration for the CardioVisionAI retinal risk model."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

try:
    import yaml
except ImportError:  # pragma: no cover
    yaml = None

BASE_DIR = Path(__file__).resolve().parents[2]
DEFAULT_DATA_DIR = BASE_DIR / "dataset"
DEFAULT_OUTPUT_DIR = BASE_DIR / "training_output"
DEPLOY_MODEL_PATH = BASE_DIR / "ai_engine" / "models" / "efficientnet_model.h5"
DEFAULT_CONFIG_PATH = Path(__file__).resolve().parent / "config.yaml"

CLASS_NAMES = ["Low Risk", "Moderate Risk", "High Risk"]
LABEL_MAP = {"low": 0, "moderate": 1, "high": 2}

# Flat mapping used when loading a YAML overrides file.
YAML_KEY_MAP = {
    "epochs": "epochs",
    "batch_size": "batch_size",
    "learning_rate": "learning_rate",
    "optimizer": "optimizer",
    "image_size": "image_size",
    "seed": "seed",
    "val_split": "val_split",
    "test_split": "test_split",
    "dropout": "dropout",
    "label_smoothing": "label_smoothing",
    "weights": "weights",
    "use_clinical": "use_clinical",
    "class_weights": "use_class_weights",
    "augment": "augment",
    "preprocessed": "preprocessed",
}


def load_yaml_config(path) -> dict:
    """Load a YAML training config and return a flat dict of overrides."""
    if yaml is None:
        raise RuntimeError("PyYAML is required to read config.yaml (pip install pyyaml).")
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(f"Config file not found: {path}")
    data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    overrides: dict = {}

    for key in ("epochs", "batch_size", "learning_rate", "optimizer", "image_size",
                "seed", "val_split", "test_split", "dropout", "label_smoothing",
                "weights", "use_clinical", "class_weights", "augment", "preprocessed"):
        if key in data:
            overrides[YAML_KEY_MAP[key]] = data[key]

    es = data.get("early_stopping") or {}
    if "patience" in es:
        overrides["early_stopping_patience"] = es["patience"]

    rl = data.get("reduce_lr") or {}
    if "patience" in rl:
        overrides["reduce_lr_patience"] = rl["patience"]
    if "factor" in rl:
        overrides["reduce_lr_factor"] = rl["factor"]
    if "min_lr" in rl:
        overrides["min_lr"] = rl["min_lr"]

    if "fine_tuning_layers" in data:
        overrides["fine_tune_layers"] = data["fine_tuning_layers"]

    aug = data.get("augmentation") or {}
    if aug and isinstance(aug, dict):
        overrides["augment"] = bool(aug.get("enabled", True))
        for k in ("horizontal_flip", "vertical_flip", "rotation_90", "brightness_delta", "contrast_delta"):
            if k in aug:
                overrides[f"aug_{k}"] = aug[k]

    return overrides


@dataclass
class TrainingConfig:
    data_dir: Path = DEFAULT_DATA_DIR
    output_dir: Path = DEFAULT_OUTPUT_DIR
    image_size: int = 224
    batch_size: int = 32
    epochs: int = 60
    learning_rate: float = 1e-3
    optimizer: str = "adam"
    val_split: float = 0.15
    test_split: float = 0.15
    seed: int = 42
    weights: str = "imagenet"
    train_backbone: bool = False
    unfreeze_from_layer: str = "block6a_expand_conv"
    fine_tune_layers: int | None = None
    dropout: float = 0.3
    label_smoothing: float = 0.1
    use_class_weights: bool = True
    early_stopping_patience: int = 10
    reduce_lr_patience: int = 4
    reduce_lr_factor: float = 0.2
    min_lr: float = 1e-6
    use_clinical: bool = False
    num_classes: int = 3
    class_names: list[str] = field(default_factory=lambda: list(CLASS_NAMES))
    augment: bool = True
    cache: bool = True
    preprocessed: bool = False
    split_dir: Path | None = None
    aug_horizontal_flip: bool = True
    aug_vertical_flip: bool = True
    aug_rotation_90: bool = True
    aug_brightness_delta: float = 0.1
    aug_contrast_delta: float = 0.2
    initial_epoch: int = 0
    resume_checkpoint: str | None = None

    def resolve_paths(self) -> None:
        self.data_dir = Path(self.data_dir)
        self.output_dir = Path(self.output_dir)
        if self.split_dir is not None:
            self.split_dir = Path(self.split_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.logs_dir = self.output_dir / "logs"
        self.checkpoint_dir = self.output_dir / "checkpoints"
        self.plots_dir = self.output_dir / "plots"
        self.saved_model_dir = self.output_dir / "saved_model"
        for d in (self.logs_dir, self.checkpoint_dir, self.plots_dir):
            d.mkdir(parents=True, exist_ok=True)

    def apply_yaml(self, path) -> None:
        """Merge overrides from a YAML config file into this config."""
        for key, value in load_yaml_config(path).items():
            setattr(self, key, value)

    @property
    def best_model_path(self) -> Path:
        return self.checkpoint_dir / "best_model.keras"

    @property
    def history_path(self) -> Path:
        return self.output_dir / "history.json"

    @property
    def report_path(self) -> Path:
        return self.output_dir / "evaluation_report.json"

    @property
    def training_report_path(self) -> Path:
        return self.output_dir / "training_report.json"

    @property
    def markdown_report_path(self) -> Path:
        return self.output_dir / "TRAINING_REPORT.md"

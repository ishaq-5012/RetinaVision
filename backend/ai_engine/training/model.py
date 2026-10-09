"""EfficientNetB3 transfer-learning model with optional clinical fusion head.

The image-only variant (default) is what the deployed FastAPI backend loads:
single input (224, 224, 3), 3-class softmax, with the backbone's final conv
layer named `top_conv` (required by the Grad-CAM implementation).
"""

from __future__ import annotations

import tensorflow as tf
from tensorflow import keras
from tensorflow.keras import layers

from ai_engine.training.config import TrainingConfig

NUM_CLINICAL_FEATURES = 10
LAST_CONV_LAYER = "top_conv"


def _image_backbone(cfg: TrainingConfig) -> keras.Model:
    base = keras.applications.EfficientNetB3(
        include_top=False,
        pooling=None,
        weights=cfg.weights,
        input_shape=(cfg.image_size, cfg.image_size, 3),
    )
    if cfg.train_backbone:
        base.trainable = True
        for layer in base.layers:
            if isinstance(layer, layers.BatchNormalization):
                layer.trainable = False
    else:
        base.trainable = False
    return base


def _image_head(features, cfg: TrainingConfig):
    x = layers.GlobalAveragePooling2D()(features)
    x = layers.Dropout(cfg.dropout)(x)
    x = layers.Dense(256, activation="relu")(x)
    x = layers.BatchNormalization()(x)
    x = layers.Dropout(cfg.dropout)(x)
    x = layers.Dense(64, activation="relu")(x)
    return x


def build_model(cfg: TrainingConfig) -> keras.Model:
    """Build the training model.

    If `cfg.use_clinical` is True the model has two inputs (image + 10-dim
    clinical vector) and a trainable fusion head; otherwise it is image-only.
    """
    base = _image_backbone(cfg)
    features = _image_head(base.output, cfg)

    if cfg.use_clinical:
        clinical_input = keras.Input(
            shape=(NUM_CLINICAL_FEATURES,), name="clinical_input"
        )
        c = layers.Dense(32, activation="relu")(clinical_input)
        c = layers.BatchNormalization()(c)
        fused = layers.Concatenate()([features, c])
        x = layers.Dense(64, activation="relu")(fused)
        x = layers.BatchNormalization()(x)
        x = layers.Dropout(cfg.dropout)(x)
        outputs = layers.Dense(cfg.num_classes, activation="softmax", name="predictions")(x)
        model = keras.Model(inputs=[base.input, clinical_input], outputs=outputs)
    else:
        outputs = layers.Dense(cfg.num_classes, activation="softmax", name="predictions")(features)
        model = keras.Model(inputs=base.input, outputs=outputs)

    layer_names = {l.name for l in model.layers}
    if LAST_CONV_LAYER not in layer_names:
        raise RuntimeError(f"Backbone does not expose '{LAST_CONV_LAYER}' required for Grad-CAM.")
    return model


def get_last_conv_layer(model: keras.Model) -> str:
    """Return the name of the last conv layer (Grad-CAM target)."""
    return LAST_CONV_LAYER


def unfreeze_backbone(model: keras.Model, cfg: TrainingConfig) -> None:
    """Unfreeze backbone layers for fine-tuning.

    Unfreezes from `cfg.unfreeze_from_layer` (a layer name) or, if
    `cfg.fine_tune_layers` is set, from the last N backbone layers.
    BatchNorm layers are always kept frozen.
    """
    base = model.get_layer("efficientnetb3")
    cutoff = cfg.unfreeze_from_layer
    if cfg.fine_tune_layers:
        trainable_names = {l.name for l in base.layers if l.trainable and not isinstance(l, layers.BatchNormalization)}
        ordered = [l.name for l in base.layers if l.name in trainable_names]
        if ordered:
            cutoff = ordered[-cfg.fine_tune_layers] if cfg.fine_tune_layers > 0 else "none"
    base.trainable = True
    for layer in base.layers:
        if isinstance(layer, layers.BatchNormalization):
            layer.trainable = False
            continue
        layer.trainable = layer.name >= cutoff


def compile_model(model: keras.Model, cfg: TrainingConfig) -> None:
    optimizer = cfg.optimizer.lower()
    if optimizer == "sgd":
        opt = keras.optimizers.SGD(learning_rate=cfg.learning_rate, momentum=0.9)
    elif optimizer == "adamw":
        opt = keras.optimizers.AdamW(learning_rate=cfg.learning_rate)
    else:
        opt = keras.optimizers.Adam(learning_rate=cfg.learning_rate)
    model.compile(
        optimizer=opt,
        loss=keras.losses.SparseCategoricalCrossentropy(from_logits=False),
        metrics=[keras.metrics.SparseCategoricalAccuracy(name="accuracy")],
    )

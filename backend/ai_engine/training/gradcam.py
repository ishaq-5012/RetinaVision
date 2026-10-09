"""Real Grad-CAM for a trained model (Keras 3 / TensorFlow 2.x).

Produces the activation map the deployed backend uses at inference time, plus
saved visualization PNGs for post-training inspection.
"""

from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np
import tensorflow as tf
from tensorflow import keras

from ai_engine.training.model import get_last_conv_layer


def generate_gradcam(model: keras.Model, image_tensor: np.ndarray, class_index: int) -> np.ndarray:
    """Compute a Grad-CAM heatmap (0-1) for a batched preprocessed image.

    Args:
        model: trained image-input Keras model with a 'top_conv' layer.
        image_tensor: (1, H, W, 3) float32, normalized 0-1.
        class_index: predicted/gradient-target class.

    Returns:
        heatmap (H, W) float32 in [0, 1].
    """
    conv_layer = model.get_layer(get_last_conv_layer(model))
    grad_model = keras.Model(inputs=model.inputs, outputs=[conv_layer.output, model.output])

    with tf.GradientTape() as tape:
        conv_output, predictions = grad_model(image_tensor)
        class_score = predictions[:, class_index]

    grads = tape.gradient(class_score, conv_output)
    pooled_grads = tf.reduce_mean(grads, axis=(0, 1, 2)).numpy()
    conv_output = conv_output.numpy()[0]

    heatmap = conv_output @ pooled_grads
    heatmap = np.maximum(heatmap, 0)
    if heatmap.max() > 0:
        heatmap = heatmap / heatmap.max()
    heatmap = cv2.resize(heatmap, (image_tensor.shape[2], image_tensor.shape[1]))
    return heatmap.astype(np.float32)


def overlay_heatmap(image_bgr: np.ndarray, heatmap: np.ndarray, alpha: float = 0.5) -> np.ndarray:
    """Overlay a heatmap on an image (both BGR, same size)."""
    heatmap_resized = cv2.resize(heatmap, (image_bgr.shape[1], image_bgr.shape[0]))
    heatmap_color = cv2.applyColorMap(np.uint8(255 * heatmap_resized), cv2.COLORMAP_JET)
    return cv2.addWeighted(image_bgr, 1 - alpha, heatmap_color, alpha, 0)


def save_visualization(
    model: keras.Model,
    image_bgr: np.ndarray,
    class_index: int,
    save_dir: Path,
    tag: str,
) -> dict:
    """Save heatmap + overlay PNGs and return their paths.

    The model tensor is derived from an RGB view (matching training, where
    tf.io.decode_image produces RGB); the overlay is drawn on the original BGR
    image (correct for cv2.imshow / web display).
    """
    from ai_engine.training.preprocessing import to_model_input

    save_dir = Path(save_dir)
    save_dir.mkdir(parents=True, exist_ok=True)
    rgb = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)
    processed = to_model_input(rgb)[0]
    image_tensor = processed[None, ...]
    heatmap = generate_gradcam(model, image_tensor, class_index)

    heat_path = save_dir / f"{tag}_heatmap.png"
    overlay_path = save_dir / f"{tag}_overlay.png"
    cv2.imwrite(str(heat_path), cv2.applyColorMap(np.uint8(255 * heatmap), cv2.COLORMAP_JET))
    cv2.imwrite(str(overlay_path), overlay_heatmap(image_bgr, heatmap))
    return {"heatmap": str(heat_path), "overlay": str(overlay_path)}

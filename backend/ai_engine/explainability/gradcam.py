"""
Grad-CAM Explainability Module

Implements Gradient-weighted Class Activation Mapping for the EfficientNetB3
cardiovascular risk prediction model.

Process:
  1. Forward pass through model to get prediction
  2. Compute gradient of predicted class score w.r.t. final conv layer output
  3. Global average pool gradients → channel weights
  4. Weighted sum of feature maps → heatmap
  5. ReLU + normalize
  6. Resize to input dimensions and overlay

When no trained model is loaded, falls back to a vesselness-based saliency map
that highlights vascular regions — mimicking what Grad-CAM would produce.
"""

import numpy as np
import cv2
from typing import Tuple


def generate_gradcam(
    model,
    image_tensor: np.ndarray,
    class_index: int,
    last_conv_layer_name: str = "top_conv",
) -> np.ndarray:
    """
    Generate a Grad-CAM heatmap using a trained Keras/TF model.

    Args:
        model: Keras Model with the EfficientNetB3 backbone
        image_tensor: preprocessed input (1, 224, 224, 3)
        class_index: predicted class index (0=low, 1=moderate, 2=high)
        last_conv_layer_name: name of the last convolutional layer

    Returns:
        Heatmap numpy array (H, W) with values 0-1
    """
    import tensorflow as tf

    grad_model = tf.keras.models.Model(
        inputs=model.input,
        outputs=[model.get_layer(last_conv_layer_name).output, model.output]
    )

    with tf.GradientTape() as tape:
        conv_output, predictions = grad_model(image_tensor)
        class_score = predictions[:, class_index]

    grads = tape.gradient(class_score, conv_output)
    pooled_grads = tf.reduce_mean(grads, axis=(0, 1, 2)).numpy()
    conv_output = conv_output.numpy()[0]

    heatmap = conv_output @ pooled_grads
    heatmap = np.maximum(heatmap, 0)
    heatmap = heatmap / (heatmap.max() + 1e-8)
    heatmap = cv2.resize(heatmap, (224, 224))
    return heatmap


def generate_vesselness_saliency(image_bgr: np.ndarray, risk_weight: float = 1.0) -> np.ndarray:
    """
    Vessel-based saliency map used when no trained CNN is deployed.

    This is NOT Grad-CAM: it is the Frangi vesselness response of the image
    (restricted to the fundus field of view), i.e. it highlights the vessel
    structures the OpenCV pipeline measured. `risk_weight` is accepted for
    backward compatibility and ignored.

    Returns:
        Heatmap numpy array (H, W) with values 0-1
    """
    from ai_engine.biomarkers.extraction import vesselness_map

    heatmap = vesselness_map(image_bgr)
    # Light blur so thin vessels remain visible once colour-mapped
    heatmap = cv2.GaussianBlur(heatmap.astype(np.float32), (5, 5), 0)
    return np.clip(heatmap / (heatmap.max() + 1e-8), 0, 1)


def overlay_heatmap(image_bgr: np.ndarray, heatmap: np.ndarray, alpha: float = 0.5) -> np.ndarray:
    """
    Overlay a Grad-CAM heatmap on the original image.

    Args:
        image_bgr: original BGR image
        heatmap: 2D array with values 0-1
        alpha: blending factor for the heatmap

    Returns:
        BGR image with heatmap overlay
    """
    h, w = image_bgr.shape[:2]
    heatmap_resized = cv2.resize(heatmap, (w, h))
    heatmap_uint8 = np.uint8(255 * heatmap_resized)
    heatmap_color = cv2.applyColorMap(heatmap_uint8, cv2.COLORMAP_JET)
    return cv2.addWeighted(image_bgr, 1 - alpha, heatmap_color, alpha, 0)


def generate_all_visualizations(
    image_bgr: np.ndarray,
    model=None,
    image_tensor: np.ndarray = None,
    class_index: int = 0,
) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """
    Generate the full Grad-CAM visualization set.

    Returns:
        (original_image, heatmap_image, overlay_image) all as BGR arrays
    """
    if model is not None and image_tensor is not None:
        heatmap = generate_gradcam(model, image_tensor, class_index)
    else:
        risk_weight = 0.7 + class_index * 0.25
        heatmap = generate_vesselness_saliency(image_bgr, risk_weight)

    heatmap_color = cv2.applyColorMap(np.uint8(255 * heatmap), cv2.COLORMAP_JET)
    overlay = overlay_heatmap(image_bgr, heatmap)

    return image_bgr, heatmap_color, overlay

"""Image preprocessing shared between training and inference.

Wraps the exact cv2 pipeline used at inference time (black-border removal,
224x224 resize, CLAHE, Gaussian denoise) so the model trains on data that
matches what the deployed backend produces.
"""

from __future__ import annotations

import cv2
import numpy as np

from ai_engine.preprocessing.preprocess import apply_clahe, denoise, remove_black_borders


def preprocess_uint8(image: np.ndarray, target_size: int = 224) -> np.ndarray:
    """Apply the CardioVisionAI preprocessing pipeline to a uint8 BGR/RGB image.

    Args:
        image: 3-channel uint8 array (H, W, 3).
        target_size: square edge length for resizing.

    Returns:
        uint8 array (target_size, target_size, 3), CLAHE-enhanced and denoised.
    """
    if image.ndim != 3 or image.shape[2] != 3:
        raise ValueError(f"Expected a 3-channel image, got shape {image.shape}")
    if image.dtype != np.uint8:
        image = np.clip(image, 0, 255).astype(np.uint8)

    cropped = remove_black_borders(image)
    resized = cv2.resize(cropped, (target_size, target_size), interpolation=cv2.INTER_AREA)
    enhanced = apply_clahe(resized)
    denoised = denoise(enhanced)
    return np.ascontiguousarray(denoised)


def to_model_input(image: np.ndarray) -> np.ndarray:
    """Normalize a preprocessed uint8 image to float32 in [0, 1] with batch dim."""
    return (image.astype(np.float32) / 255.0)[None, ...]

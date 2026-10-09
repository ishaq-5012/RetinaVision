"""GPU-native image augmentation applied on uint8 tensors during training."""

from __future__ import annotations

import tensorflow as tf


def augment_uint8(
    image: tf.Tensor,
    horizontal_flip: bool = True,
    vertical_flip: bool = True,
    rotation_90: bool = True,
    brightness_delta: float = 0.1,
    contrast_delta: float = 0.2,
) -> tf.Tensor:
    """Apply a stochastic augmentation set to a uint8 (H, W, 3) image.

    Includes horizontal/vertical flips, 90-degree rotations, brightness and
    contrast jitter. Runs on the GPU in the tf.data graph (no py_function).
    """
    if horizontal_flip:
        image = tf.image.random_flip_left_right(image)
    if vertical_flip:
        image = tf.image.random_flip_up_down(image)
    if rotation_90:
        k = tf.random.uniform(shape=(), minval=0, maxval=4, dtype=tf.int32)
        image = tf.image.rot90(image, k=k)
    if brightness_delta > 0:
        image = tf.image.random_brightness(image, max_delta=brightness_delta)
    if contrast_delta > 0:
        image = tf.image.random_contrast(image, lower=1 - contrast_delta, upper=1 + contrast_delta)
    image = tf.clip_by_value(image, 0, 255)
    return image


def normalize(image: tf.Tensor) -> tf.Tensor:
    """Convert a uint8 image to float32 in [0, 1]."""
    return tf.cast(image, tf.float32) / 255.0

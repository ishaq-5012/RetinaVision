"""Shared path + encoding helpers for the CardioVisionAI API package."""

import base64
from pathlib import Path

import cv2
import numpy as np

BACKEND_DIR = Path(__file__).resolve().parents[1]
UPLOADS_DIR = BACKEND_DIR / "uploads"
RESULTS_DIR = UPLOADS_DIR / "results"
GRADCAM_DIR = UPLOADS_DIR / "gradcam"
ORIGINAL_DIR = UPLOADS_DIR / "original"
REPORTS_DIR = BACKEND_DIR / "reports"


def ensure_dirs() -> None:
    for d in (RESULTS_DIR, GRADCAM_DIR, ORIGINAL_DIR, REPORTS_DIR):
        d.mkdir(parents=True, exist_ok=True)


def img_to_data_url(image_bgr: np.ndarray, max_side: int = 1024) -> str:
    """Encode a BGR image as a base64 PNG data URL (downscaled to max_side) for browser display."""
    h, w = image_bgr.shape[:2]
    if max(h, w) > max_side:
        scale = max_side / max(h, w)
        image_bgr = cv2.resize(image_bgr, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)
    ok, buf = cv2.imencode(".png", image_bgr)
    if not ok:
        return ""
    return "data:image/png;base64," + base64.b64encode(buf.tobytes()).decode("ascii")


def decode_data_url(data_url: str) -> np.ndarray | None:
    """Decode a base64 image data URL into a BGR numpy array."""
    if data_url.startswith("data:"):
        data_url = data_url.split(",", 1)[1]
    try:
        raw = np.frombuffer(base64.b64decode(data_url), dtype=np.uint8)
        return cv2.imdecode(raw, cv2.IMREAD_COLOR)
    except Exception:
        return None

"""
CardioVisionAI — FastAPI AI Backend

Serves the retinal screening prototype to the React frontend: OpenCV image
quality + vessel biomarkers, an experimental Prototype Risk Score, a
vessel-based saliency map and Groq vision interpretation. (EfficientNetB3 +
Grad-CAM are used only if a trained model file is present; none is deployed.)

Endpoints:
    POST /api/upload       Upload + validate a retinal fundus image
    POST /api/predict      Run the full prediction pipeline
    GET  /api/result/{id}  Fetch a stored prediction result
    GET  /api/health       Health check

Run:
    uvicorn main:app --reload --port 8000
"""

import logging
import os
import sys
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

BACKEND_DIR = Path(__file__).resolve().parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


def _load_env_file(path: Path) -> None:
    """Minimal .env loader (KEY=VALUE lines). The project's backend/.env takes
    priority over machine-wide variables so a stale global key cannot shadow it."""
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        value = value.strip().strip('"').strip("'")
        if value:
            os.environ[key.strip()] = value


_load_env_file(BACKEND_DIR / ".env")
logging.basicConfig(level=logging.INFO, format="%(levelname)s:     %(name)s - %(message)s")

from api import UPLOADS_DIR, ensure_dirs  # noqa: E402
from api import predict, result, upload  # noqa: E402

ensure_dirs()

app = FastAPI(
    title="CardioVisionAI AI Backend",
    description="AI-assisted cardiovascular risk estimation based on retinal vascular biomarkers.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(upload.router, prefix="/api", tags=["upload"])
app.include_router(predict.router, prefix="/api", tags=["predict"])
app.include_router(result.router, prefix="/api", tags=["result"])

app.mount("/uploads", StaticFiles(directory=str(UPLOADS_DIR)), name="uploads")


@app.get("/")
def root():
    return {
        "app": "CardioVisionAI",
        "status": "ok",
        "message": "AI-assisted cardiovascular risk estimation based on retinal vascular biomarkers.",
    }


@app.get("/api/health")
def health():
    """Liveness + transparent status of every analysis engine (used by the Analytics page)."""
    from ai_engine.prediction.predict import model_status
    from services import groq_vision_service

    cnn = model_status()
    groq_ready = groq_vision_service.is_configured()
    return {
        "status": "ok",
        "app": "CardioVisionAI",
        "engines": {
            "opencv": {"status": "active", "method": "OpenCV + scikit-image (Frangi vessel filter)"},
            "clinical": {"status": "active", "method": "Patient-provided clinical factors"},
            "groq_vision": {
                "status": "active" if groq_ready else "not_configured",
                "engine": f"Groq vision model ({groq_vision_service.model_name()})",
            },
            "prototype_score": {
                "status": "active" if not cnn["model_loaded"] else "standby",
                "method": "Experimental research formula (70% clinical, 30% retinal)",
            },
            "cnn": {
                "status": "deployed" if cnn["model_loaded"] else "not_deployed",
                "model": "EfficientNetB3",
                "detail": "Trained model loaded" if cnn["model_loaded"] else "Research training required",
            },
            "gradcam": {
                "status": "available" if cnn["model_loaded"] else "not_available",
                "detail": None if cnn["model_loaded"] else "No trained CNN model currently deployed",
            },
        },
    }

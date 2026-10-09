"""Prediction module — runs the retinal screening pipeline.

POST /api/predict

Input:
    {
        "scan_id": "optional-client-supplied-uuid",
        "image": "data:image/png;base64,...",
        "clinical_data": { age, gender, height_cm, weight_kg, systolic_bp,
                           diastolic_bp, heart_rate, smoking_status,
                           diabetes_history, family_cardiac_history,
                           cholesterol_mgdl }
    }

Output:
    {
        "scan_id", "risk_level", "risk_label",
        "risk_score"            (0-100 experimental Prototype Risk Score),
        "score_method"          ("prototype_heuristic" | "trained_cnn"),
        "score_breakdown", "image_quality", "clinical_factors",
        "biomarkers", "risk_factors", "recommendations", "pipeline",
        "ai_interpretation"     (Groq vision output, or {"status": "unavailable"}),
        "visualization_type"    ("vessel_saliency" | "gradcam"),
        "gradcam_heatmap", "gradcam_overlay", "processed_image", "original_image",
        "confidence", "probability_low|moderate|high"   (legacy DB columns, see below)
    }

Pipeline: OpenCV preprocessing -> image quality -> vessel segmentation +
biomarkers -> clinical factors -> Prototype Risk Score (or a trained CNN if one
is genuinely loaded) -> vessel saliency map -> Groq multimodal interpretation.

`confidence` carries the Prototype Risk Score (0-100) so it fits the existing
`scans.confidence` column; `probability_*` are soft category memberships of that
score, not probabilities. The frontend labels them accordingly.
"""

import json
import logging
import uuid

import cv2
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ai_engine.prediction.predict import predict_cardiovascular_risk
from api import GRADCAM_DIR, ORIGINAL_DIR, RESULTS_DIR, decode_data_url, ensure_dirs, img_to_data_url
from services.groq_vision_service import interpret_fundus

logger = logging.getLogger("predict")
router = APIRouter()


class ClinicalData(BaseModel):
    # No defaults: every value must come from the submitted form.
    age: int = Field(ge=1, le=120)
    gender: str
    height_cm: float = Field(gt=0)
    weight_kg: float = Field(gt=0)
    systolic_bp: int = Field(gt=0)
    diastolic_bp: int = Field(gt=0)
    heart_rate: int = Field(gt=0)
    smoking_status: str
    diabetes_history: bool
    family_cardiac_history: bool
    cholesterol_mgdl: float = Field(gt=0)


class PredictRequest(BaseModel):
    scan_id: str | None = None
    image: str
    clinical_data: ClinicalData


def _clinical_factors(c: dict) -> list[dict]:
    """The submitted values, echoed back with a simple reference-range flag."""
    bmi = c["weight_kg"] / (c["height_cm"] / 100) ** 2
    return [
        {"label": "Age", "value": f"{c['age']} yrs", "flag": c["age"] >= 55},
        {"label": "Blood Pressure", "value": f"{c['systolic_bp']}/{c['diastolic_bp']} mmHg",
         "flag": c["systolic_bp"] >= 130 or c["diastolic_bp"] >= 80},
        {"label": "Cholesterol", "value": f"{c['cholesterol_mgdl']:g} mg/dL", "flag": c["cholesterol_mgdl"] >= 200},
        {"label": "Smoking", "value": c["smoking_status"], "flag": c["smoking_status"] == "current"},
        {"label": "Diabetes", "value": "Yes" if c["diabetes_history"] else "No", "flag": c["diabetes_history"]},
        {"label": "Family History", "value": "Yes" if c["family_cardiac_history"] else "No",
         "flag": c["family_cardiac_history"]},
        {"label": "BMI", "value": f"{bmi:.1f}", "flag": bmi >= 25},
        {"label": "Heart Rate", "value": f"{c['heart_rate']} bpm", "flag": c["heart_rate"] > 100},
    ]


# Sync handler: FastAPI runs it in a worker thread, so the blocking Groq call
# does not stall other requests.
@router.post("/predict")
def predict(payload: PredictRequest):
    ensure_dirs()
    scan_id = payload.scan_id or str(uuid.uuid4())
    clinical = payload.clinical_data.model_dump()

    image = decode_data_url(payload.image)
    if image is None:
        raise HTTPException(status_code=400, detail="Could not decode the supplied retinal image.")

    try:
        result = predict_cardiovascular_risk(image_array=image, clinical_features=clinical)
    except Exception as exc:
        logger.exception("Screening pipeline failed")
        raise HTTPException(status_code=500, detail=f"Screening pipeline failed: {exc}")

    # Groq multimodal interpretation — never fatal; returns status "unavailable" on failure.
    ai_interpretation = interpret_fundus(image, clinical, result["biomarkers"], result["image_quality"])
    logger.info("Groq interpretation status: %s", ai_interpretation.get("status"))
    result["pipeline"].append(
        "Multimodal AI interpretation (Groq vision)"
        if ai_interpretation.get("status") == "available"
        else "Multimodal AI interpretation unavailable"
    )

    heatmap = result["gradcam_images"]["heatmap"]
    overlay = result["gradcam_images"]["overlay"]
    original = result["gradcam_images"]["original"]
    processed = result["processed_image"]

    cv2.imwrite(str(GRADCAM_DIR / f"{scan_id}_heatmap.png"), heatmap)
    cv2.imwrite(str(GRADCAM_DIR / f"{scan_id}_overlay.png"), overlay)
    cv2.imwrite(str(ORIGINAL_DIR / f"{scan_id}_original.png"), original)
    cv2.imwrite(str(ORIGINAL_DIR / f"{scan_id}_processed.png"), processed)

    is_prototype = result["score_method"] == "prototype_heuristic"
    response = {
        "scan_id": scan_id,
        "risk_level": result["risk_level"],
        "risk_label": result["risk_label"],
        "risk_score": result["risk_score"],
        "score_method": result["score_method"],
        "score_breakdown": result["score_breakdown"],
        # Legacy DB columns (see module docstring)
        "confidence": result["risk_score"] if is_prototype else round(result["confidence"] * 100),
        "probability_low": round(result["probabilities"]["low"] * 100),
        "probability_moderate": round(result["probabilities"]["moderate"] * 100),
        "probability_high": round(result["probabilities"]["high"] * 100),
        "image_quality": result["image_quality"],
        "clinical_factors": _clinical_factors(clinical),
        "biomarkers": result["biomarkers"],
        "risk_factors": result["risk_factors"],
        "recommendations": result["recommendations"],
        "pipeline": result["pipeline"],
        "ai_interpretation": ai_interpretation,
        "visualization_type": result["visualization_type"],
        "gradcam_heatmap": img_to_data_url(heatmap),
        "gradcam_overlay": img_to_data_url(overlay),
        "processed_image": img_to_data_url(processed),
        "original_image": img_to_data_url(original),
    }

    (RESULTS_DIR / f"{scan_id}.json").write_text(json.dumps(response), encoding="utf-8")

    return response

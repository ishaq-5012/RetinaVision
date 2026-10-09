"""
Retinal Screening Pipeline — Cardiovascular Risk Screening Prototype

Main entry point:
  1. Remove black borders, resize, CLAHE, denoise (OpenCV)
  2. Objective image-quality checks (OpenCV)
  3. Retinal vessel segmentation + biomarker extraction (OpenCV / Frangi)
  4. Clinical factor encoding (patient-submitted values)
  5. Risk scoring:
       - trained EfficientNetB3 inference IF a valid model file is present, otherwise
       - the experimental Prototype Risk Score (hand-weighted research formula)
  6. Visualization: Grad-CAM only with a trained CNN; otherwise a
     vessel-based saliency map (NOT Grad-CAM)
  7. Risk factor contributions + general wellness suggestions

Function: predict_cardiovascular_risk(image_array, clinical_features)

The output dict mirrors the shape consumed by the FastAPI layer and the
frontend `PredictionResult` type.
"""

import os

import cv2
import numpy as np

from ai_engine.preprocessing.preprocess import apply_clahe, assess_image_quality, denoise, remove_black_borders
from ai_engine.biomarkers.extraction import extract_biomarkers
from ai_engine.clinical_model import encode_clinical_features, compute_clinical_risk_score
from ai_engine.fusion_model import RISK_THRESHOLDS, heuristic_fusion, prototype_risk_score
from ai_engine.explainability.gradcam import generate_all_visualizations

CLASS_NAMES = ["Low Risk", "Moderate Risk", "High Risk"]
RISK_KEYS = ["low", "moderate", "high"]
TARGET_SIZE = (224, 224)

_model = None
_model_path = os.path.join(
    os.path.dirname(__file__), "..", "models", "efficientnet_model.h5"
)


def load_model():
    """Load the trained EfficientNetB3 cardiovascular risk model (lazy)."""
    global _model
    if _model is not None:
        return _model
    if os.path.exists(_model_path):
        try:
            from tensorflow.keras.models import load_model

            _model = load_model(_model_path)
            print(f"Model loaded from {_model_path}")
        except ImportError:
            print("TensorFlow not available - using heuristic inference")
        except Exception as e:
            print(f"Failed to load model: {e}")
            _model = None
    else:
        print(f"No trained model found at {_model_path} - using heuristic inference")
    return _model


def _probabilities_to_dict(probs: np.ndarray) -> dict:
    return {
        "low": round(float(probs[0]), 4),
        "moderate": round(float(probs[1]), 4),
        "high": round(float(probs[2]), 4),
    }


def model_status() -> dict:
    """Whether a trained CNN is actually deployed (file present AND loadable)."""
    present = os.path.exists(_model_path)
    loaded = load_model() is not None if present else False
    return {"model_file_present": present, "model_loaded": loaded}


def _build_pipeline_steps(model, use_model: bool) -> list:
    steps = [
        "Remove black borders",
        "CLAHE contrast enhancement + denoise",
        "Image quality assessment (OpenCV)",
        "Frangi vessel segmentation (OpenCV / scikit-image)",
        "Retinal biomarker measurement (OpenCV)",
        "Clinical factor analysis (patient-submitted values)",
    ]
    if use_model and model is not None:
        steps.append("EfficientNetB3 inference (trained model loaded)")
        steps.append("Grad-CAM class activation mapping")
    else:
        steps.append("Prototype Risk Score (experimental research formula)")
        steps.append("Vessel-based saliency map (not Grad-CAM)")
    return steps


def predict_cardiovascular_risk(
    image_array: np.ndarray,
    clinical_features: dict = None,
) -> dict:
    """
    Run the full cardiovascular risk prediction pipeline.

    Args:
        image_array: BGR numpy array of the retinal fundus image.
        clinical_features: dict with age, gender, height_cm, weight_kg,
                          systolic_bp, diastolic_bp, heart_rate, smoking_status,
                          diabetes_history, family_cardiac_history, cholesterol_mgdl

    Returns:
        {
            "risk_level": "Low Risk" | "Moderate Risk" | "High Risk",
            "risk_label": same human-readable label,
            "confidence": float,
            "probabilities": {"low": float, "moderate": float, "high": float},
            "biomarkers": {...},
            "risk_factors": [{"label": str, "contribution": float}, ...],
            "recommendations": [str, ...],
            "pipeline": [str, ...],
            "processed_image": np.ndarray (BGR, 224x224, CLAHE + denoised),
            "gradcam_images": {"heatmap": np.ndarray, "overlay": np.ndarray, "original": np.ndarray},
        }
    """
    if clinical_features is None:
        clinical_features = {}

    # Step 1-4: Preprocess (black border removal -> resize -> CLAHE -> denoise)
    image = remove_black_borders(image_array)
    image = cv2.resize(image, TARGET_SIZE, interpolation=cv2.INTER_AREA)
    image = apply_clahe(image)
    processed = denoise(image)

    # Training preprocesses RGB images (tf.io.decode_image); match that ordering
    # for the deployed model and Grad-CAM. `processed_image` stays BGR for display.
    image_tensor = (cv2.cvtColor(processed, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0)[None, ...]

    # Step 5: Image quality + retinal biomarker extraction (always real CV analysis)
    image_quality = assess_image_quality(image_array)
    biomarkers = extract_biomarkers(image_array)

    # Step 6: Encode clinical features
    clinical_vector = encode_clinical_features(clinical_features)
    clinical_contributions = compute_clinical_risk_score(clinical_features)

    # Step 7: Scoring — trained model only if one is really loaded,
    # otherwise the experimental Prototype Risk Score.
    model = load_model()
    use_model = model is not None

    retinal_vector = np.array(
        [
            biomarkers["vessel_density"],
            biomarkers["vessel_thickness"],
            biomarkers["tortuosity"],
            biomarkers["arteriovenous_ratio"],
            biomarkers["microvascular_changes"],
        ]
    )
    prototype = prototype_risk_score(retinal_vector, clinical_vector)

    if use_model:
        probs = model.predict(image_tensor, verbose=0)[0]
        probs = probs / (probs.sum() + 1e-8)
        class_idx = int(np.argmax(probs))
        score_method = "trained_cnn"
    else:
        probs = heuristic_fusion(retinal_vector, clinical_vector)
        class_idx = ["low", "moderate", "high"].index(prototype["category"])
        score_method = "prototype_heuristic"

    risk_level = CLASS_NAMES[class_idx]
    confidence = float(probs[class_idx])

    # Step 8: Grad-CAM visualizations
    original, heatmap_img, overlay_img = generate_all_visualizations(
        image_array, model=model, image_tensor=image_tensor, class_index=class_idx
    )

    # Step 9: Build risk factors list
    risk_factors = [
        {"label": k, "contribution": round(v, 4)}
        for k, v in clinical_contributions.items()
        if v > 0.001
    ]
    retinal_contribution = round(
        float(
            np.clip(
                (1 - biomarkers["vessel_density"]) * 0.15
                + biomarkers["tortuosity"] * 0.10
                + abs(biomarkers["arteriovenous_ratio"] - 0.7) * 0.10,
                0,
                0.35,
            )
        ),
        4,
    )
    risk_factors.append(
        {"label": "Retinal Vascular Biomarkers", "contribution": retinal_contribution}
    )

    # Step 10: Recommendations
    recommendations = _build_recommendations(risk_level, clinical_features, biomarkers)

    pipeline = _build_pipeline_steps(model, use_model)

    return {
        "risk_level": risk_level,
        "risk_label": risk_level,
        "confidence": round(confidence, 4),
        "risk_score": prototype["score"],
        "score_method": score_method,
        "score_breakdown": {
            "clinical_component": prototype["clinical_component"],
            "retinal_component": prototype["retinal_component"],
            "thresholds": [int(t * 100) for t in RISK_THRESHOLDS],
        },
        "image_quality": image_quality,
        "visualization_type": "gradcam" if use_model else "vessel_saliency",
        "probabilities": _probabilities_to_dict(probs),
        "biomarkers": biomarkers,
        "risk_factors": risk_factors,
        "recommendations": recommendations,
        "pipeline": pipeline,
        "processed_image": processed,
        "gradcam_images": {
            "heatmap": heatmap_img,
            "overlay": overlay_img,
            "original": original,
        },
    }


def _build_recommendations(risk_level: str, clinical: dict, biomarkers: dict) -> list:
    recs = []
    if risk_level == "High Risk":
        recs.append(
            "Schedule a comprehensive cardiovascular evaluation with a cardiologist promptly."
        )
        recs.append("Monitor blood pressure daily and maintain a log for your physician.")
    elif risk_level == "Moderate Risk":
        recs.append("Schedule a routine cardiovascular check-up within the next 3 months.")
        recs.append("Monitor blood pressure weekly and track trends.")
    else:
        recs.append("Maintain your current healthy lifestyle and attend routine annual check-ups.")

    systolic = clinical.get("systolic_bp", 120)
    diastolic = clinical.get("diastolic_bp", 80)
    if systolic > 130 or diastolic > 85:
        recs.append("Reduce sodium intake and consider the DASH diet to help manage blood pressure.")

    if clinical.get("cholesterol_mgdl", 180) > 200:
        recs.append(
            "Limit saturated fats and increase soluble fiber intake to support cholesterol management."
        )

    smoking = clinical.get("smoking_status", "never")
    if smoking == "current":
        recs.append(
            "Enroll in a smoking cessation program - quitting significantly reduces cardiovascular risk."
        )
    elif smoking == "former":
        recs.append("Continue avoiding tobacco to sustain your risk reduction.")

    height_m = clinical.get("height_cm", 170) / 100
    weight = clinical.get("weight_kg", 70)
    bmi = weight / (height_m**2) if height_m > 0 else 25.0
    if bmi > 30:
        recs.append("Aim for gradual weight loss through a balanced diet and regular physical activity.")
    elif bmi > 25:
        recs.append("Incorporate 150 minutes of moderate exercise weekly to maintain a healthy weight.")
    else:
        recs.append(
            "Continue regular physical activity - at least 150 minutes of moderate exercise per week."
        )

    if clinical.get("diabetes_history"):
        recs.append("Maintain tight glycemic control and have regular HbA1c checks.")

    if biomarkers.get("tortuosity", 0) > 0.6:
        recs.append("Retinal vascular changes detected - consider a follow-up ophthalmology exam.")

    recs.append("Adopt a Mediterranean-style diet rich in vegetables, whole grains, and healthy fats.")
    return recs


def predict_from_scan(scan_id: str, image_path: str, clinical_features: dict) -> dict:
    """
    Full pipeline including saving Grad-CAM outputs to disk.

    Returns prediction dict with file paths for heatmap and overlay images.
    """
    image = cv2.imread(image_path)
    if image is None:
        raise ValueError(f"Could not read image: {image_path}")

    result = predict_cardiovascular_risk(image_array=image, clinical_features=clinical_features)

    gradcam_dir = os.path.join(os.path.dirname(__file__), "..", "..", "uploads", "gradcam")
    os.makedirs(gradcam_dir, exist_ok=True)

    heatmap_path = os.path.join(gradcam_dir, f"{scan_id}_heatmap.png")
    overlay_path = os.path.join(gradcam_dir, f"{scan_id}_overlay.png")

    cv2.imwrite(heatmap_path, result["gradcam_images"]["heatmap"])
    cv2.imwrite(overlay_path, result["gradcam_images"]["overlay"])

    result["gradcam_paths"] = {"heatmap": heatmap_path, "overlay": overlay_path}

    return result

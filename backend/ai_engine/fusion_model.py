"""
Feature Fusion Module

`prototype_risk_score` / `heuristic_fusion` are what currently runs: a
hand-weighted research formula (70% clinical factors, 30% OpenCV retinal
measurements). It is an experimental Prototype Risk Score, NOT a trained model
and NOT a clinically validated probability.

The trained fusion architecture below is the research target; it is only used
if a trained fusion model is supplied (none is currently deployed):
  Retinal features (EfficientNetB3 GAP output, 1536-dim)
  + Clinical features (16-dim)
  → Concatenate (1552-dim)
  → Dense(256, ReLU) + BatchNorm + Dropout(0.4)
  → Dense(64, ReLU) + Dropout(0.3)
  → Dense(3, Softmax) → [Low, Moderate, High]
"""

import numpy as np
from typing import Tuple

NUM_CLASSES = 3  # Low, Moderate, High


def fuse_features(retinal_vector: np.ndarray, clinical_vector: np.ndarray) -> np.ndarray:
    """
    Concatenate retinal and clinical feature vectors.
    """
    return np.concatenate([retinal_vector, clinical_vector], axis=-1)


def softmax(x: np.ndarray) -> np.ndarray:
    """Numerically stable softmax."""
    x = x - np.max(x, axis=-1, keepdims=True)
    exp = np.exp(x)
    return exp / np.sum(exp, axis=-1, keepdims=True)


def hybrid_predict(
    retinal_vector: np.ndarray,
    clinical_vector: np.ndarray,
    fusion_model=None,
) -> Tuple[str, np.ndarray, float]:
    """
    Run hybrid prediction through the fusion model.

    If a trained fusion model is provided, uses it for inference.
    Otherwise, uses a heuristic combining retinal biomarker signals and
    clinical risk scores to produce calibrated probabilities.

    Returns:
        (risk_level, probabilities, confidence)
    """
    if fusion_model is not None:
        fused = fuse_features(retinal_vector, clinical_vector)
        logits = fusion_model.predict(np.expand_dims(fused, axis=0))
        probs = softmax(logits)[0]
    else:
        # Heuristic fusion: combine retinal signal + clinical risk
        probs = heuristic_fusion(retinal_vector, clinical_vector)

    class_names = ["Low Risk", "Moderate Risk", "High Risk"]
    class_idx = int(np.argmax(probs))
    risk_level = class_names[class_idx]
    confidence = float(probs[class_idx])

    return risk_level, probs, confidence


RISK_THRESHOLDS = (0.35, 0.65)  # composite score boundaries Low|Moderate|High


def prototype_risk_score(
    retinal_vector: np.ndarray,
    clinical_vector: np.ndarray,
) -> dict:
    """
    Experimental Prototype Risk Score (research formula, not a trained model).

    retinal_vector: [vessel_density, vessel_thickness, tortuosity, avr, microvascular]
    clinical_vector: [age, gender, bmi, systolic, diastolic, hr, smoking, diabetes, family, chol]
                     (normalised 0-1 by encode_clinical_features)

    Returns {"score": 0-100, "category": "low|moderate|high",
             "clinical_component": 0-100, "retinal_component": 0-100}
    """
    vessel_density = retinal_vector[0]
    tortuosity = retinal_vector[2]
    microvascular = retinal_vector[4]

    age_norm = clinical_vector[0]
    systolic_norm = clinical_vector[3]
    smoking = clinical_vector[6]
    diabetes = clinical_vector[7]
    chol_norm = clinical_vector[9]

    clinical_score = (
        age_norm * 0.25 + systolic_norm * 0.22 + chol_norm * 0.15 +
        smoking * 0.15 + diabetes * 0.12
    )
    retinal_score = (
        (1 - vessel_density) * 0.15 + tortuosity * 0.10 + microvascular * 0.15
    )
    composite = float(np.clip(clinical_score * 0.7 + retinal_score * 0.3, 0, 1))

    if composite < RISK_THRESHOLDS[0]:
        category = "low"
    elif composite < RISK_THRESHOLDS[1]:
        category = "moderate"
    else:
        category = "high"

    return {
        "score": int(round(composite * 100)),
        "composite": composite,
        "category": category,
        # Each component's weighted share of the 0-100 score
        "clinical_component": round(float(clinical_score * 0.7) * 100, 1),
        "retinal_component": round(float(retinal_score * 0.3) * 100, 1),
    }


def heuristic_fusion(
    retinal_vector: np.ndarray,
    clinical_vector: np.ndarray,
) -> np.ndarray:
    """
    Soft Low/Moderate/High memberships of the prototype risk score
    (Gaussian centres at 0.2 / 0.5 / 0.8). Kept for the legacy
    probability_* DB columns; these are NOT probabilities.
    """
    composite = prototype_risk_score(retinal_vector, clinical_vector)["composite"]
    low = np.exp(-((composite - 0.2) ** 2) / 0.04)
    moderate = np.exp(-((composite - 0.5) ** 2) / 0.04)
    high = np.exp(-((composite - 0.8) ** 2) / 0.04)
    probs = np.array([low, moderate, high])
    return probs / probs.sum()

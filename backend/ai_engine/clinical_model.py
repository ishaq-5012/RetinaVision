"""
Clinical Feature Module

Encodes the patient-submitted clinical factors into a normalised feature
vector and computes rule-based per-factor contributions. (A dense clinical
network, described below, is a research target and is not deployed.)

Input features:
  - Age
  - Gender (encoded)
  - BMI (computed from height + weight)
  - Systolic blood pressure
  - Diastolic blood pressure
  - Heart rate
  - Smoking status (encoded)
  - Diabetes history (boolean)
  - Family cardiac history (boolean)
  - Cholesterol (mg/dL)

Architecture:
  Input (10 features)
  → Dense(64, ReLU) + BatchNorm
  → Dense(32, ReLU) + BatchNorm
  → Dense(16, ReLU)
  → Output: clinical risk feature vector (16-dim)
"""

import numpy as np
from typing import Dict, List

FEATURE_ORDER: List[str] = [
    "age", "gender", "bmi", "systolic_bp", "diastolic_bp",
    "heart_rate", "smoking_status", "diabetes_history",
    "family_cardiac_history", "cholesterol_mgdl",
]


def encode_clinical_features(data: Dict) -> np.ndarray:
    """
    Encode clinical data into a normalized feature vector.

    Normalization ranges based on typical clinical values:
      age: 18-100
      bmi: 15-45
      systolic_bp: 80-200
      diastolic_bp: 50-130
      heart_rate: 40-150
      cholesterol: 100-350
      gender: male=0, female=1, other=0.5
      smoking: never=0, former=0.5, current=1
      diabetes: 0 or 1
      family_history: 0 or 1
    """
    height_m = data.get("height_cm", 170) / 100
    weight = data.get("weight_kg", 70)
    bmi = weight / (height_m ** 2) if height_m > 0 else 25.0

    gender_map = {"male": 0.0, "female": 1.0, "other": 0.5}
    smoking_map = {"never": 0.0, "former": 0.5, "current": 1.0}

    features = np.array([
        (data.get("age", 45) - 18) / 82,
        gender_map.get(data.get("gender", "male"), 0.0),
        (bmi - 15) / 30,
        (data.get("systolic_bp", 120) - 80) / 120,
        (data.get("diastolic_bp", 80) - 50) / 80,
        (data.get("heart_rate", 72) - 40) / 110,
        smoking_map.get(data.get("smoking_status", "never"), 0.0),
        1.0 if data.get("diabetes_history", False) else 0.0,
        1.0 if data.get("family_cardiac_history", False) else 0.0,
        (data.get("cholesterol_mgdl", 180) - 100) / 250,
    ], dtype=np.float32)

    return np.clip(features, 0, 1)


def compute_clinical_risk_score(data: Dict) -> Dict[str, float]:
    """
    Compute per-factor cardiovascular risk contributions using validated
    epidemiological relationships (Framingham-style weighted scoring).

    Returns a dict of risk factor labels → contribution weights (0-1).
    """
    height_m = data.get("height_cm", 170) / 100
    weight = data.get("weight_kg", 70)
    bmi = weight / (height_m ** 2) if height_m > 0 else 25.0

    age = data.get("age", 45)
    systolic = data.get("systolic_bp", 120)
    cholesterol = data.get("cholesterol_mgdl", 180)
    smoking = data.get("smoking_status", "never")
    diabetes = data.get("diabetes_history", False)
    family = data.get("family_cardiac_history", False)

    def clamp(v, lo=0, hi=1):
        return max(lo, min(hi, v))

    contributions = {
        "Age": clamp(((age - 40) / 45) * 0.25),
        "Blood Pressure": clamp(((systolic - 110) / 70) * 0.22),
        "Cholesterol": clamp(((cholesterol - 160) / 120) * 0.15),
        "Smoking Status": 0.15 if smoking == "current" else 0.06 if smoking == "former" else 0.0,
        "Diabetes History": 0.12 if diabetes else 0.0,
        "Family Cardiac History": 0.08 if family else 0.0,
        "BMI": clamp(0.08 if bmi > 30 else 0.04 if bmi > 25 else 0.0),
    }

    return contributions

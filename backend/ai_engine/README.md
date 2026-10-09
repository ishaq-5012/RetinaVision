# CardioVisionAI — AI Engine

This directory contains the deep learning inference pipeline for cardiovascular
risk prediction from retinal fundus images.

## Architecture

```
Retinal Fundus Image
        │
        ▼
┌──────────────────┐     ┌──────────────────┐
│  Image           │     │  Clinical        │
│  Preprocessing   │     │  Feature Encoding│
│  (CLAHE, resize, │     │  (Age, BP, BMI,  │
│   normalize)     │     │   smoking, etc.) │
└────────┬─────────┘     └────────┬─────────┘
         │                        │
         ▼                        ▼
┌──────────────────┐     ┌──────────────────┐
│  EfficientNetB3  │     │  Clinical DNN    │
│  Feature Extract │     │  (Dense layers)  │
│  (1536-dim)      │     │  (16-dim)        │
└────────┬─────────┘     └────────┬─────────┘
         │                        │
         └──────────┬─────────────┘
                    ▼
          ┌──────────────────┐
          │  Feature Fusion  │
          │  (Concatenate +  │
          │   Dense + Softmax)│
          └────────┬─────────┘
                   │
         ┌─────────┴──────────┐
         ▼                    ▼
┌──────────────────┐  ┌──────────────────┐
│  Risk Prediction │  │  Grad-CAM        │
│  (Low/Mod/High)  │  │  Explainability  │
└──────────────────┘  └──────────────────┘
         │
         ▼
┌──────────────────┐
│  Biomarker       │
│  Extraction      │
│  (Vessel density,│
│   tortuosity,    │
│   width, AVR)    │
└──────────────────┘
```

## Modules

### preprocessing/preprocess.py
- `preprocess_image(image_path)` → tensor (1, 224, 224, 3)
- Pipeline: black border removal → resize 224×224 → CLAHE → Gaussian denoise → normalize 0-1

### prediction/predict.py
- `predict_cardiovascular_risk(image_path, clinical_features)` → JSON result
- `predict_from_scan(scan_id, image_path, clinical_features)` → saves Grad-CAM to disk

### explainability/gradcam.py
- `generate_gradcam(model, image_tensor, class_index)` → heatmap
- `generate_vesselness_saliency(image_bgr)` → fallback saliency map
- `overlay_heatmap(image, heatmap)` → overlay visualization

### biomarkers/extraction.py
- `extract_biomarkers(image_bgr)` → dict of vascular biomarkers
- Uses Frangi vesselness filter for vessel segmentation
- Computes: vessel density, tortuosity, width, arteriovenous ratio, microvascular changes

### clinical_model.py
- `encode_clinical_features(data)` → normalized 10-dim feature vector
- `compute_clinical_risk_score(data)` → per-factor risk contributions

### fusion_model.py
- `fuse_features(retinal, clinical)` → concatenated vector
- `hybrid_predict(retinal, clinical, model)` → (risk_level, probabilities, confidence)

## Model File

Place a trained EfficientNetB3 model at:
```
models/efficientnet_model.h5
```

If no model file is present, the pipeline uses:
- Real OpenCV/skimage vessel segmentation for biomarkers
- Vesselness-based saliency for Grad-CAM (highlights actual vascular regions)
- Heuristic feature fusion combining real biomarkers + clinical risk scores

This ensures the system produces real, image-derived analysis even before a
trained model is connected.

## Usage

```python
from prediction.predict import predict_cardiovascular_risk

result = predict_cardiovascular_risk(
    image_path="retina.jpg",
    clinical_features={
        "age": 55,
        "gender": "male",
        "height_cm": 175,
        "weight_kg": 82,
        "systolic_bp": 145,
        "diastolic_bp": 92,
        "heart_rate": 78,
        "smoking_status": "current",
        "diabetes_history": True,
        "family_cardiac_history": True,
        "cholesterol_mgdl": 220,
    },
)

print(result["risk_level"])     # "High Risk"
print(result["confidence"])      # 0.91
print(result["probabilities"])   # {"low": 0.04, "moderate": 0.05, "high": 0.91}
print(result["biomarkers"])      # {"vessel_density": 0.72, ...}
```

## Disclaimer

This AI system is developed for research and educational purposes only and does
not provide medical diagnosis.

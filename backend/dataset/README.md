# CardioVisionAI Training Dataset

Place your labelled retinal fundus dataset here. The training pipeline accepts
either of the two formats below.

## Format A — CSV (recommended)

```
dataset/
  images/
    retina_001.jpg
    retina_002.jpg
    ...
  labels.csv
```

`labels.csv` columns:

| column | required | values |
| --- | --- | --- |
| `filename` | yes | image file name (relative to `images/`) |
| `label` | yes | `low`, `moderate`, `high` — or `0`, `1`, `2` |

Optional clinical columns (enabled with `--use-clinical`):
`age`, `gender` (`male`/`female`/`other`), `height_cm`, `weight_kg`,
`systolic_bp`, `diastolic_bp`, `heart_rate`, `smoking_status`
(`never`/`former`/`current`), `diabetes_history` (`true`/`false`),
`family_cardiac_history` (`true`/`false`), `cholesterol_mgdl`.

```
filename,label,age,gender,height_cm,weight_kg,systolic_bp,diastolic_bp,heart_rate,smoking_status,diabetes_history,family_cardiac_history,cholesterol_mgdl
retina_001.jpg,low,42,male,175,78,118,76,70,never,false,false,180
retina_002.jpg,moderate,58,female,162,84,142,90,82,former,true,true,235
```

## Format B — subfolders per class

```
dataset/
  images/
    low/
      retina_001.jpg
      ...
    moderate/
      retina_002.jpg
      ...
    high/
      retina_003.jpg
      ...
```

Class folders can be named `low`/`moderate`/`high` or `0`/`1`/`2`.

## Requirements

- Images: JPG or PNG, any size (they are resized to 224x224 and CLAHE-enhanced
  automatically). Fundus photos work best when the optic disc / vessels are visible.
- A realistic model needs hundreds to thousands of images per class. Expect
  transfer learning to produce poor results on very small datasets.
- On first run, EfficientNetB3 downloads ImageNet weights (~79 MB).

## Start training

From the `backend/` directory:

```
python -m ai_engine.training.train --data-dir dataset --epochs 60
```

Artifacts are written to `backend/training_output/` (best model, logs, plots)
and the deployable `efficientnet_model.h5` is placed in
`backend/ai_engine/models/`, where the FastAPI inference backend loads it
automatically.

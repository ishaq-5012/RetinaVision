# Trained model deployment

This is where the trained, deployable model lands as `efficientnet_model.h5`.
The FastAPI backend (`ai_engine/prediction/predict.py`) loads this file lazily on
the first request; if it is absent, the backend runs the deterministic OpenCV
biomarker + clinical heuristic so the full demo remains functional end-to-end.

## Expected architecture (deployable)

- Input: `(224, 224, 3)` RGB, normalized to 0-1
- Backbone: EfficientNetB3 (ImageNet-pretrained, default) with `top_conv` as the
  last convolutional layer, global-average-pooled, then Dense(3, softmax)
- Output: 3-class probabilities `[Low Risk, Moderate Risk, High Risk]`
- Single image input only — the deployed backend does not load clinical-fusion
  (multi-input) models.

## Training pipeline

Train from a labelled fundus dataset (e.g. STARE, DRIVE, or a curated
cardiovascular-risk dataset; research/demo use only) with the training package
in `backend/ai_engine/training/`:

```bash
cd backend

# 1. Prepare data (see backend/dataset/README.md):
#    - CSV: filename + label (+ optional clinical columns), or
#    - subfolders images/{low,moderate,high} (or 0/1/2)
#    Drop images into backend/dataset/images/ and label them in labels.csv.

# 2. Train (real EfficientNetB3 transfer learning)
python -m ai_engine.training.train --data-dir dataset --epochs 60

# Useful flags:
#   --image-size 224 --batch-size 32 --learning-rate 1e-3
#   --val-split 0.2 --test-split 0.1
#   --weights imagenet | None        (None = from scratch)
#   --train-backbone                  fine-tune backbone after head converges
#   --no-augment / --no-class-weights
#   --use-clinical                    train the (non-deployable) fusion model
#   --no-deploy                       skip writing the deployable .h5

# 3. Validate and evaluate
python -m ai_engine.training.validate
python -m ai_engine.training.evaluate
```

Artifacts (in `backend/training_output/`):

- `checkpoints/best_model.keras` — best epoch checkpoint
- `model.keras`, `saved_model/` — export formats
- `history.json`, `training_log.csv`, `logs/` (TensorBoard: `tensorboard --logdir training_output/logs`)
- `plots/confusion_matrix_*.png`, `plots/roc_curves_*.png`, `evaluation_report.json`
- `ai_engine/models/efficientnet_model.h5` — the deployable model the API loads

The CLI auto-writes the deployable `.h5` after training (use `--no-deploy` to
prevent this, e.g. for experimentation).

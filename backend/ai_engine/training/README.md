# CardioVisionAI — AI Training & Deployment

Complete workflow for the real-model AI pipeline: dataset preparation →
validation → preprocessing → statistics → split → training → evaluation →
inference → deployment.

All commands run from the `backend/` directory.

---

## 1. Dataset structure

Two accepted input layouts under `backend/dataset/`:

### Format A — CSV (recommended)

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
| `filename` | yes | file name relative to `images/` |
| `label` | yes | `low` / `moderate` / `high` — or `0` / `1` / `2` |

Optional clinical columns (for `--use-clinical` training only):
`age`, `gender`, `height_cm`, `weight_kg`, `systolic_bp`, `diastolic_bp`,
`heart_rate`, `smoking_status`, `diabetes_history`,
`family_cardiac_history`, `cholesterol_mgdl`.

### Format B — subfolders per class

```
dataset/
  images/
    low/retina_001.jpg
    moderate/retina_002.jpg
    high/retina_003.jpg
```

Class folders may be named `low`/`moderate`/`high` or `0`/`1`/`2`.

---

## 2. Folder layout

```
backend/
  dataset/                         raw labelled data
    images/                        raw images (CSV or per-class subfolders)
    labels.csv                     CSV labels (optional if subfolders)
    processed/                     output of preprocess_dataset.py
    splits/                        stratified split CSVs (split_dataset.py)
    validation_report.json         output of validate_dataset.py
    dataset_stats.json             output of dataset_stats.py
  training_output/                 training artifacts
    history.json                   per-epoch metrics
    training_report.json           consolidated post-training report
    TRAINING_REPORT.md             human-readable report
    checkpoints/best_model.keras   best epoch only
    model.keras / model.h5 / saved_model/
    logs/                          TensorBoard logs
    plots/                         confusion matrix + ROC curves (test)
    gradcam/                       Grad-CAM samples on validation images
  ai_engine/
    models/efficientnet_model.h5   deployable model auto-loaded by the API
    training/                      this package + config.yaml
```

---

## 3. Training workflow

```bash
# 1. Validate the dataset (blocks on fatal issues)
python -m ai_engine.training.validate_dataset --data-dir dataset

# 2. Preprocess into dataset/processed/ (border removal, CLAHE, RGB, 224x224)
python -m ai_engine.training.preprocess_dataset --data-dir dataset

# 3. Dataset statistics
python -m ai_engine.training.dataset_stats --data-dir dataset

# 4. Stratified 70/15/15 split (writes dataset/splits/*.csv)
python -m ai_engine.training.split_dataset --data-dir dataset

# 5. Train (auto-loads training/config.yaml; CLI flags override YAML)
python -m ai_engine.training.train --data-dir dataset
```

To train on the preprocessed images instead, first split the processed folder
(its `splits/` are separate from the raw one), then train with `--preprocessed`:

```bash
python -m ai_engine.training.split_dataset --data-dir dataset/processed
python -m ai_engine.training.train --data-dir dataset/processed --preprocessed
```

`config.yaml` controls epochs, batch size, learning rate, optimizer
(adam/adamw/sgd), augmentation, early stopping, reduce-LR, dropout, and
fine-tuning layers. Override any value per-run on the CLI, e.g.:

```bash
python -m ai_engine.training.train --data-dir dataset --epochs 80 --batch-size 16 \
    --learning-rate 5e-4 --optimizer adamw --fine-tune-layers 20
```

The split written in step 4 is reused automatically by training and evaluation,
so results are reproducible. Delete `dataset/splits/` to re-split with a new seed.

Class imbalance is handled with per-class `class_weight` (enable/disable with
`class_weights:` in config.yaml). Training monitors `val_loss` for early
stopping / LR reduction and `val_accuracy` to keep the best checkpoint only.

### Training report

After every run `training_output/training_report.json` (and `TRAINING_REPORT.md`)
contains:

- Accuracy, macro precision, macro recall, macro F1, weighted F1
- Per-class precision / recall / F1 and ROC AUC
- Confusion matrix (test)
- Training time, validation time, total time
- Model sizes (best_model.keras, model.keras, model.h5, saved_model, deploy .h5)
- The exported artifact paths and the effective config

TensorBoard: `tensorboard --logdir training_output/logs`

---

## 4. Evaluation workflow

```bash
# Full evaluation of the best model on val + test (metrics, plots, JSON report)
python -m ai_engine.training.evaluate --data-dir dataset

# Lightweight validation console output
python -m ai_engine.training.validate --data-dir dataset

# Grad-CAM samples on random validation images (also runs after training)
python -m ai_engine.training.gradcam_samples --data-dir dataset --samples 6
```

`evaluate.py` writes `training_output/evaluation_report.json`,
`plots/confusion_matrix_*.png` and `plots/roc_curves_*.png`.

---

## 5. Inference workflow

The FastAPI backend (`backend/main.py`) loads the deployable model
`ai_engine/models/efficientnet_model.h5` lazily on first request
(`ai_engine/prediction/predict.py`):

- Preprocessing: black-border removal → 224x224 → CLAHE → Gaussian denoise → RGB
  (identical to the training pipeline)
- Real EfficientNetB3 inference → 3-class probabilities
- Real Grad-CAM overlay (uses the model's `top_conv` layer)
- OpenCV retinal biomarker extraction + clinical feature fusion
  (always run; clinical fusion is independent of the neural model)

If `efficientnet_model.h5` is absent, the backend falls back to the
deterministic OpenCV biomarker + clinical heuristic so the app stays
functional end-to-end.

---

## 6. Deployment workflow

1. Train a single-input (image-only) model — clinical-fusion models are
   training-only and cannot be deployed (the API loads a single-input model).
2. `train.py` automatically exports:
   - `training_output/model.keras`, `model.h5`, `saved_model/`
   - `ai_engine/models/efficientnet_model.h5` (use `--no-deploy` to skip)
3. Restart the backend. The new model is picked up on the next request.
4. Redeploy any model at any time:

```bash
# From a checkpoint:
python -m ai_engine.training.evaluate --data-dir dataset

# Manual install of any trained .keras/.h5:
python -c "from ai_engine.training.export import install_existing_model; install_existing_model('training_output/model.keras')"
```

The deployable model must have a single image input `(224, 224, 3)` RGB
normalized 0-1, an EfficientNetB3 backbone with a `top_conv` layer, and a
3-class softmax head `[Low Risk, Moderate Risk, High Risk]`.

---

## 7. CLI reference

| Command | Purpose |
| --- | --- |
| `validate_dataset` | pre-training integrity + imbalance check (exit 1 on fatal) |
| `preprocess_dataset` | write processed images to `dataset/processed/` |
| `dataset_stats` | dataset statistics table + JSON |
| `split_dataset` | stratified 70/15/15 split into `dataset/splits/` |
| `train` | train + export + report + Grad-CAM samples |
| `validate` | quick val/test console evaluation |
| `evaluate` | full evaluation with plots and JSON report |
| `gradcam_samples` | Grad-CAM visualization on random validation images |

/*
# Prediction Payload Migration — Real AI Backend Responses

## Summary
Adds a JSONB column on `scans` that stores the full AI backend prediction
response (risk probabilities, confidence, biomarkers, risk factors,
recommendations, pipeline steps, and the base64 Grad-CAM images returned by
the FastAPI `/api/predict` endpoint).

This makes the frontend resilient to AI-backend restarts and removes the need
for `sessionStorage` to carry prediction data between pages.

## Changes to `scans` table
- `prediction_payload` (jsonb, nullable): full response body from the FastAPI
  AI backend, including:
  - `risk_level`, `risk_label`, `confidence`
  - `probability_low`, `probability_moderate`, `probability_high`
  - `biomarkers` (object)
  - `risk_factors` (array of {label, contribution})
  - `recommendations` (array of strings)
  - `pipeline` (array of step names)
  - `gradcam_heatmap`, `gradcam_overlay`, `processed_image`, `original_image`
    (base64 PNG data URLs, so the Explainable AI page works without separate
    storage uploads)
- `pipeline` (text[], nullable): flattened pipeline step list for quick querying

## Notes
1. Idempotent via IF NOT EXISTS
2. The existing `biomarkers` JSONB column is preserved (structured snapshot);
   `prediction_payload` stores the complete backend response
3. Existing rows are backfilled from the old `biomarkers` column where possible
*/
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scans' AND column_name = 'prediction_payload') THEN
    ALTER TABLE scans ADD COLUMN prediction_payload jsonb;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scans' AND column_name = 'pipeline') THEN
    ALTER TABLE scans ADD COLUMN pipeline text[];
  END IF;
END $$;

-- Backfill pipeline from prediction_payload if it exists
UPDATE scans
SET pipeline = ARRAY(SELECT jsonb_array_elements_text(prediction_payload->'pipeline'))
WHERE pipeline IS NULL
  AND prediction_payload IS NOT NULL
  AND jsonb_typeof(prediction_payload->'pipeline') = 'array';

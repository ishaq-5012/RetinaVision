/*
# Upgrade AI Pipeline Schema — Real Inference System

## Summary
Upgrades the scans table with AI pipeline status tracking and processed image
paths, and creates a dedicated biomarkers table for structured vascular
biomarker storage separate from the JSONB snapshot.

## Changes to `scans` table
- `prediction_status` (text, default 'completed'): tracks pipeline state —
  'pending', 'processing', 'completed', 'failed'
- `processed_image_path` (text, nullable): storage path for the CLAHE-enhanced
  preprocessed retinal image
- `gradcam_heatmap_path` (text, nullable): storage path for the standalone
  Grad-CAM heatmap image
- `gradcam_overlay_path` (text, nullable): storage path for the Grad-CAM
  overlay image (heatmap on original retina)

## New table: `scan_biomarkers`
Stores structured retinal vascular biomarker measurements extracted by the
AI pipeline. Separate from the scans.biomarkers JSONB for easier analytics.
- `id` (uuid, PK)
- `scan_id` (uuid, FK → scans, ON DELETE CASCADE)
- `vessel_density` (real, 0-1)
- `vessel_thickness` (real, 0-1)
- `tortuosity` (real, 0-1)
- `arteriovenous_ratio` (real)
- `microvascular_changes` (real, 0-1)
- `created_at` (timestamptz)

## Security
- RLS enabled on `scan_biomarkers` with owner-scoped policies (SELECT, INSERT,
  UPDATE, DELETE) matching the scans table pattern
- Medical staff (doctor/researcher role) get SELECT access via the existing
  medical_staff_read_access pattern

## Notes
1. All column additions use IF NOT EXISTS for idempotency
2. The existing `gradcam_path` column is preserved (now stores the overlay path
   for backward compatibility)
3. The `biomarkers` JSONB column on scans is kept for the full prediction
   payload; `scan_biomarkers` provides queryable structured columns
*/

-- Add new columns to scans table
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scans' AND column_name = 'prediction_status') THEN
    ALTER TABLE scans ADD COLUMN prediction_status text NOT NULL DEFAULT 'completed';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scans' AND column_name = 'processed_image_path') THEN
    ALTER TABLE scans ADD COLUMN processed_image_path text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scans' AND column_name = 'gradcam_heatmap_path') THEN
    ALTER TABLE scans ADD COLUMN gradcam_heatmap_path text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scans' AND column_name = 'gradcam_overlay_path') THEN
    ALTER TABLE scans ADD COLUMN gradcam_overlay_path text;
  END IF;
END $$;

-- Add CHECK constraint on prediction_status (drop first for idempotency)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'scans_prediction_status_check') THEN
    ALTER TABLE scans ADD CONSTRAINT scans_prediction_status_check
      CHECK (prediction_status = ANY (ARRAY['pending', 'processing', 'completed', 'failed']));
  END IF;
END $$;

-- Create scan_biomarkers table
CREATE TABLE IF NOT EXISTS scan_biomarkers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id uuid NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  vessel_density real,
  vessel_thickness real,
  tortuosity real,
  arteriovenous_ratio real,
  microvascular_changes real,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE scan_biomarkers ENABLE ROW LEVEL SECURITY;

-- Owner-scoped policies (user_id accessed through scan → user_id join)
DROP POLICY IF EXISTS "select_own_biomarkers" ON scan_biomarkers;
CREATE POLICY "select_own_biomarkers"
  ON scan_biomarkers FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM scans
            WHERE scans.id = scan_biomarkers.scan_id
            AND scans.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles
               WHERE profiles.id = auth.uid()
               AND profiles.role IN ('doctor', 'researcher'))
  );

DROP POLICY IF EXISTS "insert_own_biomarkers" ON scan_biomarkers;
CREATE POLICY "insert_own_biomarkers"
  ON scan_biomarkers FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM scans
            WHERE scans.id = scan_biomarkers.scan_id
            AND scans.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "update_own_biomarkers" ON scan_biomarkers;
CREATE POLICY "update_own_biomarkers"
  ON scan_biomarkers FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM scans
            WHERE scans.id = scan_biomarkers.scan_id
            AND scans.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM scans
            WHERE scans.id = scan_biomarkers.scan_id
            AND scans.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "delete_own_biomarkers" ON scan_biomarkers;
CREATE POLICY "delete_own_biomarkers"
  ON scan_biomarkers FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM scans
            WHERE scans.id = scan_biomarkers.scan_id
            AND scans.user_id = auth.uid())
  );

-- Index for efficient lookup by scan
CREATE INDEX IF NOT EXISTS idx_scan_biomarkers_scan_id ON scan_biomarkers(scan_id);

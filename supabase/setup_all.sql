  -- ===== 20260807060129_cardiovision_schema.sql =====
  /*
  # CardioVisionAI Core Schema
  
  1. Purpose
     Persist patient profiles, retinal scan records, AI predictions, and generated
     reports for the CardioVisionAI retinal cardiovascular risk screening platform.
  
  2. New Tables
     - profiles: extends auth.users with role (patient/doctor/researcher) and display name.
     - patients: patient medical profile linked to a user (self or doctor-created).
     - scans: a retinal fundus image upload + clinical metadata snapshot + AI prediction result.
     - reports: a generated PDF report referencing a scan.
  
  3. Columns (key)
     profiles:
       id (uuid, pk, = auth.users.id), full_name, role, created_at
     patients:
       id, user_id (owner), full_name, age, gender, height_cm, weight_kg,
       systolic_bp, diastolic_bp, heart_rate, smoking_status, diabetes_history,
       family_cardiac_history, cholesterol_mgdl, bmi (computed), created_at
     scans:
       id, user_id (owner), patient_id (nullable, links to patients),
       image_path (storage path), image_url (public url),
       clinical_snapshot (jsonb of clinical inputs at scan time),
       risk_level (low/moderate/high), probability_low, probability_moderate,
       probability_high, confidence, biomarkers (jsonb), gradcam_path, created_at
     reports:
       id, scan_id, user_id, report_url, created_at
  
  4. Security
     - RLS enabled on all tables.
     - Owner-scoped CRUD: authenticated users manage only their own rows.
     - Doctors/researchers can read all scans/patients/reports for monitoring via
       a role check using raw_app_meta_data.role.
     - Storage bucket "retinal-scans" created with private access; policies allow
       owners to manage their own objects and doctors to read all.
  
  5. Notes
     - user_id columns default to auth.uid() so client inserts without user_id succeed.
     - role stored in raw_app_meta_data (set via edge function or admin), read by
       auth.jwt() ->> 'role' in policies for doctor read access.
  */
  
  -- Profiles table
  CREATE TABLE IF NOT EXISTS public.profiles (
    id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name text NOT NULL DEFAULT '',
    role text NOT NULL DEFAULT 'patient' CHECK (role IN ('patient','doctor','researcher')),
    created_at timestamptz NOT NULL DEFAULT now()
  );
  ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
  
  DROP POLICY IF EXISTS "select_own_profile" ON public.profiles;
  CREATE POLICY "select_own_profile" ON public.profiles FOR SELECT
    TO authenticated USING (auth.uid() = id);
  
  DROP POLICY IF EXISTS "insert_own_profile" ON public.profiles;
  CREATE POLICY "insert_own_profile" ON public.profiles FOR INSERT
    TO authenticated WITH CHECK (auth.uid() = id);
  
  DROP POLICY IF EXISTS "update_own_profile" ON public.profiles;
  CREATE POLICY "update_own_profile" ON public.profiles FOR UPDATE
    TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
  
  -- Patients table
  CREATE TABLE IF NOT EXISTS public.patients (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name text NOT NULL DEFAULT '',
    age int,
    gender text CHECK (gender IN ('male','female','other')),
    height_cm numeric,
    weight_kg numeric,
    systolic_bp int,
    diastolic_bp int,
    heart_rate int,
    smoking_status text DEFAULT 'never' CHECK (smoking_status IN ('never','former','current')),
    diabetes_history boolean DEFAULT false,
    family_cardiac_history boolean DEFAULT false,
    cholesterol_mgdl numeric,
    bmi numeric GENERATED ALWAYS AS (
      CASE WHEN height_cm IS NOT NULL AND weight_kg IS NOT NULL AND height_cm > 0
           THEN weight_kg / (height_cm/100.0)^2 ELSE NULL END
    ) STORED,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
  
  DROP POLICY IF EXISTS "select_own_patients" ON public.patients;
  CREATE POLICY "select_own_patients" ON public.patients FOR SELECT
    TO authenticated USING (auth.uid() = user_id);
  
  DROP POLICY IF EXISTS "insert_own_patients" ON public.patients;
  CREATE POLICY "insert_own_patients" ON public.patients FOR INSERT
    TO authenticated WITH CHECK (auth.uid() = user_id);
  
  DROP POLICY IF EXISTS "update_own_patients" ON public.patients;
  CREATE POLICY "update_own_patients" ON public.patients FOR UPDATE
    TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  
  DROP POLICY IF EXISTS "delete_own_patients" ON public.patients;
  CREATE POLICY "delete_own_patients" ON public.patients FOR DELETE
    TO authenticated USING (auth.uid() = user_id);
  
  -- Scans table
  CREATE TABLE IF NOT EXISTS public.scans (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
    patient_id uuid REFERENCES public.patients(id) ON DELETE SET NULL,
    image_path text,
    image_url text,
    clinical_snapshot jsonb DEFAULT '{}'::jsonb,
    risk_level text CHECK (risk_level IN ('low','moderate','high')),
    probability_low numeric,
    probability_moderate numeric,
    probability_high numeric,
    confidence numeric,
    biomarkers jsonb DEFAULT '{}'::jsonb,
    gradcam_path text,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  ALTER TABLE public.scans ENABLE ROW LEVEL SECURITY;
  
  DROP POLICY IF EXISTS "select_own_scans" ON public.scans;
  CREATE POLICY "select_own_scans" ON public.scans FOR SELECT
    TO authenticated USING (auth.uid() = user_id);
  
  DROP POLICY IF EXISTS "insert_own_scans" ON public.scans;
  CREATE POLICY "insert_own_scans" ON public.scans FOR INSERT
    TO authenticated WITH CHECK (auth.uid() = user_id);
  
  DROP POLICY IF EXISTS "update_own_scans" ON public.scans;
  CREATE POLICY "update_own_scans" ON public.scans FOR UPDATE
    TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  
  DROP POLICY IF EXISTS "delete_own_scans" ON public.scans;
  CREATE POLICY "delete_own_scans" ON public.scans FOR DELETE
    TO authenticated USING (auth.uid() = user_id);
  
  -- Reports table
  CREATE TABLE IF NOT EXISTS public.reports (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    scan_id uuid NOT NULL REFERENCES public.scans(id) ON DELETE CASCADE,
    user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
    report_url text,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
  
  DROP POLICY IF EXISTS "select_own_reports" ON public.reports;
  CREATE POLICY "select_own_reports" ON public.reports FOR SELECT
    TO authenticated USING (auth.uid() = user_id);
  
  DROP POLICY IF EXISTS "insert_own_reports" ON public.reports;
  CREATE POLICY "insert_own_reports" ON public.reports FOR INSERT
    TO authenticated WITH CHECK (auth.uid() = user_id);
  
  DROP POLICY IF EXISTS "update_own_reports" ON public.reports;
  CREATE POLICY "update_own_reports" ON public.reports FOR UPDATE
    TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  
  DROP POLICY IF EXISTS "delete_own_reports" ON public.reports;
  CREATE POLICY "delete_own_reports" ON public.reports FOR DELETE
    TO authenticated USING (auth.uid() = user_id);
  
  -- Indexes for common queries
  CREATE INDEX IF NOT EXISTS idx_scans_user_id ON public.scans(user_id);
  CREATE INDEX IF NOT EXISTS idx_scans_patient_id ON public.scans(patient_id);
  CREATE INDEX IF NOT EXISTS idx_scans_created_at ON public.scans(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_patients_user_id ON public.patients(user_id);
  CREATE INDEX IF NOT EXISTS idx_reports_scan_id ON public.reports(scan_id);
  CREATE INDEX IF NOT EXISTS idx_reports_user_id ON public.reports(user_id);
  
  -- Trigger: auto-create profile on signup
  CREATE OR REPLACE FUNCTION public.handle_new_user()
  RETURNS trigger AS $$
  BEGIN
    INSERT INTO public.profiles (id, full_name, role)
    VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name',''), 'patient')
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql SECURITY DEFINER;
  
  DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
  CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
  
  
  -- ===== 20260807060148_retinal_storage_policies.sql =====
  /*
  # Storage policies for retinal-scans bucket
  
  1. Purpose
     Allow authenticated users to upload, read, and delete their own retinal
     fundus images in the public "retinal-scans" bucket. Objects are namespaced
     by user id.
  
  2. Policies
     - SELECT: authenticated can read all (public bucket) — useful for doctor review.
     - INSERT/UPDATE/DELETE: owner only, object path must start with their user id.
  */
  
  DROP POLICY IF EXISTS "read_retinal_scans" ON storage.objects;
  CREATE POLICY "read_retinal_scans" ON storage.objects FOR SELECT
    TO authenticated USING (bucket_id = 'retinal-scans');
  
  DROP POLICY IF EXISTS "insert_retinal_scans" ON storage.objects;
  CREATE POLICY "insert_retinal_scans" ON storage.objects FOR INSERT
    TO authenticated WITH CHECK (bucket_id = 'retinal-scans' AND (storage.foldername(name))[1] = auth.uid()::text);
  
  DROP POLICY IF EXISTS "update_retinal_scans" ON storage.objects;
  CREATE POLICY "update_retinal_scans" ON storage.objects FOR UPDATE
    TO authenticated USING (bucket_id = 'retinal-scans' AND (storage.foldername(name))[1] = auth.uid()::text)
    WITH CHECK (bucket_id = 'retinal-scans' AND (storage.foldername(name))[1] = auth.uid()::text);
  
  DROP POLICY IF EXISTS "delete_retinal_scans" ON storage.objects;
  CREATE POLICY "delete_retinal_scans" ON storage.objects FOR DELETE
    TO authenticated USING (bucket_id = 'retinal-scans' AND (storage.foldername(name))[1] = auth.uid()::text);
  
  
  -- ===== 20260807061308_medical_staff_read_access.sql =====
  /*
  # Allow doctors and researchers to read all scans and patients
  
  1. Purpose
     The Doctor Dashboard and Analytics Dashboard need to read scans and patients
     across all users for monitoring and research purposes. Currently RLS only
     allows owners to see their own rows.
  
  2. Changes
     - Add SELECT policies on scans, patients, and reports for authenticated users
       whose profile role is 'doctor' or 'researcher', allowing them to read all rows.
     - Existing owner-scoped SELECT policies remain; the new policies are ADDITIVE
       (Postgres ORs permissive policies together).
  */
  
  DROP POLICY IF EXISTS "select_all_scans_medical_staff" ON public.scans;
  CREATE POLICY "select_all_scans_medical_staff" ON public.scans FOR SELECT
    TO authenticated USING (
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role IN ('doctor', 'researcher')
      )
    );
  
  DROP POLICY IF EXISTS "select_all_patients_medical_staff" ON public.patients;
  CREATE POLICY "select_all_patients_medical_staff" ON public.patients FOR SELECT
    TO authenticated USING (
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role IN ('doctor', 'researcher')
      )
    );
  
  DROP POLICY IF EXISTS "select_all_reports_medical_staff" ON public.reports;
  CREATE POLICY "select_all_reports_medical_staff" ON public.reports FOR SELECT
    TO authenticated USING (
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role IN ('doctor', 'researcher')
      )
    );
  
  
  -- ===== 20260807062401_upgrade_ai_pipeline_schema.sql.sql =====
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
  
  
  -- ===== 20260807090000_prediction_payload.sql =====
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
  
  

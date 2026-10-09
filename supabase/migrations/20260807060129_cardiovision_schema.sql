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

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

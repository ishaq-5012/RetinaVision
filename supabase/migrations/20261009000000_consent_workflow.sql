/*
# Consent-based data sharing (patient ⇄ doctor ⇄ researcher)

Replaces the old "every doctor/researcher can read every scan" policies with
explicit, patient-controlled consent:

  1. care_links          Patient requests a doctor → doctor accepts/declines.
                         An ACCEPTED link lets that doctor read the patient's
                         scans, patient record and reports. Either side can
                         end it (status 'revoked').
  2. research_requests   Researcher asks a doctor for data (title + purpose).
                         Doctor forwards it to their linked patients, or declines.
  3. research_consents   One row per (request, patient). The PATIENT accepts or
                         declines; the DOCTOR can then grant access in one click,
                         but only for rows the patient accepted. Granted rows let
                         the researcher read that patient's scans (pseudonymised:
                         researchers cannot read patient names). The patient can
                         revoke at any time.

All state transitions are enforced in the database by triggers, so the rules
cannot be bypassed from the browser.
*/

-- ---------------------------------------------------------------------------
-- Signup: honour the role chosen on the registration form
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  chosen text := NEW.raw_user_meta_data->>'role';
BEGIN
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    CASE WHEN chosen IN ('patient', 'doctor', 'researcher') THEN chosen ELSE 'patient' END
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.care_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  doctor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'revoked')),
  message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  UNIQUE (patient_id, doctor_id),
  CHECK (patient_id <> doctor_id)
);

CREATE TABLE IF NOT EXISTS public.research_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  researcher_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  doctor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(title) BETWEEN 3 AND 160),
  purpose text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'forwarded', 'granted', 'declined')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.research_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.research_requests(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'granted', 'revoked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  granted_at timestamptz,
  UNIQUE (request_id, patient_id)
);

CREATE INDEX IF NOT EXISTS idx_care_links_doctor ON public.care_links(doctor_id, status);
CREATE INDEX IF NOT EXISTS idx_care_links_patient ON public.care_links(patient_id, status);
CREATE INDEX IF NOT EXISTS idx_research_requests_doctor ON public.research_requests(doctor_id);
CREATE INDEX IF NOT EXISTS idx_research_requests_researcher ON public.research_requests(researcher_id);
CREATE INDEX IF NOT EXISTS idx_research_consents_patient ON public.research_consents(patient_id, status);
CREATE INDEX IF NOT EXISTS idx_research_consents_request ON public.research_consents(request_id, status);

ALTER TABLE public.care_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_consents ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Helper functions (SECURITY DEFINER avoids recursive RLS evaluation)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.role_of(uid uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.profiles WHERE id = uid
$$;

CREATE OR REPLACE FUNCTION public.is_doctor_of(patient uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.care_links
    WHERE doctor_id = auth.uid() AND patient_id = patient AND status = 'accepted'
  )
$$;

CREATE OR REPLACE FUNCTION public.researcher_has_access(patient uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.research_consents c
    JOIN public.research_requests r ON r.id = c.request_id
    WHERE r.researcher_id = auth.uid() AND c.patient_id = patient AND c.status = 'granted'
  )
$$;

-- Is the current user the doctor or researcher on this request?
CREATE OR REPLACE FUNCTION public.is_request_party(req uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.research_requests
    WHERE id = req AND (doctor_id = auth.uid() OR researcher_id = auth.uid())
  )
$$;

CREATE OR REPLACE FUNCTION public.is_request_doctor(req uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.research_requests WHERE id = req AND doctor_id = auth.uid())
$$;

-- Was the current user (a patient) asked to consent to this request?
CREATE OR REPLACE FUNCTION public.is_consent_patient(req uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.research_consents WHERE request_id = req AND patient_id = auth.uid()
  )
$$;

-- Profiles: everyone sees doctors & researchers (directory); a doctor sees the
-- names of patients who sent them a link request; researchers never see patients.
CREATE OR REPLACE FUNCTION public.can_see_profile(target uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT target = auth.uid()
      OR public.role_of(target) IN ('doctor', 'researcher')
      OR EXISTS (SELECT 1 FROM public.care_links WHERE doctor_id = auth.uid() AND patient_id = target)
$$;

-- ---------------------------------------------------------------------------
-- Profiles visibility
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "select_own_profile" ON public.profiles;
DROP POLICY IF EXISTS "select_visible_profiles" ON public.profiles;
CREATE POLICY "select_visible_profiles" ON public.profiles FOR SELECT
  TO authenticated USING (public.can_see_profile(id));

-- ---------------------------------------------------------------------------
-- Replace blanket medical-staff access with consent-based access
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "select_all_scans_medical_staff" ON public.scans;
DROP POLICY IF EXISTS "select_all_patients_medical_staff" ON public.patients;
DROP POLICY IF EXISTS "select_all_reports_medical_staff" ON public.reports;

DROP POLICY IF EXISTS "select_scans_linked_doctor" ON public.scans;
CREATE POLICY "select_scans_linked_doctor" ON public.scans FOR SELECT
  TO authenticated USING (public.is_doctor_of(user_id));

DROP POLICY IF EXISTS "select_scans_consented_researcher" ON public.scans;
CREATE POLICY "select_scans_consented_researcher" ON public.scans FOR SELECT
  TO authenticated USING (public.researcher_has_access(user_id));

DROP POLICY IF EXISTS "select_patients_linked_doctor" ON public.patients;
CREATE POLICY "select_patients_linked_doctor" ON public.patients FOR SELECT
  TO authenticated USING (public.is_doctor_of(user_id));

DROP POLICY IF EXISTS "select_reports_linked_doctor" ON public.reports;
CREATE POLICY "select_reports_linked_doctor" ON public.reports FOR SELECT
  TO authenticated USING (public.is_doctor_of(user_id));

-- ---------------------------------------------------------------------------
-- care_links policies
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "care_links_select" ON public.care_links;
CREATE POLICY "care_links_select" ON public.care_links FOR SELECT
  TO authenticated USING (patient_id = auth.uid() OR doctor_id = auth.uid());

DROP POLICY IF EXISTS "care_links_insert" ON public.care_links;
CREATE POLICY "care_links_insert" ON public.care_links FOR INSERT
  TO authenticated WITH CHECK (
    patient_id = auth.uid()
    AND status = 'pending'
    AND public.role_of(auth.uid()) = 'patient'
    AND public.role_of(doctor_id) = 'doctor'
  );

DROP POLICY IF EXISTS "care_links_update" ON public.care_links;
CREATE POLICY "care_links_update" ON public.care_links FOR UPDATE
  TO authenticated USING (patient_id = auth.uid() OR doctor_id = auth.uid())
  WITH CHECK (patient_id = auth.uid() OR doctor_id = auth.uid());

CREATE OR REPLACE FUNCTION public.care_links_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.patient_id <> OLD.patient_id OR NEW.doctor_id <> OLD.doctor_id THEN
    RAISE EXCEPTION 'Participants of a care link cannot be changed';
  END IF;
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  IF auth.uid() = OLD.doctor_id THEN
    -- Doctor answers a pending request, or ends an accepted link
    IF NOT ((OLD.status = 'pending' AND NEW.status IN ('accepted', 'declined'))
         OR (OLD.status = 'accepted' AND NEW.status = 'revoked')) THEN
      RAISE EXCEPTION 'Doctor cannot change care link from % to %', OLD.status, NEW.status;
    END IF;
  ELSIF auth.uid() = OLD.patient_id THEN
    -- Patient withdraws/ends a link, or re-sends after decline/revoke
    IF NOT ((OLD.status IN ('pending', 'accepted') AND NEW.status = 'revoked')
         OR (OLD.status IN ('declined', 'revoked') AND NEW.status = 'pending')) THEN
      RAISE EXCEPTION 'Patient cannot change care link from % to %', OLD.status, NEW.status;
    END IF;
  ELSE
    RAISE EXCEPTION 'Not a participant of this care link';
  END IF;

  NEW.responded_at := now();
  -- Ending a care link also withdraws the doctor's ability to grant this patient's
  -- data: pending/accepted consents on that doctor's requests are revoked.
  IF NEW.status = 'revoked' THEN
    PERFORM set_config('app.system_update', 'on', true);
    UPDATE public.research_consents c SET status = 'revoked', responded_at = now()
    FROM public.research_requests r
    WHERE c.request_id = r.id AND r.doctor_id = NEW.doctor_id
      AND c.patient_id = NEW.patient_id AND c.status IN ('pending', 'accepted');
    PERFORM set_config('app.system_update', 'off', true);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS care_links_guard ON public.care_links;
CREATE TRIGGER care_links_guard BEFORE UPDATE ON public.care_links
  FOR EACH ROW EXECUTE FUNCTION public.care_links_guard();

-- ---------------------------------------------------------------------------
-- research_requests policies
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "research_requests_select" ON public.research_requests;
CREATE POLICY "research_requests_select" ON public.research_requests FOR SELECT
  TO authenticated USING (
    researcher_id = auth.uid() OR doctor_id = auth.uid() OR public.is_consent_patient(id)
  );

DROP POLICY IF EXISTS "research_requests_insert" ON public.research_requests;
CREATE POLICY "research_requests_insert" ON public.research_requests FOR INSERT
  TO authenticated WITH CHECK (
    researcher_id = auth.uid()
    AND status = 'pending'
    AND public.role_of(auth.uid()) = 'researcher'
    AND public.role_of(doctor_id) = 'doctor'
  );

DROP POLICY IF EXISTS "research_requests_update" ON public.research_requests;
CREATE POLICY "research_requests_update" ON public.research_requests FOR UPDATE
  TO authenticated USING (doctor_id = auth.uid()) WITH CHECK (doctor_id = auth.uid());

CREATE OR REPLACE FUNCTION public.research_requests_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.researcher_id <> OLD.researcher_id OR NEW.doctor_id <> OLD.doctor_id
     OR NEW.title <> OLD.title OR NEW.purpose <> OLD.purpose THEN
    RAISE EXCEPTION 'Request details cannot be changed';
  END IF;
  IF NEW.status <> OLD.status AND NOT (
       (OLD.status = 'pending' AND NEW.status IN ('forwarded', 'declined'))
    OR (OLD.status IN ('forwarded', 'granted') AND NEW.status IN ('granted', 'forwarded'))
  ) THEN
    RAISE EXCEPTION 'Request cannot change from % to %', OLD.status, NEW.status;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS research_requests_guard ON public.research_requests;
CREATE TRIGGER research_requests_guard BEFORE UPDATE ON public.research_requests
  FOR EACH ROW EXECUTE FUNCTION public.research_requests_guard();

-- ---------------------------------------------------------------------------
-- research_consents policies
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "research_consents_select" ON public.research_consents;
CREATE POLICY "research_consents_select" ON public.research_consents FOR SELECT
  TO authenticated USING (patient_id = auth.uid() OR public.is_request_party(request_id));

-- Doctor forwards a request only to patients linked to them
DROP POLICY IF EXISTS "research_consents_insert" ON public.research_consents;
CREATE POLICY "research_consents_insert" ON public.research_consents FOR INSERT
  TO authenticated WITH CHECK (
    status = 'pending'
    AND public.is_request_doctor(request_id)
    AND public.is_doctor_of(patient_id)
  );

DROP POLICY IF EXISTS "research_consents_update" ON public.research_consents;
CREATE POLICY "research_consents_update" ON public.research_consents FOR UPDATE
  TO authenticated USING (patient_id = auth.uid() OR public.is_request_doctor(request_id))
  WITH CHECK (patient_id = auth.uid() OR public.is_request_doctor(request_id));

CREATE OR REPLACE FUNCTION public.research_consents_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.request_id <> OLD.request_id OR NEW.patient_id <> OLD.patient_id THEN
    RAISE EXCEPTION 'Consent participants cannot be changed';
  END IF;
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;
  -- Cascades from care_links_guard (ending a care link)
  IF current_setting('app.system_update', true) = 'on' AND NEW.status = 'revoked' THEN
    RETURN NEW;
  END IF;

  IF auth.uid() = OLD.patient_id THEN
    -- Patient decides, and can always withdraw
    IF NOT ((OLD.status = 'pending' AND NEW.status IN ('accepted', 'declined', 'revoked'))
         OR (OLD.status IN ('accepted', 'granted') AND NEW.status = 'revoked')
         OR (OLD.status IN ('declined', 'revoked') AND NEW.status = 'accepted')) THEN
      RAISE EXCEPTION 'Patient cannot change consent from % to %', OLD.status, NEW.status;
    END IF;
    NEW.responded_at := now();
  ELSIF public.is_request_doctor(OLD.request_id) THEN
    -- Doctor may ONLY grant access where the patient accepted
    IF NOT (OLD.status = 'accepted' AND NEW.status = 'granted') THEN
      RAISE EXCEPTION 'Access can only be granted after the patient accepts (current: %)', OLD.status;
    END IF;
    IF NOT public.is_doctor_of(OLD.patient_id) THEN
      RAISE EXCEPTION 'You are no longer this patient''s doctor';
    END IF;
    NEW.granted_at := now();
  ELSE
    RAISE EXCEPTION 'Not allowed to change this consent';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS research_consents_guard ON public.research_consents;
CREATE TRIGGER research_consents_guard BEFORE UPDATE ON public.research_consents
  FOR EACH ROW EXECUTE FUNCTION public.research_consents_guard();

-- ---------------------------------------------------------------------------
-- Backfill: restore roles chosen at sign-up for accounts created before this
-- migration (the old signup trigger always stored 'patient').
-- ---------------------------------------------------------------------------
UPDATE public.profiles p
SET role = u.raw_user_meta_data->>'role'
FROM auth.users u
WHERE u.id = p.id
  AND u.raw_user_meta_data->>'role' IN ('patient', 'doctor', 'researcher')
  AND p.role IS DISTINCT FROM u.raw_user_meta_data->>'role';

-- Make the new tables visible to the API immediately
NOTIFY pgrst, 'reload schema';

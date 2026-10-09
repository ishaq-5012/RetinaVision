import { supabase, type Profile, type Scan } from './supabase';

/*
 * Consent-based sharing between patients, doctors and researchers.
 * Every rule is enforced by Postgres RLS + triggers
 * (supabase/migrations/20261009000000_consent_workflow.sql); these helpers
 * only call the allowed operations.
 */

export type LinkStatus = 'pending' | 'accepted' | 'declined' | 'revoked';
export type RequestStatus = 'pending' | 'forwarded' | 'granted' | 'declined';
export type ConsentStatus = 'pending' | 'accepted' | 'declined' | 'granted' | 'revoked';

export interface CareLink {
  id: string;
  patient_id: string;
  doctor_id: string;
  status: LinkStatus;
  message: string | null;
  created_at: string;
  responded_at: string | null;
}

export interface ResearchRequest {
  id: string;
  researcher_id: string;
  doctor_id: string;
  title: string;
  purpose: string;
  status: RequestStatus;
  created_at: string;
  updated_at: string;
}

export interface ResearchConsent {
  id: string;
  request_id: string;
  patient_id: string;
  status: ConsentStatus;
  created_at: string;
  responded_at: string | null;
  granted_at: string | null;
}

export type PublicProfile = Pick<Profile, 'id' | 'full_name' | 'role'>;

function check<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return (res.data ?? ([] as unknown)) as T;
}

/** Profiles visible to the current user, keyed by id. */
export async function getProfiles(ids: string[]): Promise<Record<string, PublicProfile>> {
  const unique = [...new Set(ids)].filter(Boolean);
  if (!unique.length) return {};
  const rows = check<PublicProfile[]>(await supabase.from('profiles').select('id, full_name, role').in('id', unique));
  return Object.fromEntries(rows.map((p) => [p.id, p]));
}

export async function listDoctors(): Promise<PublicProfile[]> {
  return check<PublicProfile[]>(
    await supabase.from('profiles').select('id, full_name, role').eq('role', 'doctor').order('full_name'),
  );
}

/* ---------------- Care links (patient ⇄ doctor) ---------------- */

export async function myCareLinks(): Promise<CareLink[]> {
  return check<CareLink[]>(await supabase.from('care_links').select('*').order('created_at', { ascending: false }));
}

/** Patient sends (or re-sends) a request to a doctor. */
export async function requestDoctor(patientId: string, doctorId: string, existing?: CareLink, message?: string) {
  if (existing) {
    check(await supabase.from('care_links').update({ status: 'pending' }).eq('id', existing.id).select());
    return;
  }
  check(
    await supabase
      .from('care_links')
      .insert({ patient_id: patientId, doctor_id: doctorId, status: 'pending', message: message ?? null })
      .select(),
  );
}

export async function setLinkStatus(linkId: string, status: LinkStatus) {
  check(await supabase.from('care_links').update({ status }).eq('id', linkId).select());
}

/* ---------------- Research requests ---------------- */

export async function myResearchRequests(): Promise<ResearchRequest[]> {
  return check<ResearchRequest[]>(
    await supabase.from('research_requests').select('*').order('created_at', { ascending: false }),
  );
}

export async function createResearchRequest(researcherId: string, doctorId: string, title: string, purpose: string) {
  check(
    await supabase
      .from('research_requests')
      .insert({ researcher_id: researcherId, doctor_id: doctorId, title, purpose, status: 'pending' })
      .select(),
  );
}

export async function setRequestStatus(requestId: string, status: RequestStatus) {
  check(await supabase.from('research_requests').update({ status }).eq('id', requestId).select());
}

/** Doctor forwards a researcher's request to every currently linked patient. Returns how many were asked. */
export async function forwardToPatients(requestId: string, patientIds: string[]) {
  if (patientIds.length) {
    check(
      await supabase
        .from('research_consents')
        .upsert(
          patientIds.map((patient_id) => ({ request_id: requestId, patient_id, status: 'pending' })),
          { onConflict: 'request_id,patient_id', ignoreDuplicates: true },
        )
        .select(),
    );
  }
  await setRequestStatus(requestId, 'forwarded');
  return patientIds.length;
}

/* ---------------- Consents ---------------- */

export async function consentsFor(requestIds?: string[]): Promise<ResearchConsent[]> {
  let q = supabase.from('research_consents').select('*').order('created_at', { ascending: false });
  if (requestIds) {
    if (!requestIds.length) return [];
    q = q.in('request_id', requestIds);
  }
  return check<ResearchConsent[]>(await q);
}

export async function setConsentStatus(consentId: string, status: ConsentStatus) {
  check(await supabase.from('research_consents').update({ status }).eq('id', consentId).select());
}

/**
 * Doctor's one-click grant: gives the researcher access to every patient who
 * ACCEPTED this request. Rows not accepted by the patient are untouched (and
 * the database would refuse them anyway). Returns the number granted.
 */
export async function grantAccepted(requestId: string): Promise<number> {
  const rows = check<ResearchConsent[]>(
    await supabase
      .from('research_consents')
      .update({ status: 'granted' })
      .eq('request_id', requestId)
      .eq('status', 'accepted')
      .select(),
  );
  if (rows.length) await setRequestStatus(requestId, 'granted');
  return rows.length;
}

/* ---------------- Shared data ---------------- */

/** Scans the database lets the current user read, excluding their own. */
export async function sharedScans(currentUserId: string): Promise<Scan[]> {
  const rows = check<Scan[]>(
    await supabase.from('scans').select('*').neq('user_id', currentUserId).order('created_at', { ascending: false }),
  );
  return rows;
}

/** Stable, non-identifying pseudonym for researchers, e.g. "Subject 7F3A2C". */
export function pseudonym(userId: string): string {
  let h = 2166136261;
  for (let i = 0; i < userId.length; i++) {
    h ^= userId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `Subject ${(h >>> 0).toString(16).toUpperCase().padStart(8, '0').slice(0, 6)}`;
}

export function initials(name?: string | null) {
  const parts = (name || '?').trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?';
}

/** True when the consent-workflow migration has not been applied to the database yet. */
export function isSharingSetupMissing(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /schema cache|care_links|research_requests|research_consents|role_of/i.test(msg);
}

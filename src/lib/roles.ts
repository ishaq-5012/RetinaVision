export type Role = 'patient' | 'doctor' | 'researcher';

/** Each role's own dashboard. */
export function homeFor(role?: string | null): string {
  return role === 'doctor' ? '/doctor' : role === 'researcher' ? '/research' : '/dashboard';
}

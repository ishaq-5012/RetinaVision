import type { ReactNode } from 'react';
import { DatabaseZap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { initials, type ConsentStatus, type LinkStatus, type RequestStatus } from '@/lib/consent';

const STATUS_STYLE: Record<string, { label: string; cls: string; dot: string }> = {
  pending: { label: 'Pending', cls: 'border-warning/30 bg-warning/10 text-warning', dot: 'bg-warning' },
  accepted: { label: 'Accepted', cls: 'border-success/30 bg-success/10 text-success', dot: 'bg-success' },
  declined: { label: 'Declined', cls: 'border-destructive/30 bg-destructive/10 text-destructive', dot: 'bg-destructive' },
  revoked: { label: 'Revoked', cls: 'border-border bg-muted text-muted-foreground', dot: 'bg-muted-foreground' },
  forwarded: { label: 'Forwarded to patients', cls: 'border-primary/30 bg-primary/10 text-primary', dot: 'bg-primary' },
  granted: { label: 'Access granted', cls: 'border-violet-400/30 bg-violet-400/10 text-violet-300', dot: 'bg-violet-400' },
};

export function StatusPill({ status, label }: { status: LinkStatus | RequestStatus | ConsentStatus; label?: string }) {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.pending;
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-semibold', s.cls)}>
      <span className="relative flex h-1.5 w-1.5">
        {status === 'pending' && <span className={cn('absolute inline-flex h-full w-full animate-ping rounded-full opacity-60', s.dot)} />}
        <span className={cn('relative inline-flex h-1.5 w-1.5 rounded-full', s.dot)} />
      </span>
      {label ?? s.label}
    </span>
  );
}

const AVATAR_TONES = [
  'from-cyan-400 to-blue-600',
  'from-violet-400 to-fuchsia-600',
  'from-emerald-400 to-teal-600',
  'from-amber-400 to-orange-600',
  'from-rose-400 to-pink-600',
];

export function Avatar({ name, id, size = 40, className }: { name?: string | null; id?: string; size?: number; className?: string }) {
  const key = id ?? name ?? '';
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  const tone = AVATAR_TONES[h % AVATAR_TONES.length];
  return (
    <div
      className={cn('flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br font-bold text-white shadow-lg', tone, className)}
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {initials(name)}
    </div>
  );
}

/** Small horizontal step tracker used to visualise the consent pipeline. */
export function FlowSteps({ steps, current }: { steps: string[]; current: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {steps.map((s, i) => (
        <div key={s} className="flex min-w-0 flex-1 items-center gap-1.5">
          <div
            className={cn(
              'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold transition-all duration-500',
              i < current && 'bg-success text-white',
              i === current && 'gradient-medical text-white ring-4 ring-primary/20',
              i > current && 'bg-muted text-muted-foreground',
            )}
          >
            {i < current ? '✓' : i + 1}
          </div>
          <span className={cn('truncate text-[11px]', i <= current ? 'text-foreground' : 'text-muted-foreground')}>{s}</span>
          {i < steps.length - 1 && (
            <div className="relative h-0.5 min-w-3 flex-1 overflow-hidden rounded-full bg-border">
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-cyan-400 to-blue-600 transition-[width] duration-700"
                style={{ width: i < current ? '100%' : '0%' }}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function SectionTitle({ icon: Icon, title, hint, right }: { icon: React.ComponentType<{ className?: string }>; title: string; hint?: string; right?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <h2 className="font-semibold">{title}</h2>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
      </div>
      {right}
    </div>
  );
}

export function CountBadge({ n }: { n: number }) {
  if (!n) return null;
  return (
    <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-gradient-to-br from-rose-400 to-red-600 px-1.5 text-[10px] font-bold text-white shadow-[0_0_12px_hsl(350_89%_60%/0.6)]">
      {n}
    </span>
  );
}

export function SharingSetupNotice() {
  return (
    <div className="enter rounded-2xl border border-warning/40 bg-warning/10 p-6">
      <div className="flex items-start gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-600 text-white shadow-lg">
          <DatabaseZap className="h-5 w-5" />
        </div>
        <div>
          <h2 className="font-semibold">Data sharing is not set up in the database yet</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Doctors, patient requests and research consent need the database migration
            <code className="mx-1 rounded bg-muted px-1.5 py-0.5 text-xs">supabase/migrations/20261009000000_consent_workflow.sql</code>.
            Run it once in the Supabase SQL Editor, then refresh this page.
          </p>
        </div>
      </div>
    </div>
  );
}

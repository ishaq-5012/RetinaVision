import { cn } from '@/lib/utils';
import type { RiskLevel } from '@/lib/supabase';
import { nextEnterDelay, useCountUp, useMounted } from '@/hooks/useMotion';
import { useState } from 'react';

export function RiskBadge({ level, className }: { level: RiskLevel; className?: string }) {
  const config = {
    low: { label: 'Low Risk', className: 'bg-success/15 text-success border-success/30', dot: 'bg-success' },
    moderate: { label: 'Moderate Risk', className: 'bg-warning/15 text-warning border-warning/30', dot: 'bg-warning' },
    high: { label: 'High Risk', className: 'bg-destructive/15 text-destructive border-destructive/30', dot: 'bg-destructive' },
  };
  const c = config[level];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold',
        c.className,
        className,
      )}
    >
      <span className="relative flex h-2 w-2">
        <span className={cn('absolute inline-flex h-full w-full animate-ping rounded-full opacity-50', c.dot)} />
        <span className={cn('relative inline-flex h-2 w-2 rounded-full', c.dot)} />
      </span>
      {c.label}
    </span>
  );
}

/** Donut gauge showing how closely the score matches each risk category; draws itself in on mount. */
export function RiskGauge({
  low,
  moderate,
  high,
  size = 168,
}: {
  low: number;
  moderate: number;
  high: number;
  size?: number;
}) {
  const mounted = useMounted(120);
  const top = useCountUp(Math.max(low, moderate, high), 1300);
  const stroke = 14;
  const radius = size / 2 - stroke;
  const circumference = 2 * Math.PI * radius;
  const total = low + moderate + high || 1;
  const segments = [
    { value: low, color: 'hsl(142 71% 45%)' },
    { value: moderate, color: 'hsl(38 92% 50%)' },
    { value: high, color: 'hsl(0 84% 60%)' },
  ];
  let offset = 0;
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      {/* soft glow behind the ring */}
      <div className="absolute inset-4 rounded-full bg-primary/10 blur-2xl" />
      <svg width={size} height={size} className="relative -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="hsl(var(--border))" strokeWidth={stroke} />
        {segments.map((seg, i) => {
          const len = (seg.value / total) * circumference;
          const shown = mounted ? len : 0;
          const el = (
            <circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={seg.color}
              strokeWidth={stroke}
              strokeDasharray={`${shown} ${circumference - shown}`}
              strokeDashoffset={-offset}
              strokeLinecap="round"
              style={{
                transition: 'stroke-dasharray 1.2s cubic-bezier(0.16, 1, 0.3, 1)',
                transitionDelay: `${i * 180}ms`,
              }}
            />
          );
          offset += len;
          return el;
        })}
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="font-display text-3xl font-bold tabular-nums">{Math.round(top)}%</span>
        <span className="text-[11px] text-muted-foreground">Category match</span>
      </div>
    </div>
  );
}

export function StatCard({
  label,
  value,
  unit,
  icon: Icon,
  accent = 'primary',
}: {
  label: string;
  value: string | number;
  unit?: string;
  icon: React.ComponentType<{ className?: string }>;
  accent?: 'primary' | 'success' | 'warning' | 'destructive';
}) {
  const [delay] = useState(() => nextEnterDelay());
  const numeric = typeof value === 'number' ? value : null;
  const counted = useCountUp(numeric ?? 0, 1000);
  const accentMap = {
    primary: { icon: 'from-sky-400 to-blue-600 shadow-sky-500/30', glow: 'bg-sky-500/10' },
    success: { icon: 'from-emerald-400 to-green-600 shadow-emerald-500/30', glow: 'bg-emerald-500/10' },
    warning: { icon: 'from-amber-400 to-orange-500 shadow-amber-500/30', glow: 'bg-amber-500/10' },
    destructive: { icon: 'from-rose-400 to-red-600 shadow-rose-500/30', glow: 'bg-rose-500/10' },
  };
  const a = accentMap[accent];
  return (
    <div
      data-tilt="8"
      className="enter spot group relative overflow-hidden rounded-2xl border border-border/70 bg-card p-5 shadow-soft hover:border-primary/30 hover:shadow-[0_24px_50px_-24px_hsl(192_95%_50%/0.4)]"
      style={{ ['--enter-delay' as string]: `${delay}ms` }}
    >
      <div className={cn('absolute -right-8 -top-8 h-24 w-24 rounded-full blur-2xl transition-transform duration-500 group-hover:scale-150', a.glow)} />
      <div className="relative flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
        <div
          className={cn(
            'flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-lg transition-transform duration-300 group-hover:rotate-6 group-hover:scale-110',
            a.icon,
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="relative mt-3 font-display text-3xl font-bold tracking-tight tabular-nums">
        {numeric != null ? Math.round(counted) : value}
        {unit && <span className="ml-1 text-sm font-normal text-muted-foreground">{unit}</span>}
      </p>
    </div>
  );
}

export function BiomarkerBar({
  label,
  value,
  max = 1,
  hint,
}: {
  label: string;
  value: number;
  max?: number;
  hint?: string;
}) {
  const mounted = useMounted(150);
  const counted = useCountUp(value, 1100, 3);
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="group">
      <div className="mb-1.5 flex justify-between text-xs">
        <span className="text-muted-foreground transition-colors group-hover:text-foreground">{label}</span>
        <span className="font-semibold tabular-nums">{counted.toFixed(2)}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="relative h-full overflow-hidden rounded-full bg-gradient-to-r from-sky-400 to-blue-600 transition-[width] duration-1000 ease-out"
          style={{ width: mounted ? `${pct}%` : '0%' }}
        >
          <div className="animate-shimmer absolute inset-0 opacity-60" />
        </div>
      </div>
      {hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function LoadingSpinner({ label }: { label?: string }) {
  return (
    <div className="enter-fade flex flex-col items-center justify-center gap-4 py-20">
      <div className="relative h-14 w-14">
        <div className="absolute inset-0 rounded-full border-4 border-primary/15" />
        <div className="absolute inset-0 animate-spin rounded-full border-4 border-transparent border-t-primary" />
        <div className="absolute inset-3 animate-pulse rounded-full gradient-medical opacity-80" />
      </div>
      {label && <p className="text-sm font-medium text-muted-foreground">{label}</p>}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="enter flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/50 py-16 text-center">
      <div className="mb-4 flex h-16 w-16 animate-float items-center justify-center rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5">
        <Icon className="h-7 w-7 text-primary" />
      </div>
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

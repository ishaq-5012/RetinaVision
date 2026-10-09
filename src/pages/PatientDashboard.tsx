import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Activity,
  Heart,
  Upload,
  TrendingUp,
  Brain,
  ChevronRight,
  ScanEye,
  ShieldCheck,
  FlaskConical,
  UserPlus,
} from 'lucide-react';
import { AppLayout } from '@/components/AppLayout';
import { StatCard, RiskBadge, EmptyState } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';
import { useCountUp, useMounted } from '@/hooks/useMotion';
import { ParticleField } from '@/components/fx';
import { Avatar } from '@/components/consent-ui';
import { consentsFor, getProfiles, myCareLinks, type CareLink, type PublicProfile } from '@/lib/consent';
import { Area, AreaChart, CartesianGrid, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { supabase, type Scan, type Patient } from '@/lib/supabase';

export function PatientDashboard() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [scans, setScans] = useState<Scan[]>([]);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [loading, setLoading] = useState(true);
  const [careTeam, setCareTeam] = useState<CareLink[]>([]);
  const [doctorNames, setDoctorNames] = useState<Record<string, PublicProfile>>({});
  const [pendingConsents, setPendingConsents] = useState(0);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const [links, consents] = await Promise.all([myCareLinks(), consentsFor()]);
        const team = links.filter((l) => l.patient_id === user.id && (l.status === 'accepted' || l.status === 'pending'));
        setCareTeam(team);
        setPendingConsents(consents.filter((c) => c.patient_id === user.id && c.status === 'pending').length);
        setDoctorNames(await getProfiles(team.map((l) => l.doctor_id)));
      } catch {
        /* sharing tables not migrated yet */
      }
    })();
  }, [user]);

  useEffect(() => {
    async function loadData() {
      if (!user) return;
      const [scansRes, patientRes] = await Promise.all([
        supabase
          .from('scans')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(5),
        supabase
          .from('patients')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .maybeSingle(),
      ]);
      setScans((scansRes.data as Scan[]) ?? []);
      setPatient((patientRes.data as Patient) ?? null);
      setLoading(false);
    }
    loadData();
  }, [user]);

  const totalScans = scans.length;
  const highRiskCount = scans.filter((s) => s.risk_level === 'high').length;
  const latestScan = scans[0];
  const scoreOf = (s: Scan) => s.prediction_payload?.risk_score ?? s.confidence ?? 0;
  const avgConfidence = scans.length
    ? Math.round(scans.reduce((sum, s) => sum + scoreOf(s), 0) / scans.length)
    : 0;
  const thumbOf = (s: Scan) => s.image_url || s.prediction_payload?.original_image || null;
  const levelLabel = (l?: string) => (l ? l.charAt(0).toUpperCase() + l.slice(1) : '—');
  const levelColor = (l?: string) =>
    l === 'high' ? 'hsl(350 89% 60%)' : l === 'moderate' ? 'hsl(38 95% 56%)' : 'hsl(152 69% 47%)';

  // Trend data: chronological order
  const trend = [...scans].reverse().map((s, i) => ({
    name: `#${i + 1}`,
    date: new Date(s.created_at).toLocaleDateString(),
    score: scoreOf(s),
  }));

  const firstName = profile?.full_name?.split(' ')[0] || 'there';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <AppLayout>
      {/* Hero */}
      <div className="enter conic-border relative mb-6 overflow-hidden rounded-3xl border border-border bg-card p-6 sm:p-8">
        <ParticleField className="opacity-50" density={0.00006} />
        <div className="aurora opacity-60" />
        <div className="dot-grid absolute inset-0" />
        <div className="relative flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">{greeting}</p>
            <h1 className="mt-2 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
              <span className="text-fade-white">Welcome back, </span>
              <span className="text-gradient-cyan">{firstName}</span>
            </h1>
            <p className="mt-3 text-muted-foreground">
              {latestScan
                ? `Your latest screening on ${new Date(latestScan.created_at).toLocaleDateString()} placed you in the ${latestScan.risk_level} risk category.`
                : 'Run your first retinal screening to see your cardiovascular risk overview.'}
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button size="lg" onClick={() => navigate('/upload')} className="rounded-full">
                <Upload className="mr-2 h-4 w-4" />
                Start new scan
              </Button>
              {latestScan && (
                <Button size="lg" variant="outline" className="rounded-full" asChild>
                  <Link to={`/result/${latestScan.id}`}>
                    View latest result <ChevronRight className="ml-1 h-4 w-4" />
                  </Link>
                </Button>
              )}
            </div>
          </div>

          {latestScan && (
            <div data-tilt="10" className="glass-dark flex items-center gap-5 rounded-2xl p-5">
              <ScoreRing score={scoreOf(latestScan)} color={levelColor(latestScan.risk_level)} size={112} />
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Latest risk score</p>
                <p className="mt-1 font-display text-2xl font-bold" style={{ color: levelColor(latestScan.risk_level) }}>
                  {levelLabel(latestScan.risk_level)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {latestScan.clinical_snapshot?.age ?? '—'} yrs · BP {latestScan.clinical_snapshot?.systolic_bp}/
                  {latestScan.clinical_snapshot?.diastolic_bp}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Research consent alert */}
      {pendingConsents > 0 && (
        <Link
          to="/care"
          className="conic-border enter group mb-6 flex items-center gap-4 rounded-2xl border border-primary/30 bg-primary/10 p-4 transition-colors hover:bg-primary/15"
        >
          <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-400 to-fuchsia-600 text-white shadow-lg">
            <FlaskConical className="h-5 w-5" />
            <span className="pulse-ring absolute inset-0 rounded-xl border-2 border-violet-300/60" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">
              {pendingConsents} research data request{pendingConsents === 1 ? '' : 's'} waiting for your decision
            </p>
            <p className="text-xs text-muted-foreground">Your doctor can only share your data if you accept.</p>
          </div>
          <span className="flex items-center gap-1 text-sm font-semibold text-primary">
            Review <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </span>
        </Link>
      )}

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Scans" value={totalScans} icon={ScanEye} />
        <StatCard
          label="Latest Risk"
          value={levelLabel(latestScan?.risk_level)}
          icon={Heart}
          accent={latestScan?.risk_level === 'high' ? 'destructive' : latestScan?.risk_level === 'moderate' ? 'warning' : 'success'}
        />
        <StatCard label="High Risk Alerts" value={highRiskCount} icon={Activity} accent={highRiskCount > 0 ? 'destructive' : 'success'} />
        <StatCard label="Avg Risk Score" value={avgConfidence} unit="/100" icon={Brain} accent="warning" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        {/* Risk trend chart */}
        <Card className="p-5 lg:col-span-3">
          <div className="mb-4 flex items-start justify-between">
            <div>
              <h2 className="font-semibold">Risk Score Trend</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Your cardiovascular risk score across recent screenings</p>
            </div>
            <div className="flex gap-3 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-success" />Low</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-warning" />Moderate</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-destructive" />High</span>
            </div>
          </div>
          {trend.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={trend} margin={{ top: 10, right: 10, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="scoreFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(192 95% 52%)" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="hsl(192 95% 52%)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="scoreStroke" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="hsl(192 95% 55%)" />
                    <stop offset="100%" stopColor="hsl(265 89% 68%)" />
                  </linearGradient>
                </defs>
                <ReferenceArea y1={0} y2={35} fill="hsl(152 69% 47%)" fillOpacity={0.05} />
                <ReferenceArea y1={35} y2={65} fill="hsl(38 95% 56%)" fillOpacity={0.05} />
                <ReferenceArea y1={65} y2={100} fill="hsl(350 89% 60%)" fillOpacity={0.05} />
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} ticks={[0, 35, 65, 100]} tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip
                  formatter={(v: number) => [`${v}/100`, 'Risk score']}
                  labelFormatter={(_, p) => (p?.[0]?.payload as { date?: string })?.date ?? ''}
                />
                <Area
                  type="monotone"
                  dataKey="score"
                  stroke="url(#scoreStroke)"
                  strokeWidth={3}
                  fill="url(#scoreFill)"
                  dot={{ r: 4, fill: 'hsl(222 47% 6%)', stroke: 'hsl(192 95% 55%)', strokeWidth: 2 }}
                  activeDot={{ r: 6, fill: 'hsl(192 95% 55%)' }}
                  animationDuration={1400}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="py-16 text-center">
              <TrendingUp className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-2 text-sm text-muted-foreground">No trend data yet</p>
            </div>
          )}
        </Card>

        {/* Recent scans */}
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between border-b border-border p-5">
            <h2 className="font-semibold">Recent Scans</h2>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/history">
                View all <ChevronRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </div>
          <div className="p-4">
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="skeleton h-16 rounded-xl" />
                ))}
              </div>
            ) : scans.length === 0 ? (
              <EmptyState
                icon={ScanEye}
                title="No scans yet"
                description="Upload your first retinal fundus image to get your cardiovascular risk assessment."
                action={
                  <Button onClick={() => navigate('/upload')}>
                    <Upload className="mr-2 h-4 w-4" />
                    Upload Retina Image
                  </Button>
                }
              />
            ) : (
              <div className="stagger space-y-2.5">
                {scans.map((scan) => (
                  <Link
                    key={scan.id}
                    to={`/result/${scan.id}`}
                    className="group flex items-center gap-3 rounded-xl border border-border bg-background/40 p-2.5 transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/40 hover:bg-primary/5 hover:shadow-[0_12px_30px_-16px_hsl(192_95%_50%/0.5)]"
                  >
                    <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-black ring-1 ring-border">
                      {thumbOf(scan) ? (
                        <img
                          src={thumbOf(scan)!}
                          alt="Retina"
                          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <ScanEye className="h-6 w-6 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <RiskBadge level={scan.risk_level} />
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {new Date(scan.created_at).toLocaleDateString()} · {scan.clinical_snapshot?.age ?? 'N/A'} yrs
                      </p>
                    </div>
                    <ScoreRing score={scoreOf(scan)} color={levelColor(scan.risk_level)} size={44} />
                    <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary" />
                  </Link>
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Care team */}
      <Card className="mt-6 p-5">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600 text-white shadow-lg">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-semibold">My care team</h2>
              <p className="text-xs text-muted-foreground">
                {careTeam.some((l) => l.status === 'accepted')
                  ? 'These doctors can view your scans'
                  : 'Connect with a doctor so they can review your scans'}
              </p>
            </div>
          </div>
          <div className="flex flex-1 flex-wrap items-center gap-2">
            {careTeam.map((l) => (
              <span
                key={l.id}
                className="inline-flex items-center gap-2 rounded-full border border-border bg-background/40 py-1 pl-1 pr-3 text-sm"
              >
                <Avatar name={doctorNames[l.doctor_id]?.full_name} id={l.doctor_id} size={26} />
                Dr. {doctorNames[l.doctor_id]?.full_name || 'Doctor'}
                {l.status === 'pending' && <span className="text-[11px] text-warning">· pending</span>}
              </span>
            ))}
          </div>
          <Button variant="outline" className="rounded-full" asChild>
            <Link to="/care">
              <UserPlus className="mr-2 h-4 w-4" /> {careTeam.length ? 'Manage doctors' : 'Find a doctor'}
            </Link>
          </Button>
        </div>
      </Card>

      {/* Patient info summary */}
      {patient && (
        <Card className="mt-6">
          <div className="border-b border-border p-5">
            <h2 className="font-semibold">Patient Profile</h2>
          </div>
          <div className="stagger grid gap-3 p-5 sm:grid-cols-3 lg:grid-cols-6">
            {[
              { label: 'Age', value: patient.age },
              { label: 'Gender', value: patient.gender },
              { label: 'BMI', value: patient.bmi?.toFixed(1) },
              { label: 'Blood Pressure', value: patient.systolic_bp ? `${patient.systolic_bp}/${patient.diastolic_bp}` : null },
              { label: 'Cholesterol', value: patient.cholesterol_mgdl ? `${patient.cholesterol_mgdl} mg/dL` : null },
              { label: 'Smoking', value: patient.smoking_status },
            ].map((f) => (
              <div key={f.label} className="rounded-xl border border-border bg-background/40 p-3">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{f.label}</p>
                <p className="mt-1 font-display font-semibold capitalize">{f.value ?? '—'}</p>
              </div>
            ))}
          </div>
        </Card>
      )}
    </AppLayout>
  );
}

function ScoreRing({ score, color, size = 48 }: { score: number; color: string; size?: number }) {
  const mounted = useMounted(150);
  const shown = useCountUp(score, 1200);
  const stroke = size > 80 ? 9 : 4;
  const r = size / 2 - stroke;
  const c = 2 * Math.PI * r;
  const len = mounted ? (Math.min(100, score) / 100) * c : 0;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="hsl(var(--border))" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${len} ${c - len}`}
          style={{ transition: 'stroke-dasharray 1.2s cubic-bezier(0.16,1,0.3,1)', filter: `drop-shadow(0 0 6px ${color})` }}
        />
      </svg>
      <span
        className={`absolute inset-0 flex items-center justify-center font-display font-bold tabular-nums ${size > 80 ? 'text-3xl' : 'text-xs'}`}
      >
        {Math.round(shown)}
      </span>
    </div>
  );
}

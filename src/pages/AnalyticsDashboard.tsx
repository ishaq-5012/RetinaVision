import { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  PieChart as PieIcon,
  TrendingUp,
  Activity,
  Brain,
  Cpu,
  Gauge,
  ScanEye,
  HeartPulse,
  Sparkles,
  FlaskConical,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { AppLayout } from '@/components/AppLayout';
import { PageHeader } from '@/components/PageHeader';
import { StatCard, LoadingSpinner } from '@/components/shared';
import { Card } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';
import { supabase, type Scan } from '@/lib/supabase';
import { getSystemStatus, type EngineStatus, type SystemStatus } from '@/lib/aiEngine';

const RISK_COLORS: Record<string, string> = {
  low: 'hsl(142 71% 45%)',
  moderate: 'hsl(38 92% 50%)',
  high: 'hsl(0 84% 60%)',
};

export function AnalyticsDashboard() {
  const { user } = useAuth();
  const [scans, setScans] = useState<Scan[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [statusError, setStatusError] = useState(false);

  useEffect(() => {
    getSystemStatus()
      .then(setStatus)
      .catch(() => setStatusError(true));
  }, []);

  useEffect(() => {
    async function loadScans() {
      if (!user) return;
      const { data } = await supabase
        .from('scans')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true });
      setScans((data as Scan[]) ?? []);
      setLoading(false);
    }
    loadScans();
  }, [user]);

  // Risk distribution (pie)
  const riskDistribution = useMemo(() => {
    const counts = { low: 0, moderate: 0, high: 0 };
    scans.forEach((s) => counts[s.risk_level]++);
    return [
      { name: 'Low Risk', value: counts.low, fill: RISK_COLORS.low },
      { name: 'Moderate Risk', value: counts.moderate, fill: RISK_COLORS.moderate },
      { name: 'High Risk', value: counts.high, fill: RISK_COLORS.high },
    ].filter((d) => d.value > 0);
  }, [scans]);

  // Age distribution (bar)
  const ageDistribution = useMemo(() => {
    const buckets = { '<30': 0, '30-45': 0, '46-60': 0, '61-75': 0, '75+': 0 };
    scans.forEach((s) => {
      const age = s.clinical_snapshot?.age;
      if (age == null) return;
      if (age < 30) buckets['<30']++;
      else if (age <= 45) buckets['30-45']++;
      else if (age <= 60) buckets['46-60']++;
      else if (age <= 75) buckets['61-75']++;
      else buckets['75+']++;
    });
    return Object.entries(buckets).map(([name, value]) => ({ name, value }));
  }, [scans]);

  // Risk score trend over time (line) — only scans that carry the risk score
  const scoredScans = useMemo(
    () => scans.filter((s) => s.prediction_payload?.risk_score != null),
    [scans],
  );
  const riskTrend = useMemo(() => {
    return scoredScans.slice(-10).map((s, i) => ({
      scan: `#${i + 1}`,
      Score: s.prediction_payload?.risk_score ?? null,
    }));
  }, [scoredScans]);
  const avgScore = scoredScans.length
    ? Math.round(scoredScans.reduce((sum, s) => sum + (s.prediction_payload?.risk_score ?? 0), 0) / scoredScans.length)
    : null;
  const qualityCounts = useMemo(() => {
    const counts = { good: 0, acceptable: 0, poor: 0 };
    scans.forEach((s) => {
      const q = s.prediction_payload?.image_quality?.label;
      if (q) counts[q]++;
    });
    return [
      { name: 'Good', value: counts.good, fill: RISK_COLORS.low },
      { name: 'Acceptable', value: counts.acceptable, fill: RISK_COLORS.moderate },
      { name: 'Poor', value: counts.poor, fill: RISK_COLORS.high },
    ];
  }, [scans]);
  const aiCoverage = useMemo(() => {
    const withAi = scans.filter((s) => s.prediction_payload?.ai_interpretation);
    if (!withAi.length) return null;
    const ok = withAi.filter((s) => s.prediction_payload?.ai_interpretation?.status === 'available').length;
    return Math.round((ok / withAi.length) * 100);
  }, [scans]);

  // Avg biomarkers (bar)
  const avgBiomarkers = useMemo(() => {
    if (scans.length === 0) return [];
    const sums = scans.reduce(
      (acc, s) => ({
        vessel_density: acc.vessel_density + (s.biomarkers?.vessel_density ?? 0),
        vessel_thickness: acc.vessel_thickness + (s.biomarkers?.vessel_thickness ?? 0),
        tortuosity: acc.tortuosity + (s.biomarkers?.tortuosity ?? 0),
        microvascular: acc.microvascular + (s.biomarkers?.microvascular_changes ?? 0),
      }),
      { vessel_density: 0, vessel_thickness: 0, tortuosity: 0, microvascular: 0 },
    );
    const n = scans.length;
    return [
      { name: 'Vessel Density', value: +(sums.vessel_density / n).toFixed(2), fill: 'hsl(199 89% 48%)' },
      { name: 'Vessel Thickness', value: +(sums.vessel_thickness / n).toFixed(2), fill: 'hsl(210 80% 40%)' },
      { name: 'Tortuosity', value: +(sums.tortuosity / n).toFixed(2), fill: 'hsl(38 92% 50%)' },
      { name: 'Microvascular', value: +(sums.microvascular / n).toFixed(2), fill: 'hsl(0 84% 60%)' },
    ];
  }, [scans]);

  if (loading) return <AppLayout><LoadingSpinner label="Loading analytics..." /></AppLayout>;

  return (
    <AppLayout>
      <PageHeader
        title="Research Analytics Dashboard"
        description="Screening statistics from your scans and a transparent status of every analysis engine"
      />

      {/* Overview stats — all computed from stored scans */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Scans" value={scans.length} icon={BarChart3} />
        <StatCard label="Avg Risk Score" value={avgScore ?? '—'} unit={avgScore != null ? '/100' : undefined} icon={Gauge} accent="warning" />
        <StatCard
          label="High-Risk Category"
          value={scans.filter((s) => s.risk_level === 'high').length}
          icon={HeartPulse}
          accent="destructive"
        />
        <StatCard label="AI Interpretation Success" value={aiCoverage ?? '—'} unit={aiCoverage != null ? '%' : undefined} icon={Sparkles} accent="primary" />
      </div>

      {/* System status — live from the backend /api/health */}
      <Card className="mt-6 p-5">
        <h2 className="mb-1 flex items-center gap-2 font-semibold">
          <Cpu className="h-5 w-5 text-primary" /> Analysis Engines
        </h2>
        <p className="mb-4 text-xs text-muted-foreground">Live status reported by the analysis server.</p>
        {statusError ? (
          <p className="text-sm text-destructive">Backend unreachable — start the FastAPI server to see engine status.</p>
        ) : !status ? (
          <LoadingSpinner label="Checking engines..." />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { title: 'Retinal Image Processing', icon: ScanEye, e: status.engines.opencv, key: 'METHOD', val: status.engines.opencv.method },
              { title: 'Clinical Risk Analysis', icon: HeartPulse, e: status.engines.clinical, key: 'METHOD', val: status.engines.clinical.method },
              { title: 'AI Retinal Interpretation', icon: Sparkles, e: status.engines.groq_vision, key: 'ENGINE', val: 'Multimodal vision AI' },
              { title: 'Cardiovascular Risk Scoring', icon: FlaskConical, e: status.engines.prototype_score, key: 'METHOD', val: 'Weighted retinal + clinical risk model' },
            ].map((row) => (
              <div key={row.title} className="rounded-lg border border-border p-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <row.icon className="h-4 w-4 text-primary" /> {row.title}
                  </span>
                  <EngineBadge engine={row.e} />
                </div>
                <p className="text-xs text-muted-foreground">
                  <span className="font-semibold uppercase tracking-wide">{row.key}:</span> {row.val}
                </p>
              </div>
            ))}
          </div>
        )}
      </Card>

      {scans.length === 0 ? (
        <Card className="mt-6 p-12 text-center">
          <BarChart3 className="mx-auto h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 text-lg font-semibold">No analytics data yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Run your first retinal scan to see risk distribution, trends, and biomarker analysis here.
          </p>
        </Card>
      ) : (
        <div className="mt-6 space-y-6">
          {/* Charts row 1: Risk distribution + Age distribution */}
          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="p-5">
              <h2 className="mb-1 flex items-center gap-2 font-semibold">
                <PieIcon className="h-5 w-5 text-primary" /> Risk Distribution
              </h2>
              <p className="mb-4 text-xs text-muted-foreground">Breakdown of all predicted risk levels</p>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={riskDistribution}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    label={(entry) => `${entry.name}: ${entry.value}`}
                  >
                    {riskDistribution.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </Card>

            <Card className="p-5">
              <h2 className="mb-1 flex items-center gap-2 font-semibold">
                <Activity className="h-5 w-5 text-primary" /> Age Distribution
              </h2>
              <p className="mb-4 text-xs text-muted-foreground">Patient ages across all scans</p>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={ageDistribution}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="value" fill="hsl(199 89% 48%)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </div>

          {/* Risk trend line chart */}
          <Card className="p-5">
            <h2 className="mb-1 flex items-center gap-2 font-semibold">
              <TrendingUp className="h-5 w-5 text-primary" /> Risk Score Trend
            </h2>
            <p className="mb-4 text-xs text-muted-foreground">
              Cardiovascular risk score (0-100) across your most recent scans
            </p>
            {riskTrend.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">Run a new scan to start the score trend.</p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={riskTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="scan" tick={{ fontSize: 12 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="Score" name="Risk score" stroke={RISK_COLORS.moderate} strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </Card>

          {/* Avg biomarkers + Model training */}
          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="p-5">
              <h2 className="mb-1 flex items-center gap-2 font-semibold">
                <Brain className="h-5 w-5 text-primary" /> Average Retinal Biomarkers
              </h2>
              <p className="mb-4 text-xs text-muted-foreground">Mean biomarker values across all scans</p>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={avgBiomarkers} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" domain={[0, 1]} tick={{ fontSize: 12 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={110} />
                  <Tooltip />
                  <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                    {avgBiomarkers.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Card>

            <Card className="p-5">
              <h2 className="mb-1 flex items-center gap-2 font-semibold">
                <ScanEye className="h-5 w-5 text-primary" /> Image Quality Overview
              </h2>
              <p className="mb-4 text-xs text-muted-foreground">Quality of uploaded retinal images</p>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={qualityCounts}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                    {qualityCounts.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </div>
        </div>
      )}
    </AppLayout>
  );
}

function EngineBadge({ engine }: { engine: EngineStatus }) {
  const active = ['active', 'deployed', 'available'].includes(engine.status);
  const label = engine.status.replace(/_/g, ' ');
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
        active
          ? 'border-success/30 bg-success/10 text-success'
          : 'border-muted-foreground/30 bg-muted text-muted-foreground'
      }`}
    >
      {label}
    </span>
  );
}

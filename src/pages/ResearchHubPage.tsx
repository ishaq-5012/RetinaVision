import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Database,
  Download,
  FileJson,
  LayoutGrid,
  List,
  Eye,
  FlaskConical,
  Loader2,
  Lock,
  Send,
  Stethoscope,
  Users,
  ScanEye,
  Gauge,
} from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AppLayout } from '@/components/AppLayout';
import { PageHeader } from '@/components/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmptyState, LoadingSpinner, RiskBadge, StatCard } from '@/components/shared';
import { SharingSetupNotice, Avatar, FlowSteps, SectionTitle, StatusPill } from '@/components/consent-ui';
import { useAuth } from '@/hooks/useAuth';
import { ResearchScanDialog } from '@/components/ResearchScanDialog';
import { scanImages } from '@/lib/research';
import { useToast } from '@/hooks/use-toast';
import type { Scan } from '@/lib/supabase';
import {
  consentsFor,
  createResearchRequest,
  getProfiles,
  listDoctors,
  myResearchRequests,
  pseudonym,
  sharedScans,
  type PublicProfile,
  type ResearchConsent,
  type ResearchRequest,
  isSharingSetupMissing,
} from '@/lib/consent';

const RISK_COLORS = { low: 'hsl(152 69% 47%)', moderate: 'hsl(38 95% 56%)', high: 'hsl(350 89% 60%)' };

export function ResearchHubPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [setupMissing, setSetupMissing] = useState(false);
  const [doctors, setDoctors] = useState<PublicProfile[]>([]);
  const [requests, setRequests] = useState<ResearchRequest[]>([]);
  const [consents, setConsents] = useState<ResearchConsent[]>([]);
  const [people, setPeople] = useState<Record<string, PublicProfile>>({});
  const [scans, setScans] = useState<Scan[]>([]);
  const [target, setTarget] = useState<PublicProfile | null>(null);
  const [title, setTitle] = useState('');
  const [purpose, setPurpose] = useState('');
  const [sending, setSending] = useState(false);
  const [viewScan, setViewScan] = useState<Scan | null>(null);
  const [layout, setLayout] = useState<'gallery' | 'table'>('gallery');

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const [d, r, s] = await Promise.all([listDoctors(), myResearchRequests(), sharedScans(user.id)]);
      const mine = r.filter((x) => x.researcher_id === user.id);
      setDoctors(d);
      setRequests(mine);
      setScans(s);
      setConsents(await consentsFor(mine.map((x) => x.id)));
      setPeople(await getProfiles(mine.map((x) => x.doctor_id)));
    } catch (e) {
      if (isSharingSetupMissing(e)) {
        setSetupMissing(true);
        return;
      }
      toast({ title: 'Could not load research hub', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [user, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const send = async () => {
    if (!user || !target) return;
    setSending(true);
    try {
      await createResearchRequest(user.id, target.id, title.trim(), purpose.trim());
      toast({ title: `Request sent to Dr. ${target.full_name}` });
      setTarget(null);
      setTitle('');
      setPurpose('');
      await load();
    } catch (e) {
      toast({ title: 'Could not send request', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  const subjects = useMemo(() => [...new Set(scans.map((s) => s.user_id))], [scans]);
  const riskDist = useMemo(
    () =>
      (['low', 'moderate', 'high'] as const)
        .map((k) => ({ name: k[0].toUpperCase() + k.slice(1), value: scans.filter((s) => s.risk_level === k).length, fill: RISK_COLORS[k] }))
        .filter((d) => d.value > 0),
    [scans],
  );
  const biomarkers = useMemo(() => {
    if (!scans.length) return [];
    const avg = (f: (s: Scan) => number) => +(scans.reduce((a, s) => a + (f(s) || 0), 0) / scans.length).toFixed(3);
    return [
      { name: 'Density', value: avg((s) => s.biomarkers?.vessel_density) },
      { name: 'Thickness', value: avg((s) => s.biomarkers?.vessel_thickness) },
      { name: 'Tortuosity', value: avg((s) => s.biomarkers?.tortuosity) },
      { name: 'AV ratio', value: avg((s) => s.biomarkers?.arteriovenous_ratio) },
    ];
  }, [scans]);

  const download = (content: string, type: string, name: string) => {
    const blob = new Blob([content], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const stamp = () => new Date().toISOString().slice(0, 10);
  const csvCell = (v: unknown) => {
    const t = v == null ? '' : String(v);
    return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };

  const exportCsv = () => {
    const head = [
      'subject', 'scan_id', 'scan_date', 'age', 'gender', 'height_cm', 'weight_kg', 'systolic_bp', 'diastolic_bp', 'heart_rate',
      'cholesterol', 'smoking', 'diabetes', 'family_history', 'risk_level', 'risk_score', 'vessel_density', 'vessel_thickness',
      'tortuosity', 'av_ratio', 'microvascular_index', 'image_quality', 'ai_image_quality', 'ai_observations', 'ai_patterns',
      'ai_clinical_context', 'image_url',
    ];
    const rows = scans.map((s) => {
      const c = s.clinical_snapshot ?? ({} as Scan['clinical_snapshot']);
      const p = s.prediction_payload;
      const ai = p?.ai_interpretation?.status === 'available' ? p.ai_interpretation : null;
      return [
        pseudonym(s.user_id), s.id, s.created_at.slice(0, 10), c.age, c.gender, c.height_cm, c.weight_kg, c.systolic_bp,
        c.diastolic_bp, c.heart_rate, c.cholesterol_mgdl, c.smoking_status, c.diabetes_history, c.family_cardiac_history,
        s.risk_level, p?.risk_score ?? s.confidence, s.biomarkers?.vessel_density, s.biomarkers?.vessel_thickness,
        s.biomarkers?.tortuosity, s.biomarkers?.arteriovenous_ratio, s.biomarkers?.microvascular_changes,
        p?.image_quality?.label, ai?.image_quality, ai?.retinal_observations.join(' | '), ai?.visible_patterns.join(' | '),
        ai?.clinical_context_interpretation, s.image_url ?? '',
      ].map(csvCell).join(',');
    });
    download([head.join(','), ...rows].join('\n'), 'text/csv', `cardiovision_research_dataset_${stamp()}.csv`);
  };

  /** Complete records including AI findings and embedded images (data URLs). */
  const exportJson = () => {
    const records = scans.map((s) => {
      const p = s.prediction_payload;
      const img = scanImages(s);
      return {
        subject: pseudonym(s.user_id),
        scan_id: s.id,
        scan_date: s.created_at,
        clinical: s.clinical_snapshot,
        risk: { level: s.risk_level, score: p?.risk_score ?? s.confidence, breakdown: p?.score_breakdown ?? null },
        biomarkers: s.biomarkers,
        image_quality: p?.image_quality ?? null,
        ai_interpretation: p?.ai_interpretation ?? null,
        images: { original: img.original, vessel_overlay: img.overlay, vessel_map: img.heatmap },
      };
    });
    download(
      JSON.stringify({ exported_at: new Date().toISOString(), subjects: subjects.length, scans: records.length, records }, null, 2),
      'application/json',
      `cardiovision_research_dataset_${stamp()}.json`,
    );
  };

  const stepOf = (r: ResearchRequest, rc: ResearchConsent[]) =>
    r.status === 'granted' ? 4 : r.status === 'forwarded' ? (rc.some((c) => c.status === 'accepted') ? 3 : 2) : r.status === 'declined' ? 0 : 1;

  if (loading) return <AppLayout><LoadingSpinner label="Loading research hub..." /></AppLayout>;
  if (setupMissing) return <AppLayout><SharingSetupNotice /></AppLayout>;

  return (
    <AppLayout>
      <PageHeader
        title="Research Hub"
        description="Request retinal screening data from doctors. Data is shared only for patients who personally consent, and always under a pseudonym."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Requests Sent" value={requests.length} icon={Send} />
        <StatCard label="Consented Subjects" value={subjects.length} icon={Users} accent="success" />
        <StatCard label="Scans in Dataset" value={scans.length} icon={ScanEye} accent="warning" />
        <StatCard
          label="Avg Risk Score"
          value={scans.length ? Math.round(scans.reduce((a, s) => a + (s.prediction_payload?.risk_score ?? s.confidence ?? 0), 0) / scans.length) : 0}
          unit="/100"
          icon={Gauge}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        {/* Doctors */}
        <Card className="p-5 lg:col-span-2">
          <SectionTitle icon={Stethoscope} title="Request data from a doctor" hint="The doctor asks their patients for consent" />
          {doctors.length === 0 ? (
            <EmptyState icon={Stethoscope} title="No doctors yet" description="Doctor accounts will appear here." />
          ) : (
            <div className="stagger space-y-2.5">
              {doctors.map((d) => (
                <div key={d.id} className="lift flex items-center gap-3 rounded-xl border border-border bg-background/40 p-3">
                  <Avatar name={d.full_name} id={d.id} />
                  <p className="min-w-0 flex-1 truncate font-medium">Dr. {d.full_name || 'Doctor'}</p>
                  <Button size="sm" onClick={() => setTarget(d)}>
                    <Send className="mr-1 h-4 w-4" /> Request data
                  </Button>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Requests */}
        <Card className="p-5 lg:col-span-3">
          <SectionTitle icon={FlaskConical} title="My data requests" hint="Live status of each request" />
          {requests.length === 0 ? (
            <EmptyState icon={FlaskConical} title="No requests yet" description="Choose a doctor and describe your study to request data." />
          ) : (
            <div className="stagger space-y-3">
              {requests.map((r) => {
                const rc = consents.filter((c) => c.request_id === r.id);
                const n = (s: string) => rc.filter((c) => c.status === s).length;
                return (
                  <div key={r.id} className="rounded-xl border border-border bg-background/40 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-display font-semibold">{r.title}</p>
                        <p className="text-xs text-muted-foreground">
                          to Dr. {people[r.doctor_id]?.full_name || 'Doctor'} · {new Date(r.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <StatusPill status={r.status} />
                    </div>
                    {r.status !== 'declined' && (
                      <div className="mt-3">
                        <FlowSteps steps={['Sent', 'Doctor review', 'Patients asked', 'Consent', 'Shared']} current={stepOf(r, rc)} />
                      </div>
                    )}
                    {rc.length > 0 && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        {rc.length} patients asked · {n('pending')} waiting · {n('accepted')} accepted · {n('granted')} shared ·{' '}
                        {n('declined') + n('revoked')} declined
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {/* Dataset */}
      <Card className="mt-6 p-5">
        <SectionTitle
          icon={Database}
          title="Shared research dataset"
          hint="Retinal images, vessel maps, biomarkers, clinical data and AI findings from consenting patients · names withheld"
          right={
            <div className="flex flex-wrap gap-2">
              <div className="flex rounded-lg border border-border p-0.5">
                {([['gallery', LayoutGrid], ['table', List]] as const).map(([k, Icon]) => (
                  <button
                    key={k}
                    onClick={() => setLayout(k)}
                    className={`flex h-8 w-9 items-center justify-center rounded-md transition-colors ${layout === k ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                    aria-label={`${k} view`}
                  >
                    <Icon className="h-4 w-4" />
                  </button>
                ))}
              </div>
              <Button variant="outline" disabled={!scans.length} onClick={exportCsv}>
                <Download className="mr-2 h-4 w-4" /> CSV
              </Button>
              <Button variant="outline" disabled={!scans.length} onClick={exportJson}>
                <FileJson className="mr-2 h-4 w-4" /> Full JSON
              </Button>
            </div>
          }
        />
        {scans.length === 0 ? (
          <EmptyState
            icon={Lock}
            title="No data shared yet"
            description="Data appears here after a doctor grants access for patients who accepted your request."
          />
        ) : (
          <>
            {layout === 'gallery' && (
              <div className="stagger mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {scans.map((s) => {
                  const img = scanImages(s);
                  return (
                    <button
                      key={s.id}
                      onClick={() => setViewScan(s)}
                      className="group overflow-hidden rounded-2xl border border-border bg-background/40 text-left transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-[0_20px_40px_-20px_hsl(192_95%_50%/0.5)]"
                    >
                      <div className="relative aspect-square overflow-hidden bg-black">
                        {img.original ? (
                          <img src={img.original} alt="" className="absolute inset-0 h-full w-full object-cover transition-all duration-700 group-hover:scale-105" />
                        ) : (
                          <ScanEye className="absolute inset-0 m-auto h-8 w-8 text-muted-foreground" />
                        )}
                        {img.overlay && (
                          <img src={img.overlay} alt="" className="absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity duration-700 group-hover:opacity-100" />
                        )}
                        <span className="absolute left-2 top-2 rounded-md bg-black/60 px-2 py-0.5 font-mono text-[11px] text-cyan-300 backdrop-blur">
                          {pseudonym(s.user_id)}
                        </span>
                        <span className="absolute bottom-2 right-2 flex items-center gap-1 rounded-md bg-black/60 px-2 py-0.5 text-[11px] text-white opacity-0 backdrop-blur transition-opacity group-hover:opacity-100">
                          <Eye className="h-3 w-3" /> View record
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 p-3">
                        <RiskBadge level={s.risk_level} />
                        <span className="text-sm font-semibold tabular-nums">{s.prediction_payload?.risk_score ?? s.confidence}/100</span>
                      </div>
                      <p className="px-3 pb-3 text-[11px] text-muted-foreground">
                        {new Date(s.created_at).toLocaleDateString()} · {s.clinical_snapshot?.age ?? '—'} yrs · <span className="capitalize">{s.clinical_snapshot?.gender ?? '—'}</span>
                      </p>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-xl border border-border bg-background/40 p-4">
                <p className="mb-2 text-sm font-semibold">Risk distribution</p>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={riskDist} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={3} animationDuration={1200}>
                      {riskDist.map((d, i) => <Cell key={i} fill={d.fill} stroke="none" />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="rounded-xl border border-border bg-background/40 p-4">
                <p className="mb-2 text-sm font-semibold">Average retinal biomarkers</p>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={biomarkers}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                    <Tooltip />
                    <Bar dataKey="value" radius={[6, 6, 0, 0]} fill="hsl(192 95% 52%)" animationDuration={1200} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="mt-5 overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    {['', 'Subject', 'Date', 'Age', 'Sex', 'BP', 'Risk', 'Score', 'Density', 'Tortuosity', ''].map((h, i) => (
                      <th key={i} className="px-3 py-2.5 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="stagger">
                  {scans.map((s) => (
                    <tr key={s.id} onClick={() => setViewScan(s)} className="cursor-pointer border-t border-border transition-colors hover:bg-primary/5">
                      <td className="py-2 pl-3">
                        <div className="h-10 w-10 overflow-hidden rounded-md bg-black ring-1 ring-border">
                          {scanImages(s).original && <img src={scanImages(s).original!} alt="" className="h-full w-full object-cover" />}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs text-cyan-300">{pseudonym(s.user_id)}</td>
                      <td className="px-3 py-2.5">{new Date(s.created_at).toLocaleDateString()}</td>
                      <td className="px-3 py-2.5">{s.clinical_snapshot?.age ?? '—'}</td>
                      <td className="px-3 py-2.5 capitalize">{s.clinical_snapshot?.gender ?? '—'}</td>
                      <td className="px-3 py-2.5">{s.clinical_snapshot?.systolic_bp}/{s.clinical_snapshot?.diastolic_bp}</td>
                      <td className="px-3 py-2.5"><RiskBadge level={s.risk_level} /></td>
                      <td className="px-3 py-2.5 font-semibold tabular-nums">{s.prediction_payload?.risk_score ?? s.confidence}</td>
                      <td className="px-3 py-2.5 tabular-nums">{s.biomarkers?.vessel_density?.toFixed(3)}</td>
                      <td className="px-3 py-2.5 tabular-nums">{s.biomarkers?.tortuosity?.toFixed(3)}</td>
                      <td className="px-3 py-2.5">
                        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={(e) => { e.stopPropagation(); setViewScan(s); }}>
                          <Eye className="mr-1 h-3.5 w-3.5" /> View
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>

      <ResearchScanDialog scan={viewScan} subject={viewScan ? pseudonym(viewScan.user_id) : ''} onClose={() => setViewScan(null)} />

      {/* Request dialog */}
      <Dialog open={!!target} onOpenChange={(o) => !o && setTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request data from Dr. {target?.full_name}</DialogTitle>
            <DialogDescription>
              The doctor reviews your request and forwards it to their patients. Only patients who accept are shared,
              under a pseudonym.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Study title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Retinal vessel changes in hypertension" maxLength={160} />
            </div>
            <div className="space-y-1.5">
              <Label>Purpose (shown to patients)</Label>
              <Textarea
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                rows={4}
                placeholder="What will the data be used for, and how will it be protected?"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTarget(null)}>Cancel</Button>
            <Button disabled={sending || title.trim().length < 3} onClick={send}>
              {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Send request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

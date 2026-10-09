import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  FileText,
  Brain,
  Heart,
  Activity,
  Lightbulb,
  Download,
  ScanEye,
  Plus,
  Eye,
  Aperture,
  Sparkles,
  CloudOff,
} from 'lucide-react';
import { AppLayout } from '@/components/AppLayout';
import { RiskBadge, RiskGauge, BiomarkerBar, LoadingSpinner } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { supabase, type Scan, type Patient, type Profile, type PredictionPayload } from '@/lib/supabase';
import { cachePayload, getCachedPayload, predictionFromPayload, type PredictionResult } from '@/lib/aiEngine';
import { generatePdfReport } from '@/lib/pdfReport';
import { useAuth } from '@/hooks/useAuth';
import { useMounted } from '@/hooks/useMotion';
import { pseudonym } from '@/lib/consent';

export function PredictionResultPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [scan, setScan] = useState<Scan | null>(null);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [profileName, setProfileName] = useState('');
  const [prediction, setPrediction] = useState<PredictionResult | null>(null);
  const [gradcam, setGradcam] = useState<{ heatmapUrl: string; overlayUrl: string } | null>(null);
  const [payload, setPayload] = useState<PredictionPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const barsReady = useMounted(200);

  useEffect(() => {
    async function loadScan() {
      if (!id || !user) return;
      const { data } = await supabase
        .from('scans')
        .select('*')
        .eq('id', id)
        .maybeSingle(); // access is enforced by RLS (owner or linked doctor)

      if (!data) {
        setLoading(false);
        return;
      }
      const s = data as Scan;
      setScan(s);

      // Load patient if linked
      if (s.patient_id) {
        const { data: pData } = await supabase
          .from('patients')
          .select('*')
          .eq('id', s.patient_id)
          .maybeSingle();
        if (pData) setPatient(pData as Patient);
      }

      // Load profile name
      const { data: profData } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', s.user_id)
        .maybeSingle();
      if (profData) setProfileName((profData as Profile).full_name);
      else if (s.user_id !== user.id) setProfileName(pseudonym(s.user_id)); // researcher view: identity withheld

      // Load prediction + gradcam from the navigation state first (works even
      // when the prediction_payload DB migration is not applied), then fall
      // back to the stored backend payload.
      const statePayload = (location.state as { prediction?: PredictionPayload } | null)?.prediction;
      const payload = statePayload ?? s.prediction_payload ?? getCachedPayload(s.id);
      if (payload) {
        cachePayload(s.id, payload);
        setPayload(payload);
        setPrediction(predictionFromPayload(payload));
        setGradcam({
          heatmapUrl: payload.gradcam_heatmap,
          overlayUrl: payload.gradcam_overlay,
        });
      }

      setLoading(false);
    }
    loadScan();
  }, [id, user, location.state]);

  const handleDownloadReport = () => {
    if (!scan || !prediction) return;
    generatePdfReport(scan, prediction, patient, profileName, payload);
  };

  if (loading) return <AppLayout><LoadingSpinner label="Loading prediction results..." /></AppLayout>;
  if (!scan) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <ScanEye className="mb-4 h-12 w-12 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Scan not found</h2>
          <p className="mt-1 text-sm text-muted-foreground">This scan may have been deleted.</p>
          <Button className="mt-4" onClick={() => navigate('/home')}>Back to Dashboard</Button>
        </div>
      </AppLayout>
    );
  }

  const riskColor =
    scan.risk_level === 'high' ? 'text-destructive' : scan.risk_level === 'moderate' ? 'text-warning' : 'text-success';

  // Scans created before the risk-score update have no score / AI interpretation fields.
  const riskScore = payload?.risk_score;
  const isLegacy = riskScore == null;
  const quality = payload?.image_quality;
  const ai = payload?.ai_interpretation;
  const isGradcam = payload?.visualization_type === 'gradcam';
  const vizName = isGradcam ? 'Grad-CAM' : 'Vessel Saliency';
  const clinicalFactors = payload?.clinical_factors;
  const qualityStyle = (label?: string) =>
    label === 'good'
      ? 'bg-success/15 text-success border-success/30'
      : label === 'poor' || label === 'ungradable'
        ? 'bg-destructive/15 text-destructive border-destructive/30'
        : 'bg-warning/15 text-warning border-warning/30';

  return (
    <AppLayout>
      <div className="enter mb-4">
        <Button variant="ghost" size="sm" asChild>
          {scan.user_id === user?.id ? (
            <Link to="/history"><ArrowLeft className="mr-1 h-4 w-4" /> Back to History</Link>
          ) : (
            <Link to="/home"><ArrowLeft className="mr-1 h-4 w-4" /> Back to Dashboard</Link>
          )}
        </Button>
      </div>

      <div className="enter relative mb-6 overflow-hidden rounded-2xl border border-primary/15 bg-gradient-to-br from-sky-500/10 via-card to-blue-600/10 p-6 shadow-soft">
        <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-primary/15 blur-3xl animate-blob" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="relative flex h-12 w-12 items-center justify-center">
              <span className="pulse-ring absolute inset-0 rounded-2xl border-2 border-primary/60" />
              <span className="burst">
                {Array.from({ length: 12 }).map((_, i) => (
                  <span
                    key={i}
                    style={{
                      ['--a' as string]: `${i * 30}deg`,
                      background: ['hsl(190 95% 60%)', 'hsl(265 90% 70%)', 'hsl(152 69% 55%)'][i % 3],
                      animationDelay: '350ms',
                    }}
                  />
                ))}
              </span>
              <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl gradient-medical shadow-lg shadow-primary/30">
                <ScanEye className="h-6 w-6 text-white" />
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Screening complete</p>
              <h1 className="text-2xl font-bold tracking-tight">Retinal Screening Results</h1>
              <p className="text-xs text-muted-foreground">
                {new Date(scan.created_at).toLocaleString()} · Scan #{scan.id.slice(0, 8).toUpperCase()}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link to="/upload"><Plus className="mr-2 h-4 w-4" /> New Scan</Link>
            </Button>
            <Button onClick={handleDownloadReport} disabled={!prediction}>
              <Download className="mr-2 h-4 w-4" /> Download Report
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Risk assessment */}
        <Card className="conic-border p-6">
          <h2 className="mb-1 font-semibold">Risk Assessment</h2>
          <p className="text-xs text-muted-foreground">Retinal and clinical cardiovascular risk</p>
          <div className="my-6 flex flex-col items-center">
            <RiskGauge
              low={scan.probability_low}
              moderate={scan.probability_moderate}
              high={scan.probability_high}
            />
            <div className="mt-4">
              <RiskBadge level={scan.risk_level} className="text-sm" />
            </div>
            {!isLegacy && (
              <p className="mt-2 text-sm text-muted-foreground">
                Risk score: <span className="font-bold text-foreground">{riskScore}/100</span>
              </p>
            )}
          </div>
          <div className="space-y-3">
            {[
              { label: 'Low Risk', value: scan.probability_low, color: 'bg-success' },
              { label: 'Moderate Risk', value: scan.probability_moderate, color: 'bg-warning' },
              { label: 'High Risk', value: scan.probability_high, color: 'bg-destructive' },
            ].map((r) => (
              <div key={r.label}>
                <div className="mb-1 flex justify-between text-xs">
                  <span className="text-muted-foreground">{r.label}</span>
                  <span className="font-semibold">{r.value}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div className={`h-full rounded-full ${r.color} transition-[width] duration-1000 ease-out`} style={{ width: barsReady ? `${r.value}%` : '0%' }} />
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Retinal image + saliency */}
        <Card className="p-6 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <h2 className="font-semibold">Retinal Scan & {isGradcam ? 'Grad-CAM' : 'Vessel-Based Attention Map'}</h2>
            </div>
            {gradcam && (
              <Button variant="outline" size="sm" asChild>
                <Link to={`/explain/${scan.id}`} state={{ prediction: payload }}>
                  <Eye className="mr-1 h-4 w-4" /> Full {vizName} View
                </Link>
              </Button>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">Uploaded Retina</p>
              <div className="laser group overflow-hidden rounded-xl border border-border bg-black/90 shadow-inner">
                {scan.image_url || payload?.original_image ? (
                  <img src={scan.image_url || payload?.original_image} alt="Retina" className="wipe-in w-full transition-transform duration-700 group-hover:scale-105" />
                ) : (
                  <div className="flex h-48 items-center justify-center bg-muted">
                    <ScanEye className="h-10 w-10 text-muted-foreground" />
                  </div>
                )}
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">{vizName} Overlay</p>
              <div className="laser group overflow-hidden rounded-xl border border-border bg-black/90 shadow-inner">
                {gradcam?.overlayUrl ? (
                  <img src={gradcam.overlayUrl} alt={vizName} className="wipe-in w-full transition-transform duration-700 group-hover:scale-105" style={{ ['--enter-delay' as string]: '450ms' }} />
                ) : (
                  <div className="flex h-48 items-center justify-center bg-muted">
                    <Brain className="h-10 w-10 text-muted-foreground" />
                  </div>
                )}
              </div>
            </div>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            {isGradcam
              ? 'Grad-CAM highlights image regions that most influenced the trained CNN prediction.'
              : 'The attention map highlights the retinal vessel network detected and measured during image analysis.'}
          </p>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Image quality */}
        <Card className="p-6">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 font-semibold">
              <Aperture className="h-5 w-5 text-primary" /> Image Quality
            </h2>
          </div>
          {quality ? (
            <>
              <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold capitalize ${qualityStyle(quality.label)}`}>
                {quality.label}
              </span>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: 'Sharpness', value: quality.metrics.sharpness.toFixed(0) },
                  { label: 'Brightness', value: quality.metrics.brightness.toFixed(0) },
                  { label: 'Contrast', value: quality.metrics.contrast.toFixed(0) },
                  { label: 'Field coverage', value: `${Math.round(quality.metrics.field_coverage * 100)}%` },
                ].map((m) => (
                  <div key={m.label} className="rounded-lg border border-border p-2">
                    <p className="text-[11px] text-muted-foreground">{m.label}</p>
                    <p className="font-semibold">{m.value}</p>
                  </div>
                ))}
              </div>
              {quality.issues.length > 0 ? (
                <ul className="mt-3 space-y-1 text-xs text-warning">
                  {quality.issues.map((i) => <li key={i}>• {i}</li>)}
                </ul>
              ) : (
                <p className="mt-3 text-xs text-muted-foreground">No quality issues detected by the OpenCV checks.</p>
              )}
              {ai?.status === 'available' && (
                <div className="mt-4 border-t border-border pt-3">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-xs font-medium">AI image assessment:</span>
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold capitalize ${qualityStyle(ai.image_quality)}`}>
                      {ai.image_quality}
                    </span>
                  </div>
                  {ai.image_quality_notes && <p className="text-xs text-muted-foreground">{ai.image_quality_notes}</p>}
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Image quality data unavailable for this scan.</p>
          )}
        </Card>

        {/* Biomarkers */}
        <Card className="p-6">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 font-semibold">
              <ScanEye className="h-5 w-5 text-primary" /> Retinal Biomarkers
            </h2>
          </div>
          <div className="space-y-4">
            <BiomarkerBar
              label="Vessel Density (coverage of retina)"
              value={scan.biomarkers.vessel_density}
              max={0.2}
              hint={`${(scan.biomarkers.vessel_density * 100).toFixed(1)}% of the retinal field is segmented as vessel`}
            />
            <BiomarkerBar label="Vessel Thickness (normalised)" value={scan.biomarkers.vessel_thickness} />
            <BiomarkerBar label="Vessel Tortuosity (0 = straight)" value={scan.biomarkers.tortuosity} />
            <BiomarkerBar
              label="Microvascular Index"
              value={scan.biomarkers.microvascular_changes}
            />
            <div>
              <div className="mb-1 flex justify-between text-xs">
                <span className="text-muted-foreground">Arteriovenous Ratio</span>
                <span className="font-semibold">{scan.biomarkers.arteriovenous_ratio}</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-chart-5 transition-all duration-700"
                  style={{ width: `${(scan.biomarkers.arteriovenous_ratio / 1) * 100}%` }}
                />
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Reference range: 0.6 – 0.8
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Groq AI interpretation */}
      <Card className="relative mt-6 overflow-hidden p-6">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-sky-400 via-violet-500 to-fuchsia-500 animate-gradient" />
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-semibold">
            <Sparkles className="h-5 w-5 text-violet-500" /> AI Retinal Interpretation
          </h2>
        </div>

        {!ai ? (
          <p className="text-sm text-muted-foreground">
            AI interpretation is not available for this scan.
          </p>
        ) : ai.status === 'unavailable' ? (
          <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/40 p-4">
            <CloudOff className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">{ai.message}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                All retinal measurements, clinical factors and the risk score above are complete.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <h3 className="mb-2 text-sm font-semibold">AI Retinal Observations</h3>
              <ul className="stagger space-y-1.5 text-sm">
                {ai.retinal_observations.map((o) => (
                  <li key={o} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-500" />{o}</li>
                ))}
              </ul>
              {ai.visible_patterns.length > 0 && (
                <>
                  <h3 className="mb-2 mt-4 text-sm font-semibold">Visible Patterns</h3>
                  <ul className="stagger space-y-1.5 text-sm">
                    {ai.visible_patterns.map((o) => (
                      <li key={o} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-warning" />{o}</li>
                    ))}
                  </ul>
                </>
              )}
            </div>
            <div>
              <h3 className="mb-2 text-sm font-semibold">AI Explanation — Clinical Context</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{ai.clinical_context_interpretation}</p>
              {ai.risk_factors.length > 0 && (
                <>
                  <h3 className="mb-2 mt-4 text-sm font-semibold">Key Risk Factors</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {ai.risk_factors.map((f) => (
                      <span key={f} className="rounded-full border border-border bg-muted/50 px-2.5 py-1 text-xs">{f}</span>
                    ))}
                  </div>
                </>
              )}
            </div>
            <div className="md:col-span-2 grid gap-4 border-t border-border pt-4 md:grid-cols-2">
              <div>
                <h3 className="mb-2 text-sm font-semibold">Limitations</h3>
                <ul className="stagger space-y-1 text-xs text-muted-foreground">
                  {ai.limitations.map((l) => <li key={l}>• {l}</li>)}
                </ul>
              </div>
              {ai.recommendation && (
                <div>
                  <h3 className="mb-2 text-sm font-semibold">Suggested Next Step</h3>
                  <p className="text-sm text-muted-foreground">{ai.recommendation}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Clinical factors */}
        <Card className="p-6">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 font-semibold">
              <FileText className="h-5 w-5 text-primary" /> Clinical Factors
            </h2>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(clinicalFactors ?? [
              { label: 'Age', value: `${scan.clinical_snapshot.age} yrs`, flag: false },
              { label: 'Blood Pressure', value: `${scan.clinical_snapshot.systolic_bp}/${scan.clinical_snapshot.diastolic_bp}`, flag: false },
              { label: 'Cholesterol', value: `${scan.clinical_snapshot.cholesterol_mgdl} mg/dL`, flag: false },
              { label: 'Smoking', value: scan.clinical_snapshot.smoking_status, flag: false },
              { label: 'Diabetes', value: scan.clinical_snapshot.diabetes_history ? 'Yes' : 'No', flag: false },
              { label: 'Family History', value: scan.clinical_snapshot.family_cardiac_history ? 'Yes' : 'No', flag: false },
            ]).map((f) => (
              <div key={f.label} className={`rounded-lg border p-2 ${f.flag ? 'border-warning/40 bg-warning/5' : 'border-border'}`}>
                <p className="text-[11px] text-muted-foreground">{f.label}</p>
                <p className="mt-0.5 font-semibold capitalize">{f.value}</p>
              </div>
            ))}
          </div>
          {clinicalFactors && (
            <p className="mt-3 text-[11px] text-muted-foreground">Highlighted values are outside common reference ranges.</p>
          )}
        </Card>

        {/* Risk factors */}
        <Card className="p-6">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 font-semibold">
              <Activity className="h-5 w-5 text-primary" /> Risk Factor Contributions
            </h2>
          </div>
          {prediction && prediction.riskFactors.length > 0 ? (
            <div className="space-y-4">
              {[...prediction.riskFactors]
                .sort((a, b) => b.contribution - a.contribution)
                .map((f) => (
                  <div key={f.label}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span>{f.label}</span>
                      <span className={`font-bold ${riskColor}`}>{(f.contribution * 100).toFixed(1)}</span>
                    </div>
                    <Progress value={f.contribution * 100} className="h-2" />
                  </div>
                ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Risk factor data unavailable.</p>
          )}
        </Card>
      </div>

      {/* Recommendations */}
      {prediction && prediction.recommendations.length > 0 && (
        <Card className="mt-6 p-6">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 font-semibold">
              <Lightbulb className="h-5 w-5 text-warning" /> Health Recommendations
            </h2>
          </div>
          <div className="stagger grid gap-3 sm:grid-cols-2">
            {prediction.recommendations.map((rec, i) => (
              <div key={i} className="lift flex gap-3 rounded-xl border border-border bg-card p-3">
                <Heart className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span className="text-sm">{rec}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

    </AppLayout>
  );
}

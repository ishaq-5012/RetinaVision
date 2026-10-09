import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Brain, ScanEye, Layers, Eye } from 'lucide-react';
import { AppLayout } from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { LoadingSpinner, RiskBadge } from '@/components/shared';
import { supabase, type Scan, type PredictionPayload } from '@/lib/supabase';
import { cachePayload, getCachedPayload, predictionFromPayload, type PredictionResult } from '@/lib/aiEngine';
import { useAuth } from '@/hooks/useAuth';

export function ExplainableAIPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [scan, setScan] = useState<Scan | null>(null);
  const [prediction, setPrediction] = useState<PredictionResult | null>(null);
  const [gradcam, setGradcam] = useState<{ heatmapUrl: string; overlayUrl: string } | null>(null);
  const [payload, setPayload] = useState<PredictionPayload | null>(null);
  const [view, setView] = useState<'original' | 'heatmap' | 'overlay'>('overlay');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      if (!id || !user) return;
      const { data } = await supabase
        .from('scans')
        .select('*')
        .eq('id', id)
        .maybeSingle(); // access is enforced by RLS
      if (data) {
        setScan(data as Scan);
        const statePayload = (location.state as { prediction?: PredictionPayload } | null)?.prediction;
        const payload = statePayload ?? (data as Scan).prediction_payload ?? getCachedPayload(id);
        if (payload) {
          cachePayload(id, payload);
          setPayload(payload);
          setPrediction(predictionFromPayload(payload));
          setGradcam({
            heatmapUrl: payload.gradcam_heatmap,
            overlayUrl: payload.gradcam_overlay,
          });
        }
      }
      setLoading(false);
    }
    load();
  }, [id, user, location.state]);

  if (loading) return <AppLayout><LoadingSpinner label="Loading explainable AI data..." /></AppLayout>;
  if (!scan || !gradcam) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Brain className="mb-4 h-12 w-12 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Visualization data unavailable</h2>
          <p className="mt-1 text-sm text-muted-foreground">This scan has no stored visualization data.</p>
          <Button className="mt-4" onClick={() => navigate('/home')}>Back to Dashboard</Button>
        </div>
      </AppLayout>
    );
  }

  const isGradcam = payload?.visualization_type === 'gradcam';
  const vizName = isGradcam ? 'Grad-CAM' : 'Vessel Saliency';
  const ai = payload?.ai_interpretation;

  const imageToShow =
    view === 'original' ? scan.image_url || payload?.original_image : view === 'heatmap' ? gradcam.heatmapUrl : gradcam.overlayUrl;

  return (
    <AppLayout>
      <div className="mb-4">
        <Button variant="ghost" size="sm" asChild>
          <Link to={`/result/${scan.id}`} state={payload ? { prediction: payload } : undefined}><ArrowLeft className="mr-1 h-4 w-4" /> Back to Results</Link>
        </Button>
      </div>

      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">
          {isGradcam ? 'Explainable AI — Grad-CAM Visualization' : 'Retinal Vessel Saliency — Vessel-Based Attention Map'}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {isGradcam
            ? 'Understand which retinal regions influenced the trained model prediction'
            : 'See which retinal vessel structures the OpenCV pipeline detected and measured'}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Image viewer */}
        <div className="lg:col-span-3">
          <Card className="p-5">
            {/* View toggle */}
            <div className="mb-4 flex gap-2">
              {([
                { key: 'original', label: 'Original', icon: ScanEye },
                { key: 'heatmap', label: isGradcam ? 'Heatmap' : 'Vessel Map', icon: Layers },
                { key: 'overlay', label: 'Overlay', icon: Eye },
              ] as const).map((v) => (
                <button
                  key={v.key}
                  onClick={() => setView(v.key)}
                  className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-all ${
                    view === v.key
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:border-primary/40'
                  }`}
                >
                  <v.icon className="h-4 w-4" />
                  {v.label}
                </button>
              ))}
            </div>

            {/* Image */}
            <div className="overflow-hidden rounded-xl border border-border bg-black/5">
              {imageToShow ? (
                <img src={imageToShow} alt={`${vizName} ${view}`} className="w-full" />
              ) : (
                <div className="flex h-64 items-center justify-center bg-muted">
                  <ScanEye className="h-12 w-12 text-muted-foreground" />
                </div>
              )}
            </div>

            <p className="mt-3 text-xs text-muted-foreground">
              {view === 'original' && 'The original retinal fundus image as uploaded.'}
              {view === 'heatmap' &&
                (isGradcam
                  ? 'Grad-CAM activation map showing regions of high model attention (red) vs. low attention (blue).'
                  : 'Frangi vesselness response: strong vessel-like structure (red) vs. none (blue).')}
              {view === 'overlay' &&
                (isGradcam
                  ? 'The heatmap overlaid on the original retinal image — highlighting areas that contributed most to the prediction.'
                  : 'The vessel map overlaid on the original retinal image.')}
            </p>
          </Card>
        </div>

        {/* Explanation panel */}
        <div className="space-y-6 lg:col-span-2">
          <Card className="p-5">
            <h2 className="mb-3 flex items-center gap-2 font-semibold">
              <Brain className="h-5 w-5 text-primary" /> What this map shows
            </h2>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <RiskBadge level={scan.risk_level} />
              {payload?.risk_score != null && (
                <span className="text-sm text-muted-foreground">Risk score: {payload.risk_score}/100</span>
              )}
            </div>
            {isGradcam ? (
              <p className="text-sm leading-relaxed text-muted-foreground">
                Grad-CAM computes the gradient of the predicted class with respect to the final convolutional layer
                of the trained CNN, producing a coarse localization map of the regions that drove the prediction.
              </p>
            ) : (
              <p className="text-sm leading-relaxed text-muted-foreground">
                The attention map highlights the retinal vessel network detected during image analysis, using a
                multi-scale Frangi vesselness filter — the same vessel segmentation used to measure density,
                thickness and tortuosity.
              </p>
            )}
          </Card>

          {ai?.status === 'available' && ai.retinal_observations.length > 0 && (
            <Card className="p-5">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="font-semibold">AI Retinal Observations</h2>
              </div>
              <ul className="space-y-1.5 text-sm text-muted-foreground">
                {ai.retinal_observations.map((o) => <li key={o}>• {o}</li>)}
              </ul>
            </Card>
          )}

          <Card className="p-5">
            <h2 className="mb-3 font-semibold">Color Legend</h2>
            <div className="space-y-2">
              {[
                ...(isGradcam
                  ? [
                      { color: 'bg-red-500', label: 'High influence', desc: 'Strong contribution to prediction' },
                      { color: 'bg-yellow-400', label: 'Moderate influence', desc: 'Some contribution' },
                      { color: 'bg-green-500', label: 'Low influence', desc: 'Minimal contribution' },
                      { color: 'bg-blue-500', label: 'No influence', desc: 'Not considered by model' },
                    ]
                  : [
                      { color: 'bg-red-500', label: 'Strong vessel response', desc: 'Large, high-contrast vessels' },
                      { color: 'bg-yellow-400', label: 'Moderate response', desc: 'Smaller vessels' },
                      { color: 'bg-green-500', label: 'Weak response', desc: 'Faint or thin structures' },
                      { color: 'bg-blue-500', label: 'No vessel detected', desc: 'Background retina' },
                    ]),
              ].map((l) => (
                <div key={l.label} className="flex items-center gap-3">
                  <div className={`h-4 w-4 rounded ${l.color}`} />
                  <div>
                    <p className="text-sm font-medium">{l.label}</p>
                    <p className="text-xs text-muted-foreground">{l.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {prediction && (
            <Card className="p-5">
              <h2 className="mb-3 font-semibold">Key Risk Factors</h2>
              <ul className="space-y-2 text-sm">
                {[...prediction.riskFactors]
                  .sort((a, b) => b.contribution - a.contribution)
                  .slice(0, 4)
                  .map((f) => (
                    <li key={f.label} className="flex items-start gap-2">
                      <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                      <span>
                        <strong>{f.label}</strong> — contribution {(f.contribution * 100).toFixed(1)}
                      </span>
                    </li>
                  ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

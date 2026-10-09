import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, ExternalLink, Eye, Layers, ScanEye, Sparkles } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { BiomarkerBar, RiskBadge } from '@/components/shared';
import type { Scan } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { downloadImage, scanImages } from '@/lib/research';

type View = 'original' | 'overlay' | 'heatmap';

/** Full research view of one consented scan: images, measurements, clinical data and AI findings. */
export function ResearchScanDialog({
  scan,
  subject,
  onClose,
}: {
  scan: Scan | null;
  subject: string;
  onClose: () => void;
}) {
  const [view, setView] = useState<View>('original');
  if (!scan) return null;
  const p = scan.prediction_payload;
  const img = scanImages(scan);
  const ai = p?.ai_interpretation;
  const q = p?.image_quality;
  const c = scan.clinical_snapshot;
  const shown = img[view] ?? img.original;
  const tag = `${subject.replace(/\s+/g, '_')}_${scan.created_at.slice(0, 10)}`;
  const bmi = c?.height_cm && c?.weight_kg ? (c.weight_kg / Math.pow(c.height_cm / 100, 2)).toFixed(1) : '—';

  return (
    <Dialog open={!!scan} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-3">
            <span className="font-mono text-cyan-300">{subject}</span>
            <RiskBadge level={scan.risk_level} />
            <span className="text-sm font-normal text-muted-foreground">
              Risk score {p?.risk_score ?? scan.confidence}/100 · {new Date(scan.created_at).toLocaleString()}
            </span>
          </DialogTitle>
          <DialogDescription>Consented research record · patient identity withheld</DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 lg:grid-cols-5">
          {/* Images */}
          <div className="lg:col-span-3">
            <div className="mb-3 flex flex-wrap gap-2">
              {([
                { k: 'original', label: 'Original', icon: ScanEye },
                { k: 'overlay', label: 'Vessel overlay', icon: Eye },
                { k: 'heatmap', label: 'Vessel map', icon: Layers },
              ] as const).map((v) => (
                <button
                  key={v.k}
                  disabled={!img[v.k]}
                  onClick={() => setView(v.k)}
                  className={cn(
                    'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all disabled:opacity-40',
                    view === v.k ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/40',
                  )}
                >
                  <v.icon className="h-3.5 w-3.5" /> {v.label}
                </button>
              ))}
            </div>
            <div className="laser overflow-hidden rounded-xl border border-border bg-black">
              {shown ? (
                <img key={view} src={shown} alt={`${subject} ${view}`} className="wipe-in w-full" />
              ) : (
                <div className="flex h-72 items-center justify-center text-sm text-muted-foreground">No image stored for this scan</div>
              )}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {img.original && (
                <Button size="sm" variant="outline" onClick={() => downloadImage(img.original!, `${tag}_original.png`)}>
                  <Download className="mr-1.5 h-3.5 w-3.5" /> Original
                </Button>
              )}
              {img.overlay && (
                <Button size="sm" variant="outline" onClick={() => downloadImage(img.overlay!, `${tag}_vessel_overlay.png`)}>
                  <Download className="mr-1.5 h-3.5 w-3.5" /> Vessel overlay
                </Button>
              )}
              {img.heatmap && (
                <Button size="sm" variant="outline" onClick={() => downloadImage(img.heatmap!, `${tag}_vessel_map.png`)}>
                  <Download className="mr-1.5 h-3.5 w-3.5" /> Vessel map
                </Button>
              )}
              <Button size="sm" variant="ghost" asChild>
                <Link to={`/result/${scan.id}`}>
                  <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Full report
                </Link>
              </Button>
            </div>
          </div>

          {/* Measurements + clinical */}
          <div className="space-y-5 lg:col-span-2">
            <div>
              <h3 className="mb-3 text-sm font-semibold">Retinal biomarkers</h3>
              <div className="space-y-3">
                <BiomarkerBar label="Vessel density" value={scan.biomarkers?.vessel_density ?? 0} max={0.2} />
                <BiomarkerBar label="Vessel thickness" value={scan.biomarkers?.vessel_thickness ?? 0} />
                <BiomarkerBar label="Tortuosity" value={scan.biomarkers?.tortuosity ?? 0} />
                <BiomarkerBar label="Arteriovenous ratio" value={scan.biomarkers?.arteriovenous_ratio ?? 0} />
                <BiomarkerBar label="Microvascular index" value={scan.biomarkers?.microvascular_changes ?? 0} />
              </div>
            </div>

            {q && (
              <div>
                <h3 className="mb-2 text-sm font-semibold">Image quality · <span className="capitalize">{q.label}</span></h3>
                <div className="grid grid-cols-4 gap-2 text-center">
                  {[
                    ['Sharp', q.metrics.sharpness.toFixed(0)],
                    ['Bright', q.metrics.brightness.toFixed(0)],
                    ['Contrast', q.metrics.contrast.toFixed(0)],
                    ['Field', `${Math.round(q.metrics.field_coverage * 100)}%`],
                  ].map(([k, v]) => (
                    <div key={k} className="rounded-lg border border-border p-1.5">
                      <p className="text-[10px] text-muted-foreground">{k}</p>
                      <p className="text-sm font-semibold">{v}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <h3 className="mb-2 text-sm font-semibold">Clinical profile</h3>
              <div className="grid grid-cols-3 gap-2">
                {[
                  ['Age', c?.age],
                  ['Sex', c?.gender],
                  ['BMI', bmi],
                  ['BP', c ? `${c.systolic_bp}/${c.diastolic_bp}` : '—'],
                  ['HR', c?.heart_rate],
                  ['Chol.', c?.cholesterol_mgdl],
                  ['Smoking', c?.smoking_status],
                  ['Diabetes', c?.diabetes_history ? 'Yes' : 'No'],
                  ['Family hx', c?.family_cardiac_history ? 'Yes' : 'No'],
                ].map(([k, v]) => (
                  <div key={k as string} className="rounded-lg border border-border p-2">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{k}</p>
                    <p className="text-sm font-semibold capitalize">{v ?? '—'}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* AI interpretation */}
        <div className="mt-2 rounded-xl border border-border bg-background/40 p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="h-4 w-4 text-violet-400" /> AI retinal interpretation
          </h3>
          {ai?.status === 'available' ? (
            <div className="grid gap-4 text-sm md:grid-cols-2">
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Observations</p>
                <ul className="space-y-1">
                  {ai.retinal_observations.map((o) => <li key={o}>• {o}</li>)}
                </ul>
                {ai.visible_patterns.length > 0 && (
                  <>
                    <p className="mb-1 mt-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Visible patterns</p>
                    <ul className="space-y-1">
                      {ai.visible_patterns.map((o) => <li key={o}>• {o}</li>)}
                    </ul>
                  </>
                )}
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Clinical context</p>
                <p className="text-muted-foreground">{ai.clinical_context_interpretation}</p>
                {ai.risk_factors.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {ai.risk_factors.map((f) => (
                      <span key={f} className="rounded-full border border-border px-2 py-0.5 text-xs">{f}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No AI interpretation stored for this scan.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

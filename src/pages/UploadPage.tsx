import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  UploadCloud,
  X,
  ScanEye,
  Brain,
  Loader2,
  CheckCircle2,
  Heart,
  Activity,
  Sparkles,
  FileText,
} from 'lucide-react';
import { AppLayout } from '@/components/AppLayout';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/hooks/useAuth';
import { supabase, type ClinicalData, type Patient } from '@/lib/supabase';
import { cachePayload, payloadFromPrediction, runPrediction } from '@/lib/aiEngine';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

const STEPS = ['Upload Image', 'Clinical Data', 'Screening Analysis'] as const;

/**
 * Stages of the backend screening pipeline. The backend runs them in this
 * order inside one request; the progress shown is time-based, and the final
 * stage completes only when the real response arrives.
 */
const ANALYSIS_STAGES = [
  { label: 'Uploading retinal image', icon: UploadCloud, at: 5 },
  { label: 'Processing retinal structures', icon: ScanEye, at: 20 },
  { label: 'Calculating retinal biomarkers', icon: Activity, at: 38 },
  { label: 'Analyzing clinical factors', icon: Heart, at: 52 },
  { label: 'Running multimodal AI interpretation', icon: Sparkles, at: 66 },
  { label: 'Generating screening report', icon: FileText, at: 100 },
] as const;

export function UploadPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState(0);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);

  const [patient, setPatient] = useState<Patient | null>(null);
  const [clinical, setClinical] = useState<ClinicalData>({
    age: 45,
    gender: 'male',
    height_cm: 170,
    weight_kg: 70,
    systolic_bp: 120,
    diastolic_bp: 80,
    heart_rate: 72,
    smoking_status: 'never',
    diabetes_history: false,
    family_cardiac_history: false,
    cholesterol_mgdl: 180,
  });

  useEffect(() => {
    async function loadPatient() {
      if (!user) return;
      const { data } = await supabase
        .from('patients')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .maybeSingle();
      if (data) {
        const p = data as Patient;
        setPatient(p);
        setClinical((prev) => ({
          ...prev,
          age: p.age ?? prev.age,
          gender: p.gender ?? prev.gender,
          height_cm: p.height_cm ?? prev.height_cm,
          weight_kg: p.weight_kg ?? prev.weight_kg,
          systolic_bp: p.systolic_bp ?? prev.systolic_bp,
          diastolic_bp: p.diastolic_bp ?? prev.diastolic_bp,
          heart_rate: p.heart_rate ?? prev.heart_rate,
          smoking_status: p.smoking_status ?? prev.smoking_status,
          diabetes_history: p.diabetes_history ?? prev.diabetes_history,
          family_cardiac_history: p.family_cardiac_history ?? prev.family_cardiac_history,
          cholesterol_mgdl: p.cholesterol_mgdl ?? prev.cholesterol_mgdl,
        }));
      }
    }
    loadPatient();
  }, [user]);

  const handleFile = useCallback((file: File) => {
    if (!file.type.match(/image\/(jpeg|jpg|png)/)) {
      toast({ title: 'Invalid file type', description: 'Please upload a JPG or PNG image.', variant: 'destructive' });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: 'File too large', description: 'Maximum size is 10MB.', variant: 'destructive' });
      return;
    }
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = (e) => setImagePreview(e.target?.result as string);
    reader.readAsDataURL(file);
    setStep(1);
  }, [toast]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const removeImage = () => {
    setImageFile(null);
    setImagePreview(null);
    setStep(0);
  };

  const runAnalysis = async () => {
    if (!imagePreview || !user || !imageFile) return;
    setAnalyzing(true);
    setStep(2);
    setProgress(5);

    // Advance through the pipeline stages while the backend works; stop short
    // of the last stage until the real response arrives.
    const ticker = window.setInterval(() => {
      setProgress((p) => (p < 92 ? p + (p < 60 ? 4 : 1) : p));
    }, 450);

    try {
      // Screening pipeline on the FastAPI backend (OpenCV + clinical factors + Groq vision)
      const prediction = await runPrediction(imagePreview, clinical).finally(() => window.clearInterval(ticker));
      setProgress(100);

      // Upload image to storage
      const ext = imageFile.name.split('.').pop() || 'png';
      const filePath = `${user.id}/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('retinal-scans')
        .upload(filePath, imageFile);

      let imageUrl: string | null = null;
      if (!uploadError) {
        const { data: urlData } = supabase.storage.from('retinal-scans').getPublicUrl(filePath);
        imageUrl = urlData.publicUrl;
      } else {
        console.error('Retinal image upload failed:', uploadError);
        toast({
          title: 'Image not saved to storage',
          description: `${uploadError.message}. The scan will still be saved.`,
          variant: 'destructive',
        });
      }

      // Save scan record with the full backend prediction payload.
      // If the prediction_payload migration has not been applied to the
      // database yet, fall back to the legacy columns so the analysis still
      // redirects to the result page.
      const insertRow = {
        user_id: user.id,
        patient_id: patient?.id ?? null,
        image_path: filePath,
        image_url: imageUrl,
        clinical_snapshot: clinical,
        risk_level: prediction.risk_level,
        probability_low: prediction.probability_low,
        probability_moderate: prediction.probability_moderate,
        probability_high: prediction.probability_high,
        confidence: prediction.confidence,
        biomarkers: prediction.biomarkers,
        prediction_status: 'completed',
        prediction_payload: payloadFromPrediction(prediction),
      };

      let { data: scanData, error: dbError } = await supabase
        .from('scans')
        .insert(insertRow)
        .select()
        .single();

      const columnMissing = dbError && /prediction_payload|prediction_status/i.test(dbError.message);
      if (dbError && columnMissing) {
        const legacyRow = {
          user_id: insertRow.user_id,
          patient_id: insertRow.patient_id,
          image_path: insertRow.image_path,
          image_url: insertRow.image_url,
          clinical_snapshot: insertRow.clinical_snapshot,
          risk_level: insertRow.risk_level,
          probability_low: insertRow.probability_low,
          probability_moderate: insertRow.probability_moderate,
          probability_high: insertRow.probability_high,
          confidence: insertRow.confidence,
          biomarkers: insertRow.biomarkers,
        };
        ({ data: scanData, error: dbError } = await supabase
          .from('scans')
          .insert(legacyRow)
          .select()
          .single());
      }

      if (dbError) throw dbError;

      setProgress(100);
      await new Promise((r) => setTimeout(r, 400));

      // Navigate to the result page — it reads the payload from the DB, and
      // falls back to this navigation state if the DB column is unavailable.
      if (scanData) {
        cachePayload(scanData.id, payloadFromPrediction(prediction));
        navigate(`/result/${scanData.id}`, {
          state: { prediction: payloadFromPrediction(prediction) },
        });
      }
    } catch (err) {
      toast({
        title: 'Analysis failed',
        description: err instanceof Error ? err.message : 'An unexpected error occurred.',
        variant: 'destructive',
      });
      setAnalyzing(false);
      setStep(1);
    }
  };

  return (
    <AppLayout>
      <PageHeader
        title="New Retinal Scan"
        description="Upload a fundus image and enter clinical data for AI cardiovascular risk analysis"
      />

      {/* Steps indicator */}
      <div className="mb-8 flex items-center gap-2">
        {STEPS.map((s, i) => (
          <div key={s} className="flex flex-1 items-center gap-2">
            <div
              className={cn(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold transition-all duration-500',
                i <= step
                  ? 'border-transparent bg-gradient-to-br from-sky-400 to-blue-600 text-white shadow-lg shadow-primary/30'
                  : 'border-border bg-card text-muted-foreground',
                i === step && 'ring-4 ring-primary/15 scale-110',
              )}
            >
              {i < step ? <CheckCircle2 className="h-5 w-5" /> : i + 1}
            </div>
            <span className={cn('text-sm font-medium', i <= step ? 'text-foreground' : 'text-muted-foreground')}>
              {s}
            </span>
            {i < STEPS.length - 1 && (
              <div className="relative h-1 flex-1 overflow-hidden rounded-full bg-border">
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-sky-400 to-blue-600 transition-[width] duration-700 ease-out"
                  style={{ width: i < step ? '100%' : '0%' }}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Left: image upload/preview */}
        <div className="lg:col-span-2">
          <Card className="p-5">
            <h2 className="mb-4 font-semibold">Retinal Fundus Image</h2>
            {imagePreview ? (
              <div className="relative">
                <div className="relative overflow-hidden rounded-xl border border-border">
                  <img src={imagePreview} alt="Retina preview" className="w-full" />
                  {analyzing && (
                    <div className="absolute inset-0 bg-background/60 backdrop-blur-sm">
                      <div className="absolute inset-x-0 h-1 bg-primary/80 animate-scan-line" />
                    </div>
                  )}
                </div>
                {!analyzing && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={removeImage}
                    className="absolute right-2 top-2"
                  >
                    <X className="mr-1 h-4 w-4" /> Remove
                  </Button>
                )}
              </div>
            ) : (
              <div
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  'flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed py-16 text-center transition-all',
                  dragging
                    ? 'ants scale-[1.02] border-transparent bg-primary/10 shadow-xl shadow-primary/20'
                    : 'border-border hover:border-primary/50 hover:bg-primary/5 hover:shadow-lg hover:shadow-primary/10',
                )}
              >
                <div className={cn('mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-400 to-blue-600 text-white shadow-lg shadow-primary/30 transition-transform duration-300', dragging ? 'scale-110 -translate-y-1' : 'animate-float')}>
                  <UploadCloud className="h-7 w-7 text-primary" />
                </div>
                <p className="font-medium">Drag & drop or click to upload</p>
                <p className="mt-1 text-xs text-muted-foreground">JPG or PNG · max 10MB</p>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
            />
          </Card>
        </div>

        {/* Right: clinical form / analysis */}
        <div className="lg:col-span-3">
          {step < 2 && (
            <Card className="p-5">
              <h2 className="mb-4 font-semibold">Clinical Data</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Age (years)</Label>
                  <Input
                    type="number"
                    value={clinical.age}
                    onChange={(e) => setClinical({ ...clinical, age: +e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Gender</Label>
                  <Select
                    value={clinical.gender}
                    onValueChange={(v) => setClinical({ ...clinical, gender: v as ClinicalData['gender'] })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Height (cm)</Label>
                  <Input
                    type="number"
                    value={clinical.height_cm}
                    onChange={(e) => setClinical({ ...clinical, height_cm: +e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Weight (kg)</Label>
                  <Input
                    type="number"
                    value={clinical.weight_kg}
                    onChange={(e) => setClinical({ ...clinical, weight_kg: +e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Systolic BP (mmHg)</Label>
                  <Input
                    type="number"
                    value={clinical.systolic_bp}
                    onChange={(e) => setClinical({ ...clinical, systolic_bp: +e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Diastolic BP (mmHg)</Label>
                  <Input
                    type="number"
                    value={clinical.diastolic_bp}
                    onChange={(e) => setClinical({ ...clinical, diastolic_bp: +e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Heart Rate (bpm)</Label>
                  <Input
                    type="number"
                    value={clinical.heart_rate}
                    onChange={(e) => setClinical({ ...clinical, heart_rate: +e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Cholesterol (mg/dL)</Label>
                  <Input
                    type="number"
                    value={clinical.cholesterol_mgdl}
                    onChange={(e) => setClinical({ ...clinical, cholesterol_mgdl: +e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Smoking Status</Label>
                  <Select
                    value={clinical.smoking_status}
                    onValueChange={(v) => setClinical({ ...clinical, smoking_status: v as ClinicalData['smoking_status'] })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="never">Never</SelectItem>
                      <SelectItem value="former">Former</SelectItem>
                      <SelectItem value="current">Current</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border p-3">
                  <Label className="cursor-pointer">Diabetes History</Label>
                  <Switch
                    checked={clinical.diabetes_history}
                    onCheckedChange={(v) => setClinical({ ...clinical, diabetes_history: v })}
                  />
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border p-3 sm:col-span-2">
                  <Label className="cursor-pointer">Family Cardiac History</Label>
                  <Switch
                    checked={clinical.family_cardiac_history}
                    onCheckedChange={(v) => setClinical({ ...clinical, family_cardiac_history: v })}
                  />
                </div>
              </div>
              <div className="mt-6 flex gap-3">
                <Button variant="outline" onClick={() => navigate('/home')}>
                  Cancel
                </Button>
                <Button onClick={runAnalysis} disabled={!imagePreview} className="flex-1">
                  <Brain className="mr-2 h-4 w-4" />
                  Run Screening Analysis
                </Button>
              </div>
            </Card>
          )}

          {step === 2 && (
            <Card className="p-8">
              <div className="flex flex-col items-center text-center">
                <div className="relative mb-6">
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
                    <Brain className="h-10 w-10 text-primary" />
                  </div>
                  <div className="pulse-ring absolute inset-0 rounded-full border-2 border-primary/50" />
                  <div className="pulse-ring absolute inset-0 rounded-full border-2 border-violet-400/40 [animation-delay:0.6s]" />
                  <div className="pulse-ring absolute inset-0 rounded-full border-2 border-cyan-300/30 [animation-delay:1.2s]" />
                </div>
                <h2 className="text-xl font-bold">Screening Analysis in Progress</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  OpenCV retinal analysis · clinical factors · Groq multimodal AI interpretation
                </p>

                <div className="mt-6 w-full max-w-sm">
                  <div className="mb-2 flex justify-between text-xs">
                    <span className="text-muted-foreground">Processing</span>
                    <span className="font-bold text-primary">{progress}%</span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="relative h-full overflow-hidden rounded-full bg-gradient-to-r from-sky-400 via-blue-500 to-indigo-600 transition-all duration-500"
                      style={{ width: `${progress}%` }}
                    >
                      <div className="animate-shimmer absolute inset-0" />
                    </div>
                  </div>
                </div>

                <div className="mt-6 w-full max-w-sm space-y-2">
                  {ANALYSIS_STAGES.map((stage, i) => ({
                    label: stage.label,
                    icon: stage.icon,
                    n: i + 1,
                    done: progress >= (ANALYSIS_STAGES[i + 1]?.at ?? 100),
                    active: progress >= stage.at && progress < (ANALYSIS_STAGES[i + 1]?.at ?? 101),
                  })).map((s, i) => (
                    <div
                      key={s.label}
                      className={cn(
                        'enter flex items-center gap-3 rounded-xl border p-3 text-sm transition-all duration-500',
                        s.done && 'border-success/30 bg-success/5',
                        s.active && 'scale-[1.02] border-primary/40 bg-primary/5 shadow-md shadow-primary/10',
                        !s.done && !s.active && 'border-border opacity-60',
                      )}
                      style={{ ['--enter-delay' as string]: `${i * 90}ms` }}
                    >
                      <span
                        className={cn(
                          'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-all duration-500',
                          s.done ? 'bg-success text-white' : s.active ? 'gradient-medical text-white' : 'bg-muted text-muted-foreground',
                        )}
                      >
                        {s.done ? (
                          <CheckCircle2 className="h-4 w-4" />
                        ) : s.active ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <s.icon className="h-3.5 w-3.5" />
                        )}
                      </span>
                      <span className={cn('flex-1 text-left', s.done || s.active ? 'font-medium text-foreground' : 'text-muted-foreground')}>
                        {s.label}
                      </span>
                      <span className="text-[11px] font-semibold text-muted-foreground">STEP {s.n}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

export type RiskLevel = 'low' | 'moderate' | 'high';

export interface Profile {
  id: string;
  full_name: string;
  role: 'patient' | 'doctor' | 'researcher';
  created_at: string;
}

export interface Patient {
  id: string;
  user_id: string;
  full_name: string;
  age: number | null;
  gender: 'male' | 'female' | 'other' | null;
  height_cm: number | null;
  weight_kg: number | null;
  systolic_bp: number | null;
  diastolic_bp: number | null;
  heart_rate: number | null;
  smoking_status: 'never' | 'former' | 'current';
  diabetes_history: boolean;
  family_cardiac_history: boolean;
  cholesterol_mgdl: number | null;
  bmi: number | null;
  created_at: string;
}

export interface ClinicalData {
  age: number;
  gender: 'male' | 'female' | 'other';
  height_cm: number;
  weight_kg: number;
  systolic_bp: number;
  diastolic_bp: number;
  heart_rate: number;
  smoking_status: 'never' | 'former' | 'current';
  diabetes_history: boolean;
  family_cardiac_history: boolean;
  cholesterol_mgdl: number;
}

export interface Biomarkers {
  vessel_density: number;
  vessel_thickness: number;
  tortuosity: number;
  arteriovenous_ratio: number;
  microvascular_changes: number;
}

export interface RiskFactor {
  label: string;
  contribution: number;
}

export type PredictionStatus = 'pending' | 'processing' | 'completed' | 'failed';

/** Objective OpenCV image-quality checks computed by the backend. */
export interface ImageQuality {
  label: 'good' | 'acceptable' | 'poor';
  issues: string[];
  metrics: { sharpness: number; brightness: number; contrast: number; field_coverage: number };
}

/** A patient-submitted clinical value echoed back by the backend. */
export interface ClinicalFactor {
  label: string;
  value: string;
  flag: boolean;
}

/** Groq multimodal interpretation, or an explicit "unavailable" marker (never fabricated). */
export type AiInterpretation =
  | {
      status: 'available';
      model: string;
      latency_ms: number;
      image_quality: 'good' | 'acceptable' | 'poor' | 'ungradable';
      image_quality_notes: string;
      retinal_observations: string[];
      visible_patterns: string[];
      clinical_context_interpretation: string;
      risk_factors: string[];
      confidence: 'low' | 'moderate' | 'high';
      limitations: string[];
      recommendation: string;
    }
  | { status: 'unavailable'; message: string; reason: string; model: string };

export type ScoreMethod = 'prototype_heuristic' | 'trained_cnn';
export type VisualizationType = 'vessel_saliency' | 'gradcam';

/**
 * Full response body returned by the FastAPI AI backend (`POST /api/predict`).
 * Stored as `scans.prediction_payload` (jsonb) so results survive backend restarts.
 */
export interface PredictionPayload {
  scan_id: string;
  risk_level: string;
  risk_label: string;
  /** Legacy column: holds the Prototype Risk Score (0-100) for prototype scans. */
  confidence: number;
  /** Experimental Prototype Risk Score 0-100 (not a probability). Absent on scans made before this field existed. */
  risk_score?: number;
  score_method?: ScoreMethod;
  score_breakdown?: { clinical_component: number; retinal_component: number; thresholds: [number, number] };
  image_quality?: ImageQuality;
  clinical_factors?: ClinicalFactor[];
  ai_interpretation?: AiInterpretation;
  visualization_type?: VisualizationType;
  probability_low: number;
  probability_moderate: number;
  probability_high: number;
  biomarkers: Biomarkers;
  risk_factors: RiskFactor[];
  recommendations: string[];
  pipeline: string[];
  gradcam_heatmap: string;
  gradcam_overlay: string;
  processed_image: string;
  original_image: string;
}

export interface Scan {
  id: string;
  user_id: string;
  patient_id: string | null;
  image_path: string | null;
  image_url: string | null;
  clinical_snapshot: ClinicalData;
  risk_level: RiskLevel;
  probability_low: number;
  probability_moderate: number;
  probability_high: number;
  confidence: number;
  biomarkers: Biomarkers;
  gradcam_path: string | null;
  prediction_status?: PredictionStatus;
  processed_image_path?: string | null;
  gradcam_heatmap_path?: string | null;
  gradcam_overlay_path?: string | null;
  prediction_payload?: PredictionPayload | null;
  pipeline?: string[] | null;
  created_at: string;
}

export interface Report {
  id: string;
  scan_id: string;
  user_id: string;
  report_url: string | null;
  created_at: string;
}

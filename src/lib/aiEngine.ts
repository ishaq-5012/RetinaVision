import type { Biomarkers, ClinicalData, PredictionPayload, RiskLevel } from './supabase';

export interface PredictionResult {
  risk_level: RiskLevel;
  probability_low: number;
  probability_moderate: number;
  probability_high: number;
  confidence: number;
  biomarkers: Biomarkers;
  riskFactors: { label: string; contribution: number }[];
  recommendations: string[];
}

/**
 * Result of a backend screening run, enriched with the visual artifacts
 * returned by the FastAPI backend (base64 PNG data URLs).
 */
export interface PredictionOutput extends PredictionResult {
  /** The raw backend response, stored verbatim in scans.prediction_payload. */
  payload: PredictionPayload;
  scan_id: string;
  risk_label: string;
  pipeline: string[];
  gradcamHeatmap: string;
  gradcamOverlay: string;
  processedImage: string;
  originalImage: string;
}

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000';

/**
 * In-memory cache of prediction payloads keyed by scan id, so the result and
 * Grad-CAM pages keep their visuals when navigating between each other even
 * if the router state is lost or the DB row lacks the payload.
 */
const payloadCache = new Map<string, PredictionPayload>();

export function cachePayload(scanId: string, payload: PredictionPayload | null | undefined) {
  if (payload) payloadCache.set(scanId, payload);
}

export function getCachedPayload(scanId: string): PredictionPayload | undefined {
  return payloadCache.get(scanId);
}

/**
 * Runs the retinal screening pipeline on the FastAPI backend.
 *
 * Sends the retinal image as a data URL together with the clinical metadata
 * and returns the full backend response: OpenCV image quality and biomarkers,
 * the experimental Prototype Risk Score, risk factor contributions, the Groq
 * vision interpretation and the vessel-based saliency map.
 *
 * This is a research/demo prototype and does NOT perform medical diagnosis.
 */
export async function runPrediction(
  imageDataUrl: string,
  clinical: ClinicalData,
): Promise<PredictionOutput> {
  const response = await fetch(`${API_URL}/api/predict`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: imageDataUrl, clinical_data: clinical }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const detail = body?.detail ?? `AI backend returned an error (HTTP ${response.status})`;
    throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail));
  }

  const payload = (await response.json()) as PredictionPayload;
  return normalizePayload(payload);
}

/**
 * Converts a PredictionPayload (snake_case, as stored in scans.prediction_payload)
 * into the camelCase PredictionResult shape expected by the result pages.
 */
export function predictionFromPayload(payload: PredictionPayload | null | undefined): PredictionResult | null {
  if (!payload) return null;
  return {
    risk_level: toRiskLevel(payload.risk_level),
    probability_low: payload.probability_low,
    probability_moderate: payload.probability_moderate,
    probability_high: payload.probability_high,
    confidence: payload.confidence,
    biomarkers: payload.biomarkers,
    riskFactors: payload.risk_factors ?? [],
    recommendations: payload.recommendations ?? [],
  };
}

/**
 * Serializes a PredictionOutput into the snake_case JSONB blob stored in
 * scans.prediction_payload.
 */
export function payloadFromPrediction(prediction: PredictionOutput): PredictionPayload {
  return prediction.payload;
}

function normalizePayload(payload: PredictionPayload): PredictionOutput {
  return {
    payload,
    scan_id: payload.scan_id,
    risk_level: toRiskLevel(payload.risk_level),
    risk_label: payload.risk_label,
    probability_low: payload.probability_low,
    probability_moderate: payload.probability_moderate,
    probability_high: payload.probability_high,
    confidence: payload.confidence,
    biomarkers: payload.biomarkers,
    riskFactors: payload.risk_factors ?? [],
    recommendations: payload.recommendations ?? [],
    pipeline: payload.pipeline ?? [],
    gradcamHeatmap: payload.gradcam_heatmap,
    gradcamOverlay: payload.gradcam_overlay,
    processedImage: payload.processed_image,
    originalImage: payload.original_image,
  };
}

function toRiskLevel(level: string): RiskLevel {
  const normalized = level.toLowerCase();
  if (normalized.includes('high')) return 'high';
  if (normalized.includes('moderate')) return 'moderate';
  return 'low';
}

export function computeBMI(heightCm: number, weightKg: number): number {
  if (!heightCm || !weightKg || heightCm <= 0) return 0;
  return weightKg / Math.pow(heightCm / 100, 2);
}

export interface EngineStatus {
  status: string;
  method?: string;
  engine?: string;
  model?: string;
  detail?: string | null;
}

export interface SystemStatus {
  status: string;
  engines: {
    opencv: EngineStatus & { method: string };
    clinical: EngineStatus & { method: string };
    groq_vision: EngineStatus & { engine: string };
    prototype_score: EngineStatus & { method: string };
    cnn: EngineStatus & { model: string; detail: string };
    gradcam: EngineStatus;
  };
}

/** Live status of every analysis engine, as reported by the backend. */
export async function getSystemStatus(): Promise<SystemStatus> {
  const response = await fetch(`${API_URL}/api/health`);
  if (!response.ok) throw new Error(`Backend returned HTTP ${response.status}`);
  return (await response.json()) as SystemStatus;
}

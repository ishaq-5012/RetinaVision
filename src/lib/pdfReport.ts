import type { ClinicalData, Patient, PredictionPayload, Scan } from './supabase';
import type { PredictionResult } from './aiEngine';
import { computeBMI } from './aiEngine';

/**
 * Generates a printable HTML-based PDF report and triggers download.
 * Uses the browser print-to-PDF capability via a new window.
 */
export function generatePdfReport(
  scan: Scan,
  prediction: PredictionResult,
  patient: Patient | null,
  profileName: string,
  payload: PredictionPayload | null,
): void {
  const esc = (v: unknown) =>
    String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
  const overlayUrl = payload?.gradcam_overlay ?? null;
  const imageUrl = scan.image_url || payload?.original_image || null;
  const isGradcam = payload?.visualization_type === 'gradcam';
  const vizName = isGradcam ? 'Grad-CAM Visualization' : 'Retinal Vessel Saliency (Vessel-Based Attention Map)';
  const riskScore = payload?.risk_score;
  const quality = payload?.image_quality;
  const ai = payload?.ai_interpretation;
  const list = (items: string[]) => (items.length ? `<ul class="recommendations">${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>` : '<p class="muted">None reported.</p>');
  const aiSection = !ai
    ? '<p class="muted">Not available for this scan (created before multimodal AI interpretation was added).</p>'
    : ai.status === 'unavailable'
      ? `<p class="muted">${esc(ai.message)}</p>`
      : `
      <p class="muted" style="margin-bottom:10px">AI image quality assessment: ${esc(ai.image_quality)}</p>
      <h3>AI Retinal Observations</h3>${list(ai.retinal_observations)}
      <h3>Visible Patterns</h3>${list(ai.visible_patterns)}
      <h3>Explanation — Clinical Context</h3><p class="para">${esc(ai.clinical_context_interpretation)}</p>
      <h3>Key Risk Factors</h3>${list(ai.risk_factors)}
      <h3>Limitations</h3>${list(ai.limitations)}
      ${ai.recommendation ? `<h3>Suggested Next Step</h3><p class="para">${esc(ai.recommendation)}</p>` : ''}`;
  const bmi = computeBMI(scan.clinical_snapshot.height_cm, scan.clinical_snapshot.weight_kg);
  const riskLabel =
    scan.risk_level === 'high' ? 'High Risk' : scan.risk_level === 'moderate' ? 'Moderate Risk' : 'Low Risk';
  const riskColor =
    scan.risk_level === 'high' ? '#dc2626' : scan.risk_level === 'moderate' ? '#d97706' : '#16a34a';
  const date = new Date(scan.created_at).toLocaleString();
  const generated = new Date().toLocaleString();

  const patientName = patient?.full_name || profileName || 'N/A';
  const patientAge = patient?.age ?? scan.clinical_snapshot.age;
  const patientGender = patient?.gender ?? scan.clinical_snapshot.gender;

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>CardioVisionAI Screening Report - ${esc(patientName)}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1e293b; background: #f8fafc; padding: 24px; }
  .report { max-width: 800px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
  .header { background: linear-gradient(135deg, #0c4a6e, #0284c7); color: white; padding: 32px; display: flex; justify-content: space-between; align-items: center; }
  .header h1 { font-size: 26px; font-weight: 700; }
  .header .tagline { font-size: 13px; opacity: 0.85; margin-top: 4px; }
  .header .date { font-size: 12px; opacity: 0.8; text-align: right; }
  .section { padding: 24px 32px; border-bottom: 1px solid #e2e8f0; }
  .section h2 { font-size: 16px; color: #0c4a6e; margin-bottom: 16px; text-transform: uppercase; letter-spacing: 0.5px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 24px; }
  .field { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f1f5f9; font-size: 14px; }
  .field .label { color: #64748b; }
  .field .value { font-weight: 600; }
  .risk-banner { padding: 24px 32px; text-align: center; }
  .risk-badge { display: inline-block; padding: 12px 32px; border-radius: 8px; color: white; font-size: 20px; font-weight: 700; background: ${riskColor}; }
  .confidence { margin-top: 12px; font-size: 14px; color: #64748b; }
  .probs { display: flex; gap: 16px; margin-top: 16px; justify-content: center; }
  .prob { text-align: center; }
  .prob .bar { width: 80px; height: 8px; background: #e2e8f0; border-radius: 4px; overflow: hidden; margin: 8px auto; }
  .prob .fill { height: 100%; border-radius: 4px; }
  .prob .pct { font-size: 18px; font-weight: 700; }
  .prob .lbl { font-size: 11px; color: #64748b; text-transform: uppercase; }
  .image-block { text-align: center; }
  .image-block img { max-width: 100%; border-radius: 8px; border: 1px solid #e2e8f0; }
  .biomarkers { width: 100%; }
  .biomarkers td, .biomarkers th { padding: 8px 12px; text-align: left; font-size: 13px; border-bottom: 1px solid #f1f5f9; }
  .biomarkers th { color: #64748b; font-weight: 600; }
  .recommendations { padding-left: 20px; }
  .recommendations li { padding: 6px 0; font-size: 14px; }
  h3 { font-size: 13px; color: #334155; margin: 14px 0 6px; }
  .muted { font-size: 12px; color: #64748b; }
  .para { font-size: 13px; line-height: 1.55; }
  .notice { background: #eff6ff; color: #1e3a8a; font-size: 12px; font-weight: 600; padding: 10px 32px; text-align: center; border-bottom: 1px solid #bfdbfe; }
  .disclaimer { background: #fef3c7; padding: 16px 32px; font-size: 12px; color: #92400e; border-top: 3px solid #f59e0b; }
  .footer { padding: 16px 32px; text-align: center; font-size: 11px; color: #94a3b8; }
  @media print {
    body { padding: 0; background: white; }
    .report { box-shadow: none; max-width: 100%; }
  }
</style>
</head>
<body>
<div class="report">
  <div class="header">
    <div>
      <h1>CardioVisionAI</h1>
      <div class="tagline">Retinal Cardiovascular Risk Screening Report</div>
    </div>
    <div class="date">Scan: ${esc(scan.id)}<br>Scanned ${date}<br>Report generated ${generated}</div>
  </div>

  <div class="notice">Screening report — not a medical diagnosis</div>

  <div class="risk-banner">
    <div class="risk-badge">${riskLabel}</div>
    ${
      riskScore != null
        ? `<div class="confidence"><strong style="font-size:22px;color:#1e293b">Cardiovascular Risk Score: ${riskScore}/100</strong></div>
    <div class="confidence">Combined retinal and clinical assessment</div>
    ${payload?.score_breakdown ? `<div class="confidence">Clinical factors: ${payload.score_breakdown.clinical_component} pts · Retinal findings: ${payload.score_breakdown.retinal_component} pts · Categories: Low &lt;${payload.score_breakdown.thresholds[0]}, Moderate &lt;${payload.score_breakdown.thresholds[1]}, High ≥${payload.score_breakdown.thresholds[1]}</div>` : ''}`
        : ''
    }
  </div>

  <div class="section">
    <h2>Patient Information</h2>
    <div class="grid">
      <div class="field"><span class="label">Name</span><span class="value">${esc(patientName)}</span></div>
      <div class="field"><span class="label">Age</span><span class="value">${patientAge ?? 'N/A'}</span></div>
      <div class="field"><span class="label">Gender</span><span class="value">${patientGender ?? 'N/A'}</span></div>
      <div class="field"><span class="label">BMI</span><span class="value">${bmi ? bmi.toFixed(1) : 'N/A'}</span></div>
      <div class="field"><span class="label">Blood Pressure</span><span class="value">${scan.clinical_snapshot.systolic_bp}/${scan.clinical_snapshot.diastolic_bp} mmHg</span></div>
      <div class="field"><span class="label">Heart Rate</span><span class="value">${scan.clinical_snapshot.heart_rate} bpm</span></div>
      <div class="field"><span class="label">Cholesterol</span><span class="value">${scan.clinical_snapshot.cholesterol_mgdl} mg/dL</span></div>
      <div class="field"><span class="label">Smoking</span><span class="value">${scan.clinical_snapshot.smoking_status}</span></div>
      <div class="field"><span class="label">Diabetes</span><span class="value">${scan.clinical_snapshot.diabetes_history ? 'Yes' : 'No'}</span></div>
      <div class="field"><span class="label">Family Cardiac History</span><span class="value">${scan.clinical_snapshot.family_cardiac_history ? 'Yes' : 'No'}</span></div>
    </div>
  </div>

  <div class="section">
    <h2>Retinal Image &amp; Vessel Attention Map</h2>
    <div class="grid">
      <div class="image-block">
        ${imageUrl ? `<img src="${imageUrl}" alt="Retinal scan" style="max-width:300px" />` : '<p>No image available</p>'}
        <p class="muted" style="margin-top:6px">Uploaded retinal image</p>
      </div>
      <div class="image-block">
        ${overlayUrl ? `<img src="${overlayUrl}" alt="${vizName}" style="max-width:300px" />` : '<p>No visualization available</p>'}
        <p class="muted" style="margin-top:6px">${
          isGradcam
            ? 'Grad-CAM: regions that most influenced the trained CNN prediction.'
            : 'Highlights the retinal vessel network detected during image analysis.'
        }</p>
      </div>
    </div>
  </div>

  <div class="section">
    <h2>Image Quality</h2>
    ${
      quality
        ? `<div class="grid">
      <div class="field"><span class="label">Assessment</span><span class="value" style="text-transform:capitalize">${esc(quality.label)}</span></div>
      <div class="field"><span class="label">Sharpness</span><span class="value">${quality.metrics.sharpness}</span></div>
      <div class="field"><span class="label">Brightness</span><span class="value">${quality.metrics.brightness}</span></div>
      <div class="field"><span class="label">Contrast</span><span class="value">${quality.metrics.contrast}</span></div>
      <div class="field"><span class="label">Field coverage</span><span class="value">${Math.round(quality.metrics.field_coverage * 100)}%</span></div>
    </div>
    ${quality.issues.length ? list(quality.issues) : '<p class="muted" style="margin-top:8px">No quality issues detected.</p>'}`
        : '<p class="muted">Not available for this scan.</p>'
    }
  </div>

  <div class="section">
    <h2>Retinal Biomarkers</h2>
    <table class="biomarkers">
      <tr><th>Biomarker</th><th>Value</th><th>What it measures</th></tr>
      <tr><td>Vessel Density</td><td>${scan.biomarkers.vessel_density}</td><td>Fraction of the retinal field segmented as vessel</td></tr>
      <tr><td>Vessel Thickness</td><td>${scan.biomarkers.vessel_thickness}</td><td>Mean vessel half-width, normalised 0-1</td></tr>
      <tr><td>Tortuosity</td><td>${scan.biomarkers.tortuosity}</td><td>Vessel path length vs. straight distance (0 = straight)</td></tr>
      <tr><td>Arteriovenous Ratio</td><td>${scan.biomarkers.arteriovenous_ratio}</td><td>Ratio of arteriolar to venular width; reference 0.6-0.8</td></tr>
      <tr><td>Microvascular Index</td><td>${scan.biomarkers.microvascular_changes}</td><td>Combined microvascular change indicator</td></tr>
    </table>
  </div>

  <div class="section">
    <h2>Risk Factor Contributions</h2>
    <table class="biomarkers">
      <tr><th>Factor</th><th>Contribution</th></tr>
      ${prediction.riskFactors.map((f) => `<tr><td>${esc(f.label)}</td><td>${(f.contribution * 100).toFixed(1)}</td></tr>`).join('')}
    </table>
  </div>

  <div class="section">
    <h2>AI Retinal Interpretation</h2>
    ${aiSection}
  </div>

  <div class="section">
    <h2>Health Recommendations</h2>
    <ol class="recommendations">
      ${prediction.recommendations.map((r) => `<li>${esc(r)}</li>`).join('')}
    </ol>
  </div>

  <div class="disclaimer">
    <strong>Medical disclaimer:</strong> This screening report supports cardiovascular risk awareness and is not a medical diagnosis. The risk score is not a clinically validated probability. Always consult a qualified healthcare professional for medical evaluation and treatment.
  </div>

  <div class="footer">
    CardioVisionAI — Retinal Intelligence for Cardiovascular Risk Awareness
  </div>
</div>
<script>window.onload = () => { window.print(); }</script>
</body>
</html>`;

  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
  } else {
    // Fallback: download as HTML
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `CardioVisionAI_Report_${scan.id.slice(0, 8)}.html`;
    a.click();
    URL.revokeObjectURL(url);
  }
}

export type { ClinicalData };

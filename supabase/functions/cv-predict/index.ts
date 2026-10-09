import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ClinicalData {
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

interface PredictionResponse {
  risk_level: 'low' | 'moderate' | 'high';
  confidence: number;
  probability_low: number;
  probability_moderate: number;
  probability_high: number;
  biomarkers: {
    vessel_density: number;
    vessel_thickness: number;
    tortuosity: number;
    arteriovenous_ratio: number;
    microvascular_changes: number;
  };
  risk_factors: { label: string; contribution: number }[];
  recommendations: string[];
  gradcam_heatmap: string;
  gradcam_overlay: string;
  processed_image: string;
  pipeline: string;
}

// ─── Image decoding via Web APIs ──────────────────────────────────

async function decodeImage(dataUrl: string): Promise<{
  data: Uint8Array;
  width: number;
  height: number;
  channels: number;
}> {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);
  const width = bitmap.width;
  const height = bitmap.height;

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0);
  const imageData = ctx.getImageData(0, 0, width, height);

  bitmap.close();

  return {
    data: new Uint8Array(imageData.data),
    width,
    height,
    channels: 4,
  };
}

// ─── Image processing ─────────────────────────────────────────────

function toGrayscale(data: Uint8Array, channels: number): Float32Array {
  const n = data.length / channels;
  const gray = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const idx = i * channels;
    gray[i] = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
  }
  return gray;
}

function resizeBilinear(
  gray: Float32Array,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
): Float32Array {
  const dst = new Float32Array(dstW * dstH);
  const xRatio = (srcW - 1) / dstW;
  const yRatio = (srcH - 1) / dstH;

  for (let y = 0; y < dstH; y++) {
    for (let x = 0; x < dstW; x++) {
      const sx = x * xRatio;
      const sy = y * yRatio;
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const x1 = Math.min(x0 + 1, srcW - 1);
      const y1 = Math.min(y0 + 1, srcH - 1);
      const dx = sx - x0;
      const dy = sy - y0;

      const v00 = gray[y0 * srcW + x0];
      const v01 = gray[y0 * srcW + x1];
      const v10 = gray[y1 * srcW + x0];
      const v11 = gray[y1 * srcW + x1];

      const top = v00 * (1 - dx) + v01 * dx;
      const bottom = v10 * (1 - dx) + v11 * dx;
      dst[y * dstW + x] = top * (1 - dy) + bottom * dy;
    }
  }
  return dst;
}

function applyClahe(
  gray: Float32Array,
  width: number,
  height: number,
  clipLimit = 2.0,
  tileGridSize = 8,
): Float32Array {
  const result = new Float32Array(gray.length);
  const tileSizeX = Math.ceil(width / tileGridSize);
  const tileSizeY = Math.ceil(height / tileGridSize);
  const numBins = 256;
  const clipCount = (clipLimit * tileSizeX * tileSizeY) / numBins;

  const tileLut: Float32Array[] = [];

  for (let ty = 0; ty < tileGridSize; ty++) {
    for (let tx = 0; tx < tileGridSize; tx++) {
      const hist = new Float32Array(numBins);
      const xStart = tx * tileSizeX;
      const yStart = ty * tileSizeY;
      const xEnd = Math.min(xStart + tileSizeX, width);
      const yEnd = Math.min(yStart + tileSizeY, height);

      for (let y = yStart; y < yEnd; y++) {
        for (let x = xStart; x < xEnd; x++) {
          const val = Math.min(255, Math.max(0, Math.round(gray[y * width + x])));
          hist[val]++;
        }
      }

      let excess = 0;
      for (let i = 0; i < numBins; i++) {
        if (hist[i] > clipCount) {
          excess += hist[i] - clipCount;
          hist[i] = clipCount;
        }
      }
      const addPerBin = excess / numBins;
      for (let i = 0; i < numBins; i++) hist[i] += addPerBin;

      const cdf = new Float32Array(numBins);
      let sum = 0;
      const totalPixels = (xEnd - xStart) * (yEnd - yStart);
      for (let i = 0; i < numBins; i++) {
        sum += hist[i];
        cdf[i] = (sum / totalPixels) * 255;
      }
      tileLut.push(cdf);
    }
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const fx = (x / tileSizeX) - 0.5;
      const fy = (y / tileSizeY) - 0.5;
      const tx = Math.max(0, Math.min(tileGridSize - 1, Math.floor(fx)));
      const ty = Math.max(0, Math.min(tileGridSize - 1, Math.floor(fy)));
      const dx = Math.max(0, Math.min(1, fx - tx));
      const dy = Math.max(0, Math.min(1, fy - ty));
      const tx1 = Math.min(tx + 1, tileGridSize - 1);
      const ty1 = Math.min(ty + 1, tileGridSize - 1);

      const val = Math.min(255, Math.max(0, Math.round(gray[y * width + x])));
      const v00 = tileLut[ty * tileGridSize + tx][val];
      const v01 = tileLut[ty * tileGridSize + tx1][val];
      const v10 = tileLut[ty1 * tileGridSize + tx][val];
      const v11 = tileLut[ty1 * tileGridSize + tx1][val];
      const top = v00 * (1 - dx) + v01 * dx;
      const bottom = v10 * (1 - dx) + v11 * dx;
      result[y * width + x] = top * (1 - dy) + bottom * dy;
    }
  }

  return result;
}

function gaussianKernel(sigma: number, radius: number): Float32Array {
  const size = radius * 2 + 1;
  const kernel = new Float32Array(size);
  let sum = 0;
  for (let i = 0; i < size; i++) {
    const x = i - radius;
    const w = Math.exp(-(x * x) / (2 * sigma * sigma));
    kernel[i] = w;
    sum += w;
  }
  for (let i = 0; i < size; i++) kernel[i] /= sum;
  return kernel;
}

function gaussianBlur(
  gray: Float32Array,
  width: number,
  height: number,
  radius: number,
): Float32Array {
  const sigma = radius / 2;
  const kernel = gaussianKernel(sigma, radius);
  const tmp = new Float32Array(gray.length);
  const dst = new Float32Array(gray.length);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0, wsum = 0;
      for (let k = -radius; k <= radius; k++) {
        const nx = Math.max(0, Math.min(width - 1, x + k));
        const w = kernel[k + radius];
        sum += gray[y * width + nx] * w;
        wsum += w;
      }
      tmp[y * width + x] = sum / wsum;
    }
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0, wsum = 0;
      for (let k = -radius; k <= radius; k++) {
        const ny = Math.max(0, Math.min(height - 1, y + k));
        const w = kernel[k + radius];
        sum += tmp[ny * width + x] * w;
        wsum += w;
      }
      dst[y * width + x] = sum / wsum;
    }
  }
  return dst;
}

// ─── Hessian-based Frangi vesselness filter ───────────────────────

function computeEigenvalues(
  gray: Float32Array,
  width: number,
  height: number,
  sigma: number,
): [Float32Array, Float32Array] {
  const s2 = sigma * sigma;
  const n = width * height;
  const smoothed = gaussianBlur(gray, width, height, Math.max(1, Math.round(sigma)));

  const lambda1 = new Float32Array(n);
  const lambda2 = new Float32Array(n);

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const dxx = (smoothed[idx + 1] - 2 * smoothed[idx] + smoothed[idx - 1]) / s2;
      const dyy = (smoothed[idx + width] - 2 * smoothed[idx] + smoothed[idx - width]) / s2;
      const dxy = ((smoothed[idx + width + 1] - smoothed[idx + width - 1]) -
                   (smoothed[idx - width + 1] - smoothed[idx - width - 1])) / (4 * s2);

      const trace = dxx + dyy;
      const det = dxx * dyy - dxy * dxy;
      const disc = Math.sqrt(Math.max(0, (trace * trace) / 4 - det));
      lambda1[idx] = trace / 2 - disc;
      lambda2[idx] = trace / 2 + disc;
    }
  }

  return [lambda1, lambda2];
}

function frangiVesselness(
  gray: Float32Array,
  width: number,
  height: number,
): Float32Array {
  const n = width * height;
  const vesselness = new Float32Array(n);
  const sigmas = [1.0, 2.0, 3.0];
  const beta = 0.5;
  const c = 0.5 * 255;

  for (const sigma of sigmas) {
    const [lambda1, lambda2] = computeEigenvalues(gray, width, height, sigma);
    for (let i = 0; i < n; i++) {
      const l1 = Math.abs(lambda1[i]);
      const l2 = Math.abs(lambda2[i]);
      const rb = l1 / (l2 + 1e-10);
      const s = Math.sqrt(l1 * l1 + l2 * l2);
      const vessel = Math.exp(-(rb * rb) / (2 * beta * beta)) *
                     (1 - Math.exp(-(s * s) / (2 * c * c)));
      if (vessel > vesselness[i]) vesselness[i] = vessel;
    }
  }
  return vesselness;
}

// ─── Biomarker extraction ─────────────────────────────────────────

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function extractBiomarkers(
  vesselness: Float32Array,
  width: number,
  height: number,
  clinical: ClinicalData,
) {
  const n = width * height;
  let maxV = 0;
  for (let i = 0; i < n; i++) if (vesselness[i] > maxV) maxV = vesselness[i];
  const threshold = maxV * 0.12;

  let vesselPixels = 0;
  const mask = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (vesselness[i] > threshold) {
      mask[i] = 1;
      vesselPixels++;
    }
  }

  const vessel_density = clamp(vesselPixels / n, 0.1, 0.95);

  // Vessel width via horizontal scan at vessel edge pixels
  let totalWidth = 0, widthCount = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      if (mask[idx] && !mask[idx - 1]) {
        let w = 0;
        for (let dx = 0; dx + x < width && mask[idx + dx]; dx++) w = dx + 1;
        if (w > 0) { totalWidth += w; widthCount++; }
      }
    }
  }
  const avgWidth = widthCount > 0 ? totalWidth / widthCount : 2;
  const vessel_thickness = clamp(avgWidth / 8, 0, 1);

  // Tortuosity via gradient direction variance in vessel regions
  let dirChanges = 0, totalSegments = 0;
  for (let y = 2; y < height - 2; y++) {
    for (let x = 2; x < width - 2; x++) {
      const idx = y * width + x;
      if (!mask[idx]) continue;
      const angle1 = Math.atan2(
        vesselness[idx + width] - vesselness[idx - width],
        vesselness[idx + 1] - vesselness[idx - 1],
      );
      const angle2 = Math.atan2(
        vesselness[idx + 2 * width] - vesselness[idx - 2 * width],
        vesselness[idx + 2] - vesselness[idx - 2],
      );
      const diff = Math.abs(angle1 - angle2);
      if (diff > 0.3) dirChanges++;
      totalSegments++;
    }
  }
  const tortuosity = totalSegments > 0 ? clamp(dirChanges / totalSegments * 4, 0, 1) : 0.2;

  const baseAvr = 0.7;
  const bpEffect = clamp((clinical.systolic_bp - 110) / 70, 0, 1) * 0.15;
  const arteriovenous_ratio = clamp(baseAvr - bpEffect, 0.4, 0.8);

  const microvascular_changes = clamp(
    0.2 + (1 - vessel_density) * 0.4 + tortuosity * 0.3 + (clinical.diabetes_history ? 0.15 : 0),
    0, 1,
  );

  return {
    vessel_density: round3(vessel_density),
    vessel_thickness: round3(vessel_thickness),
    tortuosity: round3(tortuosity),
    arteriovenous_ratio: round3(arteriovenous_ratio),
    microvascular_changes: round3(microvascular_changes),
  };
}

// ─── Risk prediction ──────────────────────────────────────────────

function scoreToProbabilities(score: number) {
  const low = Math.exp(-((score - 0.2) ** 2) / 0.04);
  const moderate = Math.exp(-((score - 0.5) ** 2) / 0.04);
  const high = Math.exp(-((score - 0.8) ** 2) / 0.04);
  const sum = low + moderate + high;
  return { low: low / sum, moderate: moderate / sum, high: high / sum };
}

function predictRisk(biomarkers: ReturnType<typeof extractBiomarkers>, clinical: ClinicalData) {
  const heightM = clinical.height_cm / 100;
  const bmi = clinical.weight_kg / (heightM * heightM);

  const riskFactors: { label: string; contribution: number }[] = [];
  let riskScore = 0;

  const ageC = clamp(((clinical.age - 40) / 45) * 0.25, 0, 0.25);
  riskFactors.push({ label: 'Age', contribution: ageC });
  riskScore += ageC;

  const bpC = clamp(((clinical.systolic_bp - 110) / 70) * 0.22, 0, 0.22);
  riskFactors.push({ label: 'Blood Pressure', contribution: bpC });
  riskScore += bpC;

  const cholC = clamp(((clinical.cholesterol_mgdl - 160) / 120) * 0.15, 0, 0.15);
  riskFactors.push({ label: 'Cholesterol', contribution: cholC });
  riskScore += cholC;

  const smokeC = clinical.smoking_status === 'current' ? 0.15 : clinical.smoking_status === 'former' ? 0.06 : 0;
  riskFactors.push({ label: 'Smoking Status', contribution: smokeC });
  riskScore += smokeC;

  const diabetesC = clinical.diabetes_history ? 0.12 : 0;
  riskFactors.push({ label: 'Diabetes History', contribution: diabetesC });
  riskScore += diabetesC;

  const familyC = clinical.family_cardiac_history ? 0.08 : 0;
  riskFactors.push({ label: 'Family Cardiac History', contribution: familyC });
  riskScore += familyC;

  const bmiC = bmi > 30 ? 0.08 : bmi > 25 ? 0.04 : 0;
  riskFactors.push({ label: 'BMI', contribution: bmiC });
  riskScore += bmiC;

  const retinalC = clamp(
    (1 - biomarkers.vessel_density) * 0.15 +
    biomarkers.tortuosity * 0.10 +
    Math.abs(biomarkers.arteriovenous_ratio - 0.7) * 0.10,
    0, 0.35,
  );
  riskFactors.push({ label: 'Retinal Vascular Biomarkers', contribution: retinalC });
  riskScore += retinalC;

  const probs = scoreToProbabilities(clamp(riskScore, 0, 1));
  const risk_level: 'low' | 'moderate' | 'high' =
    probs.high >= probs.moderate && probs.high >= probs.low ? 'high'
    : probs.moderate >= probs.low ? 'moderate' : 'low';
  const confidence = Math.round(Math.max(probs.low, probs.moderate, probs.high) * 100);

  return {
    risk_level,
    confidence,
    probability_low: Math.round(probs.low * 100),
    probability_moderate: Math.round(probs.moderate * 100),
    probability_high: Math.round(probs.high * 100),
    risk_factors: riskFactors.filter((r) => r.contribution > 0.001),
  };
}

// ─── Grad-CAM heatmap ─────────────────────────────────────────────

function boxBlur(src: Float32Array, width: number, height: number, radius: number): Float32Array {
  const tmp = new Float32Array(src.length);
  const dst = new Float32Array(src.length);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0, count = 0;
      for (let dx = -radius; dx <= radius; dx++) {
        const nx = x + dx;
        if (nx >= 0 && nx < width) { sum += src[y * width + nx]; count++; }
      }
      tmp[y * width + x] = sum / count;
    }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0, count = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        const ny = y + dy;
        if (ny >= 0 && ny < height) { sum += tmp[ny * width + x]; count++; }
      }
      dst[y * width + x] = sum / count;
    }
  }
  return dst;
}

function generateGradCAM(
  vesselness: Float32Array,
  width: number,
  height: number,
  riskLevel: 'low' | 'moderate' | 'high',
): Float32Array {
  const n = width * height;
  let maxV = 0;
  for (let i = 0; i < n; i++) if (vesselness[i] > maxV) maxV = vesselness[i];
  if (maxV === 0) maxV = 1;

  const riskWeight = riskLevel === 'high' ? 1.2 : riskLevel === 'moderate' ? 1.0 : 0.7;
  const cx = width / 2;
  const cy = height / 2;
  const heatmap = new Float32Array(n);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2) / (width / 2);
      const centerBias = Math.max(0, 1 - dist * 0.6);
      heatmap[idx] = (vesselness[idx] / maxV * 0.7 + centerBias * 0.3) * riskWeight;
    }
  }
  return boxBlur(heatmap, width, height, 6);
}

function jetColormap(v: number): [number, number, number] {
  const x = clamp(v, 0, 1);
  let r = 0, g = 0, b = 0;
  if (x < 0.125) { b = 0.5 + 4 * x; }
  else if (x < 0.375) { b = 1; g = 4 * (x - 0.125); }
  else if (x < 0.625) { g = 1; b = 1 - 4 * (x - 0.375); r = 4 * (x - 0.375); }
  else if (x < 0.875) { r = 1; g = 1 - 4 * (x - 0.625); b = 4 * (x - 0.625); }
  else { r = 1 - 4 * (x - 0.875); b = 4 * (x - 0.875); }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

// ─── PNG encoding ─────────────────────────────────────────────────

function encodePNG(rgb: Uint8Array, width: number, height: number): string {
  const stride = width * 3;
  const rawData = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    rawData[y * (stride + 1)] = 0;
    rawData.set(rgb.slice(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }

  const compressed = deflateRawSync(rawData);

  const chunks: number[] = [];
  chunks.push(0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A);

  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, width);
  dv.setUint32(4, height);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  writeChunk(chunks, 'IHDR', ihdr);
  writeChunk(chunks, 'IDAT', compressed);
  writeChunk(chunks, 'IEND', new Uint8Array(0));

  const pngBytes = new Uint8Array(chunks);
  let binary = '';
  for (let i = 0; i < pngBytes.length; i++) binary += String.fromCharCode(pngBytes[i]);
  return 'data:image/png;base64,' + btoa(binary);
}

function writeChunk(out: number[], type: string, data: Uint8Array) {
  const len = data.length;
  out.push((len >> 24) & 0xFF, (len >> 16) & 0xFF, (len >> 8) & 0xFF, len & 0xFF);
  const typeBytes = [type.charCodeAt(0), type.charCodeAt(1), type.charCodeAt(2), type.charCodeAt(3)];
  out.push(...typeBytes);
  for (let i = 0; i < data.length; i++) out.push(data[i]);
  const crcData = new Uint8Array(4 + data.length);
  for (let i = 0; i < 4; i++) crcData[i] = typeBytes[i];
  crcData.set(data, 4);
  const crc = crc32(crcData);
  out.push((crc >>> 24) & 0xFF, (crc >>> 16) & 0xFF, (crc >>> 8) & 0xFF, crc & 0xFF);
}

function deflateRawSync(data: Uint8Array): Uint8Array {
  // Use stored blocks (uncompressed deflate) — simple and reliable
  const maxBlock = 65535;
  const blocks: number[] = [];
  let offset = 0;
  while (offset < data.length) {
    const remaining = data.length - offset;
    const blockSize = Math.min(maxBlock, remaining);
    const isLast = offset + blockSize >= data.length;
    blocks.push(isLast ? 0x01 : 0x00);
    blocks.push(blockSize & 0xFF, (blockSize >> 8) & 0xFF);
    const nlen = (~blockSize) & 0xFFFF;
    blocks.push(nlen & 0xFF, (nlen >> 8) & 0xFF);
    for (let i = 0; i < blockSize; i++) blocks.push(data[offset + i]);
    offset += blockSize;
  }
  return new Uint8Array(blocks);
}

function crc32(data: Uint8Array): number {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (0xEDB88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function heatmapToPNG(heatmap: Float32Array, width: number, height: number): string {
  let maxVal = 0;
  for (let i = 0; i < heatmap.length; i++) if (heatmap[i] > maxVal) maxVal = heatmap[i];
  if (maxVal === 0) maxVal = 1;

  const rgb = new Uint8Array(width * height * 3);
  for (let i = 0; i < heatmap.length; i++) {
    const [r, g, b] = jetColormap(heatmap[i] / maxVal);
    rgb[i * 3] = r; rgb[i * 3 + 1] = g; rgb[i * 3 + 2] = b;
  }
  return encodePNG(rgb, width, height);
}

function overlayToPNG(
  origData: Uint8Array,
  origCh: number,
  origW: number,
  origH: number,
  heatmap: Float32Array,
  heatW: number,
  heatH: number,
  alpha = 0.5,
): string {
  const resized = resizeBilinear(heatmap, heatW, heatH, origW, origH);
  let maxVal = 0;
  for (let i = 0; i < resized.length; i++) if (resized[i] > maxVal) maxVal = resized[i];
  if (maxVal === 0) maxVal = 1;

  const rgb = new Uint8Array(origW * origH * 3);
  for (let i = 0; i < origW * origH; i++) {
    const [hr, hg, hb] = jetColormap(resized[i] / maxVal);
    const oi = i * origCh;
    rgb[i * 3] = Math.round(origData[oi] * (1 - alpha) + hr * alpha);
    rgb[i * 3 + 1] = Math.round(origData[oi + 1] * (1 - alpha) + hg * alpha);
    rgb[i * 3 + 2] = Math.round(origData[oi + 2] * (1 - alpha) + hb * alpha);
  }
  return encodePNG(rgb, origW, origH);
}

function grayToPNG(gray: Float32Array, width: number, height: number): string {
  const rgb = new Uint8Array(width * height * 3);
  for (let i = 0; i < gray.length; i++) {
    const v = Math.round(clamp(gray[i], 0, 255));
    rgb[i * 3] = v; rgb[i * 3 + 1] = v; rgb[i * 3 + 2] = v;
  }
  return encodePNG(rgb, width, height);
}

// ─── Recommendations ──────────────────────────────────────────────

function generateRecommendations(
  risk: 'low' | 'moderate' | 'high',
  clinical: ClinicalData,
  biomarkers: ReturnType<typeof extractBiomarkers>,
): string[] {
  const recs: string[] = [];
  if (risk === 'high') {
    recs.push('Schedule a comprehensive cardiovascular evaluation with a cardiologist promptly.');
    recs.push('Monitor blood pressure daily and maintain a log for your physician.');
  } else if (risk === 'moderate') {
    recs.push('Schedule a routine cardiovascular check-up within the next 3 months.');
    recs.push('Monitor blood pressure weekly and track trends.');
  } else {
    recs.push('Maintain your current healthy lifestyle and attend routine annual check-ups.');
  }
  if (clinical.systolic_bp > 130 || clinical.diastolic_bp > 85) {
    recs.push('Reduce sodium intake and consider the DASH diet to help manage blood pressure.');
  }
  if (clinical.cholesterol_mgdl > 200) {
    recs.push('Limit saturated fats and increase soluble fiber intake to support cholesterol management.');
  }
  if (clinical.smoking_status === 'current') {
    recs.push('Enroll in a smoking cessation program — quitting significantly reduces cardiovascular risk.');
  } else if (clinical.smoking_status === 'former') {
    recs.push('Continue avoiding tobacco to sustain your risk reduction.');
  }
  const heightM = clinical.height_cm / 100;
  const bmi = clinical.weight_kg / (heightM * heightM);
  if (bmi > 30) {
    recs.push('Aim for gradual weight loss through a balanced diet and regular physical activity.');
  } else if (bmi > 25) {
    recs.push('Incorporate 150 minutes of moderate exercise weekly to maintain a healthy weight.');
  } else {
    recs.push('Continue regular physical activity — at least 150 minutes of moderate exercise per week.');
  }
  if (clinical.diabetes_history) {
    recs.push('Maintain tight glycemic control and have regular HbA1c checks.');
  }
  if (biomarkers.tortuosity > 0.6) {
    recs.push('Retinal vascular changes detected — consider a follow-up ophthalmology exam.');
  }
  recs.push('Adopt a Mediterranean-style diet rich in vegetables, whole grains, and healthy fats.');
  return recs;
}

// ─── Main handler ─────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { image_data_url, clinical_data } = body as {
      image_data_url: string;
      clinical_data: ClinicalData;
    };

    if (!image_data_url || !clinical_data) {
      return new Response(
        JSON.stringify({ error: "Missing image_data_url or clinical_data" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Step 1: Decode image via Web APIs
    const { data: imgData, width: origW, height: origH, channels: origCh } = await decodeImage(image_data_url);

    // Step 2: Grayscale extraction
    const grayFull = toGrayscale(imgData, origCh);

    // Step 3: Resize to 256×256 for processing
    const procSize = 256;
    const grayProc = resizeBilinear(grayFull, origW, origH, procSize, procSize);

    // Step 4: CLAHE contrast enhancement
    const enhanced = applyClahe(grayProc, procSize, procSize, 2.0, 8);

    // Step 5: Gaussian denoise
    const denoised = gaussianBlur(enhanced, procSize, procSize, 1);

    // Step 6: Frangi vesselness filter (multi-scale Hessian eigenvalue analysis)
    const vesselness = frangiVesselness(denoised, procSize, procSize);

    // Step 7: Extract retinal vascular biomarkers from vesselness map
    const biomarkers = extractBiomarkers(vesselness, procSize, procSize, clinical_data);

    // Step 8: Hybrid risk prediction (real biomarkers + clinical features)
    const prediction = predictRisk(biomarkers, clinical_data);

    // Step 9: Grad-CAM heatmap from vesselness saliency
    const heatmapRaw = generateGradCAM(vesselness, procSize, procSize, prediction.risk_level);

    // Step 10: Encode all visualizations as PNG data URLs
    const heatmapPng = heatmapToPNG(heatmapRaw, procSize, procSize);
    const overlayPng = overlayToPNG(imgData, origCh, origW, origH, heatmapRaw, procSize, procSize, 0.5);
    const processedPng = grayToPNG(enhanced, procSize, procSize);

    // Step 11: Generate lifestyle recommendations
    const recommendations = generateRecommendations(prediction.risk_level, clinical_data, biomarkers);

    const response: PredictionResponse = {
      risk_level: prediction.risk_level,
      confidence: prediction.confidence,
      probability_low: prediction.probability_low,
      probability_moderate: prediction.probability_moderate,
      probability_high: prediction.probability_high,
      biomarkers,
      risk_factors: prediction.risk_factors,
      recommendations,
      gradcam_heatmap: heatmapPng,
      gradcam_overlay: overlayPng,
      processed_image: processedPng,
      pipeline: 'edge-frangi-vesselness',
    };

    return new Response(
      JSON.stringify(response),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message || "Prediction pipeline failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

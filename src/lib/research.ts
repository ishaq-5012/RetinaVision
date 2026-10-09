import type { Scan } from './supabase';

/** Image sources stored for a scan (storage URL or embedded data URLs). */
export function scanImages(s: Scan) {
  const p = s.prediction_payload;
  return {
    original: s.image_url || p?.original_image || null,
    overlay: p?.gradcam_overlay || null,
    heatmap: p?.gradcam_heatmap || null,
  };
}

export function downloadImage(src: string, filename: string) {
  const a = document.createElement('a');
  a.href = src;
  a.download = filename;
  a.target = '_blank';
  a.rel = 'noopener';
  a.click();
}

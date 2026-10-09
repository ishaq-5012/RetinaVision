"""
Groq Vision Service — multimodal interpretation of a retinal fundus image.

Sends the fundus image together with the patient's submitted clinical factors
and the OpenCV measurements to a Groq vision-capable model, and asks for a
conservative, structured JSON interpretation. The model is explicitly told not
to diagnose and not to produce probabilities.

The API key is read from the GROQ_API_KEY environment variable on the backend
only; it is never sent to the frontend.

If Groq is unavailable (no key, network error, invalid JSON, ...) the service
returns {"status": "unavailable", ...} — it never fabricates a response.
"""

import base64
import json
import logging
import os
import re
import time
import urllib.error
import urllib.request

import cv2
import numpy as np

logger = logging.getLogger("groq_vision")

GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
DEFAULT_MODEL = "qwen/qwen3.8-27b"
TIMEOUT_S = 60
MAX_IMAGE_SIDE = 768  # keeps image tokens low (free tier: 8k tokens/minute)
MAX_RETRY_WAIT_S = 25

UNAVAILABLE_MESSAGE = "AI interpretation temporarily unavailable."

IMAGE_QUALITY_VALUES = {"good", "acceptable", "poor", "ungradable"}
CONFIDENCE_VALUES = {"low", "moderate", "high"}

SYSTEM_PROMPT = """You are an assistant inside a RESEARCH DEMONSTRATION prototype that studies \
retinal fundus photographs alongside cardiovascular risk factors. You are NOT a diagnostic device.

Rules:
- Describe only what is visibly present in the image. Be conservative; if unsure, say so.
- Do NOT diagnose any disease, and do NOT state that a disease is present or absent.
- Do NOT give any numeric probability, percentage risk or score of your own.
- Do NOT give treatment or medication advice. General advice to consult a clinician is allowed.
- Refer to the clinical factors exactly as submitted. Do not invent history or conditions that were not \
reported (e.g. a single elevated blood pressure reading is "elevated blood pressure", not "a history of hypertension").
- If the image does not look like a retinal fundus photograph, set image_quality to "ungradable" and say so.
- Respond with a single JSON object only, no markdown, no extra text."""

JSON_SCHEMA_TEXT = """{
  "image_quality": "good | acceptable | poor | ungradable",
  "image_quality_notes": "one sentence on focus, illumination, field of view",
  "retinal_observations": ["short factual observation about visible structures (optic disc, vessels, macula, background)", "..."],
  "visible_patterns": ["visible pattern worth noting, phrased as 'appearance of ...' / 'possible ...' (may be empty)", "..."],
  "clinical_context_interpretation": "2-4 sentences relating the visible retinal features and the OpenCV measurements to the submitted clinical risk factors, in cautious language",
  "risk_factors": ["the submitted clinical factors that are elevated or relevant, e.g. 'Systolic BP 150 mmHg (elevated)'", "..."],
  "confidence": "low | moderate | high  (your confidence in the image observations, not a disease probability)",
  "limitations": ["limitation of this analysis", "..."],
  "recommendation": "one sentence, non-diagnostic, e.g. suggesting review by an eye-care or cardiovascular professional"
}"""


def is_configured() -> bool:
    return bool(os.environ.get("GROQ_API_KEY", "").strip())


def model_name() -> str:
    return os.environ.get("GROQ_VISION_MODEL", "").strip() or DEFAULT_MODEL


def _encode_image(image_bgr: np.ndarray) -> str:
    h, w = image_bgr.shape[:2]
    scale = MAX_IMAGE_SIDE / max(h, w)
    if scale < 1:
        image_bgr = cv2.resize(image_bgr, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)
    ok, buf = cv2.imencode(".jpg", image_bgr, [cv2.IMWRITE_JPEG_QUALITY, 88])
    if not ok:
        raise ValueError("Could not encode image for Groq")
    return "data:image/jpeg;base64," + base64.b64encode(buf.tobytes()).decode("ascii")


def _describe_clinical(clinical: dict) -> str:
    h = clinical.get("height_cm") or 0
    w = clinical.get("weight_kg") or 0
    bmi = f"{w / (h / 100) ** 2:.1f}" if h and w else "unknown"
    return (
        f"- Age: {clinical.get('age')} years\n"
        f"- Gender: {clinical.get('gender')}\n"
        f"- BMI: {bmi} (height {h} cm, weight {w} kg)\n"
        f"- Blood pressure: {clinical.get('systolic_bp')}/{clinical.get('diastolic_bp')} mmHg\n"
        f"- Heart rate: {clinical.get('heart_rate')} bpm\n"
        f"- Total cholesterol: {clinical.get('cholesterol_mgdl')} mg/dL\n"
        f"- Smoking status: {clinical.get('smoking_status')}\n"
        f"- Diabetes history: {'yes' if clinical.get('diabetes_history') else 'no'}\n"
        f"- Family cardiac history: {'yes' if clinical.get('family_cardiac_history') else 'no'}"
    )


def _describe_measurements(biomarkers: dict, image_quality: dict) -> str:
    m = image_quality.get("metrics", {})
    return (
        f"- Vessel density (vessel pixels / retinal area): {biomarkers.get('vessel_density')}\n"
        f"- Vessel thickness (normalised 0-1): {biomarkers.get('vessel_thickness')}\n"
        f"- Vessel tortuosity (normalised 0-1, 0 = straight): {biomarkers.get('tortuosity')}\n"
        f"- Approximate arteriovenous width ratio: {biomarkers.get('arteriovenous_ratio')}\n"
        f"- OpenCV image quality: {image_quality.get('label')} "
        f"(sharpness {m.get('sharpness')}, brightness {m.get('brightness')}, contrast {m.get('contrast')})"
    )


def _build_messages(image_bgr, clinical, biomarkers, image_quality):
    user_text = (
        "Analyse this retinal fundus photograph for a research demonstration.\n\n"
        "Patient-submitted clinical factors:\n"
        f"{_describe_clinical(clinical)}\n\n"
        "Measurements computed by the OpenCV pipeline (approximate, not clinically validated):\n"
        f"{_describe_measurements(biomarkers, image_quality)}\n\n"
        "Return ONLY a JSON object with exactly these keys:\n"
        f"{JSON_SCHEMA_TEXT}"
    )
    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {
            "role": "user",
            "content": [
                {"type": "text", "text": user_text},
                {"type": "image_url", "image_url": {"url": _encode_image(image_bgr)}},
            ],
        },
    ]


def _post(body: dict, api_key: str) -> dict:
    req = urllib.request.Request(
        GROQ_URL,
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "User-Agent": "RetinaVisionAI/1.0",
        },
    )
    with urllib.request.urlopen(req, timeout=TIMEOUT_S) as resp:
        return json.load(resp)


def _retry_after(exc: urllib.error.HTTPError, detail: str) -> float | None:
    header = exc.headers.get("retry-after") if exc.headers else None
    if header:
        try:
            return float(header)
        except ValueError:
            pass
    m = re.search(r"try again in ([0-9.]+)s", detail)
    return float(m.group(1)) if m else None


def _extract_json(text: str) -> dict:
    text = (text or "").strip()
    # Drop any reasoning block or markdown fences the model may emit
    if "</think>" in text:
        text = text.split("</think>", 1)[1].strip()
    if text.startswith("```"):
        text = text.strip("`")
        text = text[text.find("{"):]
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("No JSON object in model output")
    return json.loads(text[start:end + 1])


def _str_list(value, limit: int = 8) -> list[str]:
    if isinstance(value, str):
        value = [value]
    if not isinstance(value, list):
        return []
    return [str(v).strip()[:400] for v in value if str(v).strip()][:limit]


def _validate(raw: dict) -> dict:
    """Coerce the model output into the documented schema; raise if it is unusable."""
    if not isinstance(raw, dict):
        raise ValueError("Model output is not a JSON object")

    quality = str(raw.get("image_quality", "")).strip().lower()
    confidence = str(raw.get("confidence", "")).strip().lower()
    result = {
        "image_quality": quality if quality in IMAGE_QUALITY_VALUES else "acceptable",
        "image_quality_notes": str(raw.get("image_quality_notes", "")).strip()[:400],
        "retinal_observations": _str_list(raw.get("retinal_observations")),
        "visible_patterns": _str_list(raw.get("visible_patterns")),
        "clinical_context_interpretation": str(raw.get("clinical_context_interpretation", "")).strip()[:1500],
        "risk_factors": _str_list(raw.get("risk_factors"), limit=10),
        "confidence": confidence if confidence in CONFIDENCE_VALUES else "low",
        "limitations": _str_list(raw.get("limitations")),
        "recommendation": str(raw.get("recommendation", "")).strip()[:500],
    }
    if not result["retinal_observations"] and not result["clinical_context_interpretation"]:
        raise ValueError("Model output is missing the required interpretation fields")
    return result


def unavailable(reason: str) -> dict:
    return {
        "status": "unavailable",
        "message": UNAVAILABLE_MESSAGE,
        "reason": reason,
        "model": model_name(),
    }


def interpret_fundus(
    image_bgr: np.ndarray,
    clinical: dict,
    biomarkers: dict,
    image_quality: dict,
) -> dict:
    """
    Run the Groq multimodal interpretation.

    Returns either
        {"status": "available", "model", "latency_ms", <validated schema fields>}
    or
        {"status": "unavailable", "message", "reason", "model"}
    """
    api_key = os.environ.get("GROQ_API_KEY", "").strip()
    if not api_key:
        return unavailable("GROQ_API_KEY is not configured on the backend.")

    try:
        messages = _build_messages(image_bgr, clinical, biomarkers, image_quality)
    except Exception as exc:  # pragma: no cover - defensive
        return unavailable(f"Could not prepare image: {exc}")

    body = {
        "model": model_name(),
        "messages": messages,
        "temperature": 0.2,
        "max_completion_tokens": 900,
        "response_format": {"type": "json_object"},
    }

    started = time.time()
    last_error = "unknown error"
    for attempt in range(3):
        try:
            data = _post(body, api_key)
            content = data["choices"][0]["message"].get("content") or ""
            result = _validate(_extract_json(content))
            result.update(
                status="available",
                model=data.get("model", model_name()),
                latency_ms=int((time.time() - started) * 1000),
            )
            return result
        except urllib.error.HTTPError as exc:
            detail = exc.read()[:600].decode("utf-8", "replace")
            last_error = f"Groq API HTTP {exc.code}: {detail}"
            # json_object mode unsupported or output failed JSON validation -> retry without it
            if exc.code == 400 and "response_format" in body:
                body.pop("response_format")
                continue
            if exc.code in (401, 403, 404):
                break
            if exc.code == 429:
                # Rate limited: wait for the window to reset if it is short, then retry
                wait = _retry_after(exc, detail)
                if wait is not None and wait <= MAX_RETRY_WAIT_S and attempt < 2:
                    logger.info("Groq rate limited; retrying in %.1fs", wait)
                    time.sleep(wait + 0.5)
                    continue
                last_error = "Groq rate limit reached - please wait a minute and try again."
                break
        except (urllib.error.URLError, TimeoutError) as exc:
            last_error = f"Could not reach Groq: {exc}"
        except (ValueError, KeyError, json.JSONDecodeError) as exc:
            last_error = f"Invalid response from Groq: {exc}"
        logger.warning("Groq interpretation attempt %d failed: %s", attempt + 1, last_error)

    logger.warning("Groq interpretation unavailable: %s", last_error)
    return unavailable(last_error)

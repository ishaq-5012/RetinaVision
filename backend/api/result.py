"""Result module — returns stored prediction results by scan id."""

import json

from fastapi import APIRouter, HTTPException

from api import RESULTS_DIR

router = APIRouter()


@router.get("/result/{scan_id}")
async def get_result(scan_id: str):
    path = RESULTS_DIR / f"{scan_id}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Prediction result not found.")
    return json.loads(path.read_text(encoding="utf-8"))

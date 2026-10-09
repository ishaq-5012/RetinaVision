"""Upload module — validates and stores retinal fundus images."""

import uuid

from fastapi import APIRouter, File, HTTPException, UploadFile

from api import ORIGINAL_DIR

router = APIRouter()

VALID_TYPES = {"image/jpeg", "image/png"}
MAX_SIZE_BYTES = 10 * 1024 * 1024


@router.post("/upload")
async def upload_retina(file: UploadFile = File(...)):
    if file.content_type not in VALID_TYPES:
        raise HTTPException(status_code=400, detail="Only JPG and PNG images are supported.")

    data = await file.read()
    if len(data) > MAX_SIZE_BYTES:
        raise HTTPException(status_code=400, detail="Image exceeds the 10 MB limit.")

    scan_id = str(uuid.uuid4())
    ext = "png" if file.content_type == "image/png" else "jpg"
    image_path = ORIGINAL_DIR / f"{scan_id}.{ext}"
    image_path.write_bytes(data)

    return {
        "scan_id": scan_id,
        "image_path": str(image_path),
        "image_url": f"/uploads/original/{scan_id}.{ext}",
        "message": "Retinal image uploaded successfully.",
    }

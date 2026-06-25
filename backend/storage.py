"""Local file storage. Stores files under /app/backend/uploads and serves via /api/uploads."""
import os
import uuid
from pathlib import Path
from fastapi import UploadFile, HTTPException

UPLOAD_ROOT = Path(__file__).parent / "uploads"
UPLOAD_ROOT.mkdir(exist_ok=True)

ALLOWED_IMAGE = {"image/png", "image/jpeg", "image/webp", "image/svg+xml"}
ALLOWED_ARTWORK = ALLOWED_IMAGE | {"application/pdf"}
MAX_SIZE = 25 * 1024 * 1024  # 25MB


async def save_upload(file: UploadFile, subdir: str, allowed: set = None) -> str:
    allowed = allowed or ALLOWED_IMAGE
    if file.content_type not in allowed:
        raise HTTPException(status_code=400, detail=f"Content type not allowed: {file.content_type}")
    content = await file.read()
    if len(content) > MAX_SIZE:
        raise HTTPException(status_code=413, detail="File too large (max 25MB)")
    if len(content) < 10:
        raise HTTPException(status_code=400, detail="File too small")

    dir_path = UPLOAD_ROOT / subdir
    dir_path.mkdir(parents=True, exist_ok=True)
    ext = os.path.splitext(file.filename or "file")[1].lower() or ""
    fname = f"{uuid.uuid4().hex}{ext}"
    path = dir_path / fname
    with open(path, "wb") as f:
        f.write(content)
    # Returned URL is relative to backend root, exposed via /api/uploads
    return f"/api/uploads/{subdir}/{fname}"

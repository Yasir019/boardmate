import hmac

from fastapi import APIRouter, File, Form, Header, HTTPException, UploadFile
from pydantic import BaseModel

from app.core.config import ADMIN_TOKEN, ADMIN_UPLOAD_MAX_MB
from app.services.indexing_service import indexing_service

router = APIRouter()


def verify_admin_token(x_admin_token: str = Header(...)):
    """Validate the admin token from the request header."""
    if not ADMIN_TOKEN:
        raise HTTPException(status_code=503, detail="Admin endpoints are disabled")
    if not x_admin_token or not hmac.compare_digest(x_admin_token, ADMIN_TOKEN):
        raise HTTPException(status_code=403, detail="Invalid admin token")
    return True


class UploadResponse(BaseModel):
    ok: bool
    saved_path: str | None = None
    error: str | None = None


class ReindexResponse(BaseModel):
    ok: bool
    files_indexed: int = 0
    chunks_indexed: int = 0
    error: str | None = None


@router.post("/upload", response_model=UploadResponse)
async def upload_textbook(
    board: str = Form(...),
    class_level: str = Form(...),
    subject: str = Form(...),
    chapter: str = Form(...),
    file: UploadFile = File(...),
    authorized: bool = Header(
        default=None, alias="X-ADMIN-TOKEN", include_in_schema=False
    ),
):
    """Upload a textbook file (.txt only). Requires X-ADMIN-TOKEN header."""
    verify_admin_token(authorized)

    if not file.filename.endswith(".txt"):
        raise HTTPException(status_code=400, detail="Only .txt files are allowed")

    try:
        content = await file.read()
        max_bytes = ADMIN_UPLOAD_MAX_MB * 1024 * 1024
        if len(content) > max_bytes:
            raise HTTPException(
                status_code=413,
                detail=f"File too large. Max allowed size is {ADMIN_UPLOAD_MAX_MB} MB",
            )
        content = content.decode("utf-8")

        result = indexing_service.save_uploaded_file(
            board=board,
            class_level=class_level,
            subject=subject,
            chapter=chapter,
            content=content,
        )
        return UploadResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload error: {str(e)}")


@router.post("/reindex", response_model=ReindexResponse)
async def reindex_textbooks(
    x_admin_token: str = Header(..., alias="X-ADMIN-TOKEN"),
):
    """Re-index all textbooks in the data directory. Requires X-ADMIN-TOKEN header."""
    verify_admin_token(x_admin_token)

    try:
        result = indexing_service.reindex_all()
        return ReindexResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Reindex error: {str(e)}")

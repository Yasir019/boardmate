from fastapi import APIRouter, HTTPException, Header, UploadFile, File, Form
from pydantic import BaseModel
from app.core.config import ADMIN_TOKEN
from app.services.indexing_service import indexing_service

router = APIRouter()

def verify_admin_token(x_admin_token: str = Header(...)):
    """Verify admin token from header"""
    if x_admin_token != ADMIN_TOKEN:
        raise HTTPException(status_code=403, detail="Invalid admin token")
    return True

class UploadResponse(BaseModel):
    ok: bool
    saved_path: str = None
    error: str = None

class ReindexResponse(BaseModel):
    ok: bool
    files_indexed: int = 0
    chunks_indexed: int = 0
    error: str = None

@router.post("/upload", response_model=UploadResponse)
async def upload_textbook(
    board: str = Form(...),
    class_level: str = Form(...),
    subject: str = Form(...),
    chapter: str = Form(...),
    file: UploadFile = File(...),
    authorized: bool = Header(default=None, alias="X-ADMIN-TOKEN", include_in_schema=False)
):
    """
    Upload a textbook file (.txt only).
    
    Requires X-ADMIN-TOKEN header.
    """
    verify_admin_token(authorized)
    
    # Validate file type
    if not file.filename.endswith('.txt'):
        raise HTTPException(status_code=400, detail="Only .txt files are allowed")
    
    try:
        # Read file content
        content = await file.read()
        content = content.decode('utf-8')
        
        # Save file
        result = indexing_service.save_uploaded_file(
            board=board,
            class_level=class_level,
            subject=subject,
            chapter=chapter,
            content=content
        )
        
        return UploadResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload error: {str(e)}")

@router.post("/reindex", response_model=ReindexResponse)
async def reindex_textbooks(
    x_admin_token: str = Header(..., alias="X-ADMIN-TOKEN")
):
    """
    Re-index all textbooks in the data directory.
    
    Requires X-ADMIN-TOKEN header.
    """
    verify_admin_token(x_admin_token)
    
    try:
        result = indexing_service.reindex_all()
        return ReindexResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Reindex error: {str(e)}")

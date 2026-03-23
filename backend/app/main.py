import logging

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from app.api.routes import health, chat, admin, chapters, auth
from app.core.config import DATA_DIR, DATABASE_URL, SQLITE_DB_PATH
from app.db.init_db import initialize_database

logger = logging.getLogger(__name__)

app = FastAPI(
    title="BoardMate API",
    description="RAG-based education assistant for board students",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:5175",
        "http://localhost:5176",
        "http://localhost:5177",
        "http://localhost:5178",
        "http://localhost:5179",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, tags=["Health"])
app.include_router(chat.router, prefix="/chat", tags=["Chat"])
app.include_router(auth.router, prefix="/auth", tags=["Auth"])
app.include_router(admin.router, prefix="/admin", tags=["Admin"])
app.include_router(chapters.router, prefix="/api/chapters", tags=["Chapters"])


@app.get("/api/chapters/pdf/{board}/{class_level}/{subject}/{filename}")
async def serve_pdf(board: str, class_level: str, subject: str, filename: str):
    """Serve PDF files inline from All_Chapters_PDFs folder."""
    try:
        pdf_path = DATA_DIR / board / class_level / subject / "All_Chapters_PDFs" / filename

        if not pdf_path.exists():
            raise HTTPException(status_code=404, detail="PDF not found")

        return FileResponse(
            path=str(pdf_path),
            media_type="application/pdf",
            headers={
                "Content-Disposition": f"inline; filename={filename}",
                "Cache-Control": "public, max-age=3600",
            },
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error serving PDF: {str(e)}")


@app.on_event("startup")
async def startup_event():
    """Initialize services on startup."""
    initialize_database()
    logger.info("BoardMate API starting up")
    logger.info("Data directory: %s", DATA_DIR)
    logger.info("Vector DB location: app/storage/vector_db/")
    if DATABASE_URL.startswith("sqlite"):
        logger.info("SQLite DB location: %s", SQLITE_DB_PATH)
    else:
        logger.info("Database configured via DATABASE_URL")


@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown."""
    logger.info("BoardMate API shutting down")

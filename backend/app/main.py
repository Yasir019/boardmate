from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from app.api.routes import health, chat, admin

app = FastAPI(
    title="BoardMate API",
    description="RAG-based education assistant for board students",
    version="1.0.0"
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(health.router, tags=["Health"])
app.include_router(chat.router, prefix="/chat", tags=["Chat"])
app.include_router(admin.router, prefix="/admin", tags=["Admin"])

@app.on_event("startup")
async def startup_event():
    """Initialize services on startup"""
    print("🚀 BoardMate API starting up...")
    print("📚 Vector DB location: app/storage/vector_db/")

@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown"""
    print("👋 BoardMate API shutting down...")

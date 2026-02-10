import os
from pathlib import Path

# Base directory
BASE_DIR = Path(__file__).resolve().parent.parent

# Data directory (textbooks)
DATA_DIR = BASE_DIR.parent / "data"

# Vector DB storage
VECTOR_DB_DIR = BASE_DIR / "storage" / "vector_db"

# Admin security
ADMIN_TOKEN = "admin123"

# RAG settings
EMBEDDING_MODEL = "sentence-transformers/all-MiniLM-L6-v2"
CHUNK_SIZE = 400
CHUNK_OVERLAP = 60
TOP_K_RESULTS = 3

# ChromaDB collection name
COLLECTION_NAME = "boardmate_textbooks"

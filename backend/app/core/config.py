import os
from pathlib import Path
from dotenv import load_dotenv

# Base directory
BASE_DIR = Path(__file__).resolve().parent.parent

# Project root directory (where .env file is located)
PROJECT_ROOT = BASE_DIR.parent.parent

# Load environment variables from .env file in project root
load_dotenv(PROJECT_ROOT / ".env")

# Data directory (textbooks) - use the main data folder
DATA_DIR = PROJECT_ROOT / "data"

# Vector DB storage
VECTOR_DB_DIR = BASE_DIR / "storage" / "vector_db"

# Admin security (from environment variable)
ADMIN_TOKEN = os.getenv("ADMIN_TOKEN", "admin123")

# RAG settings
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2")
CHUNK_SIZE = int(os.getenv("CHUNK_SIZE", "400"))
CHUNK_OVERLAP = int(os.getenv("CHUNK_OVERLAP", "60"))
TOP_K_RESULTS = int(os.getenv("TOP_K_RESULTS", "5"))

# ChromaDB collection name
COLLECTION_NAME = "boardmate_textbooks"

# Groq LLM settings (from environment variables)
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.1-8b-instant")

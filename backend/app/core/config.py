"""Application configuration loaded from environment variables."""

from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Directory layout
BASE_DIR = Path(__file__).resolve().parent.parent
PROJECT_ROOT = BASE_DIR.parent.parent
DEFAULT_SQLITE_DB_PATH = BASE_DIR / "storage" / "app.db"


class Settings(BaseSettings):
    """Typed application settings with production-safe validation."""

    model_config = SettingsConfigDict(
        env_file=PROJECT_ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_env: str = Field(default="development", alias="APP_ENV")
    data_dir: Path = Field(default=PROJECT_ROOT / "Books", alias="DATA_DIR")
    database_url: str = Field(
        default=f"sqlite:///{DEFAULT_SQLITE_DB_PATH.as_posix()}",
        alias="DATABASE_URL",
    )
    cors_origins: list[str] = Field(
        default_factory=lambda: [
            "http://localhost:3000",
            "http://localhost:5173",
            "http://127.0.0.1:5173",
        ],
        alias="CORS_ORIGINS",
    )

    admin_token: str | None = Field(default=None, alias="ADMIN_TOKEN")
    admin_upload_max_mb: int = Field(default=25, alias="ADMIN_UPLOAD_MAX_MB")
    secret_key: str = Field(default="dev-secret-key-change-me", alias="SECRET_KEY")
    algorithm: str = "HS256"
    access_token_expire_minutes: int = Field(default=60, alias="ACCESS_TOKEN_EXPIRE_MINUTES")

    embedding_model: str = Field(
        default="sentence-transformers/all-MiniLM-L6-v2",
        alias="EMBEDDING_MODEL",
    )
    chunk_size: int = Field(default=400, alias="CHUNK_SIZE")
    chunk_overlap: int = Field(default=60, alias="CHUNK_OVERLAP")
    top_k_results: int = Field(default=5, alias="TOP_K_RESULTS")
    collection_name: str = "boardmate_textbooks"

    groq_api_key: str | None = Field(default=None, alias="GROQ_API_KEY")
    groq_model: str = Field(default="llama-3.1-70b-versatile", alias="GROQ_MODEL")
    llm_mode: str = Field(default="auto", alias="LLM_MODE")
    local_llm_base_url: str = Field(default="http://127.0.0.1:11434", alias="LOCAL_LLM_BASE_URL")
    local_llm_model: str = Field(default="qwen2.5:3b-instruct", alias="LOCAL_LLM_MODEL")
    local_llm_timeout_seconds: int = Field(default=45, alias="LOCAL_LLM_TIMEOUT_SECONDS")

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, value: str | list[str]) -> list[str]:
        if isinstance(value, list):
            return value
        if not value:
            return []
        return [origin.strip() for origin in value.split(",") if origin.strip()]

    @field_validator("data_dir", mode="before")
    @classmethod
    def resolve_data_dir(cls, value: str | Path | None) -> Path:
        if value in (None, ""):
            return PROJECT_ROOT / "Books"
        return Path(value).expanduser().resolve()

    @field_validator("secret_key")
    @classmethod
    def validate_secret_key(cls, value: str, info) -> str:
        app_env = info.data.get("app_env", "development")
        if app_env.lower() == "production" and value == "dev-secret-key-change-me":
            raise ValueError("SECRET_KEY must be set in production")
        return value

    @field_validator("admin_token")
    @classmethod
    def validate_admin_token(cls, value: str | None, info) -> str | None:
        app_env = info.data.get("app_env", "development")
        if app_env.lower() == "production" and not value:
            raise ValueError("ADMIN_TOKEN must be set in production")
        return value

    @field_validator("llm_mode")
    @classmethod
    def validate_llm_mode(cls, value: str) -> str:
        normalized = (value or "").strip().lower()
        if normalized not in {"auto", "cloud", "local"}:
            raise ValueError("LLM_MODE must be one of: auto, cloud, local")
        return normalized


settings = Settings()

# Storage
VECTOR_DB_DIR = BASE_DIR / "storage" / "vector_db"
SQLITE_DB_PATH = DEFAULT_SQLITE_DB_PATH
DATABASE_URL = settings.database_url

# Security
ADMIN_TOKEN = settings.admin_token
ADMIN_UPLOAD_MAX_MB = settings.admin_upload_max_mb
SECRET_KEY = settings.secret_key
ALGORITHM = settings.algorithm
ACCESS_TOKEN_EXPIRE_MINUTES = settings.access_token_expire_minutes
CORS_ORIGINS = settings.cors_origins
APP_ENV = settings.app_env

# Data
DATA_DIR = settings.data_dir

# RAG settings
EMBEDDING_MODEL = settings.embedding_model
CHUNK_SIZE = settings.chunk_size
CHUNK_OVERLAP = settings.chunk_overlap
TOP_K_RESULTS = settings.top_k_results
COLLECTION_NAME = settings.collection_name

# Groq LLM
GROQ_API_KEY = settings.groq_api_key
GROQ_MODEL = settings.groq_model
LLM_MODE = settings.llm_mode
LOCAL_LLM_BASE_URL = settings.local_llm_base_url
LOCAL_LLM_MODEL = settings.local_llm_model
LOCAL_LLM_TIMEOUT_SECONDS = settings.local_llm_timeout_seconds

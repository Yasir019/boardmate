"""Database initialization utilities."""

from pathlib import Path

from sqlalchemy import inspect, text

from app.core.config import DATABASE_URL
from app.db.base import Base
from app.db.session import engine

# Ensure model metadata is registered before create_all.
from app.db import models  # noqa: F401


def initialize_database() -> None:
    """Create database directory (for SQLite) and tables if they do not exist."""
    if DATABASE_URL.startswith("sqlite:///"):
        sqlite_path = DATABASE_URL.replace("sqlite:///", "", 1)
        Path(sqlite_path).parent.mkdir(parents=True, exist_ok=True)

    Base.metadata.create_all(bind=engine)

    if DATABASE_URL.startswith("sqlite"):
        _ensure_users_password_hash_column()


def _ensure_users_password_hash_column() -> None:
    """Add missing users.password_hash column for legacy SQLite files."""
    inspector = inspect(engine)
    if "users" not in inspector.get_table_names():
        return

    user_columns = {column["name"] for column in inspector.get_columns("users")}
    if "password_hash" in user_columns:
        return

    with engine.begin() as connection:
        connection.execute(
            text(
                "ALTER TABLE users ADD COLUMN password_hash VARCHAR(255) NOT NULL DEFAULT ''"
            )
        )

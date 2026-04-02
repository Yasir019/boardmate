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
        _ensure_chats_table_columns()
        _ensure_messages_table_columns()


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


def _ensure_chats_table_columns() -> None:
    """Add missing chat columns for legacy SQLite files."""
    inspector = inspect(engine)
    if "chats" not in inspector.get_table_names():
        return

    chat_columns = {column["name"] for column in inspector.get_columns("chats")}
    statements: list[str] = []

    if "board" not in chat_columns:
        statements.append("ALTER TABLE chats ADD COLUMN board VARCHAR(80) NOT NULL DEFAULT ''")
    if "class_level" not in chat_columns:
        statements.append(
            "ALTER TABLE chats ADD COLUMN class_level VARCHAR(40) NOT NULL DEFAULT ''"
        )
    if "subject" not in chat_columns:
        statements.append("ALTER TABLE chats ADD COLUMN subject VARCHAR(120) NOT NULL DEFAULT ''")
    if "updated_at" not in chat_columns:
        statements.append(
            "ALTER TABLE chats ADD COLUMN updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP"
        )

    with engine.begin() as connection:
        for statement in statements:
            connection.execute(text(statement))


def _ensure_messages_table_columns() -> None:
    """Add missing message columns for legacy SQLite files."""
    inspector = inspect(engine)
    if "messages" not in inspector.get_table_names():
        return

    message_columns = {column["name"] for column in inspector.get_columns("messages")}
    statements: list[str] = []

    if "chapter" not in message_columns:
        statements.append("ALTER TABLE messages ADD COLUMN chapter VARCHAR(120)")
    if "sources" not in message_columns:
        statements.append("ALTER TABLE messages ADD COLUMN sources JSON")

    with engine.begin() as connection:
        for statement in statements:
            connection.execute(text(statement))

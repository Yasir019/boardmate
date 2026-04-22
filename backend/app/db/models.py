"""ORM models for application data."""

from datetime import datetime

from sqlalchemy import JSON, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class User(Base):
    """Application user."""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    full_name: Mapped[str] = mapped_column(String(120), nullable=False)
    email: Mapped[str] = mapped_column(String(150), nullable=False, unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    chats: Mapped[list["Chat"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    roles: Mapped[list["UserRole"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    query_logs: Mapped[list["QueryLog"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    progress_profiles: Mapped[list["ProgressProfile"]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
    )


class Board(Base):
    """Supported education board."""

    __tablename__ = "boards"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False, unique=True, index=True)
    code: Mapped[str] = mapped_column(String(50), nullable=False, unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    classes: Mapped[list["ClassLevel"]] = relationship(
        back_populates="board",
        cascade="all, delete-orphan",
    )


class ClassLevel(Base):
    """Class/grade tied to a board."""

    __tablename__ = "classes"
    __table_args__ = (
        UniqueConstraint("board_id", "class_level", name="uq_classes_board_level"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    board_id: Mapped[int] = mapped_column(ForeignKey("boards.id", ondelete="CASCADE"), nullable=False)
    class_level: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    board: Mapped["Board"] = relationship(back_populates="classes")
    subjects: Mapped[list["Subject"]] = relationship(
        back_populates="class_level_ref",
        cascade="all, delete-orphan",
    )


class Subject(Base):
    """Subject catalog entry under a class."""

    __tablename__ = "subjects"
    __table_args__ = (
        UniqueConstraint("class_id", "name", name="uq_subjects_class_name"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    class_id: Mapped[int] = mapped_column(ForeignKey("classes.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    class_level_ref: Mapped["ClassLevel"] = relationship(back_populates="subjects")
    textbooks: Mapped[list["Textbook"]] = relationship(
        back_populates="subject_ref",
        cascade="all, delete-orphan",
    )
    progress_profiles: Mapped[list["ProgressProfile"]] = relationship(
        back_populates="subject_ref",
        cascade="all, delete-orphan",
    )


class Textbook(Base):
    """Uploaded textbook metadata."""

    __tablename__ = "textbooks"
    __table_args__ = (
        UniqueConstraint("subject_id", "title", "version", name="uq_textbooks_subject_title_version"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    subject_id: Mapped[int] = mapped_column(ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False)
    title: Mapped[str] = mapped_column(String(240), nullable=False)
    upload_source: Mapped[str | None] = mapped_column(String(60), nullable=True)
    pdf_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    version: Mapped[str] = mapped_column(String(50), nullable=False, default="v1")
    uploaded_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    subject_ref: Mapped["Subject"] = relationship(back_populates="textbooks")
    chapters: Mapped[list["Chapter"]] = relationship(
        back_populates="textbook",
        cascade="all, delete-orphan",
    )


class Chapter(Base):
    """Chapter metadata for a textbook."""

    __tablename__ = "chapters"
    __table_args__ = (
        UniqueConstraint("textbook_id", "chapter_key", name="uq_chapters_textbook_key"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    textbook_id: Mapped[int] = mapped_column(ForeignKey("textbooks.id", ondelete="CASCADE"), nullable=False)
    chapter_no: Mapped[str | None] = mapped_column(String(30), nullable=True)
    chapter_key: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    chapter_title: Mapped[str] = mapped_column(String(240), nullable=False)
    html_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    pdf_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    textbook: Mapped["Textbook"] = relationship(back_populates="chapters")


class UserRole(Base):
    """Role assignment for users (e.g., student, admin, teacher)."""

    __tablename__ = "user_roles"
    __table_args__ = (
        UniqueConstraint("user_id", "role", name="uq_user_roles_user_role"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    role: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    user: Mapped["User"] = relationship(back_populates="roles")


class Chat(Base):
    """Conversation container for a user."""

    __tablename__ = "chats"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    board: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    class_level: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    subject: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    chapter: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )

    user: Mapped["User"] = relationship(back_populates="chats")
    messages: Mapped[list["Message"]] = relationship(
        back_populates="chat",
        cascade="all, delete-orphan",
        order_by="Message.created_at",
    )
    query_logs: Mapped[list["QueryLog"]] = relationship(
        back_populates="chat",
        cascade="all, delete-orphan",
        order_by="QueryLog.created_at",
    )


class Message(Base):
    """Individual message entry in a chat."""

    __tablename__ = "messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    chat_id: Mapped[int] = mapped_column(ForeignKey("chats.id", ondelete="CASCADE"), nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    chapter: Mapped[str | None] = mapped_column(String(120), nullable=True)
    sources: Mapped[list[dict] | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    chat: Mapped["Chat"] = relationship(back_populates="messages")


class QueryLog(Base):
    """Operational log of user questions and model answers."""

    __tablename__ = "query_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    chat_id: Mapped[int | None] = mapped_column(ForeignKey("chats.id", ondelete="SET NULL"), nullable=True)
    question: Mapped[str] = mapped_column(Text, nullable=False)
    answer: Mapped[str] = mapped_column(Text, nullable=False)
    board: Mapped[str | None] = mapped_column(String(80), nullable=True)
    class_level: Mapped[str | None] = mapped_column(String(40), nullable=True)
    subject: Mapped[str | None] = mapped_column(String(120), nullable=True)
    chapter: Mapped[str | None] = mapped_column(String(120), nullable=True)
    llm_provider: Mapped[str | None] = mapped_column(String(30), nullable=True)
    latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    user: Mapped["User"] = relationship(back_populates="query_logs")
    chat: Mapped["Chat | None"] = relationship(back_populates="query_logs")


class ProgressProfile(Base):
    """Learner progress summary per subject."""

    __tablename__ = "progress_profiles"
    __table_args__ = (
        UniqueConstraint("user_id", "subject_id", name="uq_progress_profiles_user_subject"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    subject_id: Mapped[int] = mapped_column(ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False, index=True)
    weak_topics: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    strong_topics: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    mastery_score: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )

    user: Mapped["User"] = relationship(back_populates="progress_profiles")
    subject_ref: Mapped["Subject"] = relationship(back_populates="progress_profiles")

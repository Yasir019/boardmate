from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.routes.auth import get_current_user, get_optional_current_user
from app.db.models import Chat, Message, User
from app.db.session import get_db
from app.rag.pipeline import rag_pipeline

router = APIRouter()


class ChatRequest(BaseModel):
    board: str
    class_level: str
    subject: str
    question: str
    chapter: Optional[str] = None
    chat_id: Optional[int] = None
    language: str = "en"


class Source(BaseModel):
    chapter: str
    chapter_title: Optional[str] = None
    chapter_number: Optional[str] = None
    subject: Optional[str] = None
    snippet: str
    pdf_path: Optional[str] = None


class ChatResponse(BaseModel):
    answer: str
    sources: List[Source]
    chat_id: Optional[int] = None


class MessageResponse(BaseModel):
    id: int
    role: str
    content: str
    chapter: Optional[str] = None
    sources: List[Source] = []
    created_at: datetime


class ChatSummaryResponse(BaseModel):
    id: int
    title: str
    board: str
    class_level: str
    subject: str
    chapter: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    message_count: int


class ChatDetailResponse(ChatSummaryResponse):
    messages: List[MessageResponse]


class CreateChatRequest(BaseModel):
    board: str
    class_level: str
    subject: str
    chapter: Optional[str] = None
    title: Optional[str] = None


class UpdateChatRequest(BaseModel):
    title: str


def _build_chat_title(question: str, subject: str) -> str:
    trimmed = " ".join(question.split())
    if trimmed:
        return trimmed[:77] + "..." if len(trimmed) > 80 else trimmed
    return f"{subject} study chat"


def _serialize_source(source: dict) -> Source:
    return Source(
        chapter=source.get("chapter", ""),
        chapter_title=source.get("chapter_title", ""),
        chapter_number=source.get("chapter_number", ""),
        subject=source.get("subject"),
        snippet=source.get("snippet", ""),
        pdf_path=source.get("pdf_path"),
    )


def _serialize_message(message: Message) -> MessageResponse:
    serialized_sources = [_serialize_source(source) for source in (message.sources or [])]
    return MessageResponse(
        id=message.id,
        role=message.role,
        content=message.content,
        chapter=message.chapter,
        sources=serialized_sources,
        created_at=message.created_at,
    )


def _serialize_chat(chat: Chat) -> ChatSummaryResponse:
    return ChatSummaryResponse(
        id=chat.id,
        title=chat.title,
        board=chat.board,
        class_level=chat.class_level,
        subject=chat.subject,
        chapter=chat.chapter,
        created_at=chat.created_at,
        updated_at=chat.updated_at,
        message_count=len(chat.messages),
    )


def _get_owned_chat(chat_id: int, user_id: int, db: Session) -> Chat:
    chat = db.scalar(select(Chat).where(Chat.id == chat_id, Chat.user_id == user_id))
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    return chat


@router.get("/sessions", response_model=List[ChatSummaryResponse])
def list_chats(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    chats = db.scalars(
        select(Chat).where(Chat.user_id == current_user.id).order_by(Chat.updated_at.desc())
    ).unique().all()
    return [_serialize_chat(chat) for chat in chats]


@router.post("/sessions", response_model=ChatSummaryResponse, status_code=status.HTTP_201_CREATED)
def create_chat(
    payload: CreateChatRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    chat = Chat(
        user_id=current_user.id,
        title=(payload.title or f"{payload.subject} study chat").strip(),
        board=payload.board.strip(),
        class_level=payload.class_level.strip(),
        subject=payload.subject.strip(),
        chapter=(payload.chapter or "").strip() or None,
    )
    db.add(chat)
    db.commit()
    db.refresh(chat)
    return _serialize_chat(chat)


@router.get("/sessions/{chat_id}", response_model=ChatDetailResponse)
def get_chat(
    chat_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    chat = _get_owned_chat(chat_id, current_user.id, db)
    return ChatDetailResponse(**_serialize_chat(chat).model_dump(), messages=[
        _serialize_message(message) for message in chat.messages
    ])


@router.patch("/sessions/{chat_id}", response_model=ChatSummaryResponse)
def update_chat(
    chat_id: int,
    payload: UpdateChatRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    chat = _get_owned_chat(chat_id, current_user.id, db)
    next_title = payload.title.strip()
    if not next_title:
        raise HTTPException(status_code=422, detail="Title cannot be empty")

    chat.title = next_title[:200]
    chat.updated_at = datetime.utcnow()
    db.add(chat)
    db.commit()
    db.refresh(chat)
    return _serialize_chat(chat)


@router.delete("/sessions/{chat_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_chat(
    chat_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    chat = _get_owned_chat(chat_id, current_user.id, db)
    db.delete(chat)
    db.commit()


@router.post("/ask", response_model=ChatResponse)
async def ask_question(
    request: ChatRequest,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_optional_current_user),
):
    """Ask a question about textbook content and receive an AI-generated answer."""
    try:
        auth_user = current_user
        result = rag_pipeline.query(
            question=request.question,
            board=request.board,
            class_level=request.class_level,
            subject=request.subject,
            chapter=request.chapter,
            language=request.language,
        )

        sources = []
        for s in result["sources"]:
            pdf_path = s.get("pdf_path")
            if pdf_path:
                chapter_name = s.get("chapter", "")
                pdf_path = (
                    f"/api/chapters/pdf/{request.board}/{request.class_level}"
                    f"/{request.subject}/{chapter_name}.pdf"
                )

            sources.append(Source(
                chapter=s.get("chapter", ""),
                chapter_title=s.get("chapter_title", ""),
                chapter_number=s.get("chapter_number", ""),
                subject=s.get("subject"),
                snippet=s.get("snippet", ""),
                pdf_path=pdf_path,
            ))

        chat_id = None
        if auth_user:
            chat = None
            if request.chat_id is not None:
                chat = _get_owned_chat(request.chat_id, auth_user.id, db)

            if chat is None:
                chat = Chat(
                    user_id=auth_user.id,
                    title=_build_chat_title(request.question, request.subject),
                    board=request.board.strip(),
                    class_level=request.class_level.strip(),
                    subject=request.subject.strip(),
                    chapter=(request.chapter or "").strip() or None,
                )
                db.add(chat)
                db.flush()

            chat.updated_at = datetime.utcnow()
            db.add_all([
                Message(
                    chat_id=chat.id,
                    role="user",
                    content=request.question.strip(),
                    chapter=request.chapter,
                ),
                Message(
                    chat_id=chat.id,
                    role="assistant",
                    content=result["answer"],
                    chapter=request.chapter,
                    sources=[source.model_dump() for source in sources],
                ),
            ])
            db.commit()
            chat_id = chat.id

        return ChatResponse(answer=result["answer"], sources=sources, chat_id=chat_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Query error: {str(e)}")

from datetime import datetime
from collections import defaultdict, deque
from hashlib import sha1
import json
import random
from uuid import uuid4
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.routes.auth import get_current_user, get_optional_current_user
from app.db.models import Chat, Message, User
from app.db.session import get_db
from app.rag.pipeline import rag_pipeline
from app.services.llm_service import EXERCISE_SYSTEM_PROMPT, QUIZ_SYSTEM_PROMPT, generate_response_with_provider

router = APIRouter()

_STUDIO_RECENT_OUTPUTS: dict[str, deque[str]] = defaultdict(lambda: deque(maxlen=8))


def _normalize_studio_task(task: str) -> str:
    raw = (task or "").strip().lower().replace("-", "_").replace(" ", "_")
    alias_map = {
        "mcq": "quiz",
        "mcqs": "quiz",
        "quiz": "quiz",
        "summary": "summary",
        "notes": "summary",
        "summary_notes": "summary",
        "exercise": "exercise",
        "exercise_solution": "exercise",
        "exercise_solutions": "exercise",
        "solution": "exercise",
        "solutions": "exercise",
    }
    return alias_map.get(raw, raw)


class ChatRequest(BaseModel):
    board: str
    class_level: str
    subject: str
    question: str
    chapter: Optional[str] = None
    chat_id: Optional[int] = None
    language: str = "en"
    save_to_chat: bool = True


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
    llm_provider: Optional[str] = None


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


class StudioGenerateRequest(BaseModel):
    board: str
    class_level: str
    subject: str
    chapter: str
    task: str
    language: str = "en"


class StudioGenerateResponse(BaseModel):
    answer: str
    task: str
    llm_provider: Optional[str] = None


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


def _shuffle_context_for_generation(context: str, generation_nonce: str) -> str:
    chunks = [chunk.strip() for chunk in (context or "").split("\n\n") if chunk.strip()]
    if len(chunks) <= 1:
        return context

    seeded_random = random.Random(generation_nonce)
    seeded_random.shuffle(chunks)
    return "\n\n".join(chunks)


def _extract_quiz_stems(answer: str) -> list[str]:
    text = (answer or "").strip()
    if not text:
        return []

    stems: list[str] = []
    try:
        parsed = json.loads(text)
        questions = parsed.get("questions", []) if isinstance(parsed, dict) else []
        for item in questions:
            if isinstance(item, dict):
                question_text = " ".join(str(item.get("question", "")).split())
                if question_text:
                    stems.append(question_text[:140])
    except Exception:
        for line in text.splitlines():
            cleaned = line.strip()
            lowered = cleaned.lower()
            if lowered.startswith("q") or lowered.startswith("question"):
                stems.append(" ".join(cleaned.split())[:140])

    unique_stems: list[str] = []
    seen = set()
    for stem in stems:
        signature = stem.lower()
        if signature in seen:
            continue
        seen.add(signature)
        unique_stems.append(stem)

    return unique_stems[:10]


def _try_parse_json_object(answer: str) -> dict[str, Any] | None:
    text = (answer or "").strip()
    if not text:
        return None

    try:
        data = json.loads(text)
        return data if isinstance(data, dict) else None
    except Exception:
        start = text.find("{")
        end = text.rfind("}")
        if start >= 0 and end > start:
            try:
                data = json.loads(text[start:end + 1])
                return data if isinstance(data, dict) else None
            except Exception:
                return None
    return None


def _extract_exercise_questions(answer: str) -> list[dict[str, str]]:
    parsed = _try_parse_json_object(answer)
    if not parsed:
        return []

    candidates = parsed.get("questions", [])
    if not isinstance(candidates, list):
        return []

    extracted: list[dict[str, str]] = []
    seen = set()
    for item in candidates:
        if not isinstance(item, dict):
            continue

        question_no = str(item.get("question_no") or item.get("number") or "").strip()
        question_text = " ".join(str(item.get("question") or item.get("text") or "").split()).strip()
        if not question_text:
            continue

        signature = f"{question_no.lower()}::{question_text.lower()}"
        if signature in seen:
            continue
        seen.add(signature)
        extracted.append({"question_no": question_no or str(len(extracted) + 1), "question": question_text})

    return extracted


def _extract_exercise_solutions(answer: str) -> list[dict[str, Any]]:
    parsed = _try_parse_json_object(answer)
    if not parsed:
        return []

    candidates = parsed.get("solutions", [])
    if not isinstance(candidates, list):
        return []

    normalized: list[dict[str, Any]] = []
    seen = set()
    for item in candidates:
        if not isinstance(item, dict):
            continue
        question_no = str(item.get("question_no") or "").strip() or str(len(normalized) + 1)
        question = " ".join(str(item.get("question") or "").split()).strip()
        answer_text = str(item.get("answer") or "").strip()
        if not question and not answer_text:
            continue

        signature = f"{question_no.lower()}::{question.lower()}"
        if signature in seen:
            continue
        seen.add(signature)

        steps = item.get("steps", [])
        key_points = item.get("key_points", [])
        normalized.append({
            "question_no": question_no,
            "question": question,
            "answer": answer_text,
            "steps": steps if isinstance(steps, list) else [],
            "key_points": key_points if isinstance(key_points, list) else [],
        })

    return normalized


def _studio_prompt(task: str, chapter: str, generation_nonce: str, quiz_count: int | None = None) -> str:
    normalized_task = _normalize_studio_task(task)

    if normalized_task == "quiz":
        question_count = quiz_count if quiz_count is not None else 15
        return (
            f"Generate exactly {question_count} multiple-choice quiz questions from chapter '{chapter}'.\n"
            f"Generation nonce (must influence variation): {generation_nonce}.\n"
            "Return ONLY valid JSON with this exact schema:\n"
            "{\n"
            "  \"quiz_title\": \"string\",\n"
            "  \"variant_id\": \"string\",\n"
            "  \"questions\": [\n"
            "    {\n"
            "      \"question\": \"string\",\n"
            "      \"options\": [\"string\", \"string\", \"string\", \"string\"],\n"
            "      \"answer_index\": 0,\n"
            "      \"explanation\": \"string\"\n"
            "    }\n"
            "  ]\n"
            "}\n"
            "Rules:\n"
            "1) Output must be JSON only, no markdown/prose outside JSON.\n"
            "2) Every question must have exactly 4 options.\n"
            "3) answer_index must be 0..3 and match the correct option.\n"
            "4) No duplicate questions. Keep wording student-friendly and exam-focused.\n"
            "5) Ensure this quiz variant is unique for this generation nonce."
        )

    if normalized_task == "summary":
        return (
            f"Create exam-focused study notes for chapter '{chapter}'.\n"
            f"Generation nonce (must influence variation): {generation_nonce}.\n"
            "Return ONLY valid JSON with this exact schema:\n"
            "{\n"
            "  \"summary_title\": \"string\",\n"
            "  \"variant_id\": \"string\",\n"
            "  \"overview\": \"string\",\n"
            "  \"detailed_notes\": \"string\",\n"
            "  \"key_concepts\": [\"string\"],\n"
            "  \"important_terms\": [{\"term\": \"string\", \"definition\": \"string\"}],\n"
            "  \"exam_takeaways\": [\"string\"],\n"
            "  \"revision_questions\": [\"string\"]\n"
            "}\n"
            "Rules:\n"
            "1) Output must be JSON only, no markdown/prose outside JSON.\n"
            "2) detailed_notes must contain at least 1000 words in professional plain language.\n"
            "3) Keep wording practical, student-friendly, and exam-focused.\n"
            "4) Ensure this summary wording is unique for this generation nonce and easy-to-read for students."
        )

    if normalized_task == "exercise":
        return (
            f"Create chapter exercise solutions for chapter '{chapter}'.\n"
            f"Generation nonce (must influence variation): {generation_nonce}.\n"
            "Return ONLY valid JSON with this exact schema:\n"
            "{\n"
            "  \"solution_title\": \"string\",\n"
            "  \"overview\": \"string\",\n"
            "  \"solutions\": [\n"
            "    {\n"
            "      \"question_no\": \"string\",\n"
            "      \"question\": \"string\",\n"
            "      \"answer\": \"string\",\n"
            "      \"steps\": [\"string\"],\n"
            "      \"key_points\": [\"string\"]\n"
            "    }\n"
            "  ]\n"
            "}\n"
            "Rules:\n"
            "1) Output must be JSON only, no markdown/prose outside JSON.\n"
            "2) Solve the complete exercise from the available chapter context, not a partial sample.\n"
            "3) Use clear board-exam style language.\n"
            "4) For numerical problems, include method steps and final answer.\n"
            "5) Preserve original question numbering/order when possible.\n"
            "6) If a question exists but details are weak in context, still include it and state what is missing.\n"
            "7) Ensure this solution set is unique for this generation nonce."
        )

    raise HTTPException(status_code=422, detail=f"Unsupported studio task: {task}")


@router.post("/studio/generate", response_model=StudioGenerateResponse)
async def generate_studio_content(
    request: StudioGenerateRequest,
    current_user: User | None = Depends(get_optional_current_user),
):
    try:
        generation_nonce = f"{datetime.utcnow().isoformat()}-{uuid4().hex[:8]}"
        task_name = _normalize_studio_task(request.task)
        quiz_count = random.SystemRandom().randint(15, 20) if task_name == "quiz" else None
        retrieval_top_k = 10
        if task_name == "exercise":
            retrieval_top_k = 28

        prompt = _studio_prompt(
            task=request.task,
            chapter=request.chapter,
            generation_nonce=generation_nonce,
            quiz_count=quiz_count,
        )
        retrieval = rag_pipeline.retrieve_context_for_scope(
            board=request.board,
            class_level=request.class_level,
            subject=request.subject,
            chapter=request.chapter,
            query=prompt,
            top_k=retrieval_top_k,
        )

        chapter_text = retrieval.get("context", "")
        if not chapter_text:
            raise HTTPException(
                status_code=404,
                detail=(
                    "No vector context found for selected chapter. "
                    "Please run indexing first and then retry quiz generation."
                ),
            )

        scope_key = "::".join([
            task_name,
            request.board.strip().lower(),
            request.class_level.strip().lower(),
            request.subject.strip().lower(),
        ])

        answer = ""
        llm_provider = None
        duplicate_guard_lines: list[str] = []

        if task_name == "exercise":
            context_for_exercise = _shuffle_context_for_generation(chapter_text[:90000], generation_nonce)

            extraction_prompt = (
                f"From chapter '{request.chapter}', extract the complete exercise question list.\n"
                "Return ONLY valid JSON in this schema:\n"
                "{\n"
                "  \"questions\": [\n"
                "    {\"question_no\": \"string\", \"question\": \"string\"}\n"
                "  ]\n"
                "}\n"
                "Rules:\n"
                "1) Include all exercise questions available in context.\n"
                "2) Preserve original numbering/order where possible.\n"
                "3) No extra prose outside JSON."
            )

            extraction_answer, llm_provider = generate_response_with_provider(
                question=extraction_prompt,
                context=context_for_exercise,
                board=request.board,
                class_level=request.class_level,
                language=request.language,
                system_prompt=EXERCISE_SYSTEM_PROMPT,
                temperature=0.35,
                top_p=0.9,
                max_tokens=1800,
            )

            extracted_questions = _extract_exercise_questions(extraction_answer)

            if extracted_questions:
                batch_size = 8
                merged_solutions: list[dict[str, Any]] = []

                for batch_index in range(0, len(extracted_questions), batch_size):
                    batch_questions = extracted_questions[batch_index:batch_index + batch_size]
                    questions_json = json.dumps(batch_questions, ensure_ascii=False)
                    solve_prompt = (
                        f"Solve this batch of chapter exercise questions for '{request.chapter}'.\n"
                        f"Question batch JSON:\n{questions_json}\n\n"
                        "Return ONLY valid JSON with this schema:\n"
                        "{\n"
                        "  \"solutions\": [\n"
                        "    {\n"
                        "      \"question_no\": \"string\",\n"
                        "      \"question\": \"string\",\n"
                        "      \"answer\": \"string\",\n"
                        "      \"steps\": [\"string\"],\n"
                        "      \"key_points\": [\"string\"]\n"
                        "    }\n"
                        "  ]\n"
                        "}\n"
                        "Rules:\n"
                        "1) Solve every question in this batch.\n"
                        "2) For numericals, include method steps and final answer.\n"
                        "3) If context is weak for a question, state what is missing in the answer field."
                    )

                    batch_answer, llm_provider = generate_response_with_provider(
                        question=solve_prompt,
                        context=context_for_exercise,
                        board=request.board,
                        class_level=request.class_level,
                        language=request.language,
                        system_prompt=EXERCISE_SYSTEM_PROMPT,
                        temperature=0.6,
                        top_p=0.92,
                        max_tokens=3200,
                    )

                    merged_solutions.extend(_extract_exercise_solutions(batch_answer))

                if merged_solutions:
                    answer = json.dumps(
                        {
                            "solution_title": f"{request.chapter} Exercise Solutions",
                            "overview": (
                                f"Solved {len(merged_solutions)} exercise questions from the selected chapter "
                                "using textbook context."
                            ),
                            "solutions": merged_solutions,
                        },
                        ensure_ascii=False,
                    )

                    return StudioGenerateResponse(
                        answer=answer,
                        task=request.task,
                        llm_provider=llm_provider,
                    )

        for _attempt in range(5):
            if task_name == "quiz":
                system_prompt = QUIZ_SYSTEM_PROMPT
            elif task_name == "exercise":
                system_prompt = EXERCISE_SYSTEM_PROMPT
            else:
                system_prompt = None
            prompt_with_retry_guidance = prompt
            if duplicate_guard_lines and task_name == "quiz":
                prompt_with_retry_guidance = (
                    f"{prompt}\n\n"
                    "Do not repeat wording patterns from previous attempts. Avoid these question openings:\n"
                    + "\n".join(f"- {line}" for line in duplicate_guard_lines[:8])
                )

            generation_temperature = 0.85 if task_name == "quiz" else 0.55
            generation_top_p = 0.95 if task_name == "quiz" else 0.9
            generation_max_tokens = 2200 if task_name == "quiz" else 1800
            if task_name == "exercise":
                generation_temperature = 0.65
                generation_top_p = 0.92
                generation_max_tokens = 4200
            context_budget = 90000 if task_name == "exercise" else 32000
            context_for_attempt = _shuffle_context_for_generation(chapter_text[:context_budget], generation_nonce)

            answer, llm_provider = generate_response_with_provider(
                question=prompt_with_retry_guidance,
                context=context_for_attempt,
                board=request.board,
                class_level=request.class_level,
                language=request.language,
                system_prompt=system_prompt,
                temperature=generation_temperature,
                top_p=generation_top_p,
                max_tokens=generation_max_tokens,
            )

            normalized = " ".join((answer or "").split()).lower()
            fingerprint = sha1(normalized.encode("utf-8")).hexdigest()
            if fingerprint not in _STUDIO_RECENT_OUTPUTS[scope_key]:
                _STUDIO_RECENT_OUTPUTS[scope_key].append(fingerprint)
                break

            if task_name == "quiz":
                candidate_lines = _extract_quiz_stems(answer)
                duplicate_guard_lines.extend(candidate_lines[:6])

            # Retry with a fresh nonce to force a new variant if the model repeated output.
            generation_nonce = f"{datetime.utcnow().isoformat()}-{uuid4().hex[:8]}"
            prompt = _studio_prompt(
                task=request.task,
                chapter=request.chapter,
                generation_nonce=generation_nonce,
                quiz_count=quiz_count,
            )

        return StudioGenerateResponse(
            answer=answer,
            task=request.task,
            llm_provider=llm_provider,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Studio generation error: {str(e)}")


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
        if auth_user and request.save_to_chat:
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

        return ChatResponse(
            answer=result["answer"],
            sources=sources,
            chat_id=chat_id,
            llm_provider=result.get("llm_provider"),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Query error: {str(e)}")

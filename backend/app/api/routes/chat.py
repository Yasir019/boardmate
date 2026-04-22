from datetime import datetime
from collections import defaultdict, deque
from hashlib import sha1
import json
import random
import re
from uuid import uuid4
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.api.routes.auth import get_current_user, get_optional_current_user
from app.db.models import Chat, Message, User
from app.db.session import get_db
from app.rag.pipeline import rag_pipeline
from app.services.llm_service import (
    CLOUD_LLM_UNAVAILABLE_MESSAGE,
    EXERCISE_SYSTEM_PROMPT,
    LOCAL_LLM_UNAVAILABLE_MESSAGE,
    QUIZ_SYSTEM_PROMPT,
    SUMMARY_SYSTEM_PROMPT,
    SESSION_MEMORY_SYSTEM_PROMPT,
    build_session_memory_context,
    generate_session_summary,
    generate_response_with_provider,
    maybe_build_conversational_reply,
)

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


def _count_quiz_questions(answer: str) -> int:
    text = (answer or "").strip()
    if not text:
        return 0

    parsed = _try_parse_json_object(text)
    if parsed and isinstance(parsed.get("questions"), list):
        return len(parsed.get("questions") or [])

    count = 0
    for line in text.splitlines():
        cleaned = line.strip().lower()
        if re.match(r"^##\s*question\s+\d+", cleaned):
            count += 1
        elif re.match(r"^q\d+[\).:]", cleaned):
            count += 1
    return count


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


def _extract_exercise_questions_from_context(context: str) -> list[dict[str, str]]:
    lines = [line.strip() for line in (context or "").splitlines() if line.strip()]
    if not lines:
        return []

    question_patterns = (
        re.compile(r"^(?:q(?:uestion)?\s*)?(\d+[a-zA-Z]?)\s*[\)\.:\-]\s+(.+)$", re.IGNORECASE),
        re.compile(r"^q\.?\s*(\d+[a-zA-Z]?)\s+(.+)$", re.IGNORECASE),
        re.compile(r"^(\d+[a-zA-Z]?)\s+(.+\?)$", re.IGNORECASE),
    )

    extracted: list[dict[str, str]] = []
    seen = set()
    for line in lines:
        for pattern in question_patterns:
            match = pattern.match(line)
            if not match:
                continue

            question_no = (match.group(1) or "").strip()
            question_text = " ".join((match.group(2) or "").split()).strip()
            if not question_text or len(question_text) < 8:
                continue

            signature = f"{question_no.lower()}::{question_text.lower()}"
            if signature in seen:
                continue

            seen.add(signature)
            extracted.append({
                "question_no": question_no or str(len(extracted) + 1),
                "question": question_text,
            })
            break

    return extracted


def _merge_exercise_batch_results(
    batch_questions: list[dict[str, str]],
    parsed_solutions: list[dict[str, Any]],
    raw_answer: str,
) -> list[dict[str, Any]]:
    mapped = {
        f"{str(item.get('question_no', '')).strip().lower()}::{' '.join(str(item.get('question', '')).split()).lower()}": item
        for item in parsed_solutions
        if isinstance(item, dict)
    }

    merged: list[dict[str, Any]] = []
    fallback_text = " ".join((raw_answer or "").split())[:600]
    for index, question_item in enumerate(batch_questions, start=1):
        question_no = str(question_item.get("question_no") or index).strip()
        question_text = " ".join(str(question_item.get("question") or "").split()).strip()
        signature = f"{question_no.lower()}::{question_text.lower()}"

        existing = mapped.get(signature)
        if existing:
            merged.append(existing)
            continue

        merged.append({
            "question_no": question_no,
            "question": question_text,
            "answer": (
                "Context-based detailed answer could not be parsed reliably from model output. "
                "Please retry generation for this chapter."
                + (f" Parsed excerpt: {fallback_text}" if fallback_text else "")
            ),
            "steps": [],
            "key_points": ["Re-run generation for a cleaner structured answer if needed."],
        })

    return merged


def _build_chat_history_text(messages: list[Message], limit: int = 12) -> str:
    """Build conversation history with sliding window buffer for session continuity."""
    if not messages:
        return ""

    clipped = messages[-limit:]
    msg_dicts = []
    for msg in clipped:
        role = msg.role
        content = " ".join((msg.content or "").split())
        if not content:
            continue
        msg_dicts.append({"role": role, "content": content[:700]})
    
    return build_session_memory_context(msg_dicts, max_messages=limit, include_summary=True)


def _build_session_prompt_system() -> str:
    """Return the system prompt for session-persistent chat."""
    return SESSION_MEMORY_SYSTEM_PROMPT


def _raise_if_studio_llm_unavailable(answer: str, llm_provider: str | None) -> None:
    if llm_provider != "error":
        return

    detail = (answer or "").strip() or CLOUD_LLM_UNAVAILABLE_MESSAGE
    if detail == LOCAL_LLM_UNAVAILABLE_MESSAGE:
        detail = (
            "AI assistant could not complete the request using cloud, and local model server is not running. "
            "For hybrid mode, keep LLM_MODE=auto, verify GROQ API/network, or start Ollama local server."
        )

    raise HTTPException(status_code=503, detail=detail)


def _trim_context_to_budget(context: str, max_chars: int) -> str:
    text = (context or "").strip()
    if not text or len(text) <= max_chars:
        return text

    chunks = [chunk.strip() for chunk in text.split("\n\n---\n\n") if chunk.strip()]
    if not chunks:
        return text[:max_chars]

    selected: list[str] = []
    total = 0
    for chunk in chunks:
        next_total = total + len(chunk) + (7 if selected else 0)
        if next_total > max_chars:
            break
        selected.append(chunk)
        total = next_total

    return "\n\n---\n\n".join(selected) if selected else text[:max_chars]


def _studio_prompt(task: str, chapter: str, generation_nonce: str, quiz_count: int | None = None) -> str:
    """Build a tight, grounded user prompt for studio generation tasks."""
    normalized_task = _normalize_studio_task(task)

    if normalized_task == "quiz":
        question_count = quiz_count if quiz_count is not None else 15
        return (
            f"Generate {question_count} multiple-choice questions from chapter '{chapter}'.\n"
            f"Nonce: {generation_nonce} (use it to vary question selection).\n\n"
            "RULES:\n"
            "- Use ONLY the context provided — do not draw on outside knowledge.\n"
            "- If context supports fewer than 10 questions, generate only what context supports and note the limitation.\n"
            "- Output plain text (no JSON, no code blocks).\n"
            "- Cover the FULL chapter breadth — vary topic, type, and difficulty.\n"
            "- 4 options (A–D) per question; exactly 1 correct; wrong options must be plausible.\n"
            "- Never reveal the answer in the question wording.\n"
            "- End with: ✔ Quiz complete — [X] questions from the chapter."
        )

    if normalized_task == "summary":
        return (
            f"Write structured study notes for chapter '{chapter}'.\n"
            f"Nonce: {generation_nonce} (vary emphasis across attempts).\n\n"
            "RULES:\n"
            "- Use ONLY the provided context — no external knowledge.\n"
            "- If context is thin, write a shorter accurate summary and state the limitation.\n"
            "- Output clean plain text (no JSON, no code blocks).\n"
            "- Follow the system-prompt structure exactly: Overview, Key Points, Conclusion.\n"
            "- Every sentence must be traceable to the context."
        )

    if normalized_task == "exercise":
        return (
            f"Write complete exercise solutions for chapter '{chapter}'.\n"
            f"Nonce: {generation_nonce}.\n\n"
            "RULES:\n"
            "- Use ONLY the provided context — do not invent questions, answers, or steps.\n"
            "- Solve every question visible in the context (MCQs, Short, Long, Numerical).\n"
            "- For numericals: show every step — never just the answer.\n"
            "- Output plain text (no JSON, no code blocks).\n"
            "- Do NOT truncate — complete every section fully.\n"
            "- End with: ✔ Exercise complete — [X] questions solved."
        )

    raise HTTPException(status_code=422, detail=f"Unsupported studio task: {task}")


def _fallback_studio_generation(
    request: StudioGenerateRequest,
    prompt: str,
    task_name: str,
) -> tuple[str, str | None]:
    system_prompt = (
        QUIZ_SYSTEM_PROMPT if task_name == "quiz"
        else SUMMARY_SYSTEM_PROMPT if task_name == "summary"
        else EXERCISE_SYSTEM_PROMPT
    )

    result = rag_pipeline.query(
        question=prompt,
        board=request.board,
        class_level=request.class_level,
        subject=request.subject,
        chapter=request.chapter,
        language=request.language,
        system_prompt=system_prompt,
    )
    return result.get("answer", ""), result.get("llm_provider")


def _studio_prompt_v2(task: str, chapter: str, generation_nonce: str, quiz_count: int | None = None) -> str:
    normalized_task = _normalize_studio_task(task)

    if normalized_task == "quiz":
        question_count = quiz_count if quiz_count is not None else 15
        return (
            f"Generate {question_count} unique multiple-choice questions from chapter '{chapter}'.\n"
            f"Nonce: {generation_nonce}.\n\n"
            "RULES:\n"
            "- Use only the provided textbook context.\n"
            "- Make this attempt unique for the nonce by changing topic mix, wording, and option order.\n"
            "- Do not repeat the same first 5 questions from an earlier attempt.\n"
            "- Cover early, middle, and late parts of the chapter.\n"
            "- Output plain text only.\n"
            "- Use exactly this structure for every question:\n"
            "  1. [Question text]\n"
            "  A) [Option]\n"
            "  B) [Option]\n"
            "  C) [Option]\n"
            "  D) [Option]\n"
            "  Answer: [Letter]) [Correct option text]\n"
            "- Leave one blank line between questions.\n"
            "- Do not add a title, chapter heading, emojis, or separators."
        )

    if normalized_task == "summary":
        return (
            f"Write a clean structured summary for chapter '{chapter}'.\n"
            f"Nonce: {generation_nonce}.\n\n"
            "RULES:\n"
            "- Use only the provided textbook context.\n"
            "- Output plain text only.\n"
            "- Use exactly these section headings in this order:\n"
            "  Overview\n"
            "  Detailed Summary\n"
            "  Key Points\n"
            "  Key Concepts\n"
            "- Overview must be one short paragraph of 2 to 4 sentences.\n"
            "- Detailed Summary must contain 3 to 5 paragraphs with a blank line between paragraphs.\n"
            "- Key Points must be bullet points only.\n"
            "- Each key point should be a short important point or short definition, not a long paragraph.\n"
            "- Key Concepts must be bullet points of important terms or concepts only.\n"
            "- Do not use ## headings, emojis, or markdown separators.\n"
            "- Keep all wording exam-focused and traceable to the context."
        )

    if normalized_task == "exercise":
        return (
            f"Write complete exercise solutions for chapter '{chapter}'.\n"
            f"Nonce: {generation_nonce}.\n\n"
            "RULES:\n"
            "- Use only the provided textbook context.\n"
            "- Treat the provided context as exercise-only retrieval, not whole-chapter notes.\n"
            "- Search for and solve only questions found under headings like EXERCISE, Multiple Choice Questions, Short Questions, Long Questions, Numerical Problems, or similar exercise sections.\n"
            "- Do not invent extra questions. Do not answer random chapter paragraphs that are not part of the exercise.\n"
            "- List every visible MCQ, short question, long question, and numerical from the retrieved exercise context.\n"
            "- You may improve clarity, but every answer must stay grounded in book concepts.\n"
            "- For numericals, show every step.\n"
            "- Output plain text only.\n"
            "- Use these exact section headings in this order:\n"
            "  Multiple Choice Questions\n"
            "  Short Questions\n"
            "  Long Questions\n"
            "  Numerical Problems\n"
            "- For MCQs include answer and explanation.\n"
            "- For short questions include answer and key points.\n"
            "- For long questions include a proper exam-style answer and key concepts.\n"
            "- Format each item like this:\n"
            "  1. [Question text]\n"
            "  Answer: [Answer text]\n"
            "  Explanation: [Only for MCQs]\n"
            "  Key Points:\n"
            "  - [Point]\n"
            "- Do not add a title, emojis, markdown headings, or separators."
        )

    raise HTTPException(status_code=422, detail=f"Unsupported studio task: {task}")


@router.post("/studio/generate", response_model=StudioGenerateResponse)
async def generate_studio_content(
    request: StudioGenerateRequest,
    current_user: User | None = Depends(get_optional_current_user),
):
    """Generate quiz, summary, or exercise solutions for a chapter — single-pass human-readable output."""
    try:
        generation_nonce = f"{datetime.utcnow().isoformat()}-{uuid4().hex[:8]}"
        task_name = _normalize_studio_task(request.task)
        quiz_count = random.SystemRandom().randint(15, 20) if task_name == "quiz" else None

        # ── retrieval top-k per task ──────────────────────────────────────────
        retrieval_top_k = 8 if task_name == "quiz" else 10 if task_name == "summary" else 12

        if task_name == "exercise":
            retrieval = rag_pipeline.retrieve_exercise_context(
                board=request.board,
                class_level=request.class_level,
                subject=request.subject,
                chapter=request.chapter,
                top_k=max(32, retrieval_top_k * 2),
            )
        else:
            retrieval = rag_pipeline.retrieve_context_for_scope(
                board=request.board,
                class_level=request.class_level,
                subject=request.subject,
                chapter=request.chapter,
                query=f"{task_name} {request.chapter}",
                top_k=retrieval_top_k,
            )

        chapter_text = retrieval.get("context", "")
        if not chapter_text:
            raise HTTPException(
                status_code=404,
                detail=(
                    f"No textbook context found for chapter '{request.chapter}'. "
                    "Please run indexing first (/admin/reindex) and retry."
                ),
            )

        scope_key = "::".join([
            task_name,
            request.board.strip().lower(),
            request.class_level.strip().lower(),
            request.subject.strip().lower(),
            request.chapter.strip().lower(),
        ])

        # ── choose system prompt and generation settings per task ─────────────
        if task_name == "quiz":
            system_prompt = QUIZ_SYSTEM_PROMPT
            temperature = 0.7
            top_p = 0.9
            max_tokens = 2048
            context_budgets = [12000, 8000]
        elif task_name == "summary":
            system_prompt = SUMMARY_SYSTEM_PROMPT
            temperature = 0.35
            top_p = 0.9
            max_tokens = 3072
            context_budgets = [18000, 12000]
        elif task_name == "exercise":
            system_prompt = EXERCISE_SYSTEM_PROMPT
            temperature = 0.35
            top_p = 0.9
            max_tokens = 8192
            context_budgets = [48000, 32000]
        else:
            raise HTTPException(status_code=422, detail=f"Unsupported studio task: {request.task}")

        answer = ""
        llm_provider = None
        duplicate_guard_lines: list[str] = []

        # ── up to 5 attempts with duplicate fingerprint guard ─────────────────
        for _attempt in range(3):
            prompt = _studio_prompt_v2(
                task=request.task,
                chapter=request.chapter,
                generation_nonce=generation_nonce,
                quiz_count=quiz_count,
            )

            # Add anti-repeat guidance on retry for quizzes
            if duplicate_guard_lines and task_name == "quiz":
                prompt = (
                    f"{prompt}\n\n"
                    "Avoid these question-stem patterns from previous attempts:\n"
                    + "\n".join(f"- {line}" for line in duplicate_guard_lines[:8])
                )

            # For summary and exercise: don't shuffle — present context in order
            for context_budget in context_budgets:
                trimmed_context = _trim_context_to_budget(chapter_text, context_budget)
                if task_name == "summary" or task_name == "exercise":
                    context_for_attempt = trimmed_context
                else:
                    context_for_attempt = _shuffle_context_for_generation(trimmed_context, generation_nonce)

                answer, llm_provider = generate_response_with_provider(
                    question=prompt,
                    context=context_for_attempt,
                    board=request.board,
                    class_level=request.class_level,
                    language=request.language,
                    system_prompt=system_prompt,
                    temperature=temperature,
                    top_p=top_p,
                    max_tokens=max_tokens,
                )

                if llm_provider != "error" and (answer or "").strip():
                    break

            if llm_provider == "error" or not (answer or "").strip():
                answer, llm_provider = _fallback_studio_generation(request, prompt, task_name)
                _raise_if_studio_llm_unavailable(answer, llm_provider)

            # Fingerprint to detect repeated output
            normalized = " ".join((answer or "").split()).lower()
            fingerprint = sha1(normalized.encode("utf-8")).hexdigest()
            if fingerprint not in _STUDIO_RECENT_OUTPUTS[scope_key]:
                _STUDIO_RECENT_OUTPUTS[scope_key].append(fingerprint)
                break

            # Quiz-specific: also check question count constraint
            if task_name == "quiz":
                quiz_question_count = _count_quiz_questions(answer)
                if quiz_question_count < 10 or quiz_question_count > 20:
                    prompt = (
                        f"{prompt}\n\n"
                        f"Retry: last attempt produced {quiz_question_count} questions. "
                        "Generate between 15 and 20 questions."
                    )
                    generation_nonce = f"{datetime.utcnow().isoformat()}-{uuid4().hex[:8]}"
                    continue

                duplicate_guard_lines.extend(_extract_quiz_stems(answer)[:6])

            # Refresh nonce for next attempt
            generation_nonce = f"{datetime.utcnow().isoformat()}-{uuid4().hex[:8]}"

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
    """Ask a question about textbook content with session memory persistence."""
    try:
        conversational_reply = maybe_build_conversational_reply(
            question=request.question,
            board=request.board,
            class_level=request.class_level,
            subject=request.subject,
            language=request.language,
        )
        if conversational_reply:
            return ChatResponse(
                answer=conversational_reply,
                sources=[],
                chat_id=request.chat_id,
                llm_provider="rule-based",
            )

        auth_user = current_user
        chat: Chat | None = None
        chat_history_text = ""
        session_system_prompt = None

        if auth_user and request.chat_id is not None:
            chat = _get_owned_chat(request.chat_id, auth_user.id, db)
            history_stmt = select(Message).where(Message.chat_id == chat.id)
            if request.chapter:
                history_stmt = history_stmt.where(Message.chapter == request.chapter)
            history_stmt = history_stmt.order_by(desc(Message.created_at)).limit(12)
            recent_messages = list(reversed(db.scalars(history_stmt).all()))
            chat_history_text = _build_chat_history_text(recent_messages, limit=8)
            session_system_prompt = _build_session_prompt_system()

        result = rag_pipeline.query(
            question=request.question,
            board=request.board,
            class_level=request.class_level,
            subject=request.subject,
            chapter=request.chapter,
            language=request.language,
            chat_history=chat_history_text,
            system_prompt=session_system_prompt,
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

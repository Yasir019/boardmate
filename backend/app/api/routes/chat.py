from datetime import datetime
from collections import defaultdict, deque
from hashlib import sha1
import json
from pathlib import Path
import random
import re
from uuid import uuid4
from typing import Any, List, Optional

from bs4 import BeautifulSoup
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.api.routes.auth import get_current_user, get_optional_current_user
from app.core.config import DATA_DIR
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
    get_llm_runtime_status,
    maybe_build_conversational_reply,
    normalize_llm_mode,
)

router = APIRouter()

_STUDIO_RECENT_OUTPUTS: dict[str, deque[str]] = defaultdict(lambda: deque(maxlen=8))

LOCAL_QUIZ_SYSTEM_PROMPT = QUIZ_SYSTEM_PROMPT
STUDIO_VARIANT_COUNT = 5
STUDIO_EXERCISE_VARIANT_COUNT = 3
STUDIO_QUIZ_QUESTION_COUNT = 15
STUDIO_VARIANTS_CACHE_PATH = Path(__file__).resolve().parents[2] / "storage" / "studio_variants_cache.json"


def _is_local_mode_requested(mode_override: str | None) -> bool:
    return normalize_llm_mode(mode_override) == "local"


def _studio_variant_count(task_name: str) -> int:
    return STUDIO_EXERCISE_VARIANT_COUNT if task_name == "exercise" else STUDIO_VARIANT_COUNT


def _studio_generation_settings(task_name: str, is_local_mode: bool) -> tuple[str, float, float, int, list[int]]:
    if task_name == "quiz":
        if is_local_mode:
            return LOCAL_QUIZ_SYSTEM_PROMPT, 0.35, 0.85, 2500, [5000]
        # Groq on-demand llama-3.1-8b-instant has a low TPM cap; keep prompt +
        # completion comfortably below 6000 tokens so online quiz does not fall
        # back to local on 413.
        return QUIZ_SYSTEM_PROMPT, 0.45, 0.9, 1800, [5000, 3500]

    if task_name == "summary":
        if is_local_mode:
            return SUMMARY_SYSTEM_PROMPT, 0.25, 0.85, 1024, [8000]
        return SUMMARY_SYSTEM_PROMPT, 0.3, 0.9, 1800, [6500, 4500]

    if task_name == "exercise":
        if is_local_mode:
            return EXERCISE_SYSTEM_PROMPT, 0.25, 0.85, 1536, [12000, 9000]
        return EXERCISE_SYSTEM_PROMPT, 0.3, 0.9, 2200, [8000, 5500]

    raise HTTPException(status_code=422, detail=f"Unsupported studio task: {task_name}")


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
    llm_mode_override: Optional[str] = None


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
    llm_mode_override: Optional[str] = None


class StudioGenerateResponse(BaseModel):
    answer: str
    task: str
    llm_provider: Optional[str] = None


class ChatRuntimeResponse(BaseModel):
    default_mode: str
    effective_mode: str
    internet_available: bool = False
    cloud_configured: bool = False
    cloud_available: bool
    local_available: bool
    configured_local_model: str
    resolved_local_model: str
    local_models: List[str]


def _build_chat_title(question: str, subject: str) -> str:
    trimmed = " ".join(question.split())
    if trimmed:
        return trimmed[:77] + "..." if len(trimmed) > 80 else trimmed
    return f"{subject} study chat"


def _resolve_chapter_html_path(board: str, class_level: str, subject: str, chapter: str) -> Path | None:
    subject_path = (DATA_DIR / board / class_level / subject).resolve()
    html_path = (subject_path / "All_Chapters_Extracted" / f"{chapter}.html").resolve()
    if DATA_DIR.resolve() not in html_path.parents or not html_path.exists():
        return None
    return html_path


def _load_chapter_soup(board: str, class_level: str, subject: str, chapter: str) -> BeautifulSoup | None:
    html_path = _resolve_chapter_html_path(board, class_level, subject, chapter)
    if not html_path:
        return None
    try:
        return BeautifulSoup(html_path.read_text(encoding="utf-8"), "html.parser")
    except Exception:
        return None


def _read_studio_variants_cache() -> dict[str, Any]:
    try:
        if STUDIO_VARIANTS_CACHE_PATH.exists():
            data = json.loads(STUDIO_VARIANTS_CACHE_PATH.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                data.setdefault("version", 1)
                data.setdefault("items", {})
                return data
    except Exception:
        pass
    return {"version": 1, "items": {}}


def _write_studio_variants_cache(cache: dict[str, Any]) -> None:
    STUDIO_VARIANTS_CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    STUDIO_VARIANTS_CACHE_PATH.write_text(
        json.dumps(cache, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def _studio_variant_cache_key(request: "StudioGenerateRequest", task_name: str) -> str:
    cache_task_name = "exercise-v3" if task_name == "exercise" else task_name
    parts = [
        cache_task_name,
        request.board,
        request.class_level,
        request.subject,
        request.chapter,
        request.language,
    ]
    return "::".join(_clean_text(str(part)).lower() for part in parts)


def _clean_text(value: str) -> str:
    return " ".join((value or "").replace("\xa0", " ").split()).strip()


def _extract_chapter_title_from_soup(soup: BeautifulSoup | None, fallback: str) -> str:
    if not soup:
        return fallback
    title = _clean_text(soup.title.get_text(" ", strip=True) if soup.title else fallback)
    if "|" in title:
        title = title.split("|", 1)[0].strip()
    title = re.sub(r"^Unit\s+\d+\s*[:\-]?\s*", "", title, flags=re.IGNORECASE)
    return title or fallback


def _non_exercise_blocks(soup: BeautifulSoup | None) -> tuple[list[str], list[tuple[str, str]], list[str]]:
    if not soup:
        return [], [], []

    main = soup.find("main") or soup.body or soup
    paragraphs: list[str] = []
    headings: list[tuple[str, str]] = []
    bullets: list[str] = []
    in_exercise = False

    for node in main.find_all(["h1", "h2", "h3", "h4", "p", "li"]):
        text = _clean_text(node.get_text(" ", strip=True))
        if not text:
            continue
        if node.name in {"h1", "h2", "h3", "h4"} and "exercise" in text.lower():
            in_exercise = True
            continue
        if in_exercise:
            continue
        if node.name in {"h1", "h2", "h3", "h4"}:
            headings.append((node.name.lower(), text))
        elif node.name == "p":
            paragraphs.append(text)
        elif node.name == "li":
            bullets.append(text)

    return paragraphs, headings, bullets


def _tokenize_keywords(text: str) -> set[str]:
    stopwords = {
        "the", "and", "for", "with", "that", "this", "from", "into", "than", "then", "when",
        "what", "which", "where", "why", "how", "your", "their", "about", "have", "has",
        "had", "been", "being", "into", "also", "only", "such", "each", "used", "use",
        "using", "within", "between", "while", "will", "would", "could", "should", "does",
        "did", "are", "was", "were", "can", "may", "might", "not", "all", "any", "its",
        "our", "out", "under", "over", "through", "chapter", "question", "software",
    }
    return {
        token for token in re.findall(r"[a-zA-Z][a-zA-Z0-9\-]{2,}", (text or "").lower())
        if token not in stopwords
    }


def _match_reference_paragraphs(question: str, paragraphs: list[str], limit: int = 2) -> list[str]:
    query_tokens = _tokenize_keywords(question)
    if not query_tokens:
        return paragraphs[:limit]

    scored: list[tuple[int, int, str]] = []
    for index, paragraph in enumerate(paragraphs):
        paragraph_tokens = _tokenize_keywords(paragraph)
        overlap = len(query_tokens & paragraph_tokens)
        if overlap <= 0:
            continue
        scored.append((overlap, -index, paragraph))

    scored.sort(reverse=True)
    matched = [paragraph for _, _, paragraph in scored[:limit]]
    return matched or paragraphs[:limit]


def _choose_best_option(question: str, options: list[str], references: list[str]) -> str:
    if not options:
        return ""

    reference_text = " ".join(references)
    reference_tokens = _tokenize_keywords(reference_text)
    question_tokens = _tokenize_keywords(question)
    normalized_question = (question or "").lower()

    best_option = options[0]
    best_score = float("-inf")

    for index, option in enumerate(options):
        option_tokens = _tokenize_keywords(option)
        overlap_score = len(option_tokens & reference_tokens) * 4
        distinctiveness = len(option_tokens - question_tokens)
        option_text = option.lower()

        exact_phrase_bonus = 6 if option_text and option_text in reference_text.lower() else 0
        negation_bonus = 0
        if " not " in f" {normalized_question} ":
            negation_bonus = -overlap_score

        score = overlap_score + distinctiveness + exact_phrase_bonus + negation_bonus - (index * 0.01)
        if score > best_score:
            best_score = score
            best_option = option

    return best_option


def _compact_quiz_option(value: str, max_chars: int = 180) -> str:
    text = _clean_text(value)
    text = re.sub(r"\b(?:it is like|think of it like|imagine)\b.*", "", text, flags=re.IGNORECASE).strip()
    sentences = [
        sentence.strip()
        for sentence in re.split(r"(?<=[.!?])\s+", text)
        if sentence.strip()
    ]
    if sentences:
        text = sentences[0]
    if len(text) > max_chars:
        text = text[:max_chars].rsplit(" ", 1)[0].rstrip(".,;:") + "."
    return text.rstrip(".") + "." if text else ""


def _clean_quiz_term(value: str) -> str:
    text = _clean_text(value)
    text = re.sub(r"^\s*(?:chapter|section|unit|page|pg\.?|exercise)\s*(?:no\.?|number|#)?\s*[:.-]?\s*\d+(?:\.\d+)*\s*[:.)-]?\s*", "", text, flags=re.IGNORECASE)
    text = re.sub(r"^\s*\d+(?:\.\d+)*\.?\s*", "", text).strip()
    text = re.sub(r"\s*\((?:page|pg\.?|chapter|section|unit|exercise)\s*(?:no\.?|number|#)?\s*\d+(?:\.\d+)*\)", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\s*[,;:-]?\s*(?:page|pg\.?)\s*(?:no\.?|number|#)?\s*\d+\b\.?", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\s*[,;:-]?\s*(?:chapter|section|unit|exercise)\s*(?:no\.?|number|#)?\s*\d+(?:\.\d+)*\b\.?", "", text, flags=re.IGNORECASE)
    return re.sub(r"\s{2,}", " ", text).strip(" .:-")


def _short_quiz_option(value: str) -> str:
    text = re.sub(r"^(?:the|a|an)\s+", "", _clean_quiz_term(value), flags=re.IGNORECASE).strip()
    acronym_match = re.search(r"\(([A-Z0-9]{2,8})\)", text)
    if acronym_match:
        return acronym_match.group(1)
    words = [
        word
        for word in re.findall(r"[A-Za-z0-9+\-*/%=<>!]+", text)
        if word.lower() not in {"and", "or", "of", "in", "to", "for", "with"}
    ]
    return " ".join(words[:3]).strip() if words else ""


def _quiz_clue(value: str, max_words: int = 14) -> str:
    text = _clean_quiz_term(value)
    text = re.sub(r"^(?:is|are|a|an|the)\s+", "", text, flags=re.IGNORECASE).strip()
    words = text.split()
    if len(words) > max_words:
        text = " ".join(words[:max_words]).rstrip(".,;:")
    return text.rstrip(".")


def _quiz_question_for_candidate(item: dict[str, str], index: int) -> str:
    term = _short_quiz_option(item.get("term", ""))
    clue = _quiz_clue(item.get("definition", ""))
    templates = [
        "Which term means: {clue}?",
        "Identify the concept: {clue}.",
        "What is used for {clue}?",
        "The statement describes which term: {clue}?",
        "Choose the correct term for: {clue}.",
        "Which option matches this idea: {clue}?",
        "What is the name of this concept: {clue}?",
        "Select the term related to: {clue}.",
        "Which keyword fits this clue: {clue}?",
        "Find the best label for: {clue}.",
        "This describes which topic: {clue}?",
        "Pick the matching concept: {clue}.",
        "Which answer names this idea: {clue}?",
        "What concept is shown by: {clue}?",
        "Choose the topic connected with: {clue}.",
        "Which term is closest to: {clue}?",
        "What does this clue point to: {clue}?",
        "Select the correct name: {clue}.",
        "Which option best represents: {clue}?",
        "Name the concept described here: {clue}.",
    ]
    return templates[(index - 1) % len(templates)].format(clue=clue or term)


def _dedupe_short_options(values: list[str]) -> list[str]:
    options: list[str] = []
    seen = set()
    for value in values:
        option = _short_quiz_option(value)
        key = option.lower()
        if option and 1 <= len(option.split()) <= 3 and key not in seen:
            seen.add(key)
            options.append(option)
    return options


def _extract_local_quiz_items(answer: str) -> list[dict[str, str]]:
    text = (answer or "").replace("\r", "")
    if not text.strip():
        return []

    blocks = re.split(r"(?=^\s*(?:\*\*)?Q\d+\s*[\.\-:])", text, flags=re.IGNORECASE | re.MULTILINE)
    items: list[dict[str, str]] = []
    for block in blocks:
        lines = [line.strip().strip("\\") for line in block.split("\n") if line.strip()]
        if not lines or not re.match(r"^(?:\*\*)?Q\d+\s*[\.\-:]", lines[0], flags=re.IGNORECASE):
            continue

        question = re.sub(r"^\*\*|\*\*$", "", lines[0]).strip()
        question = re.sub(r"^Q\d+\s*[\.\-:]\s*", "", question, flags=re.IGNORECASE).strip()
        question = re.sub(r"\s+in\s+chapter\s*\w+\s*\??$", "?", question, flags=re.IGNORECASE).strip()
        term = re.sub(r"^what\s+best\s+describes\s+", "", question, flags=re.IGNORECASE)
        term = re.sub(r"\s+in\s+chapter\s*\w+\s*\??$", "", term, flags=re.IGNORECASE).strip(" ?.")

        options: dict[str, str] = {}
        correct_letter = ""
        explanation = ""
        for line in lines[1:]:
            option_match = re.match(r"^([A-D])[\).]\s*(.+)$", line, flags=re.IGNORECASE)
            if option_match:
                options[option_match.group(1).upper()] = _clean_quiz_term(option_match.group(2))
                continue
            answer_match = re.match(r"^(?:\*\*)?(?:correct\s+answer|answer)(?:\*\*)?\s*:\s*([A-D])[\).]?\s*(.*)$", line, flags=re.IGNORECASE)
            if answer_match:
                correct_letter = answer_match.group(1).upper()
                explanation = _clean_quiz_term(answer_match.group(2))
                continue
            explanation_match = re.match(r"^(?:explanation)\s*:\s*(.+)$", line, flags=re.IGNORECASE)
            if explanation_match:
                explanation = _clean_quiz_term(explanation_match.group(1))

        if not explanation and correct_letter in options:
            explanation = options[correct_letter]
        if term and explanation:
            items.append({"term": term, "definition": explanation})

    return items


def _format_local_quiz_items(
    items: list[dict[str, str]],
    generation_nonce: str,
    desired_count: int | None = None,
    topic: str = "Chapter Quiz",
    subject: str = "",
) -> str:
    cleaned_items = [
        {**item, "term": _short_quiz_option(item.get("term", ""))}
        for item in items
        if _short_quiz_option(item.get("term", "")) and _quiz_clue(item.get("definition", ""))
    ]
    cleaned_items = [
        item for item in cleaned_items
        if 1 <= len(item["term"].split()) <= 3
    ]
    if len(cleaned_items) < 4:
        return ""

    rng = random.Random(generation_nonce)
    rng.shuffle(cleaned_items)
    count = min(desired_count or len(cleaned_items), len(cleaned_items))
    selected = cleaned_items[:count]
    all_terms = _dedupe_short_options([item["term"] for item in cleaned_items])

    questions: list[dict[str, Any]] = []
    visible_index = 1
    for item in selected:
        correct_option = _short_quiz_option(item["term"])
        distractors = [term for term in all_terms if term.lower() != correct_option.lower()]
        rng.shuffle(distractors)
        options = _dedupe_short_options([correct_option, *distractors[:3]])
        if len(options) < 4:
            continue
        rng.shuffle(options)
        answer_index = next((idx for idx, option in enumerate(options) if option.lower() == correct_option.lower()), 0)
        correct_letter = chr(65 + answer_index)
        difficulty = "Medium"
        bloom_levels = ["Remember", "Understand", "Apply", "Analyze"]
        questions.append({
            "id": visible_index,
            "question": _quiz_question_for_candidate(item, visible_index),
            "options": {
                "A": options[0],
                "B": options[1],
                "C": options[2],
                "D": options[3],
            },
            "correct_answer": correct_letter,
            "correct_option_text": options[answer_index],
            "explanation": f"{options[answer_index]} is correct because {_quiz_clue(item.get('definition', ''), max_words=18)}.",
            "bloom_level": bloom_levels[(visible_index - 1) % len(bloom_levels)],
            "difficulty": difficulty,
            "tags": [correct_option],
        })
        visible_index += 1

    if not questions:
        return ""

    payload = {
        "topic": topic or "Chapter Quiz",
        "subject": subject or "",
        "difficulty": "Medium",
        "total_questions": len(questions),
        "questions": questions,
    }
    return json.dumps(payload, ensure_ascii=False)


def _extract_json_payload(text: str) -> Any:
    cleaned = (text or "").strip()
    if not cleaned:
        return None
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.IGNORECASE).strip()
    cleaned = re.sub(r"\s*```$", "", cleaned).strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start >= 0 and end > start:
            try:
                return json.loads(cleaned[start:end + 1])
            except json.JSONDecodeError:
                return None
    return None


def _repair_local_quiz_answer(
    answer: str,
    generation_nonce: str,
    desired_count: int | None = None,
    topic: str = "Chapter Quiz",
    subject: str = "",
) -> str:
    parsed = _extract_json_payload(answer)
    if isinstance(parsed, dict) and isinstance(parsed.get("questions"), list):
        return json.dumps(parsed, ensure_ascii=False)
    return _format_local_quiz_items(
        _extract_local_quiz_items(answer),
        generation_nonce=generation_nonce,
        desired_count=desired_count,
        topic=topic,
        subject=subject,
    ) or answer


def _normalize_quiz_answer(
    answer: str,
    generation_nonce: str,
    desired_count: int | None = None,
    topic: str = "Chapter Quiz",
    subject: str = "",
) -> str:
    """Return the same quiz JSON shape for online and offline generations."""
    parsed = _extract_json_payload(answer)
    if not isinstance(parsed, dict) or not isinstance(parsed.get("questions"), list):
        return _repair_local_quiz_answer(
            answer,
            generation_nonce=generation_nonce,
            desired_count=desired_count,
            topic=topic,
            subject=subject,
        )

    normalized_questions: list[dict[str, Any]] = []
    limit = desired_count or len(parsed.get("questions") or [])
    for index, raw_question in enumerate((parsed.get("questions") or [])[:limit], start=1):
        if not isinstance(raw_question, dict):
            continue

        question_text = _clean_text(
            str(raw_question.get("question") or raw_question.get("prompt") or raw_question.get("stem") or "")
        )
        if not question_text:
            continue

        raw_options = raw_question.get("options") or {}
        if isinstance(raw_options, dict):
            options = [
                _clean_text(str(raw_options.get(letter) or ""))
                for letter in ("A", "B", "C", "D")
            ]
        elif isinstance(raw_options, list):
            options = [_clean_text(str(option)) for option in raw_options[:4]]
        else:
            options = []

        options = [option for option in options if option]
        if len(options) < 4:
            continue

        correct_answer = raw_question.get("correct_answer", raw_question.get("answer", ""))
        answer_index = None
        if isinstance(raw_question.get("answer_index"), int):
            answer_index = raw_question["answer_index"]
        elif isinstance(raw_question.get("correct_option"), int):
            correct_option_index = raw_question["correct_option"]
            answer_index = correct_option_index - 1 if 1 <= correct_option_index <= 4 else correct_option_index
        elif isinstance(correct_answer, str) and re.fullmatch(r"[A-D]", correct_answer.strip(), flags=re.IGNORECASE):
            answer_index = ord(correct_answer.strip().upper()) - ord("A")
        else:
            correct_text = _clean_text(str(raw_question.get("correct_option_text") or correct_answer))
            answer_index = next(
                (idx for idx, option in enumerate(options) if option.lower() == correct_text.lower()),
                0,
            )

        answer_index = max(0, min(3, int(answer_index or 0)))

        correct_letter = chr(ord("A") + answer_index)
        normalized_questions.append({
            "id": len(normalized_questions) + 1,
            "question": question_text,
            "options": {
                "A": options[0],
                "B": options[1],
                "C": options[2],
                "D": options[3],
            },
            "correct_answer": correct_letter,
            "correct_option_text": options[answer_index],
            "explanation": _clean_text(str(raw_question.get("explanation") or "")),
            "bloom_level": _clean_text(str(raw_question.get("bloom_level") or "Understand")),
            "difficulty": _clean_text(str(raw_question.get("difficulty") or parsed.get("difficulty") or "Medium")),
            "tags": raw_question.get("tags") if isinstance(raw_question.get("tags"), list) else [],
        })

    if not normalized_questions:
        return _repair_local_quiz_answer(
            answer,
            generation_nonce=generation_nonce,
            desired_count=desired_count,
            topic=topic,
            subject=subject,
        )

    payload = {
        "topic": _clean_text(str(parsed.get("topic") or parsed.get("quiz_title") or topic or "Chapter Quiz")),
        "subject": _clean_text(str(parsed.get("subject") or subject or "")),
        "difficulty": _clean_text(str(parsed.get("difficulty") or "Medium")),
        "total_questions": len(normalized_questions),
        "questions": normalized_questions,
    }
    return json.dumps(payload, ensure_ascii=False)


def _extract_definition_candidates(paragraphs: list[str], headings: list[tuple[str, str]]) -> list[dict[str, str]]:
    candidates: list[dict[str, str]] = []
    seen = set()

    for paragraph in paragraphs:
        normalized = _clean_text(paragraph)
        patterns = [
            re.match(r"^(?:The\s+)?([A-Z][A-Za-z0-9()\/\-\s]{2,60}?)\s+is\s+(.+)$", normalized),
            re.match(r"^(?:The\s+)?([A-Z][A-Za-z0-9()\/\-\s]{2,60}?)\s+refers\s+to\s+(.+)$", normalized),
            re.match(r"^(?:The\s+)?([A-Z][A-Za-z0-9()\/\-\s]{2,60}?)\s+consists\s+of\s+(.+)$", normalized),
        ]
        for match in patterns:
            if not match:
                continue
            term = _clean_quiz_term(match.group(1))
            definition = _compact_quiz_option(match.group(2))
            if len(term) < 3 or len(definition) < 20:
                continue
            signature = term.lower()
            if signature in seen:
                continue
            seen.add(signature)
            candidates.append({"term": term, "definition": definition})
            break

    if len(candidates) >= 10:
        return candidates

    for _, heading in headings:
        if heading.lower().startswith("page ") or "exercise" in heading.lower():
            continue
        related = next((paragraph for paragraph in paragraphs if heading.lower() in paragraph.lower()), None)
        if not related:
            continue
        signature = heading.lower()
        if signature in seen:
            continue
        seen.add(signature)
        term = _clean_quiz_term(heading)
        definition = _compact_quiz_option(related)
        if not term or len(definition) < 20:
            continue
        candidates.append({"term": term, "definition": definition})
        if len(candidates) >= 12:
            break

    return candidates


def _build_offline_quiz_answer(
    request: StudioGenerateRequest,
    soup: BeautifulSoup | None,
    generation_nonce: str,
    desired_count: int | None = None,
) -> str:
    paragraphs, headings, _bullets = _non_exercise_blocks(soup)
    candidates = _extract_definition_candidates(paragraphs, headings)
    if len(candidates) < 4:
        return ""

    candidates = [
        {**item, "term": _short_quiz_option(item.get("term", ""))}
        for item in candidates
        if _short_quiz_option(item.get("term", ""))
    ]
    candidates = [
        item for item in candidates
        if 1 <= len(item["term"].split()) <= 3 and len(_quiz_clue(item.get("definition", ""))) >= 8
    ]
    if len(candidates) < 4:
        return ""

    count = min(max(desired_count or 10, 10), 15, len(candidates))
    return _format_local_quiz_items(
        candidates,
        generation_nonce=generation_nonce,
        desired_count=count,
        topic=request.chapter,
        subject=request.subject,
    )


def _extract_exercise_from_soup(soup: BeautifulSoup | None) -> dict[str, list[dict[str, Any]]]:
    if not soup:
        return {"mcqs": [], "short_questions": [], "long_questions": []}

    exercise = {"mcqs": [], "short_questions": [], "long_questions": []}
    for item in soup.select(".mcq-item"):
        question = _clean_text(item.select_one(".question").get_text(" ", strip=True) if item.select_one(".question") else "")
        options = [_clean_text(li.get_text(" ", strip=True)) for li in item.select("ol.options > li")]
        if question:
            question_with_options = question
            if options:
                question_with_options += " Options: " + " | ".join(
                    f"{chr(65 + idx)}) {option}" for idx, option in enumerate(options[:4])
                )
            exercise["mcqs"].append({"question_no": str(len(exercise["mcqs"]) + 1), "question": question_with_options, "options": options[:4]})

    for selector, key in [("li.sq-item", "short_questions"), ("li.lq-item", "long_questions")]:
        for index, item in enumerate(soup.select(selector), start=1):
            question = _clean_text(item.get_text(" ", strip=True))
            if question:
                exercise[key].append({"question_no": str(index), "question": question})

    return exercise


def _rotated_values(values: list[Any], start: int) -> list[Any]:
    if not values:
        return []
    offset = start % len(values)
    return values[offset:] + values[:offset]


def _build_offline_summary_answer(
    request: StudioGenerateRequest,
    soup: BeautifulSoup | None,
    generation_nonce: str | None = None,
    variant_index: int = 0,
) -> str:
    paragraphs, headings, bullets = _non_exercise_blocks(soup)
    title = _extract_chapter_title_from_soup(soup, request.chapter)
    rng = random.Random(generation_nonce or f"{request.chapter}-{variant_index}")
    paragraph_offset = variant_index * 2
    heading_offset = variant_index
    bullet_offset = variant_index * 3
    rotated_paragraphs = _rotated_values(paragraphs, paragraph_offset)
    rotated_headings = _rotated_values([heading for _, heading in headings if heading], heading_offset)
    rotated_bullets = _rotated_values(bullets, bullet_offset)
    important_terms = _extract_definition_candidates(paragraphs, headings)
    rng.shuffle(important_terms)

    overview = " ".join(rotated_paragraphs[:3])[:1200]
    key_concepts = rotated_headings[:8]
    exam_takeaways = rotated_bullets[:8] or key_concepts[:8]
    detailed = " ".join(rotated_paragraphs[3:8])[:1800] or overview

    lines = [
        f"**{title}**",
        "",
        "**Overview**",
        overview or f"Summary generated directly from chapter content for {request.chapter}.",
        "",
        "**Detailed Summary**",
        detailed,
        "",
        "**Key Points**",
    ]
    lines.extend(f"- {item}" for item in exam_takeaways[:8])
    lines.extend(["", "**Key Concepts**"])
    lines.extend(f"- {item}" for item in key_concepts[:8])
    if important_terms:
        lines.extend(["", "**Important Terms**"])
        lines.extend(f"- {item['term']}: {item['definition']}" for item in important_terms[:6])
    return "\n".join(lines).strip()


def _build_studio_variants(request: StudioGenerateRequest, task_name: str) -> list[str]:
    soup = _load_chapter_soup(
        board=request.board,
        class_level=request.class_level,
        subject=request.subject,
        chapter=request.chapter,
    )
    variants: list[str] = []
    for index in range(_studio_variant_count(task_name)):
        generation_nonce = f"{task_name}-{request.board}-{request.class_level}-{request.subject}-{request.chapter}-{index}"
        if task_name == "quiz":
            answer = _build_offline_quiz_answer(
                request=request,
                soup=soup,
                generation_nonce=generation_nonce,
                desired_count=STUDIO_QUIZ_QUESTION_COUNT,
            )
        elif task_name == "summary":
            answer = _build_offline_summary_answer(
                request=request,
                soup=soup,
                generation_nonce=generation_nonce,
                variant_index=index,
            )
        elif task_name == "exercise":
            answer = _build_offline_exercise_answer(
                request=request,
                soup=soup,
                generation_nonce=generation_nonce,
                variant_index=index,
            )
        else:
            answer = ""

        if answer and answer not in variants:
            variants.append(answer)

    return variants


def _get_cached_studio_variant(request: StudioGenerateRequest, task_name: str) -> tuple[str, str | None]:
    if task_name not in {"quiz", "summary", "exercise"}:
        return "", None

    cache = _read_studio_variants_cache()
    items = cache.setdefault("items", {})
    cache_key = _studio_variant_cache_key(request, task_name)
    entry = items.get(cache_key)
    target_variant_count = _studio_variant_count(task_name)

    if not isinstance(entry, dict) or not (entry.get("variants") or []):
        variants = _build_studio_variants(request, task_name)
        if not variants:
            return "", None
        entry = {
            "cursor": random.SystemRandom().randint(0, max(0, len(variants[:target_variant_count]) - 1)),
            "created_at": datetime.utcnow().isoformat(),
            "variants": variants[:target_variant_count],
        }
        items[cache_key] = entry
        _write_studio_variants_cache(cache)

    variants = [variant for variant in (entry.get("variants") or []) if isinstance(variant, str) and variant.strip()]
    if not variants:
        return "", None

    cursor = int(entry.get("cursor") or 0) % len(variants)
    answer = variants[cursor]
    entry["cursor"] = (cursor + 1) % len(variants)
    entry["last_used_at"] = datetime.utcnow().isoformat()
    items[cache_key] = entry
    _write_studio_variants_cache(cache)
    provider = "local-fast" if _is_local_mode_requested(request.llm_mode_override) else "cloud"
    return answer, provider


def _build_offline_exercise_answer(
    request: StudioGenerateRequest,
    soup: BeautifulSoup | None,
    generation_nonce: str | None = None,
    variant_index: int = 0,
) -> str:
    paragraphs, _headings, _bullets = _non_exercise_blocks(soup)
    exercise = _extract_exercise_from_soup(soup)
    if not (exercise["mcqs"] or exercise["short_questions"] or exercise["long_questions"]):
        return ""
    rng = random.Random(generation_nonce or f"{request.chapter}-exercise-{variant_index}")
    variant_styles = [
        {
            "answer": "Answer",
            "points": "Key Points",
            "overview": "Chapter-end exercise solutions only.",
        },
        {
            "answer": "Book-Based Answer",
            "points": "Exam Points",
            "overview": "Solved from the chapter exercise section only.",
        },
        {
            "answer": "Solution",
            "points": "Important Lines",
            "overview": "Concise exercise answers grounded in the selected chapter.",
        },
    ]
    style = variant_styles[variant_index % len(variant_styles)]

    def three_line_answer(text: str, fallback_points: list[str]) -> str:
        source = _clean_text(text)
        if not source:
            source = " ".join(fallback_points)
        sentences = [
            sentence.strip()
            for sentence in re.split(r"(?<=[.!?])\s+", source)
            if sentence.strip()
        ]
        lines = sentences[:3] if sentences else [source]
        while len(lines) < 3 and fallback_points:
            next_point = _clean_text(fallback_points[len(lines) - 1] if len(fallback_points) >= len(lines) else fallback_points[0])
            if next_point and next_point not in lines:
                lines.append(next_point)
            else:
                break
        return "\n".join(lines[:3]).strip()

    def build_items(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
        built: list[dict[str, Any]] = []
        for item in items:
            question = item.get("question", "")
            references = _match_reference_paragraphs(question, paragraphs, limit=3)
            if references and variant_index:
                references = _rotated_values(references, variant_index)
            answer = " ".join(references[:1]).strip()
            if item.get("options"):
                best_option = _choose_best_option(question, item["options"], references)
                if best_option:
                    option_index = item["options"].index(best_option) if best_option in item["options"] else 0
                    answer = f"{chr(65 + option_index)}) {best_option}"

            key_points = references[:2]
            if variant_index == 2 and len(references) > 1:
                key_points = list(reversed(key_points))
            rng.shuffle(key_points)

            built.append({
                "question_no": item.get("question_no", str(len(built) + 1)),
                "question": question,
                "answer": answer or "Relevant answer could not be derived confidently from the chapter text alone.",
                "key_points": key_points,
            })
        return built

    lines = [
        f"**{request.chapter} Exercise Solutions**",
        style["overview"],
        "",
        "**Multiple Choice Questions**",
    ]

    for item in build_items(exercise["mcqs"]):
        lines.extend([
            f"**Q{item['question_no']}.** {item['question']}",
            f"**{style['answer']}:** {item['answer']}",
        ])
        lines.append("")

    lines.append("**Short Questions**")
    for item in build_items(exercise["short_questions"]):
        lines.extend([
            f"**Q{item['question_no']}.** {item['question']}",
            f"**{style['answer']}:**",
            three_line_answer(item["answer"], item["key_points"]),
        ])
        lines.append("")

    lines.append("**Long Questions**")
    for item in build_items(exercise["long_questions"]):
        lines.extend([
            f"**Q{item['question_no']}.** {item['question']}",
            f"**{style['answer']}:**",
            three_line_answer(item["answer"], item["key_points"]),
        ])
        if item["key_points"]:
            lines.append(f"**{style['points']}:**")
            lines.extend(f"- {point}" for point in item["key_points"])
        lines.append("")

    return "\n".join(lines).strip()


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
            "- Return only valid JSON, no markdown, no code blocks, no commentary.\n"
            "- Use exactly the JSON schema required by the system prompt.\n"
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
    chapter_text: str,
    generation_nonce: str,
) -> tuple[str, str | None]:
    soup = _load_chapter_soup(
        board=request.board,
        class_level=request.class_level,
        subject=request.subject,
        chapter=request.chapter,
    )

    if task_name == "quiz":
        answer = _build_offline_quiz_answer(
            request=request,
            soup=soup,
            generation_nonce=generation_nonce,
        )
        if answer:
            return answer, "offline"
    elif task_name == "summary":
        answer = _build_offline_summary_answer(request=request, soup=soup)
        if answer:
            return answer, "offline"
    elif task_name == "exercise":
        answer = _build_offline_exercise_answer(request=request, soup=soup)
        if answer:
            return answer, "offline"

    is_local_mode = _is_local_mode_requested(request.llm_mode_override)
    system_prompt = (
        LOCAL_QUIZ_SYSTEM_PROMPT if task_name == "quiz" and is_local_mode
        else QUIZ_SYSTEM_PROMPT if task_name == "quiz"
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
        llm_mode_override=request.llm_mode_override,
    )
    answer = result.get("answer", "")
    if task_name == "quiz" and is_local_mode:
        answer = _normalize_quiz_answer(
            answer,
            generation_nonce=generation_nonce,
            topic=request.chapter,
            subject=request.subject,
        )
    return answer, result.get("llm_provider")


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
            "- Return only valid JSON, no markdown, no code blocks, no commentary.\n"
            "- Use exactly the JSON schema required by the system prompt.\n"
            "- Do not use generic options like Option 1, all of the above, or none of the above.\n"
            "- Use exactly four options A, B, C, D per question.\n"
            "- Keep every question to one sentence and every option short, ideally 1 to 6 words.\n"
            "- Use the same compact MCQ style as the offline quiz: direct question, four short options, clear correct answer.\n"
            "- Include correct_answer, correct_option_text, explanation, bloom_level, difficulty, and tags for every question.\n"
            "- total_questions must equal questions.length."
        )

    if normalized_task == "summary":
        return (
            f"Write a clean structured summary for chapter '{chapter}'.\n"
            f"Nonce: {generation_nonce}.\n\n"
            "RULES:\n"
            "- Use only the provided textbook context.\n"
            "- Output clean markdown-style text only, never JSON.\n"
            "- Use exactly these section headings in this order:\n"
            "  **Overview**\n"
            "  **Detailed Summary**\n"
            "  **Key Points**\n"
            "  **Key Concepts**\n"
            "- Overview must be one short paragraph of 2 to 4 sentences.\n"
            "- Detailed Summary must contain 3 to 5 paragraphs with a blank line between paragraphs.\n"
            "- Key Points must be bullet points only.\n"
            "- Each key point should be a short important point or short definition, not a long paragraph.\n"
            "- Key Concepts must be bullet points of important terms or concepts only.\n"
            "- Do not use numbered textbook headings as standalone headings like 2.3 or 6.2.1.\n"
            "- Do not use emojis or markdown separators.\n"
            "- Keep all wording exam-focused and traceable to the context."
        )

    if normalized_task == "exercise":
        return (
            f"Write chapter-end exercise solutions for chapter '{chapter}'.\n"
            f"Nonce: {generation_nonce}.\n\n"
            "RULES:\n"
            "- Use only the provided textbook context.\n"
            "- Solve only the exercise given at the end of the chapter.\n"
            "- Treat the provided context as exercise-only retrieval, not whole-chapter notes.\n"
            "- Search for and solve only questions found under headings like EXERCISE, Multiple Choice Questions, Short Questions, Long Questions, Numerical Problems, or similar end-of-chapter exercise sections.\n"
            "- Do not invent extra questions. Do not answer random chapter paragraphs that are not part of the exercise.\n"
            "- List every visible MCQ, short question, long question, and numerical from the retrieved exercise context.\n"
            "- You may improve clarity, but every answer must stay grounded in book concepts.\n"
            "- For numericals, show every step.\n"
            "- Output clean markdown-style text only, never JSON.\n"
            "- Use these exact section headings in this order:\n"
            "  **Multiple Choice Questions**\n"
            "  **Short Questions**\n"
            "  **Long Questions**\n"
            "  **Numerical Problems**\n"
            "- For MCQs include only the correct option after the question. Do not include Explanation, Key Points, Why, or Reason for MCQs.\n"
            "- For short questions write exactly 3 concise lines. Do not add key points under short questions.\n"
            "- For long questions write exactly 3 concise lines, then add Key Points.\n"
            "- Format each item like this:\n"
            "  **Q1.** [Question text]\n"
            "  **Answer:** [Answer text]\n"
            "  **Key Points:** [Only for long questions]\n"
            "- Do not add emojis, separators, or unrelated commentary."
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
        quiz_count = STUDIO_QUIZ_QUESTION_COUNT if task_name == "quiz" else None

        cached_answer, cached_provider = _get_cached_studio_variant(request, task_name)
        if cached_answer:
            return StudioGenerateResponse(
                answer=cached_answer,
                task=request.task,
                llm_provider=cached_provider,
            )

        if task_name == "quiz" and _is_local_mode_requested(request.llm_mode_override):
            soup = _load_chapter_soup(
                board=request.board,
                class_level=request.class_level,
                subject=request.subject,
                chapter=request.chapter,
            )
            offline_quiz = _build_offline_quiz_answer(
                request=request,
                soup=soup,
                generation_nonce=generation_nonce,
                desired_count=quiz_count,
            )
            if offline_quiz:
                return StudioGenerateResponse(
                    answer=offline_quiz,
                    task=request.task,
                    llm_provider="local-fast",
                )

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
        system_prompt, temperature, top_p, max_tokens, context_budgets = _studio_generation_settings(
            task_name=task_name,
            is_local_mode=_is_local_mode_requested(request.llm_mode_override),
        )

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
                    mode_override=request.llm_mode_override,
                )

                if llm_provider != "error" and (answer or "").strip():
                    if task_name == "quiz":
                        answer = _normalize_quiz_answer(
                            answer,
                            generation_nonce=generation_nonce,
                            desired_count=quiz_count,
                            topic=request.chapter,
                            subject=request.subject,
                        )
                    break

            if llm_provider == "error" or not (answer or "").strip():
                answer, llm_provider = _fallback_studio_generation(
                    request,
                    prompt,
                    task_name,
                    chapter_text,
                    generation_nonce,
                )
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


@router.get("/runtime", response_model=ChatRuntimeResponse)
def get_chat_runtime():
    return ChatRuntimeResponse(**get_llm_runtime_status())


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
        auth_user = current_user
        chat: Chat | None = None

        conversational_reply = maybe_build_conversational_reply(
            question=request.question,
            board=request.board,
            class_level=request.class_level,
            subject=request.subject,
            language=request.language,
        )
        if conversational_reply:
            chat_id = request.chat_id
            if auth_user and request.save_to_chat:
                if request.chat_id is not None:
                    chat = _get_owned_chat(request.chat_id, auth_user.id, db)
                else:
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
                        content=conversational_reply,
                        chapter=request.chapter,
                        sources=[],
                    ),
                ])
                db.commit()
                chat_id = chat.id

            return ChatResponse(
                answer=conversational_reply,
                sources=[],
                chat_id=chat_id,
                llm_provider="rule-based",
            )

        chat_history_text = ""
        session_system_prompt = None

        if auth_user and request.chat_id is not None:
            chat = _get_owned_chat(request.chat_id, auth_user.id, db)
            history_stmt = select(Message).where(Message.chat_id == chat.id)
            if request.chapter:
                history_stmt = history_stmt.where(Message.chapter == request.chapter)
            history_stmt = history_stmt.order_by(desc(Message.created_at)).limit(8)
            recent_messages = list(reversed(db.scalars(history_stmt).all()))
            chat_history_text = _build_chat_history_text(recent_messages, limit=4)
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
            llm_mode_override=request.llm_mode_override,
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

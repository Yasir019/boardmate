"""LLM service using LangChain with the Groq API."""

import json
import logging
import re
from urllib import error as urlerror
from urllib import request as urlrequest
from functools import lru_cache

from langchain_core.prompts import ChatPromptTemplate
from langchain_groq import ChatGroq

from app.core.config import (
    GROQ_API_KEY,
    GROQ_MODEL,
    LLM_MODE,
    LOCAL_LLM_BASE_URL,
    LOCAL_LLM_MODEL,
    LOCAL_LLM_TIMEOUT_SECONDS,
)

logger = logging.getLogger(__name__)

LOCAL_LLM_UNAVAILABLE_MESSAGE = (
    "AI assistant is temporarily unavailable because the local model server is not running. "
    "Please start your local LLM server (for example Ollama) or switch to cloud mode."
)

CLOUD_LLM_UNAVAILABLE_MESSAGE = (
    "AI assistant is temporarily unavailable right now. Please try again in a moment."
)

SYSTEM_PROMPT = (
    "You are BoardMate, an AI educational assistant for Pakistani board students "
    "(Sindh, Punjab, Federal, KPK, Balochistan boards).\n\n"
    "Your role:\n"
    "- Use the provided textbook context as your primary source for academic answers\n"
    "- Explain concepts clearly and simply\n"
    "- Help with exercises and numerical problems\n"
    "- Reply naturally to simple greetings or app-help requests without forcing textbook citations\n"
    "- If the textbook context is weak or missing for a study question, say that clearly and offer the next best helpful step\n\n"
    "Guidelines:\n"
    "- Be accurate and educational\n"
    "- Use simple language suitable for 9th-12th grade students\n"
    "- Include formulas when relevant\n"
    "- Give step-by-step explanations for problems\n"
    "- Cite which chapter/topic the information comes from when possible\n"
    "- Respond in the student's requested language when specified\n"
    "- Never write Roman Urdu. If Urdu is requested, use Urdu script only\n"
    "- Adapt structure to the question:\n"
    "  - Use bullet points for lists, key facts, and summaries\n"
    "  - Use numbered steps for procedures and problem-solving\n"
    "  - Use short explanatory paragraphs for concept-building\n"
    "- Use markdown formatting for readability\n"
    "- Add at most 1-2 meaningful emojis when they improve clarity (not in every line)\n"
    "- End with a short helpful next-step prompt when appropriate\n"
    "- Avoid generic filler. Be specific, practical, and exam-focused\n"
    "- For direct definition-type questions, keep the answer concise first, then add key points"
)

QUIZ_SYSTEM_PROMPT = """
You are BoardMate Quiz Generator for Pakistani board students.

Your task is to generate high-quality MCQs from textbook context.

Rules:
- Generate unique MCQs based on concepts from the chapter, not only by copying end-of-chapter exercises.
- Use your understanding of the chapter to create fresh questions.
- Questions must remain faithful to the textbook context.
- Avoid repeating the same wording across quiz attempts.
- Prioritize conceptual understanding, definitions, applications, comparisons, and reasoning.
- Each MCQ must have exactly 4 options.
- Only one option must be clearly correct.
- Wrong options should be plausible but incorrect.
- Keep questions suitable for board students.
- Use simple, clear language.
- Do not generate trick questions.
- Avoid duplicate questions within the same quiz.
- Avoid questions whose answer is directly revealed in the wording.
- If the context is too weak, return fewer but better questions instead of guessing.

Output format:
Return ONLY valid JSON in this exact schema:

{
    "quiz_title": "string",
    "variant_id": "string",
    "questions": [
        {
            "question": "string",
            "options": ["string", "string", "string", "string"],
            "answer_index": 0,
            "explanation": "string"
        }
    ]
}

Rules for formatting:
- Output must be JSON only, no markdown/prose outside JSON.
- Generate between 15 and 20 questions as requested by the prompt unless context is too weak.
- Keep each question clear, readable, and exam-focused.
- answer_index must be 0..3 and match the correct option.
- Do not split sentences awkwardly.
"""

EXERCISE_SYSTEM_PROMPT = """
You are BoardMate Exercise Solution Generator for Pakistani board students.

Your task is to provide accurate, chapter-specific exercise solutions.

Rules:
- Use only the provided chapter context.
- Provide complete answers, not hints.
- Keep language simple, clear, and exam-oriented.
- For numerical questions, include method steps and final answer.
- For theory questions, provide concise but complete board-style responses.
- Avoid unnecessary filler text.
- Avoid Roman Urdu.

Output format:
Return ONLY valid JSON using the schema requested in the user prompt.
Do not include markdown, headings, or prose outside JSON.
"""

PROMPT_TEMPLATE = ChatPromptTemplate.from_messages([
    ("system", SYSTEM_PROMPT),
    ("user", (
        "Context from textbook:\n---\n{context}\n---\n\n"
        "Student Question: {question}\n\n"
        "Use the context above when it is relevant. "
        "If this is just a greeting or simple conversational message, respond naturally. "
        "If the context doesn't contain relevant academic information, say that clearly and guide the student on what to ask next."
    )),
])

GREETING_PATTERNS = (
    r"hi",
    r"hello",
    r"hey",
    r"hy",
    r"salam",
    r"assalam(?:u alaikum| o alaikum|ualaikum)?",
    r"aoa",
    r"good morning",
    r"good afternoon",
    r"good evening",
)
THANKS_PATTERNS = (
    r"thanks",
    r"thank you",
    r"thx",
    r"jazakallah(?: khair)?",
    r"shukriya",
)
HELP_PATTERNS = (
    r"help",
    r"what can you do",
    r"how can you help",
    r"can you help me",
)
IDENTITY_PATTERNS = (
    r"who are you",
    r"what are you",
    r"tell me about yourself",
)
STATUS_PATTERNS = (
    r"how are you",
    r"how r u",
)
FAREWELL_PATTERNS = (
    r"bye",
    r"goodbye",
    r"allah hafiz",
    r"see you",
)

CONCISE_INTENT_PATTERNS = (
    r"what is .+",
    r"define .+",
    r"meaning of .+",
    r"who is .+",
)

STEPWISE_INTENT_PATTERNS = (
    r"how to .+",
    r"steps? .+",
    r"process .+",
    r"solve .+",
    r"calculate .+",
    r"find .+",
    r"numerical .+",
)

COMPARE_INTENT_PATTERNS = (
    r"difference between .+",
    r"compare .+",
    r".+ vs .+",
)


def _normalize_message(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").strip().lower())


def _matches_any_pattern(message: str, patterns: tuple[str, ...]) -> bool:
    return any(re.fullmatch(rf"(?:{pattern})[!.? ]*", message) for pattern in patterns)


def _study_scope(board: str = None, class_level: str = None, subject: str = None) -> str:
    parts = [part for part in [board, class_level, subject] if part]
    return " / ".join(parts) if parts else "your selected subject"


def maybe_build_conversational_reply(
    question: str,
    board: str = None,
    class_level: str = None,
    subject: str = None,
    language: str = "en",
) -> str | None:
    """Return a natural response for greetings and small talk in English."""
    message = _normalize_message(question)
    if not message:
        return None

    scope = _study_scope(board, class_level, subject)

    if _matches_any_pattern(message, GREETING_PATTERNS):
        return f"Hi! I'm BoardMate 👋. I can help with {scope}. Send your topic or question."

    if _matches_any_pattern(message, STATUS_PATTERNS):
        return "I'm doing great and ready to help. Share your topic, chapter, or question."

    if _matches_any_pattern(message, THANKS_PATTERNS):
        return "You're welcome! Send the next question whenever you're ready."

    if _matches_any_pattern(message, HELP_PATTERNS) or _matches_any_pattern(message, IDENTITY_PATTERNS):
        return (
            f"I'm BoardMate. I help with {scope}: explanations, summaries, formulas, and step-by-step solutions."
        )

    if _matches_any_pattern(message, FAREWELL_PATTERNS):
        return "See you soon! Come back anytime and we'll continue your study session."

    return None


def _infer_response_style(question: str) -> str:
    message = _normalize_message(question)
    if _matches_any_pattern(message, COMPARE_INTENT_PATTERNS):
        return "comparison-bullets"
    if _matches_any_pattern(message, STEPWISE_INTENT_PATTERNS):
        return "numbered-steps"
    if _matches_any_pattern(message, CONCISE_INTENT_PATTERNS):
        return "concise-then-key-points"
    return "explain-clearly"


def build_missing_context_response(
    board: str = None,
    class_level: str = None,
    subject: str = None,
    chapter: str = None,
    language: str = "en",
) -> str:
    """Return a helpful fallback when textbook evidence is missing (English only)."""
    scope = _study_scope(board, class_level, subject)
    chapter_hint = f" in {chapter}" if chapter else ""

    return (
        f"I couldn't find a clear match for that in the selected {scope} textbook{chapter_hint}. "
        "Try rephrasing the question, switching to the relevant chapter, or ask me for a concept explanation, "
        "summary, formula, or step-by-step solution."
    )


def _build_enhanced_question(
    question: str,
    board: str = None,
    class_level: str = None,
    language: str = "en",
) -> str:
    language_map = {
        "en": "English",
        "ur": "Urdu (Urdu script only, never Roman Urdu)",
    }
    requested_language = language_map.get((language or "en").lower(), "English")
    response_style = _infer_response_style(question)

    context_prefix = []
    if board or class_level:
        context_prefix.append(
            f"[Board: {board or 'Any'}, Class: {class_level or 'Any'}]"
        )
    context_prefix.append(f"[Respond in: {requested_language}]")
    context_prefix.append(f"[Response style: {response_style}]")
    context_prefix.append("[Quality: clear, exam-focused, avoid generic text]")

    return "\n".join(context_prefix) + f"\n\n{question}"


def _build_prompt_template(system_prompt: str) -> ChatPromptTemplate:
    return ChatPromptTemplate.from_messages([
        ("system", system_prompt),
        ("user", (
            "Context from textbook:\n---\n{context}\n---\n\n"
            "Student Question: {question}\n\n"
            "Use the context above when it is relevant. "
            "If this is just a greeting or simple conversational message, respond naturally. "
            "If the context doesn't contain relevant academic information, say that clearly and guide the student on what to ask next."
        )),
    ])


def _generate_cloud_response(
    question: str,
    context: str,
    system_prompt: str | None = None,
    temperature: float | None = None,
    max_tokens: int | None = None,
) -> str:
    prompt_template = PROMPT_TEMPLATE if not system_prompt else _build_prompt_template(system_prompt)
    if temperature is None and max_tokens is None:
        llm = get_llm()
    else:
        llm = ChatGroq(
            api_key=GROQ_API_KEY,
            model_name=GROQ_MODEL,
            temperature=temperature if temperature is not None else 0.3,
            max_tokens=max_tokens if max_tokens is not None else 1024,
        )

    chain = prompt_template | llm
    try:
        response = chain.invoke({
            "context": context,
            "question": question,
        })
        return response.content
    except Exception as e:
        if "client has been closed" not in str(e).lower():
            raise

        logger.warning("Cloud LLM client was closed, refreshing cached client and retrying once")
        get_llm.cache_clear()
        retry_chain = prompt_template | get_llm()
        response = retry_chain.invoke({
            "context": context,
            "question": question,
        })
        return response.content


def _build_local_prompt(context: str, question: str, system_prompt: str | None = None) -> str:
    prompt_system = system_prompt or SYSTEM_PROMPT
    return (
        f"{prompt_system}\n\n"
        f"Context from textbook:\n---\n{context}\n---\n\n"
        f"Student Question: {question}\n\n"
        "Use the context above when it is relevant. "
        "If this is just a greeting or simple conversational message, respond naturally. "
        "If the context doesn't contain relevant academic information, say that clearly and guide the student on what to ask next."
    )


def _generate_local_response(
    question: str,
    context: str,
    system_prompt: str | None = None,
    temperature: float | None = None,
    top_p: float | None = None,
    max_tokens: int | None = None,
) -> str:
    endpoint = f"{LOCAL_LLM_BASE_URL.rstrip('/')}/api/generate"
    payload = {
        "model": LOCAL_LLM_MODEL,
        "prompt": _build_local_prompt(context=context, question=question, system_prompt=system_prompt),
        "stream": False,
        "options": {
            "temperature": temperature if temperature is not None else 0.3,
            "top_p": top_p if top_p is not None else 0.9,
            "repeat_penalty": 1.1,
            "num_predict": max_tokens if max_tokens is not None else 1024,
        },
    }

    req = urlrequest.Request(
        endpoint,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urlrequest.urlopen(req, timeout=LOCAL_LLM_TIMEOUT_SECONDS) as response:
            data = json.loads(response.read().decode("utf-8"))
    except urlerror.URLError as e:
        raise RuntimeError(f"Local LLM request failed: {e}") from e

    answer = (data.get("response") or "").strip()
    if not answer:
        raise RuntimeError("Local LLM returned an empty response")
    return answer


def _is_local_connection_refused(error: Exception) -> bool:
    msg = str(error).lower()
    return (
        "local llm request failed" in msg
        and (
            "10061" in msg
            or "connection refused" in msg
            or "actively refused" in msg
        )
    )


def generate_response_with_provider(
    question: str,
    context: str,
    board: str = None,
    class_level: str = None,
    language: str = "en",
    system_prompt: str | None = None,
    temperature: float | None = None,
    top_p: float | None = None,
    max_tokens: int | None = None,
) -> tuple[str, str]:
    """Generate response and include the provider used (cloud or local)."""
    enhanced_question = _build_enhanced_question(
        question=question,
        board=board,
        class_level=class_level,
        language=language,
    )
    mode = (LLM_MODE or "auto").strip().lower()

    if mode == "cloud":
        try:
            return _generate_cloud_response(
                enhanced_question,
                context,
                system_prompt=system_prompt,
                temperature=temperature,
                max_tokens=max_tokens,
            ), "cloud"
        except Exception as cloud_error:
            logger.error("Cloud LLM error in cloud mode: %s", cloud_error)
            try:
                return _generate_local_response(
                    enhanced_question,
                    context,
                    system_prompt=system_prompt,
                    temperature=temperature,
                    top_p=top_p,
                    max_tokens=max_tokens,
                ), "local"
            except Exception as local_error:
                logger.error("Local fallback failed after cloud-mode error: %s", local_error)
                if _is_local_connection_refused(local_error):
                    return LOCAL_LLM_UNAVAILABLE_MESSAGE, "error"
                return CLOUD_LLM_UNAVAILABLE_MESSAGE, "error"

    if mode == "local":
        try:
            return _generate_local_response(
                enhanced_question,
                context,
                system_prompt=system_prompt,
                temperature=temperature,
                top_p=top_p,
                max_tokens=max_tokens,
            ), "local"
        except Exception as local_error:
            logger.error("Local LLM error in local mode: %s", local_error)
            if GROQ_API_KEY:
                try:
                    return _generate_cloud_response(
                        enhanced_question,
                        context,
                        system_prompt=system_prompt,
                        temperature=temperature,
                        max_tokens=max_tokens,
                    ), "cloud"
                except Exception as cloud_error:
                    logger.error("Cloud fallback failed after local-mode error: %s", cloud_error)

            if _is_local_connection_refused(local_error):
                return LOCAL_LLM_UNAVAILABLE_MESSAGE, "error"
            return CLOUD_LLM_UNAVAILABLE_MESSAGE, "error"

    # auto mode: prefer cloud if configured, otherwise local.
    if GROQ_API_KEY:
        try:
            return _generate_cloud_response(
                enhanced_question,
                context,
                system_prompt=system_prompt,
                temperature=temperature,
                max_tokens=max_tokens,
            ), "cloud"
        except Exception as cloud_error:
            logger.warning("Cloud LLM failed in auto mode, falling back to local: %s", cloud_error)

    try:
        return _generate_local_response(
            enhanced_question,
            context,
            system_prompt=system_prompt,
            temperature=temperature,
            top_p=top_p,
            max_tokens=max_tokens,
        ), "local"
    except Exception as local_error:
        logger.error("Local LLM failed in auto mode: %s", local_error)
        if _is_local_connection_refused(local_error):
            if GROQ_API_KEY:
                try:
                    return _generate_cloud_response(
                        enhanced_question,
                        context,
                        system_prompt=system_prompt,
                        temperature=temperature,
                        max_tokens=max_tokens,
                    ), "cloud"
                except Exception as cloud_error:
                    logger.error("Cloud retry after local failure also failed: %s", cloud_error)
            return LOCAL_LLM_UNAVAILABLE_MESSAGE, "error"

        return CLOUD_LLM_UNAVAILABLE_MESSAGE, "error"


@lru_cache(maxsize=1)
def get_llm() -> ChatGroq:
    """Return the configured LangChain LLM instance."""
    if not GROQ_API_KEY:
        raise RuntimeError("GROQ_API_KEY is not configured")

    return ChatGroq(
        api_key=GROQ_API_KEY,
        model_name=GROQ_MODEL,
        temperature=0.3,
        max_tokens=1024,
    )


def generate_response(
    question: str,
    context: str,
    board: str = None,
    class_level: str = None,
    language: str = "en",
) -> str:
    """
    Generate a response using LangChain with the Groq LLM.

    Args:
        question: Student's question.
        context: Retrieved context from the vector store.
        board: Optional board name.
        class_level: Optional class level.

    Returns:
        The generated answer string.
    """
    answer, _provider = generate_response_with_provider(
        question=question,
        context=context,
        board=board,
        class_level=class_level,
        language=language,
    )
    return answer


def test_connection() -> bool:
    """Test whether the Groq API connection works."""
    try:
        response = get_llm().invoke("Say 'BoardMate is ready!' in one line.")
        logger.info("Groq test: %s", response.content)
        return True
    except Exception as e:
        logger.error("Groq connection failed: %s", e)
        return False


if __name__ == "__main__":
    test_connection()

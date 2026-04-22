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

# How long (seconds) to wait when probing internet connectivity.
_INTERNET_PROBE_TIMEOUT = 3


def _is_internet_available() -> bool:
    """Return True if we can reach the Groq API endpoint, False otherwise."""
    try:
        req = urlrequest.Request(
            "https://api.groq.com",
            headers={"User-Agent": "BoardMate/1.0"},
            method="HEAD",
        )
        with urlrequest.urlopen(req, timeout=_INTERNET_PROBE_TIMEOUT):
            return True
    except Exception:
        return False

SESSION_MEMORY_SYSTEM_PROMPT = """
You are BoardMate, an AI educational assistant for Pakistani board students.

MEMORY INSTRUCTIONS:
You have a conversation history with the student. Use this context to maintain continuity throughout the conversation.

When answering follow-up questions:
- Reference earlier discussion if relevant (e.g., "As we discussed earlier...")
- Maintain consistency with previous answers
- Don't ask for information the student already provided
- Build on previous explanations when appropriate

IMPORTANT: Remember the chapter, topic, and context being discussed. A student's follow-up question like "Explain more" or "What about X?" refers to the current chapter/subject being studied.
"""

def build_session_memory_context(
    messages: list[dict],
    max_messages: int = 10,
    include_summary: bool = True,
) -> str:
    """Build conversation context for session continuity using sliding window buffer.
    
    Args:
        messages: List of message dicts with 'role' and 'content' keys
        max_messages: Maximum number of recent messages to include
        include_summary: Whether to include a session summary
    
    Returns:
        Formatted conversation history string with session summary
    """
    if not messages:
        return "No previous messages in this session."
    
    recent = messages[-max_messages:] if len(messages) > max_messages else messages
    
    history_parts = []
    for msg in recent:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        if content and len(content.strip()) > 0:
            prefix = "Student" if role == "user" else "Assistant"
            truncated = content[:500] + "..." if len(content) > 500 else content
            history_parts.append(f"{prefix}: {truncated}")
    
    if not history_parts:
        return "No previous messages in this session."
    
    history_text = "\n\n".join(history_parts)
    
    if include_summary and len(messages) > max_messages:
        summary_placeholder = f"\n\n[This session has {len(messages)} messages. Earlier context available.]"
        history_text = summary_placeholder + "\n\n" + history_text
    
    return history_text


def generate_session_summary(messages: list[dict], current_topic: str = "") -> str:
    """Generate a summary of the conversation session for memory persistence.
    
    Args:
        messages: List of conversation messages
        current_topic: Current chapter/topic being discussed
    
    Returns:
        Session summary string
    """
    if len(messages) < 3:
        return ""
    
    user_messages = [m.get("content", "") for m in messages if m.get("role") == "user"]
    if not user_messages:
        return ""
    
    topics_discussed = current_topic or "various topics"
    question_count = len(user_messages)
    last_question = user_messages[-1][:100] if user_messages else ""
    
    return (
        f"Session Summary: Student asked {question_count} question(s) about {topics_discussed}. "
        f"Last question: {last_question}..."
    )


SYSTEM_PROMPT = (
    "You are BoardMate, an AI educational assistant for Pakistani board students "
    "(Sindh, Punjab, Federal, KPK, Balochistan boards).\n\n"
    "CRITICAL GROUNDING RULE:\n"
    "- Use ONLY the textbook context provided as your source for all academic answers.\n"
    "- If the context does not contain enough information to answer the question, "
    "say: 'I couldn't find this in the selected chapter. Please check the chapter selection or rephrase your question.'\n"
    "- DO NOT fill gaps using your training knowledge for subject-matter questions.\n\n"
    "Your role:\n"
    "- Explain concepts clearly using ONLY the provided context\n"
    "- Help with exercises and problems found in the context\n"
    "- Reply naturally to greetings and app-help without forcing citations\n\n"
    "Guidelines:\n"
    "- Be accurate and educational\n"
    "- Use simple language suitable for 9th-12th grade students\n"
    "- Include formulas when they appear in context\n"
    "- Give step-by-step explanations for problems\n"
    "- Cite chapter/topic from context when possible\n"
    "- Respond in the student's requested language when specified\n"
    "- Never write Roman Urdu — Urdu script only if Urdu requested\n"
    "- Adapt structure to question type: bullets for lists, numbered steps for procedures, "
    "short paragraphs for concepts\n"
    "- Use markdown formatting for readability\n"
    "- Add at most 1-2 meaningful emojis when they aid clarity\n"
    "- Avoid generic filler — be specific, practical, and exam-focused\n"
)

QUIZ_SYSTEM_PROMPT = """
You are BoardMate Quiz Generator for Pakistani board students.

STRICT GROUNDING RULE — THIS IS MANDATORY:
You MUST generate ALL questions EXCLUSIVELY from the textbook context provided below.
If the context is insufficient to generate even 10 questions, generate only as many as the context supports and say:
"⚠ Only X questions could be generated — the chapter context retrieved was limited."
DO NOT use your training knowledge. DO NOT hallucinate content not present in the context.

UNIQUENESS RULE:
Every quiz attempt must feel fresh. Vary which facts, definitions, and concepts you pick.
Do not reuse the same question phrasing across attempts.

FORMAT (plain text, never JSON):

📝 QUIZ: [Chapter name exactly as in context]

---

## Question 1
[Question text — derived directly from context]
A) [Option]
B) [Option]
C) [Option]
D) [Option]
✅ Correct Answer: [Letter]
📚 Explanation: [1-sentence explanation citing the context]

---

[Repeat for 15–20 questions]

CONTENT RULES:
- Questions count: minimum 15, maximum 20, only if context supports it
- 4 options each, exactly 1 correct, wrong options must be plausible
- Cover the FULL breadth of the provided context (not just the first section)
- Vary types: definitions, fill-in-blank, application, reasoning
- Never reveal the answer in the question wording
- If context mentions a formula, number, or process — use it
- End with: "✔ Quiz complete — [X] questions from [chapter name]"
"""

EXERCISE_SYSTEM_PROMPT = """
You are BoardMate Exercise Solution Generator for Pakistani board students.

STRICT GROUNDING RULE — THIS IS MANDATORY:
Solve questions ONLY using the textbook context provided.
Do not invent answers, formulas, or steps not present in the context.
If a question cannot be solved from the context, write:
"⚠ Insufficient context for this question — please ensure the chapter is fully indexed."

FORMAT (plain text, never JSON):

📋 EXERCISE SOLUTIONS: [Chapter name from context]

---

### Section A: Multiple Choice Questions

**Q1.** [Question from context]
**Answer:** [Correct option — letter and full text]
**Solution:** [1–2 sentence explanation from context]

---

### Section B: Short Questions

**Q1.** [Question from context]
**Answer:** [2–4 sentence exam-style answer, grounded in context]
**Key Points:**
- [Key fact from context]
- [Key fact from context]

---

### Section C: Long Questions

**Q1.** [Question from context]
**Answer:**
[Step-by-step explanation using context. Use numbered steps for clarity.]

**Key Concepts from context:**
- [Concept 1]
- [Concept 2]

---

### Section D: Numerical Problems (if present in context)

**Q1.** [Problem from context]
**Given:** [Data from context]
**Required:** [What to find]
**Solution:**
Step 1: [Formula from context]
Step 2: [Substitute values]
Step 3: [Calculate result]
**Answer:** [Final value with units]

---

RULES:
1. Solve every question present in the context — skip nothing
2. Include all sections visible in context: MCQs, Short, Long, Numerical, Fill-in-the-blank
3. For numericals, show ALL steps — never just a final answer
4. Language: simple, exam-focused English (or Urdu script if requested)
5. Do NOT truncate — complete every question fully
6. End with: "✔ Exercise complete — [X] questions solved from [chapter name]"
"""

SUMMARY_SYSTEM_PROMPT = """
You are BoardMate Study Notes Generator for Pakistani board students.

STRICT GROUNDING RULE — THIS IS MANDATORY:
Generate notes ONLY from the textbook context provided. Do not add external knowledge.
If context is thin, produce a shorter but accurate summary and note the limitation.

OUTPUT STRUCTURE — follow this EXACTLY, no deviations:

📖 CHAPTER SUMMARY: [Chapter name from context]

---

## Overview (20 lines)
[Write exactly ~20 lines summarising the chapter's main themes, purpose, and scope.
Each line = one meaningful sentence. Cover the chapter in sequence as it appears in context.]

---

## Key Points
[Bullet list of the most important facts, definitions, formulas, and concepts from the context.
Minimum 8 points. Each bullet = one clear, exam-focused fact.]
- [Point 1]
- [Point 2]
...

---

## Conclusion (10 lines)
[Write exactly ~10 lines wrapping up the chapter.
Summarise what the student should take away. Connect key ideas.
Mention exam relevance where visible in context.]

---

RULES:
- Every sentence must be traceable to the provided context
- Do NOT add examples, facts, or figures not present in the context
- Use simple language for 9th–12th grade students
- No JSON, no code blocks — clean readable text only
"""

PROMPT_TEMPLATE = ChatPromptTemplate.from_messages([
    ("system", SYSTEM_PROMPT),
    ("user", (
        "Context from textbook:\n---\n{context}\n---\n\n"
        "Recent conversation history (may be empty):\n{chat_history}\n\n"
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
    r"what is your name",
    r"what's your name",
    r"your name",
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
            "Recent conversation history (may be empty):\n{chat_history}\n\n"
            "Student Question: {question}\n\n"
            "Use the context above when it is relevant. "
            "If this is just a greeting or simple conversational message, respond naturally. "
            "If the context doesn't contain relevant academic information, say that clearly and guide the student on what to ask next."
        )),
    ])


def _generate_cloud_response(
    question: str,
    context: str,
    chat_history: str = "",
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
            "chat_history": chat_history,
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
            "chat_history": chat_history,
            "question": question,
        })
        return response.content


def _build_local_prompt(
    context: str,
    question: str,
    system_prompt: str | None = None,
    chat_history: str = "",
) -> str:
    prompt_system = system_prompt or SYSTEM_PROMPT
    return (
        f"{prompt_system}\n\n"
        f"Context from textbook:\n---\n{context}\n---\n\n"
        f"Recent conversation history (may be empty):\n{chat_history}\n\n"
        f"Student Question: {question}\n\n"
        "Use the context above when it is relevant. "
        "If this is just a greeting or simple conversational message, respond naturally. "
        "If the context doesn't contain relevant academic information, say that clearly and guide the student on what to ask next."
    )


def _generate_local_response(
    question: str,
    context: str,
    chat_history: str = "",
    system_prompt: str | None = None,
    temperature: float | None = None,
    top_p: float | None = None,
    max_tokens: int | None = None,
) -> str:
    endpoint = f"{LOCAL_LLM_BASE_URL.rstrip('/')}/api/generate"
    payload = {
        "model": LOCAL_LLM_MODEL,
        "prompt": _build_local_prompt(
            context=context,
            question=question,
            system_prompt=system_prompt,
            chat_history=chat_history,
        ),
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
    chat_history: str = "",
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
                chat_history=chat_history,
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
                    chat_history=chat_history,
                    system_prompt=system_prompt,
                    temperature=temperature,
                    top_p=top_p,
                    max_tokens=max_tokens,
                ), "local"
            except Exception as local_error:
                logger.error("Local fallback failed after cloud-mode error: %s", local_error)
                return CLOUD_LLM_UNAVAILABLE_MESSAGE, "error"

    if mode == "local":
        try:
            return _generate_local_response(
                enhanced_question,
                context,
                chat_history=chat_history,
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
                        chat_history=chat_history,
                        system_prompt=system_prompt,
                        temperature=temperature,
                        max_tokens=max_tokens,
                    ), "cloud"
                except Exception as cloud_error:
                    logger.error("Cloud fallback failed after local-mode error: %s", cloud_error)

            if _is_local_connection_refused(local_error):
                return LOCAL_LLM_UNAVAILABLE_MESSAGE, "error"
            return CLOUD_LLM_UNAVAILABLE_MESSAGE, "error"

    # ── auto mode: internet-aware hybrid routing ──────────────────────────────
    # Probe connectivity first so we skip the Groq timeout when offline.
    internet_up = _is_internet_available() if GROQ_API_KEY else False
    logger.debug("Auto-mode connectivity probe: internet_up=%s", internet_up)

    if internet_up and GROQ_API_KEY:
        try:
            return _generate_cloud_response(
                enhanced_question,
                context,
                chat_history=chat_history,
                system_prompt=system_prompt,
                temperature=temperature,
                max_tokens=max_tokens,
            ), "cloud"
        except Exception as cloud_error:
            logger.warning(
                "Cloud LLM failed despite connectivity probe passing — falling back to local: %s",
                cloud_error,
            )

    # Fallback: local LLM (Ollama)
    try:
        return _generate_local_response(
            enhanced_question,
            context,
            chat_history=chat_history,
            system_prompt=system_prompt,
            temperature=temperature,
            top_p=top_p,
            max_tokens=max_tokens,
        ), "local"
    except Exception as local_error:
        logger.error("Local LLM failed in auto mode: %s", local_error)

        # Last-chance cloud retry if probe was wrong and local is also down.
        if GROQ_API_KEY and not internet_up:
            try:
                return _generate_cloud_response(
                    enhanced_question,
                    context,
                    chat_history=chat_history,
                    system_prompt=system_prompt,
                    temperature=temperature,
                    max_tokens=max_tokens,
                ), "cloud"
            except Exception as cloud_error:
                logger.error("Last-chance cloud retry also failed: %s", cloud_error)

        if _is_local_connection_refused(local_error):
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
    chat_history: str = "",
    board: str = None,
    class_level: str = None,
    language: str = "en",
    system_prompt: str = None,
) -> str:
    """
    Generate a response using LangChain with the Groq LLM.

    Args:
        question: Student's question.
        context: Retrieved context from the vector store.
        chat_history: Previous conversation for context.
        board: Optional board name.
        class_level: Optional class level.
        language: Response language.
        system_prompt: Optional system prompt override.

    Returns:
        The generated answer string.
    """
    answer, _provider = generate_response_with_provider(
        question=question,
        context=context,
        chat_history=chat_history,
        board=board,
        class_level=class_level,
        language=language,
        system_prompt=system_prompt,
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

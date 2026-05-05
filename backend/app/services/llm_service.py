"""LLM service using LangChain with the Groq API."""

import json
import logging
import re
import time
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

VALID_LLM_MODES = {"auto", "cloud", "local"}

LOCAL_LLM_UNAVAILABLE_MESSAGE = (
    "AI assistant is temporarily unavailable because the local model server is not running. "
    "Please start your local LLM server (for example Ollama) or switch to cloud mode."
)

LOCAL_LLM_TIMEOUT_MESSAGE = (
    "AI assistant is temporarily unavailable because the local model took too long to respond. "
    "Try a smaller Ollama model or increase LOCAL_LLM_TIMEOUT_SECONDS."
)

CLOUD_LLM_UNAVAILABLE_MESSAGE = (
    "AI assistant is temporarily unavailable right now. Please try again in a moment."
)

# How long (seconds) to wait when probing internet connectivity.
_INTERNET_PROBE_TIMEOUT = 3
_INTERNET_PROBE_CACHE_TTL = 30
_internet_probe_cache: dict[str, float | bool] = {
    "checked_at": 0.0,
    "is_available": False,
}
_local_model_cache: dict[str, float | list[str]] = {
    "checked_at": 0.0,
    "models": [],
}


def _is_internet_available() -> bool:
    """Return True if we can reach the Groq API endpoint, False otherwise."""
    now = time.time()
    checked_at = float(_internet_probe_cache.get("checked_at") or 0.0)
    if now - checked_at < _INTERNET_PROBE_CACHE_TTL:
        return bool(_internet_probe_cache.get("is_available"))

    is_available = False
    try:
        req = urlrequest.Request(
            "https://api.groq.com",
            headers={"User-Agent": "BoardMate/1.0"},
            method="HEAD",
        )
        with urlrequest.urlopen(req, timeout=_INTERNET_PROBE_TIMEOUT):
            is_available = True
    except Exception:
        is_available = False

    _internet_probe_cache["checked_at"] = now
    _internet_probe_cache["is_available"] = is_available
    return is_available


def normalize_llm_mode(mode: str | None, default: str | None = None) -> str:
    normalized = (mode or default or LLM_MODE or "auto").strip().lower()
    return normalized if normalized in VALID_LLM_MODES else (default or LLM_MODE or "auto").strip().lower()


def _get_available_local_models() -> list[str]:
    now = time.time()
    checked_at = float(_local_model_cache.get("checked_at") or 0.0)
    if now - checked_at < 15:
        return list(_local_model_cache.get("models") or [])

    endpoint = f"{LOCAL_LLM_BASE_URL.rstrip('/')}/api/tags"
    models: list[str] = []
    try:
        req = urlrequest.Request(
            endpoint,
            headers={"User-Agent": "BoardMate/1.0"},
            method="GET",
        )
        with urlrequest.urlopen(req, timeout=min(LOCAL_LLM_TIMEOUT_SECONDS, 5)) as response:
            data = json.loads(response.read().decode("utf-8"))
            models = [
                str(item.get("name", "")).strip()
                for item in (data.get("models") or [])
                if str(item.get("name", "")).strip()
            ]
    except Exception:
        models = []

    _local_model_cache["checked_at"] = now
    _local_model_cache["models"] = models
    return models


def resolve_local_llm_model() -> str:
    available_models = _get_available_local_models()
    configured_model = (LOCAL_LLM_MODEL or "").strip()

    if configured_model and configured_model in available_models:
        return configured_model

    if available_models:
        fallback_model = available_models[0]
        if configured_model and configured_model != fallback_model:
            logger.warning(
                "Configured local model '%s' is unavailable. Falling back to detected Ollama model '%s'.",
                configured_model,
                fallback_model,
            )
        return fallback_model

    return configured_model


def get_llm_runtime_status(mode_override: str | None = None) -> dict[str, object]:
    default_mode = normalize_llm_mode(LLM_MODE, "auto")
    effective_mode = normalize_llm_mode(mode_override, default_mode)
    local_models = _get_available_local_models()
    resolved_local_model = resolve_local_llm_model()
    cloud_configured = bool(GROQ_API_KEY)

    return {
        "default_mode": default_mode,
        "effective_mode": effective_mode,
        "cloud_available": cloud_configured,
        "local_available": bool(local_models),
        "configured_local_model": LOCAL_LLM_MODEL,
        "resolved_local_model": resolved_local_model,
        "local_models": local_models,
    }

CHAT_SYSTEM_PROMPT = """
You are BoardMate, an intelligent academic assistant designed exclusively for Pakistani Intermediate (9 to 12 class) students preparing for their board examinations. You will be provided with the content of a specific chapter from a textbook. Your job is to answer student questions using only that chapter content.

━━━ IDENTITY & TONE ━━━
- You are a patient, encouraging, and knowledgeable tutor
- Use simple, exam-focused language appropriate for FSc/FA students
- Never be rude, dismissive, or condescending
- If the requested response language is Urdu, always answer in proper Urdu script only
- Never answer in Roman Urdu
- If a student writes in Roman Urdu and the response language is Urdu, convert the reply into proper Urdu script
- If a student writes in Urdu or Roman Urdu but the response language is English, answer in English
- If a student greets you or makes small talk, respond briefly and warmly then redirect to the chapter
- If a student expresses frustration ("I don't understand", "I give up"), respond with empathy and a fresh, simpler approach
- If a student expresses exam stress or anxiety, respond with encouragement and 2-3 practical study tips
- For academic questions, do not begin with greetings, pleasantries, or filler like "Hello!", "Sure!", or "It's great to help you". Start directly with the answer.

━━━ CONTENT RESTRICTION ━━━
- Only answer from the provided chapter content. Never use outside knowledge.
- If a topic is not covered in the chapter, respond exactly: "This topic is not covered in the selected chapter. Please switch to the relevant chapter."
- Never make up facts, definitions, formulas, or examples that are not in the chapter.
- If a question is completely off-topic or non-academic, politely decline and redirect the student to the chapter.

━━━ ANSWER FORMAT RULES ━━━
- For a single topic question: use the topic name as a bold heading, then give the full explanation below it.
- For multiple topics or multiple questions in one message: identify each topic separately. Use each topic name as its own heading. Answer each one fully and separately. Never merge two different topic answers into one paragraph. Never use Q1/Q2/Q3 labels.

The correct format for multiple topics is:

[Topic Name]
[Full detailed explanation for that topic]

[Topic Name]
[Full detailed explanation for that topic]

━━━ ANSWER QUALITY RULES ━━━
- Default answer structure: Definition -> Explanation -> Key Points -> Example (if applicable)
- For short answer requests ("briefly explain", "short answer"): limit to 2-4 lines maximum, give only the core point
- For long/detailed answer requests ("explain in detail", "full answer"): give a complete board-exam style answer with all sub-points, elaboration, and a conclusion
- For formula-based questions: write the formula, define every variable with its unit, then show a step-by-step sample calculation
- For numerical problems: follow this structure -> Given -> Required -> Formula -> Substitution -> Answer with units
- For comparison questions ("difference between X and Y"): explain X fully, then Y fully, then list key differences as clear points
- For similarity questions: list all common features as structured points
- For diagram questions: describe the diagram in detail, list all labeled parts with their positions and functions
- For "parts of X" questions: list every part mentioned in the chapter with its name and a one-line function
- For "why" or "how" questions: explain the full reasoning or mechanism clearly and step by step
- For definition questions: give the formal definition first, then explain in simple everyday words

━━━ EXAM PREPARATION RULES ━━━
- Align all answers to the Pakistani board exam pattern
- Short answers should be 2-4 lines; long answers should be detailed multi-paragraph responses
- For MCQ requests: generate 5 MCQs strictly from chapter content in this format -> Question + (A) (B) (C) (D) options + correct answer marked with check
- For important short question requests: generate 5-8 likely short questions based on key definitions and concepts in the chapter
- For important long question requests: generate 3-5 board-style long questions covering major chapter topics
- For past paper style requests: generate questions in formal board exam format with marks allocation e.g. (4+4 marks)
- For quiz requests ("quiz me", "test me"): generate 5 mixed questions one at a time and wait for the student's answer
- For revision checklist requests: list all major topics from the chapter as a checkbox list
- For "most important topics" or "what will come in exam" requests: highlight the 3-5 most exam-relevant concepts based on their prominence in the chapter

━━━ SPECIAL LEARNING SUPPORT RULES ━━━
- If a student asks the same question again or says they still do not understand: give the answer in a completely different, simpler way using a real-life analogy
- If a student says "explain simply", "easy wording mein", or "explain like I am 10": use the simplest possible language, everyday analogies, and zero technical jargon
- If a student asks for a memory tip or mnemonic: create a simple, memorable trick or acronym based on the topic
- If a student asks for examples only: skip the theory and provide 2-3 clear real-world or textbook examples directly from the chapter
- If a student asks for a chapter summary: provide a concise summary with all major topic headings and 1-2 line descriptions for each
- If a student asks "will this come in exam": respond based on how central and prominent the topic is within the chapter content provided

━━━ CONTEXT INJECTION FORMAT ━━━
Every student message will be sent to you in this format:

Chapter Title: {chapter_title}
Subject: {subject_name}
Class: {class_level}

--- CHAPTER CONTENT START ---
{chapter_text}
--- CHAPTER CONTENT END ---

Student Question: {student_question}

Always read the chapter content carefully before answering. Your answer must come from that content only.
"""

SESSION_MEMORY_SYSTEM_PROMPT = CHAT_SYSTEM_PROMPT + """

MEMORY INSTRUCTIONS:
You have a conversation history with the student. Use this context to maintain continuity throughout the conversation.
- Reference earlier discussion if relevant
- Maintain consistency with previous answers
- Don't ask for information the student already provided
- Build on previous explanations when appropriate
- A follow-up question like "Explain more" or "What about X?" refers to the current chapter or subject being studied
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

SYSTEM_PROMPT = CHAT_SYSTEM_PROMPT

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
Correct Answer: [Letter]

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

EXERCISE SOLUTIONS: [Chapter name from context]

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
        "Use only the textbook context above for academic answers. "
        "For academic questions, start directly with the answer and do not add greetings or conversational openers. "
        "If the context doesn't contain relevant academic information, say that clearly."
    )),
])

GREETING_PATTERNS = (
    r"hi",
    r"hii+",
    r"hello",
    r"helo+",
    r"hey",
    r"hy",
    r"salam",
    r"slam",
    r"aslam(?: o alaikum|ualaikum| walekum)?",
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
ACKNOWLEDGEMENT_PATTERNS = (
    r"ok",
    r"okay",
    r"okk+",
    r"alright",
    r"all right",
    r"fine",
    r"good",
    r"right",
    r"yes",
    r"yes+",
    r"yep",
    r"yeah",
    r"hm+",
    r"hmm+",
    r"acha",
    r"achha",
    r"theek",
    r"thik",
    r"thik hai",
    r"theek hai",
    r"thek hai",
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

    if _matches_any_pattern(message, ACKNOWLEDGEMENT_PATTERNS):
        return "Alright. Ask your next question from the selected chapter and I'll help."

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
            "Use only the textbook context above for academic answers. "
            "For academic questions, start directly with the answer and do not add greetings or conversational openers. "
            "If the context doesn't contain relevant academic information, say that clearly."
        )),
    ])


def _strip_academic_greeting_prefix(answer: str, question: str) -> str:
    text = (answer or "").strip()
    if not text:
        return text

    if maybe_build_conversational_reply(question):
        return text

    patterns = (
        r"^(?:hello|hi|hey)[!,. ]+",
        r"^(?:sure|certainly|absolutely|of course|alright|okay|ok)[!,. ]+",
        r"^(?:hello|hi|hey)[^.!?]*[.!?]\s*",
        r"^(?:it'?s\s+great\s+to\s+help\s+you[^.!?]*[.!?]\s*)",
    )

    cleaned = text
    for pattern in patterns:
        cleaned = re.sub(pattern, "", cleaned, flags=re.IGNORECASE).strip()

    return cleaned or text


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
            max_tokens=max_tokens if max_tokens is not None else 2048,  # Increased default from 1024
        )

    chain = prompt_template | llm
    try:
        response = chain.invoke({
            "context": context,
            "chat_history": chat_history,
            "question": question,
            "chapter_text": context,
            "chapter_title": "",
            "subject_name": "",
            "class_level": "",
            "student_question": question,
        })
        return _strip_academic_greeting_prefix(response.content, question)
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
            "chapter_text": context,
            "chapter_title": "",
            "subject_name": "",
            "class_level": "",
            "student_question": question,
        })
        return _strip_academic_greeting_prefix(response.content, question)


def _build_local_prompt(
    context: str,
    question: str,
    system_prompt: str | None = None,
    chat_history: str = "",
) -> str:
    trimmed_context = (context or "").strip()
    if len(trimmed_context) > 3200:
        trimmed_context = trimmed_context[:3200].rstrip()

    trimmed_history = (chat_history or "").strip()
    if len(trimmed_history) > 500:
        trimmed_history = trimmed_history[-500:].lstrip()

    return (
        "Context from textbook:\n"
        f"---\n{trimmed_context}\n---\n\n"
        f"Recent conversation history:\n{trimmed_history or 'No previous messages.'}\n\n"
        f"Student Question:\n{question}\n\n"
        "Answer rules:\n"
        "- Use only the textbook context.\n"
        "- For academic answers, start directly with the answer.\n"
        "- Keep the answer concise and relevant.\n"
        "- If context is insufficient, say so clearly.\n"
        "- Never output <think> tags or chain-of-thought.\n"
    )


def _strip_thinking_markup(text: str) -> str:
    cleaned = (text or "").strip()
    if not cleaned:
        return ""

    if "</think>" in cleaned:
        cleaned = cleaned.split("</think>")[-1].strip()

    cleaned = re.sub(r"<think>.*?</think>", "", cleaned, flags=re.IGNORECASE | re.DOTALL).strip()
    cleaned = re.sub(r"^thinking:\s*", "", cleaned, flags=re.IGNORECASE).strip()
    return cleaned


def _extract_local_answer(data: dict) -> str:
    direct_response = _strip_thinking_markup(str(data.get("response") or ""))
    if direct_response:
        return direct_response

    message = data.get("message") or {}
    message_content = _strip_thinking_markup(str(message.get("content") or ""))
    if message_content:
        return message_content

    return ""


def _generate_local_response(
    question: str,
    context: str,
    chat_history: str = "",
    system_prompt: str | None = None,
    temperature: float | None = None,
    top_p: float | None = None,
    max_tokens: int | None = None,
) -> str:
    endpoint = f"{LOCAL_LLM_BASE_URL.rstrip('/')}/api/chat"
    local_model = resolve_local_llm_model()
    prompt_system = system_prompt or (
        "You are BoardMate, a textbook-grounded tutor for Pakistani board students. "
        "Use only the provided textbook context. "
        "Answer directly and concisely. "
        "Do not include hidden reasoning, thinking tags, or analysis in the output. "
        "If the context is insufficient, say so clearly."
    )
    payload = {
        "model": local_model,
        "messages": [
            {"role": "system", "content": prompt_system},
            {
                "role": "user",
                "content": _build_local_prompt(
                    context=context,
                    question=question,
                    system_prompt=prompt_system,
                    chat_history=chat_history,
                ),
            },
        ],
        "stream": False,
        "options": {
            "temperature": temperature if temperature is not None else 0.3,
            "top_p": top_p if top_p is not None else 0.9,
            "repeat_penalty": 1.1,
            "num_predict": max_tokens if max_tokens is not None else 1024,
            "num_ctx": 2048,
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

    answer = _extract_local_answer(data)
    if not answer:
        thinking_text = str(data.get("thinking") or "")
        done_reason = str(data.get("done_reason") or "")
        if thinking_text.strip():
            raise RuntimeError(
                f"Local LLM returned reasoning without a final answer (done_reason={done_reason or 'unknown'})"
            )
        raise RuntimeError("Local LLM returned an empty response")
    return _strip_academic_greeting_prefix(answer, question)


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


def _is_local_timeout(error: Exception) -> bool:
    msg = str(error).lower()
    return "timed out" in msg or "timeout" in msg


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
    mode_override: str | None = None,
) -> tuple[str, str]:
    """Generate response and include the provider used (cloud or local)."""
    enhanced_question = _build_enhanced_question(
        question=question,
        board=board,
        class_level=class_level,
        language=language,
    )
    mode = normalize_llm_mode(mode_override, LLM_MODE)

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
            if _is_local_connection_refused(local_error):
                return LOCAL_LLM_UNAVAILABLE_MESSAGE, "error"
            if _is_local_timeout(local_error):
                return LOCAL_LLM_TIMEOUT_MESSAGE, "error"
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
        if _is_local_timeout(local_error):
            return LOCAL_LLM_TIMEOUT_MESSAGE, "error"
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
        max_tokens=2048,  # Increased from 1024 for longer, more detailed chat responses
    )


def generate_response(
    question: str,
    context: str,
    chat_history: str = "",
    board: str = None,
    class_level: str = None,
    language: str = "en",
    system_prompt: str = None,
    mode_override: str | None = None,
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
        mode_override=mode_override,
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

"""LLM service using LangChain with the Groq API."""

import logging
from functools import lru_cache

from langchain_core.prompts import ChatPromptTemplate
from langchain_groq import ChatGroq

from app.core.config import GROQ_API_KEY, GROQ_MODEL

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = (
    "You are BoardMate, an AI educational assistant for Pakistani board students "
    "(Sindh, Punjab, Federal, KPK, Balochistan boards).\n\n"
    "Your role:\n"
    "- Answer questions based ONLY on the provided context from textbooks\n"
    "- Explain concepts clearly and simply\n"
    "- Help with exercises and numerical problems\n"
    "- If the answer is not in the context, say "
    '"I don\'t have information about this topic in my knowledge base."\n\n'
    "Guidelines:\n"
    "- Be accurate and educational\n"
    "- Use simple language suitable for 9th-12th grade students\n"
    "- Include formulas when relevant\n"
    "- Give step-by-step explanations for problems\n"
    "- Cite which chapter/topic the information comes from when possible\n"
    "- Respond in the student's requested language when specified\n"
    "- For Urdu responses, use clear and natural Urdu script"
)

PROMPT_TEMPLATE = ChatPromptTemplate.from_messages([
    ("system", SYSTEM_PROMPT),
    ("user", (
        "Context from textbook:\n---\n{context}\n---\n\n"
        "Student Question: {question}\n\n"
        "Please answer the question based on the context provided above. "
        "If the context doesn't contain relevant information, let the student know."
    )),
])


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
    try:
        chain = PROMPT_TEMPLATE | get_llm()
        enhanced_question = question
        language_map = {
            "en": "English",
            "ur": "Urdu",
        }
        requested_language = language_map.get((language or "en").lower(), "English")

        context_prefix = []
        if board or class_level:
            context_prefix.append(
                f"[Board: {board or 'Any'}, Class: {class_level or 'Any'}]"
            )
        context_prefix.append(f"[Respond in: {requested_language}]")
        enhanced_question = "\n".join(context_prefix) + f"\n\n{question}"

        response = chain.invoke({
            "context": context,
            "question": enhanced_question,
        })
        return response.content

    except Exception as e:
        logger.error("Error generating response: %s", e)
        return f"Error generating response: {str(e)}"


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

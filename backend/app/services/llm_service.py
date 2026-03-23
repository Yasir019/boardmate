"""LLM service using LangChain with the Groq API."""

import logging

from langchain_core.prompts import ChatPromptTemplate
from langchain_groq import ChatGroq

from app.core.config import GROQ_API_KEY, GROQ_MODEL

logger = logging.getLogger(__name__)

llm = ChatGroq(
    api_key=GROQ_API_KEY,
    model_name=GROQ_MODEL,
    temperature=0.3,
    max_tokens=1024,
)

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
    "- Cite which chapter/topic the information comes from when possible"
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

chain = PROMPT_TEMPLATE | llm


def generate_response(
    question: str,
    context: str,
    board: str = None,
    class_level: str = None,
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
        enhanced_question = question
        if board or class_level:
            enhanced_question = (
                f"[Board: {board or 'Any'}, Class: {class_level or 'Any'}]\n\n"
                f"{question}"
            )

        response = chain.invoke({
            "context": context,
            "question": enhanced_question,
        })
        return response.content

    except Exception as e:
        logger.error("Error generating response: %s", e)
        return f"Error generating response: {str(e)}"


def get_llm():
    """Return the LangChain LLM instance."""
    return llm


def test_connection() -> bool:
    """Test whether the Groq API connection works."""
    try:
        response = llm.invoke("Say 'BoardMate is ready!' in one line.")
        logger.info("Groq test: %s", response.content)
        return True
    except Exception as e:
        logger.error("Groq connection failed: %s", e)
        return False


if __name__ == "__main__":
    test_connection()

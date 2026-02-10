"""
LLM Service using Groq API for fast inference
"""
from groq import Groq
from app.core.config import GROQ_API_KEY, GROQ_MODEL

# Initialize Groq client
client = Groq(api_key=GROQ_API_KEY)

SYSTEM_PROMPT = """You are BoardMate, an AI educational assistant for Pakistani board students (Sindh, Punjab, Federal, KPK, Balochistan boards).

Your role:
- Answer questions based ONLY on the provided context from textbooks
- Explain concepts clearly and simply
- Help with exercises and numerical problems
- If the answer is not in the context, say "I don't have information about this topic in my knowledge base."

Guidelines:
- Be accurate and educational
- Use simple language suitable for 9th-12th grade students
- Include formulas when relevant
- Give step-by-step explanations for problems
- Cite which chapter/topic the information comes from when possible"""


def generate_response(question: str, context: str, board: str = None, class_level: str = None) -> str:
    """
    Generate a response using Groq LLM with RAG context.
    
    Args:
        question: Student's question
        context: Retrieved context from vector store
        board: Optional board filter (e.g., "Sindh")
        class_level: Optional class filter (e.g., "10th")
    
    Returns:
        LLM generated response
    """
    
    # Build the prompt with context
    user_prompt = f"""Context from textbook:
---
{context}
---

Student Question: {question}

Please answer the question based on the context provided above. If the context doesn't contain relevant information, let the student know."""

    if board or class_level:
        user_prompt = f"[Board: {board or 'Any'}, Class: {class_level or 'Any'}]\n\n" + user_prompt

    try:
        chat_completion = client.chat.completions.create(
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt}
            ],
            model=GROQ_MODEL,
            temperature=0.3,  # Lower for more factual responses
            max_tokens=1024,
            top_p=0.9
        )
        
        return chat_completion.choices[0].message.content
    
    except Exception as e:
        return f"Error generating response: {str(e)}"


def test_connection() -> bool:
    """Test if Groq API connection works."""
    try:
        response = client.chat.completions.create(
            messages=[{"role": "user", "content": "Say 'BoardMate is ready!' in one line."}],
            model=GROQ_MODEL,
            max_tokens=50
        )
        print(f"Groq test: {response.choices[0].message.content}")
        return True
    except Exception as e:
        print(f"Groq connection failed: {e}")
        return False


if __name__ == "__main__":
    test_connection()

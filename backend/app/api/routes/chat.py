from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.rag.pipeline import rag_pipeline

router = APIRouter()

class ChatRequest(BaseModel):
    board: str
    class_level: str
    subject: str
    question: str

class Source(BaseModel):
    chapter: str
    snippet: str

class ChatResponse(BaseModel):
    answer: str
    sources: list[Source]

@router.post("/ask", response_model=ChatResponse)
async def ask_question(request: ChatRequest):
    """
    Ask a question about textbook content.
    
    Retrieves relevant chunks from the specified board/class/subject
    and returns an answer with sources.
    """
    try:
        result = rag_pipeline.query(
            question=request.question,
            board=request.board,
            class_level=request.class_level,
            subject=request.subject
        )
        
        return ChatResponse(
            answer=result["answer"],
            sources=[Source(**s) for s in result["sources"]]
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Query error: {str(e)}")

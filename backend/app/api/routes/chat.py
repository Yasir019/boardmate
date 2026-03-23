from typing import List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.rag.pipeline import rag_pipeline

router = APIRouter()


class ChatRequest(BaseModel):
    board: str
    class_level: str
    subject: str
    question: str
    chapter: Optional[str] = None


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


@router.post("/ask", response_model=ChatResponse)
async def ask_question(request: ChatRequest):
    """Ask a question about textbook content and receive an AI-generated answer."""
    try:
        result = rag_pipeline.query(
            question=request.question,
            board=request.board,
            class_level=request.class_level,
            subject=request.subject,
            chapter=request.chapter,
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

        return ChatResponse(answer=result["answer"], sources=sources)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Query error: {str(e)}")

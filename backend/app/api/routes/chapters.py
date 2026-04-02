"""Routes for listing and serving chapter content."""

import re
from pathlib import Path
from typing import List, Optional

from bs4 import BeautifulSoup
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.core.config import DATA_DIR

router = APIRouter()


class Chapter(BaseModel):
    chapter: str
    chapter_number: str
    chapter_title: str
    pdf_path: Optional[str] = None
    html_path: Optional[str] = None


class ChaptersResponse(BaseModel):
    board: str
    class_level: str
    subject: str
    chapters: List[Chapter]


def _resolve_subject_path(board: str, class_level: str, subject: str) -> Path:
    subject_path = (DATA_DIR / board / class_level / subject).resolve()
    if DATA_DIR.resolve() not in subject_path.parents:
        raise HTTPException(status_code=400, detail="Invalid subject path")
    return subject_path


def _extract_title(html_file: Path, chapter_name: str) -> str:
    """Extract a clean chapter title from an HTML file."""
    try:
        with open(html_file, "r", encoding="utf-8") as f:
            soup = BeautifulSoup(f.read(), "html.parser")
            title = soup.title.string if soup.title else chapter_name

            if "\u2013" in title or "-" in title:
                parts = re.split(r"[\u2013-]", title, maxsplit=1)
                if len(parts) > 1:
                    title = parts[1].strip()

            if "|" in title:
                title = title.split("|")[0].strip()

            title = re.sub(r"^Unit\s+\d+\s*[:\u2013-]?\s*", "", title, flags=re.IGNORECASE)
            return title
    except Exception:
        return chapter_name


@router.get("/list", response_model=ChaptersResponse)
async def get_chapters(board: str, class_level: str, subject: str):
    """Return a list of chapters for a given board, class, and subject."""
    try:
        subject_path = _resolve_subject_path(board, class_level, subject)

        if not subject_path.exists():
            raise HTTPException(
                status_code=404,
                detail=f"Subject not found: {board}/{class_level}/{subject}",
            )

        extracted_dir = subject_path / "All_Chapters_Extracted"
        pdf_dir = subject_path / "All_Chapters_PDFs"

        if not extracted_dir.exists():
            return ChaptersResponse(
                board=board, class_level=class_level, subject=subject, chapters=[]
            )

        chapters: List[Chapter] = []

        for html_file in sorted(extracted_dir.glob("*.html")):
            chapter_name = html_file.stem

            chapter_num = re.search(r"Chapter(\d+)", chapter_name, re.IGNORECASE)
            chapter_number = chapter_num.group(1) if chapter_num else "1"

            title = _extract_title(html_file, chapter_name)

            pdf_path = None
            if pdf_dir.exists():
                pdf_file = pdf_dir / f"{chapter_name}.pdf"
                if pdf_file.exists():
                    pdf_path = (
                        f"/api/chapters/pdf/{board}/{class_level}"
                        f"/{subject}/{chapter_name}.pdf"
                    )

            chapters.append(
                Chapter(
                    chapter=chapter_name,
                    chapter_number=chapter_number,
                    chapter_title=title,
                    pdf_path=pdf_path,
                )
            )

        return ChaptersResponse(
            board=board, class_level=class_level, subject=subject, chapters=chapters
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading chapters: {str(e)}")


@router.get("/content/{board}/{class_level}/{subject}/{chapter}")
async def get_chapter_content(
    board: str, class_level: str, subject: str, chapter: str
):
    """Return the raw HTML content of a specific chapter."""
    try:
        subject_path = _resolve_subject_path(board, class_level, subject)
        html_path = (subject_path / "All_Chapters_Extracted" / f"{chapter}.html").resolve()

        if subject_path not in html_path.parents:
            raise HTTPException(status_code=400, detail="Invalid chapter path")

        if not html_path.exists():
            raise HTTPException(status_code=404, detail="Chapter not found")

        content = html_path.read_text(encoding="utf-8")

        return {"content": content}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error loading chapter: {str(e)}"
        )

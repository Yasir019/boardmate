"""Load textbook HTML files from the Books directory structure."""

import logging
import re
from pathlib import Path
from typing import Dict, List

from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)


def extract_text_from_html(html_content: str) -> str:
    """Extract clean text from raw HTML content."""
    soup = BeautifulSoup(html_content, "html.parser")

    for tag in soup(["script", "style", "nav", "aside"]):
        tag.decompose()

    text = soup.get_text()
    lines = (line.strip() for line in text.splitlines())
    chunks = (phrase.strip() for line in lines for phrase in line.split("  "))
    return "\n".join(chunk for chunk in chunks if chunk)


def extract_chapter_info(html_content: str, filename: str) -> Dict[str, str]:
    """Extract chapter title and number from HTML content or filename."""
    soup = BeautifulSoup(html_content, "html.parser")

    title = ""
    if soup.title:
        title = soup.title.string or ""
    elif soup.h1:
        title = soup.h1.get_text().strip()
    if not title:
        title = filename.replace(".html", "").replace("_", " ").title()

    chapter_num = re.search(r"Chapter(\d+)", filename, re.IGNORECASE)
    chapter_number = chapter_num.group(1) if chapter_num else "1"

    return {"title": title, "chapter_number": chapter_number}


def load_textbooks(data_dir: Path) -> List[Dict[str, str]]:
    """
    Load all HTML textbook files from the Books directory.

    Expected structure::

        Books/
          Board/
            Class/
              Subject/
                All_Chapters_Extracted/
                  Chapter1.html
                All_Chapters_PDFs/
                  Chapter1.pdf

    Returns:
        List of dicts containing file metadata and extracted text content.
    """
    textbooks: List[Dict[str, str]] = []

    if not data_dir.exists():
        logger.warning("Data directory not found: %s", data_dir)
        return textbooks

    for board_dir in data_dir.iterdir():
        if not board_dir.is_dir():
            continue
        board = board_dir.name

        for class_dir in board_dir.iterdir():
            if not class_dir.is_dir():
                continue
            class_level = class_dir.name

            for subject_dir in class_dir.iterdir():
                if not subject_dir.is_dir():
                    continue
                subject = subject_dir.name

                extracted_dir = subject_dir / "All_Chapters_Extracted"
                if not extracted_dir.exists():
                    continue

                pdf_dir = subject_dir / "All_Chapters_PDFs"

                for html_file in extracted_dir.glob("*.html"):
                    chapter_name = html_file.stem

                    try:
                        with open(html_file, "r", encoding="utf-8") as f:
                            html_content = f.read()

                        text_content = extract_text_from_html(html_content)
                        chapter_info = extract_chapter_info(html_content, html_file.name)

                        pdf_path = None
                        if pdf_dir.exists():
                            pdf_file = pdf_dir / f"{chapter_name}.pdf"
                            if pdf_file.exists():
                                pdf_path = str(pdf_file)

                        textbooks.append({
                            "file_path": str(html_file),
                            "pdf_path": pdf_path,
                            "board": board,
                            "class_level": class_level,
                            "subject": subject,
                            "chapter": chapter_name,
                            "chapter_number": chapter_info["chapter_number"],
                            "chapter_title": chapter_info["title"],
                            "content": text_content,
                        })

                        logger.info(
                            "Loaded: %s/%s/%s/%s",
                            board, class_level, subject, chapter_name,
                        )

                    except Exception as e:
                        logger.error("Error loading %s: %s", html_file, e)

    return textbooks

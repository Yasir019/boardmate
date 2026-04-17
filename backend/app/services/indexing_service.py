"""Service for managing textbook indexing."""

import logging
import re
import threading
from typing import Dict

from app.core.config import DATA_DIR
from app.rag.pipeline import rag_pipeline

logger = logging.getLogger(__name__)


def _safe_path_segment(value: str, field_name: str) -> str:
    cleaned = value.strip()
    if not cleaned:
        raise ValueError(f"{field_name} is required")
    if cleaned in {".", ".."} or re.search(r"[\\/]", cleaned):
        raise ValueError(f"Invalid {field_name}")
    return cleaned


class IndexingService:
    """Manage textbook indexing operations."""

    def __init__(self):
        self._reindex_lock = threading.Lock()

    def reindex_all(self) -> Dict:
        """Re-index all textbooks in the data directory."""
        if not self._reindex_lock.acquire(blocking=False):
            return {
                "ok": False,
                "error": "Reindex already in progress. Please wait for it to finish.",
            }

        try:
            result = rag_pipeline.index_textbooks()
            return {
                "ok": True,
                "files_indexed": result["files_indexed"],
                "chunks_indexed": result["chunks_indexed"],
            }
        except Exception as e:
            logger.error("Indexing error: %s", e)
            return {"ok": False, "error": str(e)}
        finally:
            self._reindex_lock.release()

    @staticmethod
    def save_uploaded_file(
        board: str,
        class_level: str,
        subject: str,
        chapter: str,
        content: str,
    ) -> Dict:
        """
        Save an uploaded textbook file to disk.

        Args:
            board: Board name.
            class_level: Class level.
            subject: Subject name.
            chapter: Chapter name.
            content: File content.

        Returns:
            Dict with ok status and saved_path.
        """
        try:
            safe_board = _safe_path_segment(board, "board")
            safe_class_level = _safe_path_segment(class_level, "class_level")
            safe_subject = _safe_path_segment(subject, "subject")
            safe_chapter = _safe_path_segment(chapter, "chapter")

            save_dir = (DATA_DIR / safe_board / safe_class_level / safe_subject).resolve()
            if DATA_DIR.resolve() not in save_dir.parents:
                raise ValueError("Invalid upload path")
            save_dir.mkdir(parents=True, exist_ok=True)

            file_path = save_dir / f"{safe_chapter}.txt"
            with open(file_path, "w", encoding="utf-8") as f:
                f.write(content)

            return {
                "ok": True,
                "saved_path": str(file_path.relative_to(DATA_DIR.parent)).replace("\\", "/"),
            }
        except (OSError, ValueError) as e:
            logger.error("File save error: %s", e)
            return {"ok": False, "error": str(e)}


indexing_service = IndexingService()

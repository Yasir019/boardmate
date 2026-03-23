"""Service for managing textbook indexing."""

import logging
from typing import Dict

from app.core.config import DATA_DIR
from app.rag.pipeline import rag_pipeline

logger = logging.getLogger(__name__)


class IndexingService:
    """Manage textbook indexing operations."""

    @staticmethod
    def reindex_all() -> Dict:
        """Re-index all textbooks in the data directory."""
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
            save_dir = DATA_DIR / board / class_level / subject
            save_dir.mkdir(parents=True, exist_ok=True)

            file_path = save_dir / f"{chapter}.txt"
            with open(file_path, "w", encoding="utf-8") as f:
                f.write(content)

            return {
                "ok": True,
                "saved_path": str(file_path.relative_to(DATA_DIR.parent)),
            }
        except Exception as e:
            logger.error("File save error: %s", e)
            return {"ok": False, "error": str(e)}


indexing_service = IndexingService()

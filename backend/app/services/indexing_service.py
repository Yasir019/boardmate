from pathlib import Path
from typing import Dict
from app.rag.pipeline import rag_pipeline
from app.core.config import DATA_DIR

class IndexingService:
    """Service for managing textbook indexing"""
    
    @staticmethod
    def reindex_all() -> Dict:
        """
        Re-index all textbooks in the data directory.
        
        Returns:
            Dict with ok status, files_indexed, and chunks_indexed
        """
        try:
            result = rag_pipeline.index_textbooks()
            return {
                "ok": True,
                "files_indexed": result["files_indexed"],
                "chunks_indexed": result["chunks_indexed"]
            }
        except Exception as e:
            print(f"❌ Indexing error: {e}")
            return {
                "ok": False,
                "error": str(e)
            }
    
    @staticmethod
    def save_uploaded_file(
        board: str,
        class_level: str,
        subject: str,
        chapter: str,
        content: str
    ) -> Dict:
        """
        Save uploaded textbook file.
        
        Args:
            board: Board name
            class_level: Class level
            subject: Subject name
            chapter: Chapter name
            content: File content
        
        Returns:
            Dict with ok status and saved_path
        """
        try:
            # Create directory structure
            save_dir = DATA_DIR / board / class_level / subject
            save_dir.mkdir(parents=True, exist_ok=True)
            
            # Save file
            file_path = save_dir / f"{chapter}.txt"
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(content)
            
            return {
                "ok": True,
                "saved_path": str(file_path.relative_to(DATA_DIR.parent))
            }
        except Exception as e:
            print(f"❌ File save error: {e}")
            return {
                "ok": False,
                "error": str(e)
            }

indexing_service = IndexingService()

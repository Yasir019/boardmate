"""RAG pipeline: indexing and querying textbooks via LangChain."""

import logging
from typing import Dict

from langchain_text_splitters import RecursiveCharacterTextSplitter

from app.core.config import (
    CHUNK_OVERLAP,
    CHUNK_SIZE,
    COLLECTION_NAME,
    DATA_DIR,
    EMBEDDING_MODEL,
    TOP_K_RESULTS,
    VECTOR_DB_DIR,
)
from app.rag.cleaner import clean_text
from app.rag.loader import load_textbooks
from app.rag.vector_store import VectorStore
from app.services.llm_service import (
    build_missing_context_response,
    generate_response_with_provider,
    maybe_build_conversational_reply,
)

logger = logging.getLogger(__name__)


def _normalize_key(value: str | None) -> str:
    if value is None:
        return ""
    return " ".join(str(value).strip().lower().split())


class RAGPipeline:
    """Complete RAG pipeline for indexing and querying textbook content."""

    def __init__(self):
        self.vector_store = None
        self.text_splitter = None

    def _ensure_models_loaded(self):
        """Lazy-load models on first use."""
        if self.vector_store is None:
            self.vector_store = VectorStore(
                VECTOR_DB_DIR,
                COLLECTION_NAME,
                EMBEDDING_MODEL,
            )
        if self.text_splitter is None:
            self.text_splitter = RecursiveCharacterTextSplitter(
                chunk_size=CHUNK_SIZE,
                chunk_overlap=CHUNK_OVERLAP,
                length_function=len,
                separators=["\n\n", "\n", ". ", " ", ""],
            )

    def index_textbooks(self) -> Dict:
        """
        Run the full indexing pipeline:
        1. Load textbooks from the data directory.
        2. Clean and chunk text.
        3. Store chunks in ChromaDB.

        Returns:
            Dict with files_indexed and chunks_indexed counts.
        """
        self._ensure_models_loaded()

        logger.info("Starting indexing pipeline")
        logger.info("Loading textbooks from %s", DATA_DIR)
        textbooks = load_textbooks(DATA_DIR)
        logger.info("Loaded %d textbook files", len(textbooks))

        if not textbooks:
            return {"files_indexed": 0, "chunks_indexed": 0}

        logger.info("Clearing existing vector store")
        self.vector_store.clear()

        all_chunks = []
        all_metadatas = []
        all_ids = []

        for textbook in textbooks:
            cleaned = clean_text(textbook["content"])
            chunks = self.text_splitter.split_text(cleaned)

            for chunk_idx, chunk in enumerate(chunks):
                all_chunks.append(chunk)
                all_metadatas.append({
                    "board": textbook["board"],
                    "class_level": textbook["class_level"],
                    "subject": textbook["subject"],
                    "chapter": textbook["chapter"],
                    "board_key": _normalize_key(textbook["board"]),
                    "class_level_key": _normalize_key(textbook["class_level"]),
                    "subject_key": _normalize_key(textbook["subject"]),
                    "chapter_key": _normalize_key(textbook["chapter"]),
                    "chapter_number": textbook["chapter_number"],
                    "chapter_title": textbook["chapter_title"],
                    "pdf_path": textbook.get("pdf_path", ""),
                })
                all_ids.append(
                    f"{textbook['board']}_{textbook['class_level']}_"
                    f"{textbook['subject']}_{textbook['chapter']}_{chunk_idx}"
                )

        logger.info("Generated %d chunks", len(all_chunks))
        logger.info("Storing chunks in ChromaDB")

        self.vector_store.add_documents(
            chunks=all_chunks,
            metadatas=all_metadatas,
            ids=all_ids,
        )

        logger.info("Indexing complete")
        return {
            "files_indexed": len(textbooks),
            "chunks_indexed": len(all_chunks),
        }

    def query(
        self,
        question: str,
        board: str,
        class_level: str,
        subject: str,
        chapter: str = None,
        language: str = "en",
    ) -> Dict:
        """
        Query the RAG system.

        Args:
            question: User's question.
            board: Board filter.
            class_level: Class filter.
            subject: Subject filter.
            chapter: Optional chapter filter.

        Returns:
            Dict with answer and sources.
        """
        self._ensure_models_loaded()

        conversational_reply = maybe_build_conversational_reply(
            question=question,
            board=board,
            class_level=class_level,
            subject=subject,
            language=language,
        )
        if conversational_reply:
            return {
                "answer": conversational_reply,
                "sources": [],
                "llm_provider": "rule-based",
            }

        filters = {
            "board_key": _normalize_key(board),
            "class_level_key": _normalize_key(class_level),
            "subject_key": _normalize_key(subject),
        }
        if chapter:
            filters["chapter_key"] = _normalize_key(chapter)

        results = self.vector_store.search(
            query=question,
            top_k=TOP_K_RESULTS,
            filters=filters,
        )

        if not results:
            return {
                "answer": build_missing_context_response(
                    board=board,
                    class_level=class_level,
                    subject=subject,
                    chapter=chapter,
                    language=language,
                ),
                "sources": [],
                "llm_provider": "rule-based",
            }

        context = "\n\n---\n\n".join(r["text"] for r in results)

        answer, llm_provider = generate_response_with_provider(
            question=question,
            context=context,
            board=board,
            class_level=class_level,
            language=language,
        )

        sources = []
        seen_chapters = set()
        for r in results:
            metadata = r["metadata"]
            chapter_key = metadata.get("chapter", "")
            if chapter_key not in seen_chapters:
                snippet = r["text"]
                sources.append({
                    "chapter": chapter_key,
                    "chapter_title": metadata.get("chapter_title", ""),
                    "chapter_number": metadata.get("chapter_number", ""),
                    "subject": metadata.get("subject", ""),
                    "snippet": snippet[:150] + "..." if len(snippet) > 150 else snippet,
                    "pdf_path": metadata.get("pdf_path", ""),
                })
                seen_chapters.add(chapter_key)

        return {"answer": answer, "sources": sources, "llm_provider": llm_provider}


rag_pipeline = RAGPipeline()

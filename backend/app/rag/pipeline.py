"""RAG pipeline: indexing and querying textbooks via LangChain."""

import logging
import re
from typing import Dict

from bs4 import BeautifulSoup
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
    normalize_llm_mode,
    translate_question_for_retrieval,
)

logger = logging.getLogger(__name__)

_EXERCISE_SECTION_PATTERNS = (
    re.compile(r"\bexercise\b", re.IGNORECASE),
    re.compile(r"\bmultiple\s+choice\s+questions?\b", re.IGNORECASE),
    re.compile(r"\bmcqs?\b", re.IGNORECASE),
    re.compile(r"\bshort\s+questions?\b", re.IGNORECASE),
    re.compile(r"\blong\s+questions?\b", re.IGNORECASE),
    re.compile(r"\bnumerical(?:s| problems?)?\b", re.IGNORECASE),
    re.compile(r"\bfill\s*in\s*the\s*blanks?\b", re.IGNORECASE),
    re.compile(r"\breview\s+questions?\b", re.IGNORECASE),
)

_FAST_LOCAL_STOPWORDS = {
    "what", "is", "are", "the", "a", "an", "of", "in", "on", "for", "to", "and", "or",
    "define", "explain", "briefly", "short", "note", "describe", "meaning", "concept",
}


def _is_fast_local_question(question: str) -> bool:
    normalized = _normalize_key(question)
    return bool(re.match(r"^(what\s+is|what\s+are|define|briefly\s+explain|explain)\b", normalized))


def _keywords_for_fast_answer(question: str) -> set[str]:
    return {
        token
        for token in re.findall(r"[a-zA-Z][a-zA-Z0-9\-]{2,}", _normalize_key(question))
        if token not in _FAST_LOCAL_STOPWORDS
    }


def _question_term(question: str) -> str:
    normalized = _normalize_key(question)
    normalized = re.sub(r"^(what\s+is|what\s+are|define|briefly\s+explain|explain)\s+", "", normalized)
    return " ".join(token for token in normalized.split() if token not in _FAST_LOCAL_STOPWORDS).strip()


def _clean_display_heading(value: str) -> str:
    cleaned = re.sub(r"^\s*(?:chapter|section|unit|page|pg\.?|exercise)\s*(?:no\.?|number|#)?\s*[:.-]?\s*\d+(?:\.\d+)*\s*[:.)-]?\s*", "", value or "", flags=re.IGNORECASE)
    cleaned = re.sub(r"^\s*\d+(?:\.\d+)*\.?\s*", "", cleaned).strip()
    return cleaned or value


def _chapter_html_path(board: str, class_level: str, subject: str, chapter: str | None):
    if not chapter:
        return None
    html_path = (DATA_DIR / board / class_level / subject / "All_Chapters_Extracted" / f"{chapter}.html").resolve()
    if DATA_DIR.resolve() not in html_path.parents or not html_path.exists():
        return None
    return html_path


def _build_heading_local_answer(
    question: str,
    board: str,
    class_level: str,
    subject: str,
    chapter: str | None,
    language: str = "en",
) -> str:
    if (language or "en").lower().startswith("ur") or not _is_fast_local_question(question):
        return ""

    term = _question_term(question)
    if not term:
        return ""

    html_path = _chapter_html_path(board, class_level, subject, chapter)
    if not html_path:
        return ""

    try:
        soup = BeautifulSoup(html_path.read_text(encoding="utf-8"), "html.parser")
    except Exception:
        return ""

    term_words = [word for word in term.split() if len(word) > 2]
    if not term_words:
        return ""

    for heading in soup.find_all(["h2", "h3", "h4"]):
        heading_text = clean_text(heading.get_text(" ", strip=True))
        heading_key = _normalize_key(heading_text)
        if not all(word in heading_key for word in term_words[:3]):
            continue

        details: list[str] = []
        for sibling in heading.find_all_next(["h1", "h2", "h3", "h4", "p", "li"], limit=10):
            if sibling.name in {"h1", "h2", "h3", "h4"}:
                break
            text = clean_text(sibling.get_text(" ", strip=True))
            text_key = _normalize_key(text)
            if text and not text_key.startswith("think of it like"):
                clean_sentences = [
                    sentence
                    for sentence in _split_sentences(text)
                    if "this is like" not in _normalize_key(sentence)
                ]
                details.extend(clean_sentences or ([text] if "this is like" not in text_key else []))
            if len(" ".join(details)) > 450:
                break

        if details:
            return f"**{_clean_display_heading(heading_text)}**\n\n" + " ".join(details)[:700].strip()

    return ""


def _split_sentences(text: str) -> list[str]:
    return [
        sentence.strip()
        for sentence in re.split(r"(?<=[.!?])\s+", " ".join((text or "").split()))
        if len(sentence.strip()) > 20
    ]


def _is_good_fast_sentence(sentence: str, term: str, keywords: set[str]) -> bool:
    normalized = _normalize_key(sentence)
    if not normalized:
        return False
    if normalized.startswith("page ") or "think of it like" in normalized:
        return False
    if any(token in normalized for token in (" recipe", " cake", " analogy", "imagine ")):
        return False

    sentence_tokens = set(re.findall(r"[a-zA-Z][a-zA-Z0-9\-]{2,}", normalized))
    required_overlap = min(len(keywords), 2)
    if len(keywords & sentence_tokens) < required_overlap:
        return False

    term_words = [word for word in term.split() if word]
    if term_words and not all(word in normalized for word in term_words[:3]):
        return False

    definition_patterns = (
        r"\b(?:is|are)\s+(?:a|an|the)?\s*\w+",
        r"\brefers\s+to\b",
        r"\bmeans\b",
        r"\bis\s+defined\s+as\b",
        r"\bconsists\s+of\b",
        r"\binvolves\b",
        r"\bplan(?:s|ned|ning)?\s+(?:out\s+)?how\b",
    )
    return any(re.search(pattern, normalized) for pattern in definition_patterns)


def _build_fast_local_answer(question: str, results: list[dict], language: str = "en") -> str:
    if (language or "en").lower().startswith("ur") or not _is_fast_local_question(question):
        return ""

    keywords = _keywords_for_fast_answer(question)
    if not keywords:
        return ""
    term = _question_term(question)

    scored_sentences: list[tuple[int, int, str]] = []
    for result_index, result in enumerate(results[:2]):
        for sentence_index, sentence in enumerate(_split_sentences(result.get("text", ""))):
            if not _is_good_fast_sentence(sentence, term, keywords):
                continue
            sentence_tokens = set(re.findall(r"[a-zA-Z][a-zA-Z0-9\-]{2,}", sentence.lower()))
            overlap = len(keywords & sentence_tokens)
            if overlap:
                scored_sentences.append((overlap, -(result_index * 100 + sentence_index), sentence))

    if not scored_sentences:
        return ""

    scored_sentences.sort(reverse=True)
    answer_sentences = [scored_sentences[0][2]]
    for _overlap, _rank, sentence in scored_sentences[1:4]:
        if sentence not in answer_sentences and len(" ".join(answer_sentences)) < 450:
            answer_sentences.append(sentence)

    heading = _clean_display_heading(term)
    answer = " ".join(answer_sentences)[:700].strip()
    return f"**{heading.title()}**\n\n{answer}" if heading else answer


def _normalize_key(value: str | None) -> str:
    if value is None:
        return ""
    return " ".join(str(value).strip().lower().split())


def _chat_top_k_for_question(question: str, is_local_mode: bool = False) -> int:
    normalized = _normalize_key(question)
    word_count = len(normalized.split())
    if not normalized:
        return 1 if is_local_mode else 2
    if is_local_mode:
        if word_count <= 4:
            return 3
        if any(token in normalized for token in ("difference", "compare", "why", "how", "steps", "explain", "derive")):
            return 2
        return 1
    if word_count <= 6:
        return 2
    if any(token in normalized for token in ("difference", "compare", "why", "how", "steps", "explain", "derive")):
        return min(max(4, TOP_K_RESULTS), TOP_K_RESULTS)
    return min(TOP_K_RESULTS, 3)


def _chat_max_tokens_for_question(question: str, is_local_mode: bool = False) -> int:
    normalized = _normalize_key(question)
    if is_local_mode:
        if any(token in normalized for token in ("difference", "compare", "why", "how", "steps", "detail", "detailed", "long")):
            return 160
        return 96
    if any(token in normalized for token in ("difference", "compare", "why", "how", "steps", "detail", "detailed", "long")):
        return 512
    return 256


def _trim_chat_context_for_mode(context: str, is_local_mode: bool = False) -> str:
    if not context:
        return ""
    max_chars = 1400 if is_local_mode else 9000
    if len(context) <= max_chars:
        return context
    return context[:max_chars].rstrip() + "\n\n[Context trimmed for faster response]"


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

    @staticmethod
    def _is_closed_client_error(error: Exception) -> bool:
        message = str(error).lower()
        return "client has been closed" in message or "cannot send a request" in message

    def _reset_vector_store(self):
        """Drop the current vector wrapper so the next operation starts fresh."""
        logger.warning("Resetting vector store after closed-client error")
        self.vector_store = None
        self._ensure_models_loaded()

    def _run_vector_operation(self, operation_name: str, operation):
        try:
            return operation()
        except Exception as e:
            if not self._is_closed_client_error(e):
                raise
            logger.warning(
                "Vector operation %s failed with a closed client; rebuilding and retrying",
                operation_name,
            )
            self._reset_vector_store()
            try:
                return operation()
            except Exception as retry_error:
                if self._is_closed_client_error(retry_error):
                    logger.warning(
                        "Vector operation %s still has a closed client after retry",
                        operation_name,
                    )
                raise

    def _chapter_html_blocks(
        self,
        board: str,
        class_level: str,
        subject: str,
        chapter: str | None,
    ) -> list[str]:
        html_path = _chapter_html_path(board, class_level, subject, chapter)
        if not html_path:
            return []

        try:
            soup = BeautifulSoup(html_path.read_text(encoding="utf-8"), "html.parser")
        except Exception as e:
            logger.warning("Could not read chapter HTML fallback %s: %s", html_path, e)
            return []

        blocks: list[str] = []
        for node in soup.find_all(["h1", "h2", "h3", "h4", "p", "li"]):
            text = clean_text(node.get_text(" ", strip=True))
            if not text or text.lower().startswith("page "):
                continue
            blocks.append(text)
        return blocks

    def _chapter_html_context(
        self,
        board: str,
        class_level: str,
        subject: str,
        chapter: str | None,
        max_chars: int = 12000,
    ) -> str:
        blocks = self._chapter_html_blocks(board, class_level, subject, chapter)
        selected: list[str] = []
        total = 0
        for block in blocks:
            next_total = total + len(block) + (2 if selected else 0)
            if next_total > max_chars:
                break
            selected.append(block)
            total = next_total
        return "\n\n".join(selected)

    def _chapter_html_search_results(
        self,
        question: str,
        board: str,
        class_level: str,
        subject: str,
        chapter: str | None,
        top_k: int,
    ) -> list[dict]:
        blocks = self._chapter_html_blocks(board, class_level, subject, chapter)
        if not blocks:
            return []

        keywords = {
            token
            for token in re.findall(r"[a-zA-Z][a-zA-Z0-9\-]{2,}", _normalize_key(question))
            if token not in _FAST_LOCAL_STOPWORDS
        }
        chunks: list[str] = []
        current: list[str] = []
        current_len = 0
        for block in blocks:
            if current and current_len + len(block) > 1100:
                chunks.append("\n".join(current))
                current = []
                current_len = 0
            current.append(block)
            current_len += len(block)
        if current:
            chunks.append("\n".join(current))

        scored: list[tuple[int, int, str]] = []
        for index, chunk in enumerate(chunks):
            chunk_tokens = set(re.findall(r"[a-zA-Z][a-zA-Z0-9\-]{2,}", chunk.lower()))
            score = len(keywords & chunk_tokens)
            scored.append((score, -index, chunk))
        scored.sort(reverse=True)

        title = next((block for block in blocks if len(block) <= 140), chapter or "")
        results = []
        for score, _rank, chunk in scored[:max(1, top_k)]:
            if score <= 0 and results:
                continue
            results.append({
                "text": chunk,
                "metadata": {
                    "board": board,
                    "class_level": class_level,
                    "subject": subject,
                    "chapter": chapter or "",
                    "chapter_title": title,
                    "chapter_number": "",
                    "pdf_path": "",
                },
                "distance": 0.25 if score > 0 else 0.75,
            })
        return results

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
        chat_history: str = "",
        system_prompt: str = None,
        llm_mode_override: str | None = None,
    ) -> Dict:
        """
        Query the RAG system with optional session memory.

        Args:
            question: User's question.
            board: Board filter.
            class_level: Class filter.
            subject: Subject filter.
            chapter: Optional chapter filter.
            chat_history: Previous conversation messages for context.
            system_prompt: Optional system prompt for session memory.

        Returns:
            Dict with answer and sources.
        """
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
        is_local_mode = normalize_llm_mode(llm_mode_override) == "local"
        if chapter:
            filters["chapter_key"] = _normalize_key(chapter)

        heading_local_answer = _build_heading_local_answer(
            question=question,
            board=board,
            class_level=class_level,
            subject=subject,
            chapter=chapter,
            language=language,
        ) if is_local_mode else ""
        if heading_local_answer:
            return {
                "answer": heading_local_answer,
                "sources": [],
                "llm_provider": "local-fast",
            }

        top_k = _chat_top_k_for_question(question, is_local_mode=is_local_mode)
        results = []
        if is_local_mode:
            results = self._chapter_html_search_results(
                question=question,
                board=board,
                class_level=class_level,
                subject=subject,
                chapter=chapter,
                top_k=top_k,
            )
            if not results:
                logger.warning("Local HTML retrieval found no results; trying vector search")

        retrieval_query = question if is_local_mode else translate_question_for_retrieval(question)
        if not results:
            try:
                self._ensure_models_loaded()
                results = self._run_vector_operation(
                    "chat_search",
                    lambda: self.vector_store.search(
                        query=retrieval_query or question,
                        top_k=top_k,
                        filters=filters,
                    ),
                )
            except Exception as e:
                if not is_local_mode and not self._is_closed_client_error(e):
                    raise
                logger.warning("Using chapter HTML fallback for chat retrieval after vector error: %s", e)
                results = self._chapter_html_search_results(
                    question=retrieval_query or question,
                    board=board,
                    class_level=class_level,
                    subject=subject,
                    chapter=chapter,
                    top_k=top_k,
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

        top_distance = results[0].get("distance")
        if isinstance(top_distance, (int, float)) and top_distance > 1.15:
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
        context = _trim_chat_context_for_mode(context, is_local_mode=is_local_mode)

        fast_local_answer = _build_fast_local_answer(question, results, language=language) if is_local_mode else ""
        if fast_local_answer:
            return {
                "answer": fast_local_answer,
                "sources": [
                    {
                        "chapter": results[0]["metadata"].get("chapter", ""),
                        "chapter_title": results[0]["metadata"].get("chapter_title", ""),
                        "chapter_number": results[0]["metadata"].get("chapter_number", ""),
                        "subject": results[0]["metadata"].get("subject", ""),
                        "snippet": results[0]["text"][:150] + "..." if len(results[0]["text"]) > 150 else results[0]["text"],
                        "pdf_path": results[0]["metadata"].get("pdf_path"),
                    }
                ],
                "llm_provider": "local-fast",
            }

        answer, llm_provider = generate_response_with_provider(
            question=question,
            context=context,
            chat_history=chat_history,
            board=board,
            class_level=class_level,
            language=language,
            system_prompt=None if is_local_mode else system_prompt,
            max_tokens=_chat_max_tokens_for_question(question, is_local_mode=is_local_mode),
            mode_override=llm_mode_override,
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

    def retrieve_context_for_scope(
        self,
        board: str,
        class_level: str,
        subject: str,
        chapter: str | None,
        query: str,
        top_k: int = 8,
    ) -> Dict:
        """Retrieve chapter-scoped context from vector embeddings for non-chat studio tasks."""
        filters = {
            "board_key": _normalize_key(board),
            "class_level_key": _normalize_key(class_level),
            "subject_key": _normalize_key(subject),
        }
        if chapter:
            filters["chapter_key"] = _normalize_key(chapter)

        # For studio generation, prefer broad filtered retrieval so outputs cover the full selected chapter.
        try:
            self._ensure_models_loaded()
            filtered_docs = self._run_vector_operation(
                "scope_get_documents",
                lambda: self.vector_store.get_documents(
                    filters=filters,
                    limit=max(24, top_k * 3),
                ),
            )
        except Exception as e:
            if not self._is_closed_client_error(e):
                raise
            logger.warning("Using chapter HTML fallback for scoped retrieval")
            context = self._chapter_html_context(
                board=board,
                class_level=class_level,
                subject=subject,
                chapter=chapter,
                max_chars=max(12000, top_k * 1500),
            )
            return {"context": context, "chunks": 1 if context else 0}

        if filtered_docs:
            context = "\n\n---\n\n".join(item["text"] for item in filtered_docs)
            return {"context": context, "chunks": len(filtered_docs)}

        try:
            results = self._run_vector_operation(
                "scope_search",
                lambda: self.vector_store.search(
                    query=query,
                    top_k=max(1, top_k),
                    filters=filters,
                ),
            )
        except Exception as e:
            if not self._is_closed_client_error(e):
                raise
            logger.warning("Using chapter HTML fallback for scoped search")
            results = self._chapter_html_search_results(
                question=query,
                board=board,
                class_level=class_level,
                subject=subject,
                chapter=chapter,
                top_k=top_k,
            )

        if not results:
            return {"context": "", "chunks": 0}

        context = "\n\n---\n\n".join(r["text"] for r in results)
        return {"context": context, "chunks": len(results)}

    def retrieve_exercise_context(
        self,
        board: str,
        class_level: str,
        subject: str,
        chapter: str | None,
        top_k: int = 32,
    ) -> Dict:
        """Retrieve exercise-focused chapter context, prioritizing exercise sections."""
        filters = {
            "board_key": _normalize_key(board),
            "class_level_key": _normalize_key(class_level),
            "subject_key": _normalize_key(subject),
        }
        if chapter:
            filters["chapter_key"] = _normalize_key(chapter)

        try:
            self._ensure_models_loaded()
            filtered_docs = self._run_vector_operation(
                "exercise_get_documents",
                lambda: self.vector_store.get_documents(
                    filters=filters,
                    limit=max(96, top_k * 6),
                ),
            )
        except Exception as e:
            if not self._is_closed_client_error(e):
                raise
            logger.warning("Using chapter HTML fallback for exercise retrieval")
            context = self._chapter_html_context(
                board=board,
                class_level=class_level,
                subject=subject,
                chapter=chapter,
                max_chars=max(18000, top_k * 1800),
            )
            return {"context": context, "chunks": 1 if context else 0}

        indexed_docs = list(enumerate(filtered_docs))
        prioritized = []
        for index, item in indexed_docs:
            text = str(item.get("text") or "")
            if not text:
                continue

            score = sum(1 for pattern in _EXERCISE_SECTION_PATTERNS if pattern.search(text))
            if score <= 0:
                continue
            prioritized.append((index, score, item))

        prioritized.sort(key=lambda entry: (-entry[1], entry[0]))

        combined = []
        seen_texts = set()

        for _, _, item in prioritized[:top_k]:
            text = str(item.get("text") or "").strip()
            if not text or text in seen_texts:
                continue
            seen_texts.add(text)
            combined.append(item)

        semantic_queries = [
            f"{chapter or subject} exercise",
            f"{chapter or subject} multiple choice questions",
            f"{chapter or subject} short questions",
            f"{chapter or subject} long questions",
        ]

        for query in semantic_queries:
            try:
                results = self._run_vector_operation(
                    "exercise_search",
                    lambda query=query: self.vector_store.search(
                        query=query,
                        top_k=max(4, top_k // 2),
                        filters=filters,
                    ),
                )
            except Exception as e:
                if not self._is_closed_client_error(e):
                    raise
                logger.warning("Skipping exercise semantic search after closed-client error")
                results = []
            for item in results:
                text = str(item.get("text") or "").strip()
                if not text or text in seen_texts:
                    continue
                seen_texts.add(text)
                combined.append(item)
                if len(combined) >= top_k:
                    break
            if len(combined) >= top_k:
                break

        if not combined and filtered_docs:
            combined = filtered_docs[:top_k]

        context = "\n\n---\n\n".join(
            str(item.get("text") or "").strip()
            for item in combined
            if str(item.get("text") or "").strip()
        )
        return {"context": context, "chunks": len(combined)}


rag_pipeline = RAGPipeline()

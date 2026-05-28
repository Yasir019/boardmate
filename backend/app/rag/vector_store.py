"""LangChain Chroma vector store for textbook chunks."""

import logging
from pathlib import Path
from threading import RLock
from typing import Callable, Dict, List, Optional, TypeVar

from chromadb.api.client import SharedSystemClient
from langchain_chroma import Chroma
from langchain_community.embeddings import HuggingFaceEmbeddings

logger = logging.getLogger(__name__)
T = TypeVar("T")


class VectorStore:
    """Wrapper around LangChain Chroma for storing and retrieving textbook chunks."""

    def __init__(
        self,
        persist_directory: Path,
        collection_name: str = "boardmate_textbooks",
        embedding_model: str = None,
    ):
        self.persist_directory = persist_directory
        self.collection_name = collection_name
        self._client_lock = RLock()

        persist_directory.mkdir(parents=True, exist_ok=True)

        self.embeddings = HuggingFaceEmbeddings(
            model_name=embedding_model or "sentence-transformers/all-MiniLM-L6-v2"
        )

        self.vectorstore = self._create_vectorstore()

    def _create_vectorstore(self) -> Chroma:
        return Chroma(
            collection_name=self.collection_name,
            embedding_function=self.embeddings,
            persist_directory=str(self.persist_directory),
        )

    @staticmethod
    def _is_closed_client_error(error: Exception) -> bool:
        message = str(error).lower()
        return "client has been closed" in message or "cannot send a request" in message

    def _reconnect(self):
        """Recreate the Chroma client handle while keeping persisted data."""
        with self._client_lock:
            # Chroma caches persistent clients by directory. If that cached system owns
            # a closed httpx client, rebuilding Chroma without clearing the cache can
            # return the same closed client again.
            SharedSystemClient.clear_system_cache()
            self.vectorstore = self._create_vectorstore()

    def _run_with_reconnect(self, operation_name: str, operation: Callable[[], T]) -> T:
        try:
            return operation()
        except Exception as e:
            if not self._is_closed_client_error(e):
                raise

            logger.warning(
                "Chroma client was closed during %s, reconnecting and retrying once",
                operation_name,
            )
            self._reconnect()
            return operation()

    def clear(self):
        """Delete all documents from the collection and recreate it."""
        try:
            self.vectorstore.delete_collection()
            self.vectorstore = self._create_vectorstore()
            logger.info("Collection cleared")
        except Exception as e:
            logger.warning("Error clearing collection: %s", e)

    def add_documents(
        self,
        chunks: List[str],
        metadatas: List[Dict[str, str]],
        ids: List[str],
    ):
        """Add text chunks with metadata to the vector store."""
        self._run_with_reconnect(
            "add_documents",
            lambda: self.vectorstore.add_texts(
                texts=chunks,
                metadatas=metadatas,
                ids=ids,
            ),
        )

    def search(
        self,
        query: str,
        top_k: int = 3,
        filters: Optional[Dict[str, str]] = None,
    ) -> List[Dict]:
        """
        Search for similar chunks.

        Args:
            query: Query text.
            top_k: Number of results to return.
            filters: Metadata filters (e.g. {"board": "Punjab"}).

        Returns:
            List of dicts with text, metadata, and distance.
        """
        where = None
        if filters:
            valid_filters = {k: v for k, v in filters.items() if v is not None}
            if len(valid_filters) == 1:
                key, value = list(valid_filters.items())[0]
                where = {key: {"$eq": value}}
            elif len(valid_filters) > 1:
                where = {
                    "$and": [
                        {k: {"$eq": v}} for k, v in valid_filters.items()
                    ]
                }

        def _run_search():
            if where:
                return self.vectorstore.similarity_search_with_score(
                    query=query, k=top_k, filter=where
                )
            return self.vectorstore.similarity_search_with_score(
                query=query, k=top_k
            )

        results = self._run_with_reconnect("search", _run_search)

        return [
            {
                "text": doc.page_content,
                "metadata": doc.metadata,
                "distance": score,
            }
            for doc, score in results
        ]

    def get_documents(
        self,
        filters: Optional[Dict[str, str]] = None,
        limit: int | None = None,
    ) -> List[Dict]:
        """Fetch documents by metadata filters without semantic similarity ranking."""
        where = None
        if filters:
            valid_filters = {k: v for k, v in filters.items() if v is not None}
            if len(valid_filters) == 1:
                key, value = list(valid_filters.items())[0]
                where = {key: {"$eq": value}}
            elif len(valid_filters) > 1:
                where = {
                    "$and": [
                        {k: {"$eq": v}} for k, v in valid_filters.items()
                    ]
                }

        def _run_get():
            kwargs = {
                "where": where,
                "include": ["documents", "metadatas"],
            }
            if limit and limit > 0:
                kwargs["limit"] = limit
            return self.vectorstore.get(**kwargs)

        data = self._run_with_reconnect("get_documents", _run_get)

        documents = data.get("documents", []) or []
        metadatas = data.get("metadatas", []) or []
        results: List[Dict] = []
        for idx, text in enumerate(documents):
            if not text:
                continue
            metadata = metadatas[idx] if idx < len(metadatas) and isinstance(metadatas[idx], dict) else {}
            results.append({"text": text, "metadata": metadata})
        return results

    def as_retriever(self, search_kwargs: Dict = None):
        """Return a LangChain retriever interface."""
        return self._run_with_reconnect(
            "as_retriever",
            lambda: self.vectorstore.as_retriever(
                search_kwargs=search_kwargs or {"k": 5}
            ),
        )

    def count(self) -> int:
        """Return the total number of documents in the collection."""
        return self._run_with_reconnect(
            "count",
            lambda: len(self.vectorstore.get()["ids"]),
        )

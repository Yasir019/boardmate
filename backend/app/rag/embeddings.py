"""Embedding model wrapper using sentence-transformers."""

import logging
from typing import List

from sentence_transformers import SentenceTransformer

logger = logging.getLogger(__name__)


class EmbeddingModel:
    """Wrapper for sentence-transformers embedding model."""

    def __init__(self, model_name: str = "sentence-transformers/all-MiniLM-L6-v2"):
        logger.info("Loading embedding model: %s", model_name)
        self.device = "cpu"
        self.model = SentenceTransformer(model_name, device=self.device)
        logger.info("Model loaded on %s", self.device)

    def embed_texts(self, texts: List[str]) -> List[List[float]]:
        """Generate embeddings for a list of texts."""
        if not texts:
            return []
        embeddings = self.model.encode(
            texts, show_progress_bar=True, convert_to_numpy=True
        )
        return embeddings.tolist()

    def embed_query(self, query: str) -> List[float]:
        """Generate an embedding for a single query string."""
        embedding = self.model.encode(query, convert_to_numpy=True)
        return embedding.tolist()

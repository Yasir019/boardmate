from sentence_transformers import SentenceTransformer
from typing import List
import torch

class EmbeddingModel:
    """Wrapper for sentence-transformers embedding model"""
    
    def __init__(self, model_name: str = "sentence-transformers/all-MiniLM-L6-v2"):
        print(f"📦 Loading embedding model: {model_name}")
        # Force CPU usage
        self.device = "cpu"
        self.model = SentenceTransformer(model_name, device=self.device)
        print(f"✅ Model loaded on {self.device}")
    
    def embed_texts(self, texts: List[str]) -> List[List[float]]:
        """
        Generate embeddings for a list of texts.
        
        Args:
            texts: List of text strings
        
        Returns:
            List of embedding vectors
        """
        if not texts:
            return []
        
        # Generate embeddings
        embeddings = self.model.encode(
            texts,
            show_progress_bar=True,
            convert_to_numpy=True
        )
        
        return embeddings.tolist()
    
    def embed_query(self, query: str) -> List[float]:
        """
        Generate embedding for a single query.
        
        Args:
            query: Query string
        
        Returns:
            Embedding vector
        """
        embedding = self.model.encode(query, convert_to_numpy=True)
        return embedding.tolist()

import chromadb
from typing import List, Dict, Optional
from pathlib import Path

class VectorStore:
    """ChromaDB vector store for textbook chunks"""
    
    def __init__(self, persist_directory: Path, collection_name: str = "boardmate_textbooks"):
        """
        Initialize ChromaDB client and collection.
        
        Args:
            persist_directory: Directory to persist ChromaDB data
            collection_name: Name of the collection
        """
        self.persist_directory = persist_directory
        self.collection_name = collection_name
        
        # Create directory if it doesn't exist
        persist_directory.mkdir(parents=True, exist_ok=True)
        
        # Initialize ChromaDB persistent client (ChromaDB 1.x API)
        self.client = chromadb.PersistentClient(path=str(persist_directory))
        
        # Get or create collection
        self.collection = self.client.get_or_create_collection(
            name=collection_name,
            metadata={"description": "Textbook chunks with embeddings"}
        )
    
    def clear(self):
        """Delete all documents from collection"""
        try:
            self.client.delete_collection(name=self.collection_name)
            self.collection = self.client.create_collection(
                name=self.collection_name,
                metadata={"description": "Textbook chunks with embeddings"}
            )
            print("✅ Collection cleared")
        except Exception as e:
            print(f"⚠️ Error clearing collection: {e}")
    
    def add_documents(
        self,
        chunks: List[str],
        embeddings: List[List[float]],
        metadatas: List[Dict[str, str]],
        ids: List[str]
    ):
        """
        Add documents to the vector store.
        
        Args:
            chunks: List of text chunks
            embeddings: List of embedding vectors
            metadatas: List of metadata dicts (board, class_level, subject, chapter)
            ids: List of unique IDs
        """
        self.collection.add(
            documents=chunks,
            embeddings=embeddings,
            metadatas=metadatas,
            ids=ids
        )
    
    def search(
        self,
        query_embedding: List[float],
        top_k: int = 3,
        filters: Optional[Dict[str, str]] = None
    ) -> List[Dict]:
        """
        Search for similar chunks.
        
        Args:
            query_embedding: Query embedding vector
            top_k: Number of results to return
            filters: Metadata filters (e.g., {"board": "Punjab", "class_level": "9"})
        
        Returns:
            List of results with text, metadata, and distance
        """
        where = filters if filters else None
        
        results = self.collection.query(
            query_embeddings=[query_embedding],
            n_results=top_k,
            where=where
        )
        
        # Format results
        formatted_results = []
        if results['documents']:
            for i, doc in enumerate(results['documents'][0]):
                formatted_results.append({
                    "text": doc,
                    "metadata": results['metadatas'][0][i],
                    "distance": results['distances'][0][i]
                })
        
        return formatted_results
    
    def count(self) -> int:
        """Get total number of documents in collection"""
        return self.collection.count()

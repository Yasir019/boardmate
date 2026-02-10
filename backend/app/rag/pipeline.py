from typing import List, Dict
from pathlib import Path
from app.rag.loader import load_textbooks
from app.rag.cleaner import clean_text
from app.rag.chunker import chunk_text
from app.rag.embeddings import EmbeddingModel
from app.rag.vector_store import VectorStore
from app.core.config import (
    DATA_DIR, VECTOR_DB_DIR, EMBEDDING_MODEL,
    CHUNK_SIZE, CHUNK_OVERLAP, COLLECTION_NAME, TOP_K_RESULTS
)

class RAGPipeline:
    """Complete RAG pipeline for indexing and querying"""
    
    def __init__(self):
        self.embedding_model = None
        self.vector_store = None
    
    def _ensure_models_loaded(self):
        """Lazy load models when needed"""
        if self.embedding_model is None:
            self.embedding_model = EmbeddingModel(EMBEDDING_MODEL)
        if self.vector_store is None:
            self.vector_store = VectorStore(VECTOR_DB_DIR, COLLECTION_NAME)
    
    def index_textbooks(self) -> Dict:
        """
        Complete indexing pipeline:
        1. Load textbooks from data directory
        2. Clean text
        3. Chunk text
        4. Generate embeddings
        5. Store in ChromaDB
        
        Returns:
            Dict with files_indexed and chunks_indexed counts
        """
        self._ensure_models_loaded()
        
        print("📚 Starting indexing pipeline...")
        
        # Load textbooks
        print(f"📂 Loading textbooks from {DATA_DIR}")
        textbooks = load_textbooks(DATA_DIR)
        print(f"✅ Loaded {len(textbooks)} textbook files")
        
        if not textbooks:
            return {"files_indexed": 0, "chunks_indexed": 0}
        
        # Clear existing data
        print("🗑️ Clearing existing vector store...")
        self.vector_store.clear()
        
        # Process each textbook
        all_chunks = []
        all_metadatas = []
        all_ids = []
        
        for idx, textbook in enumerate(textbooks):
            # Clean text
            cleaned = clean_text(textbook["content"])
            
            # Chunk text
            chunks = chunk_text(cleaned, CHUNK_SIZE, CHUNK_OVERLAP)
            
            # Create metadata and IDs for each chunk
            for chunk_idx, chunk in enumerate(chunks):
                all_chunks.append(chunk)
                all_metadatas.append({
                    "board": textbook["board"],
                    "class_level": textbook["class_level"],
                    "subject": textbook["subject"],
                    "chapter": textbook["chapter"]
                })
                all_ids.append(f"{textbook['board']}_{textbook['class_level']}_{textbook['subject']}_{textbook['chapter']}_{chunk_idx}")
        
        print(f"✂️ Generated {len(all_chunks)} chunks")
        
        # Generate embeddings
        print("🔢 Generating embeddings...")
        embeddings = self.embedding_model.embed_texts(all_chunks)
        
        # Store in vector database
        print("💾 Storing in ChromaDB...")
        self.vector_store.add_documents(
            chunks=all_chunks,
            embeddings=embeddings,
            metadatas=all_metadatas,
            ids=all_ids
        )
        
        print(f"✅ Indexing complete!")
        
        return {
            "files_indexed": len(textbooks),
            "chunks_indexed": len(all_chunks)
        }
    
    def query(
        self,
        question: str,
        board: str,
        class_level: str,
        subject: str
    ) -> Dict:
        """
        Query the RAG system.
        
        Args:
            question: User's question
            board: Board filter
            class_level: Class filter
            subject: Subject filter
        
        Returns:
            Dict with answer and sources
        """
        self._ensure_models_loaded()
        
        # Generate query embedding
        query_embedding = self.embedding_model.embed_query(question)
        
        # Search vector store with filters
        filters = {
            "board": board,
            "class_level": class_level,
            "subject": subject
        }
        
        results = self.vector_store.search(
            query_embedding=query_embedding,
            top_k=TOP_K_RESULTS,
            filters=filters
        )
        
        # Build response
        if not results:
            return {
                "answer": "Not found in textbook.",
                "sources": []
            }
        
        # Create context from retrieved chunks
        context = "\n\n".join([r["text"] for r in results])
        
        # For now, return a stub answer with context
        # In production, this would be sent to an LLM
        answer = f"Based on the textbook content:\n\n{context}\n\n(Note: This is a stub response showing retrieved context. In production, an LLM would generate a proper answer.)"
        
        # Format sources
        sources = [
            {
                "chapter": r["metadata"]["chapter"],
                "snippet": r["text"][:150] + "..." if len(r["text"]) > 150 else r["text"]
            }
            for r in results
        ]
        
        return {
            "answer": answer,
            "sources": sources
        }

# Global pipeline instance
rag_pipeline = RAGPipeline()

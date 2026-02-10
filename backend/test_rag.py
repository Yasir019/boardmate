from app.rag.pipeline import rag_pipeline

# Test multiple questions
questions = [
    "What is the Law of Mass Action?",
    "What is Kc and what does it indicate?",
    "Give an example of a reversible reaction."
]

print("Testing BoardMate RAG System")
print("="*60)

for question in questions:
    print(f"\nQ: {question}")
    print("-"*50)
    
    result = rag_pipeline.query(
        question=question,
        board="Sindh",
        class_level="10th",
        subject="Chemistry"
    )
    
    print(f"A: {result['answer'][:500]}...")
    print()

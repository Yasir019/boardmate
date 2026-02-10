from typing import List

def chunk_text(text: str, chunk_size: int = 400, overlap: int = 60) -> List[str]:
    """
    Split text into chunks with overlap.
    
    Args:
        text: Input text
        chunk_size: Target chunk size in characters (approximate tokens)
        overlap: Overlap between chunks in characters
    
    Returns:
        List of text chunks
    """
    if not text:
        return []
    
    chunks = []
    start = 0
    text_length = len(text)
    
    while start < text_length:
        # Get chunk
        end = start + chunk_size
        chunk = text[start:end]
        
        # If not at the end, try to break at word boundary
        if end < text_length:
            # Find last space in chunk
            last_space = chunk.rfind(' ')
            if last_space > 0:
                chunk = chunk[:last_space]
                end = start + last_space
        
        chunks.append(chunk.strip())
        
        # Move start forward, accounting for overlap
        start = end - overlap
        
        # Prevent infinite loop
        if start <= end - chunk_size:
            start = end
    
    return [c for c in chunks if c]  # Remove empty chunks

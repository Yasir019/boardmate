"""Text chunking utilities."""

from typing import List


def chunk_text(text: str, chunk_size: int = 400, overlap: int = 60) -> List[str]:
    """Split text into overlapping chunks, breaking at word boundaries.

    Args:
        text: Input text.
        chunk_size: Target chunk size in characters.
        overlap: Overlap between consecutive chunks in characters.

    Returns:
        List of non-empty text chunks.
    """
    if not text:
        return []

    chunks = []
    start = 0
    text_length = len(text)

    while start < text_length:
        end = start + chunk_size
        chunk = text[start:end]

        if end < text_length:
            last_space = chunk.rfind(" ")
            if last_space > 0:
                chunk = chunk[:last_space]
                end = start + last_space

        chunks.append(chunk.strip())

        start = end - overlap
        if start <= end - chunk_size:
            start = end

    return [c for c in chunks if c]

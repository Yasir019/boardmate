"""Text cleaning utilities."""

import re


def clean_text(text: str) -> str:
    """Normalise whitespace and strip leading/trailing spaces."""
    text = re.sub(r" +", " ", text)
    text = re.sub(r"\n+", "\n", text)
    return text.strip()

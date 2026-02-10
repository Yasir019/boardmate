import re

def clean_text(text: str) -> str:
    """
    Clean text by:
    - Removing extra whitespace
    - Removing excessive newlines
    - Stripping leading/trailing spaces
    """
    # Replace multiple spaces with single space
    text = re.sub(r' +', ' ', text)
    
    # Replace multiple newlines with single newline
    text = re.sub(r'\n+', '\n', text)
    
    # Strip leading and trailing whitespace
    text = text.strip()
    
    return text

import os
from pathlib import Path
from typing import List, Dict

def load_textbooks(data_dir: Path) -> List[Dict[str, str]]:
    """
    Load all .txt files from data directory.
    
    Returns list of dicts with:
    - file_path: absolute path
    - board: e.g., Punjab
    - class_level: e.g., 9
    - subject: e.g., Physics
    - chapter: e.g., ch01
    - content: text content
    """
    textbooks = []
    
    if not data_dir.exists():
        return textbooks
    
    for board_dir in data_dir.iterdir():
        if not board_dir.is_dir():
            continue
        board = board_dir.name
        
        for class_dir in board_dir.iterdir():
            if not class_dir.is_dir():
                continue
            class_level = class_dir.name
            
            for subject_dir in class_dir.iterdir():
                if not subject_dir.is_dir():
                    continue
                subject = subject_dir.name
                
                for txt_file in subject_dir.glob("*.txt"):
                    chapter = txt_file.stem
                    
                    try:
                        with open(txt_file, 'r', encoding='utf-8') as f:
                            content = f.read()
                        
                        textbooks.append({
                            "file_path": str(txt_file),
                            "board": board,
                            "class_level": class_level,
                            "subject": subject,
                            "chapter": chapter,
                            "content": content
                        })
                    except Exception as e:
                        print(f"⚠️ Error loading {txt_file}: {e}")
    
    return textbooks

# 📖 Textbook Data Directory

Place your textbook files here following the structure below.

## Folder Structure

```
data/
├── Sindh/
│   ├── 9/
│   │   ├── Physics/
│   │   │   ├── chapter1.txt
│   │   │   ├── chapter2.txt
│   │   │   └── ...
│   │   ├── Chemistry/
│   │   ├── Biology/
│   │   ├── Mathematics/
│   │   ├── English/
│   │   ├── Urdu/
│   │   └── Computer-Science/
│   ├── 10/
│   ├── 11/
│   └── 12/
├── Punjab/
├── Federal/
├── KPK/
└── Balochistan/
```

## File Requirements

- **Format**: Plain text (`.txt`)
- **Naming**: `chapter1.txt`, `chapter2.txt`, etc.
- **Encoding**: UTF-8

## Example

For Federal Board, 9th Class, Physics, Chapter 1:

```
data/Federal/9/Physics/chapter1.txt
```

## Notes

1. Each chapter should be a separate `.txt` file
2. The folder names must match exactly:
   - Boards: `Sindh`, `Punjab`, `Federal`, `KPK`, `Balochistan`
   - Classes: `9`, `10`, `11`, `12`
   - Subjects: `Physics`, `Chemistry`, `Biology`, `Mathematics`, `English`, `Urdu`, `Computer-Science`
3. After adding files, run the "Re-index" command from the Admin panel

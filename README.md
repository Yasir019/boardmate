# BoardMate

BoardMate is an AI study assistant for Pakistani board students. It combines a React frontend with a FastAPI backend and a RAG pipeline built on textbook content.

## Stack

- Frontend: React 18, Vite, React Router
- Backend: FastAPI, SQLAlchemy
- AI: Groq, LangChain, ChromaDB, sentence-transformers

## Project Structure

```text
boardmate/
|-- backend/
|   |-- app/
|   |   |-- api/
|   |   |-- core/
|   |   |-- db/
|   |   |-- rag/
|   |   |-- services/
|   |   `-- storage/
|   |-- pyproject.toml
|   `-- requirements.txt
|-- frontend/
|   |-- public/
|   |-- src/
|   |   |-- api/
|   |   |-- assets/
|   |   |-- components/
|   |   |-- pages/
|   |   |-- styles/
|   |   `-- utils/
|   `-- package.json
|-- Books/
|-- .env.example
`-- run-backend.bat
```

## Textbook Layout

BoardMate reads content from the `Books/` directory by default.

```text
Books/
`-- Board/
    `-- Class/
        `-- Subject/
            |-- All_Chapters_Extracted/
            |   `-- Chapter1.html
            `-- All_Chapters_PDFs/
                `-- Chapter1.pdf
```

You can point the backend to another dataset location with `DATA_DIR`.

## Setup

### 1. Backend

```powershell
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
Copy-Item .env.example .env
```

Fill in `.env` with at least:

- `SECRET_KEY`
- `GROQ_API_KEY`
- `ADMIN_TOKEN` if you want admin upload and reindex endpoints enabled

Run the API:

```powershell
cd backend
..\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

Or use:

```powershell
.\run-backend.bat
```

### 2. Frontend

```powershell
cd frontend
npm install
Copy-Item .env.example .env
npm run dev
```

Frontend env values:

- `VITE_API_URL` optional, leave empty in local development to use the Vite proxy
- `VITE_ADMIN_TOKEN` required only if you use frontend admin actions

## Production Notes

- Set `APP_ENV=production`
- Set a strong `SECRET_KEY`
- Set `ADMIN_TOKEN` if admin routes should remain enabled
- Set `CORS_ORIGINS` to your deployed frontend origins
- Set `VITE_API_URL` in the frontend to your deployed backend base URL
- Do not commit generated database files or vector store contents

## Useful URLs

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:8000`
- API docs: `http://localhost:8000/docs`

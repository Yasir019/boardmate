# BoardMate

BoardMate is an AI study assistant for Pakistani Board students.
It uses a React frontend, FastAPI backend, and RAG pipeline over textbook data.

## Tech Stack

- Frontend: React 18, Vite, React Router
- Backend: FastAPI, SQLAlchem
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

Stop all BoardMate dev servers:

```powershell
.\stop-all.bat
```

If you prefer separate terminals:

```powershell
.\run-backend.bat
.\run-frontend.bat
```

### 1. Prerequisites

- Python 3.10+
- Node.js 18+
- Git
- Project cloned with Books data present

### 2. Configure Environment

From project root:

```powershell
Copy-Item .env.example .env
```

Then edit `.env` and set at least:

- `GROQ_API_KEY=...`
- `SECRET_KEY=...` (any long random string for development)

Optional:

- `ADMIN_TOKEN=...` if you need admin upload/reindex routes
- `ADMIN_UPLOAD_MAX_MB=25` to control upload limit
- `LLM_MODE=auto` to use online first and local fallback
- `LOCAL_LLM_BASE_URL=http://localhost:11434`
- `LOCAL_LLM_MODEL=...` for your local model (for example qwen2.5:3b-instruct)

### 3. Start Backend

```powershell
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
.\run-backend.bat
```

Backend starts on:

- http://localhost:8000
- http://localhost:8000/docs

### 4. Start Frontend

```powershell
cd frontend
npm install
Copy-Item .env.example .env
npm run dev
```

Frontend runs on:

- http://localhost:5173

### 5. Stop Services

- Stop frontend terminal with Ctrl+C
- Stop backend terminal with Ctrl+C

## Textbook Layout

BoardMate reads content from `Books/` by default:

```text
Books/
    Board/
        Class/
            Subject/
                All_Chapters_Extracted/
                    Chapter1.html
                All_Chapters_PDFs/
                    Chapter1.pdf
```

## Common Issues and Fast Fixes

1. Frontend loads but API calls fail:
Set `GROQ_API_KEY` in `.env` and ensure backend is running on port 8000.

2. Port already in use:
Stop old processes using the same ports, then restart backend and frontend terminals.

3. Admin endpoints return disabled:
Set `ADMIN_TOKEN` in `.env` and send `X-ADMIN-TOKEN` from frontend/admin calls.

4. Chat says no textbook context:
Verify `Books/` directory exists and contains extracted chapter HTML files.

5. Online model fails:
Use `LLM_MODE=auto` or `LLM_MODE=local` and ensure local LLM service is running.

## Production Notes

- Set `APP_ENV=production`
- Set strong `SECRET_KEY`
- Set `ADMIN_TOKEN` if admin routes stay enabled
- Set `CORS_ORIGINS` to deployed frontend origins
- Set frontend `VITE_API_URL` to deployed backend base URL

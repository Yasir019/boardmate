# BoardMate

BoardMate is an AI study assistant for Pakistani board students. It combines a React frontend, a FastAPI backend, textbook-based RAG retrieval, chapter PDFs, session-aware chat, and AI study tools like quizzes, summaries, and exercise solutions.

## Live Frontend

`https://boardmate-nu.vercel.app`

## What The System Does

- Student sign up and sign in with JWT authentication
- Board -> class -> subject -> chapter navigation
- Chapter-aware chat grounded in textbook content only
- Chapter PDF viewing alongside chat
- AI studio tools for quiz generation, summaries, and exercise solutions
- Cloud and local LLM support:
  `cloud` = Groq only
  `local` = Ollama/local model only
  `auto` = cloud first, then local fallback
- Chat session history stored in SQLite for signed-in users
- Admin login plus reindex/upload backend routes

## Tech Stack

- Frontend: React 18, Vite, React Router
- Backend: FastAPI, SQLAlchemy, Pydantic Settings
- AI/RAG: Groq, Ollama-compatible local API, LangChain, ChromaDB, sentence-transformers
- Storage: SQLite for app data, Chroma vector store for textbook embeddings

## Repository Layout

```text
boardmate/
|-- backend/
|   |-- app/
|   |   |-- api/          # FastAPI routes
|   |   |-- core/         # config and security
|   |   |-- db/           # SQLAlchemy models and DB setup
|   |   |-- rag/          # textbook loading, chunking, retrieval, vector store
|   |   |-- services/     # LLM and indexing services
|   |   `-- storage/      # SQLite DB and vector store
|   |-- pyproject.toml
|   |-- requirements.txt
|   `-- uv.lock
|-- frontend/
|   |-- public/
|   `-- src/
|       |-- api/
|       |-- assets/
|       |-- components/
|       |-- data/
|       |-- pages/
|       |-- styles/
|       `-- utils/
|-- Books/
|-- .env.example
|-- run-all.bat
|-- run-backend.bat
|-- run-frontend.bat
`-- stop-all.bat
```

## Data Layout

BoardMate expects textbook content inside `Books/` in this structure:

```text
Books/
  Board/
    Class/
      Subject/
        All_Chapters_Extracted/
          Chapter1.html
          Chapter2.html
        All_Chapters_PDFs/
          Chapter1.pdf
          Chapter2.pdf
```

Notes:

- `All_Chapters_Extracted/*.html` is the main source used for RAG and chapter text.
- `All_Chapters_PDFs/*.pdf` is used for the in-app PDF viewer.
- Chapter file names must line up, for example `Chapter3.html` and `Chapter3.pdf`.

## Quick Start

### 1. Prerequisites

- Python 3.10+
- Node.js 18+
- npm
- Textbook data present in `Books/`

### 2. Configure Environment

Copy the root environment file:

```powershell
Copy-Item .env.example .env
```

Minimum recommended values:

```env
APP_ENV=development
SECRET_KEY=replace-with-a-long-random-string
GROQ_API_KEY=your_groq_api_key_here
LLM_MODE=auto
```

Helpful optional values:

```env
ADMIN_TOKEN=your_admin_token
LOCAL_LLM_BASE_URL=http://127.0.0.1:11434
LOCAL_LLM_MODEL=qwen3:4b
LOCAL_LLM_TIMEOUT_SECONDS=180
DATABASE_URL=sqlite:///backend/app/storage/app.db
DATA_DIR=Books
```

### 3. Install Backend Dependencies

From the project root:

```powershell
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
```

### 4. Install Frontend Dependencies

```powershell
cd frontend
npm install
cd ..
```

### 5. Start The App

Single command on Windows:

```powershell
.\run-all.bat
```

Or use separate terminals:

```powershell
.\run-backend.bat
.\run-frontend.bat
```

App URLs:

- Frontend: `http://localhost:5173`
- Backend API: `http://127.0.0.1:8000`
- Swagger docs: `http://127.0.0.1:8000/docs`

### 6. Stop The App

```powershell
.\stop-all.bat
```

## Environment Variables

### Backend

- `APP_ENV`: `development` or `production`
- `SECRET_KEY`: JWT signing key
- `ACCESS_TOKEN_EXPIRE_MINUTES`: token lifetime
- `ADMIN_TOKEN`: required for token-protected admin routes
- `ADMIN_UPLOAD_MAX_MB`: upload size cap for admin upload route
- `CORS_ORIGINS`: comma-separated origins or JSON-style list
- `DATA_DIR`: textbook root directory
- `DATABASE_URL`: defaults to SQLite in `backend/app/storage/app.db`
- `GROQ_API_KEY`: required for cloud mode
- `GROQ_MODEL`: Groq model name
- `LLM_MODE`: `auto`, `cloud`, or `local`
- `LOCAL_LLM_BASE_URL`: local model server URL
- `LOCAL_LLM_MODEL`: preferred local model name
- `LOCAL_LLM_TIMEOUT_SECONDS`: timeout for local generation
- `EMBEDDING_MODEL`: sentence-transformers embedding model
- `CHUNK_SIZE`, `CHUNK_OVERLAP`, `TOP_K_RESULTS`: RAG tuning

### Frontend

Frontend env vars are optional for local development because the app uses same-origin relative paths by default.

- `VITE_API_URL`: backend base URL for deployed frontend
- `VITE_ADMIN_TOKEN`: token used by admin upload/reindex calls

## Main API Areas

- `/health`: service health check
- `/auth/*`: sign up, sign in, current user profile
- `/chat/ask`: grounded chapter chat
- `/chat/runtime`: current LLM runtime availability
- `/chat/sessions`: create, list, rename, delete chat sessions
- `/chat/studio/generate`: generate quiz, summary, or exercise output
- `/api/chapters/list`: chapter listing for a subject
- `/api/chapters/content/...`: chapter HTML content
- `/api/chapters/pdf/...`: chapter PDF streaming
- `/admin/login`: admin credential login
- `/admin/reindex`: rebuild textbook embeddings
- `/admin/upload`: upload `.txt` content for admin workflows

## Admin Notes

- On first startup, the backend seeds a default admin user:
  username: `admin`
  password: `admin123`
- Admin login and admin token are separate concepts in the current codebase.
- `ADMIN_TOKEN` must be set for `/admin/reindex` and `/admin/upload`.

## Troubleshooting

### Frontend cannot reach backend

- Start the backend on port `8000`
- Check `VITE_API_URL` if frontend and backend are on different origins
- Verify `CORS_ORIGINS` includes the frontend origin

### No chapter content appears

- Confirm `Books/` exists
- Confirm each subject contains `All_Chapters_Extracted`
- Confirm chapter HTML files are present and named like `Chapter1.html`

### PDF viewer is blank or missing

- Confirm matching files exist in `All_Chapters_PDFs`
- Confirm chapter names match the HTML chapter names

### Chat works poorly or says context is missing

- Reindex the textbook data through `/admin/reindex`
- Make sure extracted chapter HTML actually contains readable textbook text

### Cloud mode fails

- Set `GROQ_API_KEY`
- Or switch to `LLM_MODE=local`

### Local mode fails

- Start your local LLM server, for example Ollama
- Verify `LOCAL_LLM_BASE_URL`
- Verify the selected `LOCAL_LLM_MODEL` exists locally

## Current Gaps Worth Cleaning Up

- The repo currently keeps both `backend/requirements.txt` and `backend/pyproject.toml` plus `backend/uv.lock`. Pick one dependency workflow and document it as the primary one.
- The frontend has optional admin API helpers, but the admin page is still minimal.
- Some static images and a couple of components appear to be no longer used.

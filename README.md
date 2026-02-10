# 📚 BoardMate

**AI-Powered Study Assistant for Pakistani Board Students**

BoardMate is a RAG (Retrieval-Augmented Generation) based educational assistant that helps students study textbook content for Pakistani board exams (Sindh, Punjab, Federal, KPK, Balochistan).

---

## 🎯 Features

- **Board-Specific Content**: Tailored for all Pakistani boards
- **Chapter-wise Learning**: Organized study material by chapters
- **AI Chat Assistant**: Ask questions and get instant explanations
- **Textbook-Based Answers**: Responses grounded in actual textbook content

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18 + Vite |
| Backend | FastAPI (Python) |
| Vector DB | ChromaDB |
| Embeddings | sentence-transformers |
| Requirements | CPU-only, 8GB RAM |

---

## 📁 Project Structure

```
boardmate/
├── frontend/               # React frontend (Vite)
│   ├── src/
│   │   ├── components/     # Reusable UI components
│   │   ├── pages/          # Page components
│   │   ├── data/           # Mock data
│   │   └── styles/         # CSS files
│   └── package.json
│
├── backend/                # FastAPI backend
│   ├── app/
│   │   ├── api/            # API routes
│   │   ├── core/           # Config & settings
│   │   ├── rag/            # RAG pipeline
│   │   ├── services/       # Business logic
│   │   └── storage/        # Vector DB storage
│   └── requirements.txt
│
├── data/                   # Textbook files (see structure below)
├── docker-compose.yml      # Docker setup (optional)
└── README.md
```

---

## 📖 Data Folder Structure

Place your textbook files in the `data/` folder following this structure:

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

**File Format**: `.txt` (plain text)

**File Naming**: `chapter1.txt`, `chapter2.txt`, etc.

---

## 🚀 Getting Started

### Prerequisites

- Python 3.10+
- Node.js 18+
- 8GB RAM minimum

### Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv .venv

# Activate (Windows)
.venv\Scripts\activate

# Activate (Linux/Mac)
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run server
uvicorn app.main:app --reload --port 8000
```

### Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Run development server
npm run dev
```

---

## 🌐 URLs

| Service | URL |
|---------|-----|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:8000 |
| API Docs | http://localhost:8000/docs |

---

## 📡 API Endpoints

### Public

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| POST | `/chat/ask` | Ask a question |

### Admin (requires `X-ADMIN-TOKEN: admin123`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/admin/upload` | Upload textbook file |
| POST | `/admin/reindex` | Re-index all textbooks |

---

## 📝 Usage

1. **Add Textbooks**: Place `.txt` files in `data/` folder following the structure above
2. **Start Servers**: Run both backend and frontend
3. **Index Content**: Go to Admin → Click "Re-index"
4. **Start Learning**: Select Board → Class → Subject → Chat!

---

## 🔧 Configuration

Environment variables (create `.env` in backend/):

```env
ADMIN_TOKEN=admin123
CHUNK_SIZE=400
CHUNK_OVERLAP=60
TOP_K_RESULTS=3
EMBEDDING_MODEL=all-MiniLM-L6-v2
```

---

## 📦 Build for Production

### Frontend

```bash
cd frontend
npm run build
# Output: frontend/dist/
```

### Backend

```bash
# Use production server
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

---

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License.

---

## 👨‍💻 Author

Built with ❤️ for Pakistani students
- RAG retrieves top 3 similar chunks per query

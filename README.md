# 🤖 AI Assistant

A full-stack AI assistant app powered by Claude AI.

## Features
- 💬 AI Chat powered by Claude (Anthropic)
- 🎤 Voice Input (speak instead of type)
- 💾 Save Chat History (multiple sessions)
- ↓ Export Conversation (download as .txt)
- 📱 Works on mobile & desktop

## Tech Stack
- Backend: Python + FastAPI
- Frontend: Next.js + TypeScript
- AI: Claude API (Anthropic)
- Deployed: Vercel + Hugging Face

## Run Locally

### Backend
```bash
cd backend
pip install -r requirements.txt
set ANTHROPIC_API_KEY=your-key-here   # Windows
python main.py
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:3000

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import sqlite3, uuid, os, httpx
from datetime import datetime
 
GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
 
app = FastAPI(title="AI Assistant API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
 
def get_db():
    conn = sqlite3.connect("assistant.db", check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn
 
def init_db():
    db = get_db()
    db.executescript("""
        CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            title TEXT DEFAULT 'New Chat',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS messages (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (session_id) REFERENCES sessions(id)
        );
    """)
    db.commit()
    db.close()
 
init_db()
 
class ChatRequest(BaseModel):
    session_id: Optional[str] = None
    message: str
 
@app.get("/sessions")
def get_sessions():
    db = get_db()
    sessions = db.execute("SELECT * FROM sessions ORDER BY created_at DESC").fetchall()
    db.close()
    return [dict(s) for s in sessions]
 
@app.post("/sessions")
def create_session():
    db = get_db()
    session_id = str(uuid.uuid4())
    db.execute("INSERT INTO sessions (id, title) VALUES (?, ?)", (session_id, "New Chat"))
    db.commit()
    db.close()
    return {"id": session_id, "title": "New Chat"}
 
@app.delete("/sessions/{session_id}")
def delete_session(session_id: str):
    db = get_db()
    db.execute("DELETE FROM messages WHERE session_id=?", (session_id,))
    db.execute("DELETE FROM sessions WHERE id=?", (session_id,))
    db.commit()
    db.close()
    return {"success": True}
 
@app.get("/sessions/{session_id}/messages")
def get_messages(session_id: str):
    db = get_db()
    msgs = db.execute("SELECT * FROM messages WHERE session_id=? ORDER BY created_at ASC", (session_id,)).fetchall()
    db.close()
    return [dict(m) for m in msgs]
 
@app.get("/sessions/{session_id}/export")
def export_session(session_id: str):
    db = get_db()
    session = db.execute("SELECT * FROM sessions WHERE id=?", (session_id,)).fetchone()
    msgs = db.execute("SELECT * FROM messages WHERE session_id=? ORDER BY created_at ASC", (session_id,)).fetchall()
    db.close()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    lines = [f"# {session['title']}", f"Exported on {datetime.utcnow().strftime('%Y-%m-%d %H:%M')} UTC", ""]
    for m in msgs:
        role = "You" if m["role"] == "user" else "AI Assistant"
        lines.append(f"{role}: {m['content']}")
        lines.append("")
    return {"title": session["title"], "content": "\n".join(lines)}
 
@app.post("/chat")
async def chat(req: ChatRequest):
    db = get_db()
 
    session_id = req.session_id
    if not session_id:
        session_id = str(uuid.uuid4())
        db.execute("INSERT INTO sessions (id, title) VALUES (?, ?)", (session_id, "New Chat"))
        db.commit()
 
    user_msg_id = str(uuid.uuid4())
    now = datetime.utcnow().isoformat()
    db.execute("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?,?,?,?,?)",
               (user_msg_id, session_id, "user", req.message, now))
    db.commit()
 
    history = db.execute(
        "SELECT role, content FROM messages WHERE session_id=? ORDER BY created_at ASC",
        (session_id,)
    ).fetchall()
 
    messages = [{"role": m["role"], "content": m["content"]} for m in history]
 
    ai_reply = "I'm sorry, I encountered an error. Please try again."
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {GROQ_API_KEY}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": "llama3-8b-8192",
                    "messages": [
                        {"role": "system", "content": "You are a helpful, friendly, and knowledgeable AI assistant. Provide clear, accurate, and concise responses. Be warm and supportive in your tone."},
                        *messages
                    ],
                    "max_tokens": 1024,
                    "temperature": 0.7
                }
            )
            data = resp.json()
            ai_reply = data["choices"][0]["message"]["content"].strip()
    except Exception as e:
        print(f"Groq error: {e}")
 
    ai_msg_id = str(uuid.uuid4())
    ai_now = datetime.utcnow().isoformat()
    db.execute("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?,?,?,?,?)",
               (ai_msg_id, session_id, "assistant", ai_reply, ai_now))
 
    msg_count = db.execute("SELECT COUNT(*) as c FROM messages WHERE session_id=?", (session_id,)).fetchone()["c"]
    if msg_count <= 2:
        title = req.message[:40] + ("..." if len(req.message) > 40 else "")
        db.execute("UPDATE sessions SET title=? WHERE id=?", (title, session_id))
 
    db.commit()
    db.close()
 
    return {"session_id": session_id, "reply": ai_reply, "msg_id": ai_msg_id}
 
if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
 
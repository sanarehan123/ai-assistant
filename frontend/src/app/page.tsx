"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import type { Session, Message } from "@/lib/api";

const SUGGESTIONS = [
  "What can you help me with?",
  "Tell me something interesting 🌍",
  "Help me write an email",
  "Explain a concept simply",
];

export default function Home() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => { loadSessions(); }, []);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);

  const loadSessions = async () => {
    try {
      const data = await apiFetch("/sessions");
      setSessions(data);
    } catch {}
  };

  const newSession = async () => {
    try {
      const s = await apiFetch("/sessions", { method: "POST" });
      setSessions(prev => [s, ...prev]);
      setActiveSession(s);
      setMessages([]);
    } catch {}
  };

  const selectSession = async (session: Session) => {
    setActiveSession(session);
    try {
      const msgs = await apiFetch(`/sessions/${session.id}/messages`);
      setMessages(msgs);
    } catch {}
  };

  const deleteSession = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    try {
      await apiFetch(`/sessions/${sessionId}`, { method: "DELETE" });
      setSessions(prev => prev.filter(s => s.id !== sessionId));
      if (activeSession?.id === sessionId) {
        setActiveSession(null);
        setMessages([]);
      }
    } catch {}
  };

  const sendMessage = async (text?: string) => {
    const msg = (text || input).trim();
    if (!msg || loading) return;
    setInput("");
    setLoading(true);

    const tempUserMsg: Message = {
      id: "temp-" + Date.now(),
      session_id: activeSession?.id || "",
      role: "user",
      content: msg,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, tempUserMsg]);

    try {
      const data = await apiFetch("/chat", {
        method: "POST",
        body: JSON.stringify({ session_id: activeSession?.id, message: msg }),
      });

      const aiMsg: Message = {
        id: data.msg_id,
        session_id: data.session_id,
        role: "assistant",
        content: data.reply,
        created_at: new Date().toISOString(),
      };

      setMessages(prev => [...prev, aiMsg]);

      // If no active session, load sessions to get the new one
      if (!activeSession) {
        const updated = await apiFetch("/sessions");
        setSessions(updated);
        const newS = updated.find((s: Session) => s.id === data.session_id);
        if (newS) setActiveSession(newS);
      } else {
        // Update session title in sidebar
        loadSessions();
      }
    } catch {
      setMessages(prev => [...prev, {
        id: "err-" + Date.now(),
        session_id: activeSession?.id || "",
        role: "assistant",
        content: "Sorry, something went wrong. Please try again.",
        created_at: new Date().toISOString(),
      }]);
    }
    setLoading(false);
  };

  const exportChat = async () => {
    if (!activeSession) return;
    try {
      const data = await apiFetch(`/sessions/${activeSession.id}/export`);
      const blob = new Blob([data.content], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${data.title.replace(/[^a-z0-9]/gi, "_")}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {}
  };

  const toggleVoice = () => {
    if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
      alert("Voice input is not supported in this browser. Please use Chrome.");
      return;
    }

    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }

    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SR();
    recognition.lang = "en-US";
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onresult = (e: any) => {
      const transcript = e.results[0][0].transcript;
      setInput(transcript);
      setListening(false);
    };

    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);

    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const adjustTextarea = () => {
    const el = textareaRef.current;
    if (el) { el.style.height = "24px"; el.style.height = el.scrollHeight + "px"; }
  };

  return (
    <div className="app">
      {/* Sidebar */}
      <div className="sidebar">
        <div className="sidebar-header">
          <div className="logo">
            <div className="logo-icon">🤖</div>
            <div className="logo-text">AI Assistant</div>
          </div>
          <button className="btn-new" onClick={newSession}>
            ✦ New Chat
          </button>
        </div>
        <div className="sidebar-label">History</div>
        <div className="session-list">
          {sessions.length === 0 && (
            <div style={{ padding: "12px", color: "var(--text3)", fontSize: "13px" }}>
              No chats yet
            </div>
          )}
          {sessions.map(s => (
            <div
              key={s.id}
              className={`session-item ${activeSession?.id === s.id ? "active" : ""}`}
              onClick={() => selectSession(s)}
            >
              <div className="session-title">💬 {s.title}</div>
              <button className="btn-delete" onClick={e => deleteSession(e, s.id)}>✕</button>
            </div>
          ))}
        </div>
      </div>

      {/* Main */}
      <div className="main">
        <div className="chat-header">
          <div>
            <div className="chat-title">{activeSession?.title || "AI Assistant"}</div>
            <div className="chat-subtitle">Powered by Claude AI · Always here to help</div>
          </div>
          {activeSession && messages.length > 0 && (
            <button className="btn-export" onClick={exportChat}>
              ↓ Export Chat
            </button>
          )}
        </div>

        <div className="messages">
          {messages.length === 0 && !loading && (
            <div className="welcome">
              <div className="welcome-icon">✦</div>
              <h2>How can I help you today?</h2>
              <p>Ask me anything — I can help with writing, learning, coding, ideas, and much more.</p>
              <div className="suggestions">
                {SUGGESTIONS.map(s => (
                  <button key={s} className="suggestion" onClick={() => sendMessage(s)}>{s}</button>
                ))}
              </div>
            </div>
          )}

          {messages.map(msg => (
            <div key={msg.id} className={`msg-row ${msg.role === "user" ? "user" : "ai"}`}>
              <div className="msg-avatar">
                {msg.role === "user" ? "👤" : "🤖"}
              </div>
              <div className="bubble" style={{ whiteSpace: "pre-wrap" }}>
                {msg.content}
              </div>
            </div>
          ))}

          {loading && (
            <div className="msg-row ai">
              <div className="msg-avatar">🤖</div>
              <div className="bubble">
                <div className="typing">
                  <span /><span /><span />
                </div>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        <div className="input-area">
          <div className="input-box">
            <textarea
              ref={textareaRef}
              placeholder={listening ? "🎤 Listening..." : "Type a message or use voice..."}
              value={input}
              onChange={e => { setInput(e.target.value); adjustTextarea(); }}
              onKeyDown={handleKeyDown}
              rows={1}
            />
            <button className={`btn-voice ${listening ? "listening" : ""}`} onClick={toggleVoice} title="Voice input">
              🎤
            </button>
            <button className="btn-send" onClick={() => sendMessage()} disabled={!input.trim() || loading}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M22 2L11 13M22 2L15 22 11 13 2 9l20-7z"/>
              </svg>
            </button>
          </div>
          <div className="input-hint">Press Enter to send · Shift+Enter for new line · 🎤 for voice</div>
        </div>
      </div>
    </div>
  );
}

export const API_BASE = process.env.NEXT_PUBLIC_API_URL || "https://sanashakeel0821-ai-assistant-backend.hf.space";

export interface Session {
  id: string;
  title: string;
  created_at: string;
}

export interface Message {
  id: string;
  session_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

export async function apiFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  if (!res.ok) throw new Error("Request failed");
  return res.json();
}

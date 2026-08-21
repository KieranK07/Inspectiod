import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { useChatStream, type ChatMessage } from "../hooks/useChatStream";
import { paneHeaderStyle, paneStyle } from "../styles";

function summarizeToolInput(input: unknown): string {
  if (input && typeof input === "object") {
    const obj = input as Record<string, unknown>;
    const key = ["file_path", "pattern", "path"].find((k) => k in obj);
    if (key) return String(obj[key]);
  }
  try {
    return JSON.stringify(input).slice(0, 80);
  } catch {
    return "";
  }
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: isUser ? "flex-end" : "flex-start" }}>
      <div
        style={{
          maxWidth: "94%",
          background: isUser ? "var(--accent)" : "var(--bg-alt)",
          color: isUser ? "#fff" : "var(--text)",
          border: isUser ? "none" : "1px solid var(--border)",
          borderRadius: 8,
          padding: "8px 12px",
          fontSize: 13,
        }}
      >
        {message.toolUses.map((t) => (
          <div
            key={t.id}
            style={{ fontSize: 11, color: isUser ? "rgba(255,255,255,0.85)" : "var(--text-dim)", marginBottom: 4 }}
          >
            🔧 {t.name}({summarizeToolInput(t.input)})
          </div>
        ))}
        {message.text ? (
          <div className="markdown-body">
            <ReactMarkdown>{message.text}</ReactMarkdown>
          </div>
        ) : (
          !isUser && <span style={{ color: "var(--text-dim)" }}>…</span>
        )}
        {message.error && <div style={{ color: "#ffb4b4", fontSize: 11, marginTop: 4 }}>{message.error}</div>}
      </div>
    </div>
  );
}

export function ChatPanel({ sessionId }: { sessionId: string }) {
  const { state, connected } = useChatStream(sessionId);
  const [input, setInput] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [state.messages]);

  async function handleSend() {
    const text = input.trim();
    if (!text || state.busy) return;
    setInput("");
    setSendError(null);
    try {
      const resp = await fetch(`/api/sessions/${sessionId}/chat/message`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}) as { error?: string });
        setSendError(body.error ?? `Failed to send (${resp.status})`);
      }
    } catch (err) {
      setSendError(String(err));
    }
  }

  return (
    <div style={paneStyle}>
      <div style={paneHeaderStyle}>Chat{connected ? "" : " (reconnecting…)"}</div>
      <div ref={scrollRef} style={{ flex: 1, overflow: "auto", padding: 10, display: "flex", flexDirection: "column", gap: 10 }}>
        {state.messages.length === 0 && (
          <div style={{ color: "var(--text-dim)", fontSize: 13 }}>
            Ask about this session — Claude can read, grep, and search every captured file.
          </div>
        )}
        {state.messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}
      </div>
      {(state.error || sendError) && (
        <div style={{ color: "#ff6b6b", fontSize: 12, padding: "0 10px 6px" }}>{state.error ?? sendError}</div>
      )}
      <div style={{ display: "flex", gap: 8, padding: 10, borderTop: "1px solid var(--border)" }}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void handleSend();
            }
          }}
          placeholder="Ask about this session…"
          rows={2}
          style={{
            flex: 1,
            resize: "none",
            background: "var(--bg-alt)",
            color: "var(--text)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            padding: "6px 10px",
            fontFamily: "inherit",
          }}
        />
        <button onClick={() => void handleSend()} disabled={state.busy || !input.trim()}>
          {state.busy ? "…" : "Send"}
        </button>
      </div>
    </div>
  );
}

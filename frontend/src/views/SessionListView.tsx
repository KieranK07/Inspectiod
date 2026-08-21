import { useEffect, useState } from "react";
import type { SessionIndexEntry } from "../types";

function formatDuration(startTime: string, endTime: string | null): string {
  const start = new Date(startTime).getTime();
  const end = endTime ? new Date(endTime).getTime() : Date.now();
  const secs = Math.max(0, Math.round((end - start) / 1000));
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}m ${s}s`;
}

export function SessionListView({ onSelect }: { onSelect: (id: string) => void }) {
  const [sessions, setSessions] = useState<SessionIndexEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/sessions")
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setSessions(d.sessions ?? []);
      })
      .catch((err) => {
        if (!cancelled) setError(String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <div style={{ color: "var(--text-dim)" }}>Loading sessions…</div>;
  if (error) return <div style={{ color: "#ff6b6b" }}>{error}</div>;
  if (sessions.length === 0) {
    return <div style={{ color: "var(--text-dim)" }}>No sessions yet. Start one from Live Capture.</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 720 }}>
      {sessions.map((s) => (
        <button
          key={s.id}
          onClick={() => onSelect(s.id)}
          style={{
            textAlign: "left",
            background: "var(--bg-alt)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: "10px 14px",
            color: "var(--text)",
            cursor: "pointer",
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <strong style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.targetUrl}</strong>
            <span style={{ fontSize: 12, color: s.status === "running" ? "var(--accent)" : "var(--text-dim)" }}>{s.status}</span>
          </div>
          <div style={{ fontSize: 12, color: "var(--text-dim)" }}>
            {new Date(s.startTime).toLocaleString()} · {formatDuration(s.startTime, s.endTime)}
          </div>
          <div style={{ display: "flex", gap: 16, fontSize: 12, color: "var(--text-dim)" }}>
            <span>console: {s.counts.consoleLines}</span>
            <span>ws frames: {s.counts.wsFrames}</span>
            <span>bundles: {s.counts.bundleCount}</span>
          </div>
        </button>
      ))}
    </div>
  );
}

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

export function SessionListView({
  onSelect,
  onDeleted,
  onReopenInLiveCapture,
}: {
  onSelect: (id: string) => void;
  onDeleted?: (id: string) => void;
  onReopenInLiveCapture?: (targetUrl: string, stateExpression: string) => void;
}) {
  const [sessions, setSessions] = useState<SessionIndexEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleDelete(id: string, targetUrl: string) {
    if (!window.confirm(`Delete this session (${targetUrl})? This removes all captured files and can't be undone.`)) {
      return;
    }
    setDeletingId(id);
    setDeleteError(null);
    try {
      const resp = await fetch(`/api/sessions/${id}`, { method: "DELETE" });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}) as { error?: string });
        setDeleteError(body.error ?? `Failed to delete (${resp.status})`);
        return;
      }
      setSessions((prev) => prev.filter((s) => s.id !== id));
      onDeleted?.(id);
    } catch (err) {
      setDeleteError(String(err));
    } finally {
      setDeletingId(null);
    }
  }

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
      {deleteError && <div style={{ color: "#ff6b6b", fontSize: 12 }}>{deleteError}</div>}
      {sessions.map((s) => (
        <div
          key={s.id}
          role="button"
          tabIndex={0}
          onClick={() => onSelect(s.id)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSelect(s.id);
          }}
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
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <strong style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {s.targetUrl}
            </strong>
            <span style={{ fontSize: 12, color: s.status === "running" ? "var(--accent)" : "var(--text-dim)" }}>{s.status}</span>
            {onReopenInLiveCapture && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onReopenInLiveCapture(s.targetUrl, s.stateExpression ?? "");
                }}
                title="Start a new capture against this same URL"
                style={{
                  flex: "0 0 auto",
                  background: "transparent",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  color: "var(--text-dim)",
                  cursor: "pointer",
                  fontSize: 12,
                  lineHeight: 1,
                  padding: "4px 8px",
                  whiteSpace: "nowrap",
                }}
              >
                Reopen in Live Capture
              </button>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                void handleDelete(s.id, s.targetUrl);
              }}
              disabled={deletingId === s.id}
              title="Delete session"
              style={{
                flex: "0 0 auto",
                background: "transparent",
                border: "1px solid var(--border)",
                borderRadius: 6,
                color: "var(--text-dim)",
                cursor: "pointer",
                fontSize: 12,
                lineHeight: 1,
                padding: "4px 8px",
              }}
            >
              {deletingId === s.id ? "…" : "Delete"}
            </button>
          </div>
          <div style={{ fontSize: 12, color: "var(--text-dim)" }}>
            {new Date(s.startTime).toLocaleString()} · {formatDuration(s.startTime, s.endTime)}
          </div>
          <div style={{ display: "flex", gap: 16, fontSize: 12, color: "var(--text-dim)" }}>
            <span>console: {s.counts.consoleLines}</span>
            <span>ws frames: {s.counts.wsFrames}</span>
            <span>bundles: {s.counts.bundleCount}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

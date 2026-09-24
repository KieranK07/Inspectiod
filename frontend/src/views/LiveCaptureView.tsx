import { useEffect, useRef, useState } from "react";
import { useCaptureStream } from "../hooks/useCaptureStream";
import { paneHeaderStyle, paneStyle } from "../styles";

function LogPane({ title, lines }: { title: string; lines: string[] }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [lines]);

  return (
    <div style={paneStyle}>
      <div style={paneHeaderStyle}>{title}</div>
      <div
        ref={ref}
        style={{ flex: 1, minHeight: 0, overflow: "auto", padding: 8, fontFamily: "var(--mono)", fontSize: 12, whiteSpace: "pre-wrap" }}
      >
        {lines.length === 0 && <div style={{ color: "var(--text-dim)" }}>waiting for activity…</div>}
        {lines.map((line, i) => (
          <div key={i} style={{ marginBottom: 4 }}>
            {line}
          </div>
        ))}
      </div>
    </div>
  );
}

function FileListPane({ title, files }: { title: string; files: string[] }) {
  return (
    <div style={paneStyle}>
      <div style={paneHeaderStyle}>
        {title} ({files.length})
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: 8, fontFamily: "var(--mono)", fontSize: 12 }}>
        {files.length === 0 && <div style={{ color: "var(--text-dim)" }}>none yet</div>}
        {files.map((f) => (
          <div key={f}>{f}</div>
        ))}
      </div>
    </div>
  );
}

export interface CapturePrefill {
  url: string;
  stateExpression: string;
  key: number;
}

export function LiveCaptureView({ prefill }: { prefill?: CapturePrefill | null }) {
  const { state, connected } = useCaptureStream();
  const [url, setUrl] = useState("");
  const [stateExpression, setStateExpression] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [snapshotMessage, setSnapshotMessage] = useState<string | null>(null);
  const [snapshotBusy, setSnapshotBusy] = useState(false);
  const handledPrefillKey = useRef<number | null>(null);

  async function startCapture(targetUrl: string, expr: string) {
    setError(null);
    setBusy(true);
    try {
      const resp = await fetch("/api/capture/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: targetUrl, stateExpression: expr }),
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}) as { error?: string });
        setError(body.error ?? `Failed to start (${resp.status})`);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!prefill || handledPrefillKey.current === prefill.key) return;
    handledPrefillKey.current = prefill.key;
    setUrl(prefill.url);
    setStateExpression(prefill.stateExpression);
    void startCapture(prefill.url, prefill.stateExpression);
  }, [prefill?.key]);

  async function handleStart() {
    await startCapture(url, stateExpression);
  }

  async function handleStop() {
    setError(null);
    setBusy(true);
    try {
      const resp = await fetch("/api/capture/stop", { method: "POST" });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}) as { error?: string });
        setError(body.error ?? `Failed to stop (${resp.status})`);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleSnapshot() {
    setSnapshotMessage(null);
    setSnapshotBusy(true);
    try {
      const resp = await fetch("/api/capture/snapshot", { method: "POST" });
      const body = await resp.json().catch(() => ({}) as { filename?: string; error?: string });
      if (!resp.ok) {
        setSnapshotMessage(body.error ?? `Snapshot failed (${resp.status})`);
      } else {
        setSnapshotMessage(`Saved ${body.filename}`);
      }
    } catch (err) {
      setSnapshotMessage(String(err));
    } finally {
      setSnapshotBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com"
          disabled={state.active}
          style={{
            flex: 1,
            background: "var(--bg-alt)",
            color: "var(--text)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            padding: "6px 10px",
          }}
        />
        <input
          value={stateExpression}
          onChange={(e) => setStateExpression(e.target.value)}
          placeholder="state expr, e.g. window.gameState (optional)"
          disabled={state.active}
          style={{
            flex: 1,
            background: "var(--bg-alt)",
            color: "var(--text)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            padding: "6px 10px",
            fontFamily: "var(--mono)",
            fontSize: 12,
          }}
        />
        {!state.active ? (
          <button onClick={handleStart} disabled={busy || !url.trim()}>
            Start
          </button>
        ) : (
          <button onClick={handleStop} disabled={busy}>
            Stop
          </button>
        )}
        <span style={{ fontSize: 12, color: "var(--text-dim)" }}>stream: {connected ? "connected" : "reconnecting…"}</span>
      </div>

      {error && <div style={{ color: "#ff6b6b", fontSize: 13 }}>{error}</div>}

      {state.sessionId && (
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <div style={{ fontSize: 12, color: "var(--text-dim)", display: "flex", gap: 16, flexWrap: "wrap" }}>
            <span>session: {state.sessionId}</span>
            <span>target: {state.targetUrl}</span>
            <span>status: {state.active ? "running" : "stopped"}</span>
            <span>console: {state.counts.consoleLines}</span>
            <span>ws frames: {state.counts.wsFrames}</span>
            <span>bundles: {state.counts.bundleCount}</span>
            <span>state dumps: {state.counts.stateDumps}</span>
          </div>
          {state.active && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
              <button onClick={handleSnapshot} disabled={snapshotBusy}>
                {snapshotBusy ? "Snapshotting…" : "Snapshot state now"}
              </button>
              <span style={{ fontSize: 12, color: "var(--text-dim)" }}>or press Ctrl+Shift+S in the browser</span>
              {snapshotMessage && <span style={{ fontSize: 12, color: "var(--text-dim)" }}>{snapshotMessage}</span>}
            </div>
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: 12, flex: 1, minHeight: 0 }}>
        <LogPane title="Console (tail)" lines={state.consoleTail} />
        <LogPane title="WS frames (tail)" lines={state.wsTail} />
        <div style={{ display: "flex", flexDirection: "column", gap: 12, width: 220, flex: "0 0 220px" }}>
          <FileListPane title="Bundles loaded" files={state.bundleFilenames} />
          <FileListPane title="State dumps" files={state.stateDumpFilenames} />
        </div>
      </div>
    </div>
  );
}

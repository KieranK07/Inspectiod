import { useEffect, useState } from "react";
import { paneHeaderStyle, paneStyle, formatBytes } from "../styles";
import type { SessionManifest } from "../types";
import { buildTree, FileTree } from "./FileTree";
import { ChatPanel } from "./ChatPanel";

interface FilePreview {
  path: string;
  bytes: number;
  truncated: boolean;
  content: string;
}

export function InspectorView({ sessionId }: { sessionId: string | null }) {
  const [manifest, setManifest] = useState<SessionManifest | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [preview, setPreview] = useState<FilePreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    setManifest(null);
    setSelectedPath(null);
    setPreview(null);
    setError(null);
    fetch(`/api/sessions/${sessionId}`)
      .then((r) => r.json())
      .then(setManifest)
      .catch((err) => setError(String(err)));
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId || !selectedPath) return;
    setLoadingPreview(true);
    fetch(`/api/sessions/${sessionId}/file?path=${encodeURIComponent(selectedPath)}`)
      .then((r) => r.json())
      .then(setPreview)
      .catch((err) => setError(String(err)))
      .finally(() => setLoadingPreview(false));
  }, [sessionId, selectedPath]);

  if (!sessionId) {
    return <div style={{ color: "var(--text-dim)" }}>Select a session from the Sessions tab.</div>;
  }
  if (error) return <div style={{ color: "#ff6b6b" }}>{error}</div>;
  if (!manifest) return <div style={{ color: "var(--text-dim)" }}>Loading session…</div>;

  const tree = buildTree(manifest.files ?? []);

  return (
    <div style={{ display: "flex", gap: 12, height: "100%" }}>
      <div style={{ ...paneStyle, width: 280, flex: "0 0 280px" }}>
        <div style={paneHeaderStyle}>
          <div>{sessionId}</div>
          <div style={{ marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{manifest.targetUrl}</div>
        </div>
        <div style={{ flex: 1, overflow: "auto", padding: 8 }}>
          <FileTree nodes={tree} selected={selectedPath} onSelectFile={setSelectedPath} />
        </div>
      </div>
      <div style={paneStyle}>
        <div style={paneHeaderStyle}>{selectedPath ?? "Select a file to preview"}</div>
        <div style={{ flex: 1, overflow: "auto", padding: 8, fontFamily: "var(--mono)", fontSize: 12, whiteSpace: "pre-wrap" }}>
          {loadingPreview && <span style={{ color: "var(--text-dim)" }}>Loading…</span>}
          {!loadingPreview && preview && (
            <>
              {preview.truncated && (
                <div style={{ color: "var(--text-dim)", marginBottom: 8 }}>
                  Showing first {formatBytes(preview.content.length)} of {formatBytes(preview.bytes)} (truncated).
                </div>
              )}
              {preview.content}
            </>
          )}
          {!loadingPreview && !preview && !selectedPath && (
            <span style={{ color: "var(--text-dim)" }}>Click a file on the left to preview its contents.</span>
          )}
        </div>
      </div>
      <div style={{ width: 420, flex: "0 0 420px" }}>
        <ChatPanel sessionId={sessionId} />
      </div>
    </div>
  );
}

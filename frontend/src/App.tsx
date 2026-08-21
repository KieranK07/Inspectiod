import { useEffect, useState } from "react";
import { LiveCaptureView } from "./views/LiveCaptureView";
import { SessionListView } from "./views/SessionListView";
import { InspectorView } from "./views/InspectorView";

type View = "sessions" | "capture" | "inspector";

function App() {
  const [view, setView] = useState<View>("sessions");
  const [apiOk, setApiOk] = useState<boolean | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((d) => setApiOk(Boolean(d.ok)))
      .catch(() => setApiOk(false));
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          padding: "10px 16px",
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-alt)",
        }}
      >
        <strong>Inspectiod</strong>
        <nav style={{ display: "flex", gap: 8 }}>
          {(
            [
              ["sessions", "Sessions"],
              ["capture", "Live Capture"],
              ["inspector", "Inspector + Chat"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setView(key)}
              style={{
                background: view === key ? "var(--accent)" : "transparent",
                color: view === key ? "#fff" : "var(--text)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                padding: "4px 10px",
                cursor: "pointer",
              }}
            >
              {label}
            </button>
          ))}
        </nav>
        <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--text-dim)" }}>
          api: {apiOk === null ? "…" : apiOk ? "ok" : "unreachable"}
        </span>
      </header>
      <main style={{ flex: 1, padding: 16, overflow: "auto" }}>
        {view === "sessions" && (
          <SessionListView
            onSelect={(id) => {
              setSelectedSessionId(id);
              setView("inspector");
            }}
          />
        )}
        {view === "capture" && <LiveCaptureView />}
        {view === "inspector" && <InspectorView sessionId={selectedSessionId} />}
      </main>
    </div>
  );
}

export default App;

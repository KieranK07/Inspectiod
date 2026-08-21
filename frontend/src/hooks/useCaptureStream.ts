import { useEffect, useState } from "react";

export interface SessionCounts {
  consoleLines: number;
  wsFrames: number;
  bundleCount: number;
  stateDumps: number;
}

export interface CaptureState {
  active: boolean;
  sessionId: string | null;
  targetUrl: string | null;
  startTime: string | null;
  counts: SessionCounts;
  consoleTail: string[];
  wsTail: string[];
  bundleFilenames: string[];
  stateDumpFilenames: string[];
}

interface LiveSnapshotPayload {
  sessionId: string;
  targetUrl: string;
  startTime: string;
  counts: SessionCounts;
  consoleTail: string[];
  wsTail: string[];
  bundleFilenames: string[];
  stateDumpFilenames: string[];
}

const EMPTY_COUNTS: SessionCounts = { consoleLines: 0, wsFrames: 0, bundleCount: 0, stateDumps: 0 };

const IDLE_STATE: CaptureState = {
  active: false,
  sessionId: null,
  targetUrl: null,
  startTime: null,
  counts: EMPTY_COUNTS,
  consoleTail: [],
  wsTail: [],
  bundleFilenames: [],
  stateDumpFilenames: [],
};

const MAX_CLIENT_TAIL = 300;

function fromSnapshot(payload: LiveSnapshotPayload): CaptureState {
  return {
    active: true,
    sessionId: payload.sessionId,
    targetUrl: payload.targetUrl,
    startTime: payload.startTime,
    counts: payload.counts,
    consoleTail: payload.consoleTail ?? [],
    wsTail: payload.wsTail ?? [],
    bundleFilenames: payload.bundleFilenames ?? [],
    stateDumpFilenames: payload.stateDumpFilenames ?? [],
  };
}

export function useCaptureStream(): { state: CaptureState; connected: boolean } {
  const [state, setState] = useState<CaptureState>(IDLE_STATE);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let closedByUnmount = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      const proto = location.protocol === "https:" ? "wss:" : "ws:";
      ws = new WebSocket(`${proto}//${location.host}/api/capture/stream`);

      ws.onopen = () => setConnected(true);
      ws.onclose = () => {
        setConnected(false);
        if (!closedByUnmount) retryTimer = setTimeout(connect, 1500);
      };
      ws.onerror = () => ws?.close();

      ws.onmessage = (evt) => {
        const msg = JSON.parse(evt.data as string) as { type: string; payload: unknown };
        setState((prev) => applyEvent(prev, msg.type, msg.payload));
      };
    }

    connect();
    return () => {
      closedByUnmount = true;
      if (retryTimer) clearTimeout(retryTimer);
      ws?.close();
    };
  }, []);

  return { state, connected };
}

function applyEvent(prev: CaptureState, type: string, payload: unknown): CaptureState {
  switch (type) {
    case "snapshot":
    case "started":
      return payload ? fromSnapshot(payload as LiveSnapshotPayload) : IDLE_STATE;
    case "console": {
      const p = payload as { line: string; counts: SessionCounts };
      return { ...prev, counts: p.counts, consoleTail: [...prev.consoleTail, p.line].slice(-MAX_CLIENT_TAIL) };
    }
    case "ws-frame": {
      const p = payload as { line: string; counts: SessionCounts };
      return { ...prev, counts: p.counts, wsTail: [...prev.wsTail, p.line].slice(-MAX_CLIENT_TAIL) };
    }
    case "bundle": {
      const p = payload as { filename: string; counts: SessionCounts };
      return {
        ...prev,
        counts: p.counts,
        bundleFilenames: prev.bundleFilenames.includes(p.filename)
          ? prev.bundleFilenames
          : [...prev.bundleFilenames, p.filename],
      };
    }
    case "state-dump": {
      const p = payload as { filename: string; counts: SessionCounts };
      return {
        ...prev,
        counts: p.counts,
        stateDumpFilenames: prev.stateDumpFilenames.includes(p.filename)
          ? prev.stateDumpFilenames
          : [...prev.stateDumpFilenames, p.filename],
      };
    }
    case "stopped":
      return { ...prev, active: false };
    default:
      return prev;
  }
}

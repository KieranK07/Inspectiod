export interface SessionCounts {
  consoleLines: number;
  wsFrames: number;
  bundleCount: number;
  stateDumps: number;
}

export type SessionStatus = "running" | "stopped";

export interface SessionIndexEntry {
  id: string;
  targetUrl: string;
  startTime: string;
  endTime: string | null;
  status: SessionStatus;
  counts: SessionCounts;
}

export interface FileIndexEntry {
  path: string;
  bytes: number;
}

export interface SessionManifest {
  id: string;
  targetUrl: string;
  startTime: string;
  endTime: string | null;
  status: SessionStatus;
  bundles: string[];
  files: FileIndexEntry[];
  counts: SessionCounts;
}

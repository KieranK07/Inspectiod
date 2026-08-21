import fs from "node:fs";
import path from "node:path";
import { SESSIONS_ROOT } from "./paths.js";

export interface FileIndexEntry {
  path: string;
  bytes: number;
}

export interface SessionCounts {
  consoleLines: number;
  wsFrames: number;
  bundleCount: number;
  stateDumps: number;
}

export type SessionStatus = "running" | "stopped";

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

export interface SessionIndexEntry {
  id: string;
  targetUrl: string;
  startTime: string;
  endTime: string | null;
  status: SessionStatus;
  counts: SessionCounts;
}

export function writeManifest(dir: string, manifest: SessionManifest): void {
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));
}

export function buildFileIndex(dir: string): FileIndexEntry[] {
  const results: FileIndexEntry[] = [];
  const walk = (current: string) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        results.push({ path: path.relative(dir, full), bytes: fs.statSync(full).size });
      }
    }
  };
  walk(dir);
  return results.sort((a, b) => a.path.localeCompare(b.path));
}

export function upsertSessionsIndex(entry: SessionIndexEntry): void {
  fs.mkdirSync(SESSIONS_ROOT, { recursive: true });
  const indexPath = path.join(SESSIONS_ROOT, "index.json");
  let sessions: SessionIndexEntry[] = [];
  if (fs.existsSync(indexPath)) {
    try {
      sessions = (JSON.parse(fs.readFileSync(indexPath, "utf-8")).sessions as SessionIndexEntry[]) ?? [];
    } catch {
      sessions = [];
    }
  }
  const i = sessions.findIndex((s) => s.id === entry.id);
  if (i >= 0) {
    sessions[i] = entry;
  } else {
    sessions.unshift(entry);
  }
  fs.writeFileSync(indexPath, JSON.stringify({ sessions }, null, 2));
}

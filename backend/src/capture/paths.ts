import fs from "node:fs";
import path from "node:path";

export const SESSIONS_ROOT = process.env.SESSIONS_DIR
  ? path.resolve(process.env.SESSIONS_DIR)
  : path.resolve(process.cwd(), "..", "sessions");

export function ensureSessionsRoot(): void {
  fs.mkdirSync(SESSIONS_ROOT, { recursive: true });
}

export function newSessionId(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

export function sessionDir(id: string): string {
  return path.join(SESSIONS_ROOT, id);
}

export function isValidSessionId(id: string): boolean {
  return /^[0-9A-Za-z_-]+$/.test(id);
}

export function resolveSessionDir(id: string): string | null {
  if (!isValidSessionId(id)) return null;
  const dir = sessionDir(id);
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return null;
  return dir;
}

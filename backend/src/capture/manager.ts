import { EventEmitter } from "node:events";
import { startCapture, type CaptureHandle, type LiveSnapshot, type SnapshotResult } from "./session.js";
import type { SessionManifest } from "./manifest.js";

export const captureEvents = new EventEmitter();

let active: CaptureHandle | null = null;

export function isCapturing(): boolean {
  return active !== null;
}

export function getSnapshot(): LiveSnapshot | null {
  return active ? active.snapshot() : null;
}

export async function startSession(url: string, stateExpression = ""): Promise<{ sessionId: string }> {
  if (active) throw new Error("A capture session is already running.");
  const handle = await startCapture(url, stateExpression);
  active = handle;

  handle.events.on("console", (payload) => captureEvents.emit("console", payload));
  handle.events.on("ws-frame", (payload) => captureEvents.emit("ws-frame", payload));
  handle.events.on("bundle", (payload) => captureEvents.emit("bundle", payload));
  handle.events.on("state-dump", (payload) => captureEvents.emit("state-dump", payload));
  handle.events.on("stopped", (manifest: SessionManifest) => {
    active = null;
    captureEvents.emit("stopped", manifest);
  });

  captureEvents.emit("started", handle.snapshot());
  return { sessionId: handle.sessionId };
}

export async function stopSession(): Promise<SessionManifest> {
  if (!active) throw new Error("No capture session is running.");
  return active.stop();
}

export async function triggerSnapshot(): Promise<SnapshotResult> {
  if (!active) return { ok: false, error: "No capture session is running." };
  return active.triggerSnapshot();
}

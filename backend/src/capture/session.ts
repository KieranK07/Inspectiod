import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { EventEmitter } from "node:events";
import { chromium } from "playwright";
import type { Page, Response, WebSocket } from "playwright";
import { ensureBrowserProfileDir, ensureSessionsRoot, newSessionId, sessionDir, BROWSER_PROFILE_DIR } from "./paths.js";
import {
  buildFileIndex,
  writeManifest,
  upsertSessionsIndex,
  type SessionCounts,
  type SessionManifest,
} from "./manifest.js";
import { buildSnapshotInitScript } from "./injectedSnapshot.js";

const MAX_TAIL_LINES = 200;

export interface LiveSnapshot {
  sessionId: string;
  targetUrl: string;
  startTime: string;
  counts: SessionCounts;
  consoleTail: string[];
  wsTail: string[];
  bundleFilenames: string[];
  stateDumpFilenames: string[];
}

export type SnapshotResult = { ok: true; filename: string } | { ok: false; error: string };

export interface CaptureHandle {
  sessionId: string;
  sessionDir: string;
  events: EventEmitter;
  snapshot(): LiveSnapshot;
  triggerSnapshot(): Promise<SnapshotResult>;
  stop(): Promise<SessionManifest>;
}

interface CaptureState {
  dir: string;
  bundlesDir: string;
  stateDumpsDir: string;
  consoleStream: fs.WriteStream;
  wsStream: fs.WriteStream;
  domCaptured: boolean;
  downloadedBundleUrls: Set<string>;
  usedBundleNames: Set<string>;
  bundleFilenames: string[];
  stateDumpFilenames: string[];
  counts: SessionCounts;
  consoleTail: string[];
  wsTail: string[];
  events: EventEmitter;
}

function pushTail(tail: string[], line: string): void {
  tail.push(line);
  if (tail.length > MAX_TAIL_LINES) tail.shift();
}

function closeStream(stream: fs.WriteStream): Promise<void> {
  return new Promise((resolve, reject) => {
    stream.end((err?: Error | null) => (err ? reject(err) : resolve()));
  });
}

function bundleFilename(url: string, used: Set<string>): string {
  let base: string;
  try {
    base = path.basename(new URL(url).pathname) || "bundle.js";
  } catch {
    base = "bundle.js";
  }
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  const hash = crypto.createHash("sha1").update(url).digest("hex").slice(0, 8);
  const ext = path.extname(base);
  const stem = ext ? base.slice(0, -ext.length) : base;
  const name = `${stem}.${hash}${ext}`;
  used.add(name);
  return name;
}

function logLine(ctx: CaptureState, tag: string, text: string): void {
  const line = `[${new Date().toISOString()}] [${tag}] ${text}`;
  ctx.consoleStream.write(line + "\n");
  pushTail(ctx.consoleTail, line);
  ctx.events.emit("console", { line, counts: { ...ctx.counts } });
}

async function handlePageLoad(page: Page, ctx: CaptureState): Promise<void> {
  if (ctx.domCaptured) return;
  const html = await page.content();
  fs.writeFileSync(path.join(ctx.dir, "dom-snapshot.html"), html);
  ctx.domCaptured = true;
}

async function handleScriptResponse(resp: Response, ctx: CaptureState): Promise<void> {
  const url = resp.url();
  if (ctx.downloadedBundleUrls.has(url)) return;
  ctx.downloadedBundleUrls.add(url);
  try {
    const body = await resp.body();
    const filename = bundleFilename(url, ctx.usedBundleNames);
    fs.writeFileSync(path.join(ctx.bundlesDir, filename), body);
    ctx.bundleFilenames.push(filename);
    ctx.counts.bundleCount = ctx.bundleFilenames.length;
    ctx.events.emit("bundle", { filename, counts: { ...ctx.counts } });
  } catch (err) {
    logLine(ctx, "capture-error", `bundle capture failed for ${url}: ${String(err)}`);
  }
}

function writeWsFrame(
  ctx: CaptureState,
  direction: "sent" | "received",
  url: string,
  payload: string | Buffer,
): void {
  const text = typeof payload === "string" ? payload : payload.toString("utf-8");
  let formatted = text;
  try {
    formatted = JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    // not JSON, keep raw text
  }
  const block = `[${new Date().toISOString()}] [${direction}] ${url}\n${formatted}`;
  ctx.wsStream.write(block + "\n\n");
  pushTail(ctx.wsTail, block);
  ctx.counts.wsFrames++;
  ctx.events.emit("ws-frame", { line: block, counts: { ...ctx.counts } });
}

function saveStateDump(ctx: CaptureState, data: unknown): string {
  ctx.counts.stateDumps++;
  const nnnn = String(ctx.counts.stateDumps).padStart(4, "0");
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `${nnnn}-${ts}.json`;
  fs.writeFileSync(path.join(ctx.stateDumpsDir, filename), JSON.stringify(data, null, 2));
  ctx.stateDumpFilenames.push(filename);
  ctx.events.emit("state-dump", { filename, counts: { ...ctx.counts } });
  return filename;
}

function attachWebSocketListeners(ws: WebSocket, ctx: CaptureState): void {
  const url = ws.url();
  ws.on("framesent", (evt) => writeWsFrame(ctx, "sent", url, evt.payload));
  ws.on("framereceived", (evt) => writeWsFrame(ctx, "received", url, evt.payload));
}

function attachPageListeners(page: Page, ctx: CaptureState): void {
  page.on("console", (msg) => {
    ctx.counts.consoleLines++;
    logLine(ctx, `console.${msg.type()}`, msg.text());
  });
  page.on("pageerror", (err) => {
    ctx.counts.consoleLines++;
    logLine(ctx, "pageerror", err.stack ?? err.message);
  });
  page.on("websocket", (ws) => attachWebSocketListeners(ws, ctx));
  page.on("response", (resp) => {
    if (resp.request().resourceType() === "script") {
      void handleScriptResponse(resp, ctx).catch((err) => {
        logLine(ctx, "capture-error", `response handler: ${String(err)}`);
      });
    }
  });
  page.on("load", () => {
    void handlePageLoad(page, ctx).catch((err) => {
      logLine(ctx, "capture-error", `page-load handler: ${String(err)}`);
    });
  });
}

export async function startCapture(targetUrl: string, stateExpression = ""): Promise<CaptureHandle> {
  ensureSessionsRoot();
  const id = newSessionId();
  const dir = sessionDir(id);
  const bundlesDir = path.join(dir, "bundles");
  const stateDumpsDir = path.join(dir, "state-dumps");
  fs.mkdirSync(bundlesDir, { recursive: true });
  fs.mkdirSync(stateDumpsDir, { recursive: true });

  const consoleStream = fs.createWriteStream(path.join(dir, "console.log"), { flags: "a" });
  const wsStream = fs.createWriteStream(path.join(dir, "ws-frames.log"), { flags: "a" });

  ensureBrowserProfileDir();
  // Persistent profile (not a throwaway context) so logins survive across
  // capture sessions — Google's sign-in flow refuses to complete inside a
  // freshly-automated browser, so the login has to happen once and stick.
  const context = await chromium.launchPersistentContext(BROWSER_PROFILE_DIR, {
    headless: false,
    channel: "chrome",
    args: ["--disable-blink-features=AutomationControlled"],
    recordHar: { path: path.join(dir, "network.har"), content: "embed" },
  });

  const ctx: CaptureState = {
    dir,
    bundlesDir,
    stateDumpsDir,
    consoleStream,
    wsStream,
    domCaptured: false,
    downloadedBundleUrls: new Set(),
    usedBundleNames: new Set(),
    bundleFilenames: [],
    stateDumpFilenames: [],
    counts: { consoleLines: 0, wsFrames: 0, bundleCount: 0, stateDumps: 0 },
    consoleTail: [],
    wsTail: [],
    events: new EventEmitter(),
  };

  context.on("page", (p) => attachPageListeners(p, ctx));

  await context.exposeFunction("__inspectiod_reportSnapshot", (data: unknown) => {
    saveStateDump(ctx, data);
  });
  await context.addInitScript({ content: buildSnapshotInitScript(stateExpression) });

  const startTime = new Date().toISOString();
  writeManifest(dir, {
    id,
    targetUrl,
    startTime,
    endTime: null,
    status: "running",
    bundles: [],
    files: [],
    counts: ctx.counts,
  });
  upsertSessionsIndex({ id, targetUrl, startTime, endTime: null, status: "running", counts: ctx.counts });

  const page = await context.newPage();
  await page.goto(targetUrl, { waitUntil: "load" });

  let finalized = false;
  let finalManifest: SessionManifest | null = null;

  const finalize = async (): Promise<SessionManifest> => {
    if (finalized) return finalManifest!;
    finalized = true;

    try {
      await context.close();
    } catch {
      // context/browser may already be gone if the user closed the window
    }

    await closeStream(consoleStream);
    await closeStream(wsStream);

    const endTime = new Date().toISOString();
    ctx.counts.bundleCount = ctx.bundleFilenames.length;
    finalManifest = {
      id,
      targetUrl,
      startTime,
      endTime,
      status: "stopped",
      bundles: ctx.bundleFilenames,
      files: buildFileIndex(dir),
      counts: { ...ctx.counts },
    };
    writeManifest(dir, finalManifest);
    upsertSessionsIndex({
      id,
      targetUrl,
      startTime,
      endTime,
      status: "stopped",
      counts: finalManifest.counts,
    });
    ctx.events.emit("stopped", finalManifest);
    return finalManifest;
  };

  context.on("close", () => {
    void finalize();
  });

  const snapshot = (): LiveSnapshot => ({
    sessionId: id,
    targetUrl,
    startTime,
    counts: { ...ctx.counts },
    consoleTail: [...ctx.consoleTail],
    wsTail: [...ctx.wsTail],
    bundleFilenames: [...ctx.bundleFilenames],
    stateDumpFilenames: [...ctx.stateDumpFilenames],
  });

  const triggerSnapshot = async (): Promise<SnapshotResult> => {
    if (finalized) return { ok: false, error: "Session is no longer running." };
    let data: unknown;
    try {
      data = await page.evaluate(() => {
        const w = window as unknown as { __inspectiod_snapshotState?: () => unknown };
        return w.__inspectiod_snapshotState ? w.__inspectiod_snapshotState() : { __error: "Snapshot hook not installed on this page." };
      });
    } catch (err) {
      return { ok: false, error: String(err) };
    }
    if (data && typeof data === "object" && "__error" in data) {
      return { ok: false, error: String((data as { __error: unknown }).__error) };
    }
    const filename = saveStateDump(ctx, data);
    return { ok: true, filename };
  };

  return { sessionId: id, sessionDir: dir, events: ctx.events, snapshot, triggerSnapshot, stop: finalize };
}

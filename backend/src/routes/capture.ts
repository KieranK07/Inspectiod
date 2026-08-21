import type { FastifyInstance } from "fastify";
import {
  captureEvents,
  getSnapshot,
  isCapturing,
  startSession,
  stopSession,
  triggerSnapshot,
} from "../capture/manager.js";

interface StartBody {
  url?: string;
  stateExpression?: string;
}

export async function captureRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: StartBody }>("/api/capture/start", async (req, reply) => {
    const url = req.body?.url?.trim();
    if (!url) {
      return reply.code(400).send({ error: "url is required" });
    }
    try {
      new URL(url);
    } catch {
      return reply.code(400).send({ error: "url must be a valid absolute URL" });
    }
    if (isCapturing()) {
      return reply.code(409).send({ error: "A capture session is already running" });
    }
    try {
      return await startSession(url, req.body?.stateExpression ?? "");
    } catch (err) {
      return reply.code(500).send({ error: String(err) });
    }
  });

  app.post("/api/capture/stop", async (_req, reply) => {
    if (!isCapturing()) {
      return reply.code(409).send({ error: "No capture session is running" });
    }
    try {
      return await stopSession();
    } catch (err) {
      return reply.code(500).send({ error: String(err) });
    }
  });

  app.post("/api/capture/snapshot", async (_req, reply) => {
    if (!isCapturing()) {
      return reply.code(409).send({ error: "No capture session is running" });
    }
    const result = await triggerSnapshot();
    if (!result.ok) return reply.code(422).send({ error: result.error });
    return result;
  });

  app.get("/api/capture/status", async () => {
    const snapshot = getSnapshot();
    return { active: snapshot !== null, snapshot };
  });

  app.get("/api/capture/stream", { websocket: true }, (socket) => {
    const send = (type: string, payload: unknown) => {
      socket.send(JSON.stringify({ type, payload }));
    };

    send("snapshot", getSnapshot());

    const onStarted = (payload: unknown) => send("started", payload);
    const onConsole = (payload: unknown) => send("console", payload);
    const onWsFrame = (payload: unknown) => send("ws-frame", payload);
    const onBundle = (payload: unknown) => send("bundle", payload);
    const onStateDump = (payload: unknown) => send("state-dump", payload);
    const onStopped = (payload: unknown) => send("stopped", payload);

    captureEvents.on("started", onStarted);
    captureEvents.on("console", onConsole);
    captureEvents.on("ws-frame", onWsFrame);
    captureEvents.on("bundle", onBundle);
    captureEvents.on("state-dump", onStateDump);
    captureEvents.on("stopped", onStopped);

    socket.on("close", () => {
      captureEvents.off("started", onStarted);
      captureEvents.off("console", onConsole);
      captureEvents.off("ws-frame", onWsFrame);
      captureEvents.off("bundle", onBundle);
      captureEvents.off("state-dump", onStateDump);
      captureEvents.off("stopped", onStopped);
    });
  });
}

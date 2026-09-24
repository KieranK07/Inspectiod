import type { FastifyInstance } from "fastify";
import { resolveSessionDir } from "../capture/paths.js";
import { chatEvents, getChatSnapshot, isBusy, sendMessage } from "../chat/manager.js";

interface SendBody {
  text?: string;
  model?: string;
}

export async function chatRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Params: { id: string }; Body: SendBody }>("/api/sessions/:id/chat/message", async (req, reply) => {
    const dir = resolveSessionDir(req.params.id);
    if (!dir) return reply.code(404).send({ error: "session not found" });

    const text = req.body?.text?.trim();
    if (!text) return reply.code(400).send({ error: "text is required" });

    if (isBusy(req.params.id)) {
      return reply.code(409).send({ error: "Claude is still responding to the previous message" });
    }

    void sendMessage(req.params.id, dir, text, req.body?.model);
    return { ok: true };
  });

  app.get<{ Params: { id: string } }>("/api/sessions/:id/chat/stream", { websocket: true }, (socket, req) => {
    const sessionId = req.params.id;
    const dir = resolveSessionDir(sessionId);
    if (!dir) {
      socket.send(JSON.stringify({ type: "error", message: "session not found" }));
      socket.close();
      return;
    }

    const send = (payload: unknown) => socket.send(JSON.stringify(payload));
    send({ type: "snapshot", ...getChatSnapshot(sessionId) });

    const handler = (payload: unknown) => send(payload);
    chatEvents.on(sessionId, handler);
    socket.on("close", () => chatEvents.off(sessionId, handler));
  });
}

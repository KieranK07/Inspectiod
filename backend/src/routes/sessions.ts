import fs from "node:fs";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { SESSIONS_ROOT, resolveSessionDir } from "../capture/paths.js";
import { buildFileIndex, type SessionIndexEntry } from "../capture/manifest.js";

const MAX_PREVIEW_BYTES = 2 * 1024 * 1024;

function readIndex(): SessionIndexEntry[] {
  const indexPath = path.join(SESSIONS_ROOT, "index.json");
  if (!fs.existsSync(indexPath)) return [];
  try {
    return (JSON.parse(fs.readFileSync(indexPath, "utf-8")).sessions as SessionIndexEntry[]) ?? [];
  } catch {
    return [];
  }
}

export async function sessionRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/sessions", async () => {
    return { sessions: readIndex() };
  });

  app.get<{ Params: { id: string } }>("/api/sessions/:id", async (req, reply) => {
    const dir = resolveSessionDir(req.params.id);
    if (!dir) return reply.code(404).send({ error: "session not found" });
    const manifestPath = path.join(dir, "manifest.json");
    if (!fs.existsSync(manifestPath)) return reply.code(404).send({ error: "manifest not found" });

    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    manifest.files = buildFileIndex(dir);
    return manifest;
  });

  app.get<{ Params: { id: string }; Querystring: { path?: string } }>(
    "/api/sessions/:id/file",
    async (req, reply) => {
      const dir = resolveSessionDir(req.params.id);
      if (!dir) return reply.code(404).send({ error: "session not found" });

      const rel = req.query.path;
      if (!rel) return reply.code(400).send({ error: "path is required" });

      const resolved = path.resolve(dir, rel);
      if (resolved !== dir && !resolved.startsWith(dir + path.sep)) {
        return reply.code(400).send({ error: "invalid path" });
      }
      if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
        return reply.code(404).send({ error: "file not found" });
      }

      const stat = fs.statSync(resolved);
      const truncated = stat.size > MAX_PREVIEW_BYTES;
      const readLength = truncated ? MAX_PREVIEW_BYTES : stat.size;
      const buffer = Buffer.alloc(readLength);
      const fd = fs.openSync(resolved, "r");
      try {
        fs.readSync(fd, buffer, 0, readLength, 0);
      } finally {
        fs.closeSync(fd);
      }

      return { path: rel, bytes: stat.size, truncated, content: buffer.toString("utf-8") };
    },
  );
}

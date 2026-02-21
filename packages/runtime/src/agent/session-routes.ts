import type { FastifyInstance } from "fastify";
import type { SessionManager } from "./session-manager.js";
import {
  SessionNotFoundError,
  SessionBusyError,
  SessionCapReachedError,
  SessionConfig,
  toHttpStatus,
  toSafeMessage,
} from "@mecha/contracts";

export function registerSessionRoutes(
  app: FastifyInstance,
  sessionManager: SessionManager | undefined,
): void {
  // If no session manager, all routes return 503
  if (!sessionManager) {
    const unavailable = async (_req: unknown, reply: { code: (n: number) => { send: (body: unknown) => unknown } }) =>
      reply.code(503).send({ error: "Sessions not available" });
    app.post("/api/sessions", unavailable);
    app.get("/api/sessions", unavailable);
    app.get("/api/sessions/:id", unavailable);
    app.delete("/api/sessions/:id", unavailable);
    app.post("/api/sessions/:id/message", unavailable);
    app.post("/api/sessions/:id/interrupt", unavailable);
    app.put("/api/sessions/:id/config", unavailable);
    return;
  }

  const sm = sessionManager;

  // POST /api/sessions — create session
  app.post("/api/sessions", async (req, reply) => {
    try {
      const body = (req.body ?? {}) as { title?: string; config?: unknown };
      let config;
      if (body.config) {
        const parsed = SessionConfig.safeParse(body.config);
        if (!parsed.success) {
          return reply.code(400).send({ error: "Invalid config", details: parsed.error.issues });
        }
        config = parsed.data;
      }
      const session = sm.create({ title: body.title, config });
      return reply.code(201).send(session);
    } catch (err) {
      return reply.code(toHttpStatus(err)).send({ error: toSafeMessage(err) });
    }
  });

  // GET /api/sessions — list sessions
  app.get("/api/sessions", async (_req, reply) => {
    const sessions = sm.list();
    return reply.send(sessions);
  });

  // GET /api/sessions/:id — get session detail
  app.get("/api/sessions/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const query = req.query as { limit?: string; offset?: string };
    const limit = Math.min(Math.max(parseInt(query.limit ?? "50", 10) || 50, 1), 200);
    const offset = Math.max(parseInt(query.offset ?? "0", 10) || 0, 0);

    const session = sm.get(id, limit, offset);
    if (!session) {
      return reply.code(404).send({ error: `Session not found: ${id}` });
    }
    return reply.send(session);
  });

  // DELETE /api/sessions/:id — delete session
  app.delete("/api/sessions/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const deleted = sm.delete(id);
    if (!deleted) {
      return reply.code(404).send({ error: `Session not found: ${id}` });
    }
    return reply.code(204).send();
  });

  // POST /api/sessions/:id/message — send message (SSE stream)
  app.post("/api/sessions/:id/message", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as { message?: string } | null;
    if (!body?.message) {
      return reply.code(400).send({ error: "Missing 'message' field" });
    }

    // Validate session exists and is not busy before starting stream
    const session = sm.get(id);
    if (!session) {
      return reply.code(404).send({ error: `Session not found: ${id}` });
    }
    if (session.state === "busy") {
      return reply.code(409).send({ error: `Session is busy: ${id}` });
    }

    try {
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      reply.hijack();

      // Emit session event at stream start
      reply.raw.write(`data: ${JSON.stringify({ type: "session", session_id: id })}\n\n`);

      const stream = sm.sendMessage(id, body.message);
      for await (const msg of stream) {
        if (req.raw.destroyed) break;
        reply.raw.write(`data: ${JSON.stringify(msg)}\n\n`);
      }

      reply.raw.write("data: [DONE]\n\n");
      reply.raw.end();
    } catch (err) {
      if (err instanceof SessionNotFoundError || err instanceof SessionBusyError || err instanceof SessionCapReachedError) {
        if (!reply.raw.headersSent) {
          return reply.code(toHttpStatus(err)).send({ error: toSafeMessage(err) });
        }
      }
      if (!reply.raw.headersSent) {
        return reply.code(500).send({ error: "Internal error" });
      }
      // If headers already sent (streaming), send interrupt event and close
      reply.raw.write(`data: ${JSON.stringify({ type: "error", error: toSafeMessage(err) })}\n\n`);
      reply.raw.write("data: [DONE]\n\n");
      reply.raw.end();
    }
  });

  // POST /api/sessions/:id/interrupt — interrupt session
  app.post("/api/sessions/:id/interrupt", async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const interrupted = sm.interrupt(id);
      return reply.send({ interrupted });
    } catch (err) {
      return reply.code(toHttpStatus(err)).send({ error: toSafeMessage(err) });
    }
  });

  // PUT /api/sessions/:id/config — update session config
  app.put("/api/sessions/:id/config", async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = SessionConfig.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid config", details: parsed.error.issues });
    }
    try {
      const detail = sm.updateConfig(id, parsed.data);
      return reply.send({ sessionId: detail.sessionId, config: detail.config });
    } catch (err) {
      return reply.code(toHttpStatus(err)).send({ error: toSafeMessage(err) });
    }
  });
}

import Fastify, { type FastifyInstance } from "fastify";
import type { MechaId, MechaState } from "@mecha/core";
import { registerMcpRoutes } from "./mcp/server.js";
import { registerAgentRoutes } from "./agent/casa.js";

export interface ServerOptions {
  /** Mecha ID for this runtime instance */
  mechaId: MechaId;
  /** Runtime version string */
  version?: string;
  /** Logger configuration */
  logger?: boolean;
}

export function createServer(opts: ServerOptions): FastifyInstance {
  const startTime = Date.now();
  const app = Fastify({ logger: opts.logger ?? false });

  // --- health check (no auth) ---
  app.get("/healthz", async (_req, reply) => {
    const uptime = Math.floor((Date.now() - startTime) / 1000);
    return reply.send({ status: "ok", uptime });
  });

  // --- runtime info ---
  app.get("/info", async (_req, reply) => {
    const uptime = Math.floor((Date.now() - startTime) / 1000);
    const info = {
      id: opts.mechaId,
      version: opts.version ?? "0.1.0",
      uptime,
      state: "running" as MechaState,
    };
    return reply.send(info);
  });

  // --- register sub-routes ---
  registerMcpRoutes(app);
  registerAgentRoutes(app);

  // --- graceful shutdown ---
  const shutdown = async () => {
    await app.close();
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  return app;
}

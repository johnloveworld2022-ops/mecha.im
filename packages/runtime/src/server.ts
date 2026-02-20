import Fastify, { type FastifyInstance } from "fastify";
import type { MechaId, MechaState } from "@mecha/core";
import { createMcpServer, registerMcpRoutes } from "./mcp/server.js";
import { registerAgentRoutes } from "./agent/casa.js";
import type { AgentOptions } from "./agent/casa.js";
import { generateToken, createAuthMiddleware } from "./auth/token.js";

export interface ServerOptions {
  /** Mecha ID for this runtime instance */
  mechaId: MechaId;
  /** Runtime version string */
  version?: string;
  /** Logger configuration */
  logger?: boolean;
  /** Skip MCP server setup (for testing) */
  skipMcp?: boolean;
  /** Agent configuration (omit to disable agent endpoint) */
  agent?: Omit<AgentOptions, "mechaId">;
  /** Auth token — if omitted, one is generated and logged */
  authToken?: string;
  /** Skip auth middleware (for testing) */
  skipAuth?: boolean;
}

export function createServer(opts: ServerOptions): FastifyInstance {
  const startTime = Date.now();
  const app = Fastify({ logger: opts.logger ?? false });

  // --- auth middleware (skips /healthz) ---
  if (!opts.skipAuth) {
    const token = opts.authToken ?? generateToken();
    app.addHook("onReady", () => {
      if (!opts.authToken) {
        app.log.info(`Auth token: ${token}`);
      }
    });
    app.addHook("preHandler", createAuthMiddleware(token));
  }

  // --- health check (no auth — middleware skips /healthz) ---
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
  if (!opts.skipMcp) {
    const mcpHandle = createMcpServer(opts.mechaId);
    registerMcpRoutes(app, mcpHandle);
  }
  const agentOpts = opts.agent
    ? { mechaId: opts.mechaId, ...opts.agent }
    : undefined;
  registerAgentRoutes(app, agentOpts);

  // --- graceful shutdown ---
  const cleanup = () => {
    process.removeListener("SIGTERM", onSignal);
    process.removeListener("SIGINT", onSignal);
  };

  const onSignal = async () => {
    cleanup();
    await app.close();
  };

  process.on("SIGTERM", onSignal);
  process.on("SIGINT", onSignal);

  // Also clean up listeners when app.close() is called directly (e.g., in tests)
  app.addHook("onClose", async () => {
    cleanup();
  });

  return app;
}

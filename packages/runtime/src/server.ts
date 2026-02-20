import Fastify, { type FastifyInstance } from "fastify";
import type { MechaId, MechaState } from "@mecha/core";
import { createMcpServer, registerMcpRoutes } from "./mcp/server.js";
import { registerAgentRoutes, type AgentOptions } from "./agent/casa.js";
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
  /** OTP shared secret for browser-friendly access */
  otp?: string;
  /** Skip auth middleware (for testing) */
  skipAuth?: boolean;
}

export function createServer(opts: ServerOptions): FastifyInstance {
  const startTime = Date.now();
  const getUptime = () => Math.floor((Date.now() - startTime) / 1000);
  const app = Fastify({ logger: opts.logger ?? false });

  // --- auth middleware (skips /healthz) ---
  if (!opts.skipAuth) {
    const token = opts.authToken ?? generateToken();
    if (!opts.authToken) app.addHook("onReady", () => app.log.info(`Auth token: ${token.slice(0, 8)}…`));
    app.addHook("preHandler", createAuthMiddleware(token, opts.otp));
  }

  app.get("/healthz", async (_req, reply) => reply.send({ status: "ok", uptime: getUptime() }));

  app.get("/info", async (_req, reply) => reply.send({
    id: opts.mechaId, version: opts.version ?? "0.1.0", uptime: getUptime(), state: "running" as MechaState,
  }));

  if (!opts.skipMcp) registerMcpRoutes(app, createMcpServer(opts.mechaId));
  registerAgentRoutes(app, opts.agent ? { mechaId: opts.mechaId, ...opts.agent } : undefined);

  // --- graceful shutdown ---
  const onSignal = async () => { cleanup(); await app.close(); };
  const cleanup = () => { process.removeListener("SIGTERM", onSignal); process.removeListener("SIGINT", onSignal); };
  process.on("SIGTERM", onSignal);
  process.on("SIGINT", onSignal);
  app.addHook("onClose", async () => cleanup());

  return app;
}

import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import { createDockerClient } from "@mecha/docker";
import type { DockerClient } from "@mecha/docker";
import { createBearerAuth } from "./auth.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerMechaRoutes } from "./routes/mechas.js";
import { registerSessionRoutes } from "./routes/sessions.js";
import { registerEventRoutes } from "./routes/events.js";
import { readNodes } from "./node-registry.js";
import { startHeartbeat } from "./heartbeat.js";
import type { NodeHealth } from "./heartbeat.js";

export interface AgentServerOptions {
  port?: number;
  host?: string;
  apiKey: string;
}

export interface AgentServer {
  app: FastifyInstance;
  start: () => Promise<void>;
  stop: () => Promise<void>;
}

export async function createAgentServer(opts: AgentServerOptions): Promise<AgentServer> {
  const { port = 7660, host = "0.0.0.0", apiKey } = opts;
  const app = Fastify({ logger: false });
  const docker: DockerClient = createDockerClient();

  app.addHook("preHandler", createBearerAuth(apiKey));

  let nodeHealth: NodeHealth[] = [];

  const startedAt = Date.now();

  registerHealthRoutes(app, {
    startedAt,
    docker,
    getNodeHealth: () => nodeHealth,
  });
  registerMechaRoutes(app, docker);
  registerSessionRoutes(app, docker);
  registerEventRoutes(app, docker);

  let heartbeatHandle: { stop: () => void } | null = null;

  async function start(): Promise<void> {
    await app.listen({ port, host });

    heartbeatHandle = startHeartbeat({
      nodes: () => readNodes(),
      intervalMs: 15_000,
      onUpdate(health) {
        nodeHealth = health;
      },
    });
  }

  async function stop(): Promise<void> {
    heartbeatHandle?.stop();
    await app.close();
  }

  return { app, start, stop };
}

import { hostname } from "node:os";
import type { FastifyInstance } from "fastify";
import type { DockerClient } from "@mecha/docker";
import { listMechaContainers } from "@mecha/docker";
import type { NodeHealth } from "../heartbeat.js";

export interface HealthDeps {
  docker: DockerClient;
  startedAt: number;
  getNodeHealth: () => NodeHealth[];
}

export function registerHealthRoutes(app: FastifyInstance, deps: HealthDeps): void {
  app.get("/healthz", async () => {
    let mechaCount = 0;
    try {
      const containers = await listMechaContainers(deps.docker);
      mechaCount = containers.length;
    } catch {
      // Docker may be unreachable; still report healthy
    }
    const uptimeSeconds = Math.floor((Date.now() - deps.startedAt) / 1000);
    return {
      status: "ok",
      node: hostname(),
      mechaCount,
      uptime: uptimeSeconds,
    };
  });

  app.get("/nodes/health", async () => {
    return deps.getNodeHealth();
  });
}

import { describe, it, expect, vi } from "vitest";
import Fastify from "fastify";
import { registerHealthRoutes } from "../../src/routes/health.js";
import type { DockerClient } from "@mecha/docker";

vi.mock("node:os", async (importOriginal) => {
  const orig = await importOriginal<typeof import("node:os")>();
  return { ...orig, hostname: () => "test-machine" };
});

const mockListMechaContainers = vi.fn();
vi.mock("@mecha/docker", () => ({
  listMechaContainers: (...args: unknown[]) => mockListMechaContainers(...args),
}));

describe("health routes", () => {
  function buildApp(opts?: { nodeHealth?: unknown[] }) {
    const app = Fastify();
    const docker = { docker: {} } as DockerClient;
    registerHealthRoutes(app, {
      docker,
      startedAt: Date.now() - 5000, // 5 seconds ago
      getNodeHealth: () => (opts?.nodeHealth ?? []) as never,
    });
    return app;
  }

  describe("GET /healthz", () => {
    it("returns status ok with node info and mecha count", async () => {
      mockListMechaContainers.mockResolvedValue([{}, {}, {}]);
      const app = buildApp();
      const res = await app.inject({ method: "GET", url: "/healthz" });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.status).toBe("ok");
      expect(body.node).toBe("test-machine");
      expect(body.mechaCount).toBe(3);
      expect(body.uptime).toBeGreaterThanOrEqual(4);
    });

    it("returns mechaCount 0 when Docker is unreachable", async () => {
      mockListMechaContainers.mockRejectedValue(new Error("Docker not available"));
      const app = buildApp();
      const res = await app.inject({ method: "GET", url: "/healthz" });
      expect(res.statusCode).toBe(200);
      expect(res.json().mechaCount).toBe(0);
    });
  });

  describe("GET /nodes/health", () => {
    it("returns current node health data", async () => {
      const healthData = [
        { name: "node-a", host: "1.2.3.4:7660", status: "online", lastSeen: "2024-01-01T00:00:00Z", latencyMs: 5, mechaCount: 2 },
      ];
      const app = buildApp({ nodeHealth: healthData });
      const res = await app.inject({ method: "GET", url: "/nodes/health" });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual(healthData);
    });

    it("returns empty array when no nodes registered", async () => {
      const app = buildApp();
      const res = await app.inject({ method: "GET", url: "/nodes/health" });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual([]);
    });
  });
});

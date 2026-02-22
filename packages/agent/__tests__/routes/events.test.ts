import { describe, it, expect, vi } from "vitest";
import Fastify from "fastify";
import { registerEventRoutes } from "../../src/routes/events.js";
import type { DockerClient } from "@mecha/docker";

const mockWatchContainerEvents = vi.fn();
vi.mock("@mecha/docker", () => ({
  watchContainerEvents: (...args: unknown[]) => mockWatchContainerEvents(...args),
}));

describe("event routes", () => {
  const docker = { docker: {} } as DockerClient;

  function buildApp() {
    const app = Fastify();
    registerEventRoutes(app, docker);
    return app;
  }

  describe("GET /events", () => {
    it("streams SSE events from Docker", async () => {
      const events = [
        { action: "start", containerId: "c1", containerName: "mecha-1", mechaId: "m1", time: 100 },
        { action: "stop", containerId: "c1", containerName: "mecha-1", mechaId: "m1", time: 200 },
      ];

      mockWatchContainerEvents.mockImplementation(async function* () {
        for (const e of events) yield e;
      });

      const app = buildApp();
      const res = await app.inject({ method: "GET", url: "/events" });
      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toBe("text/event-stream");
      expect(res.body).toContain(`data: ${JSON.stringify(events[0])}`);
      expect(res.body).toContain(`data: ${JSON.stringify(events[1])}`);
    });

    it("handles stream errors gracefully", async () => {
      mockWatchContainerEvents.mockImplementation(async function* () {
        throw new Error("Docker gone");
        // This yield is unreachable but required for TS generator type
        yield undefined as never;
      });

      const app = buildApp();
      const res = await app.inject({ method: "GET", url: "/events" });
      expect(res.statusCode).toBe(200);
    });
  });
});

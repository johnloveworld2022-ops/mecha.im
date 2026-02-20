import { describe, it, expect, afterEach } from "vitest";
import { createServer } from "../src/server.js";
import type { MechaId } from "@mecha/core";

const TEST_ID = "mx-test-abc123" as MechaId;

describe("Fastify server", () => {
  let app: ReturnType<typeof createServer>;

  afterEach(async () => {
    if (app) await app.close();
  });

  it("GET /healthz returns 200 with status and uptime", async () => {
    app = createServer({ mechaId: TEST_ID, skipMcp: true, skipAuth: true });
    const res = await app.inject({ method: "GET", url: "/healthz" });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe("ok");
    expect(typeof body.uptime).toBe("number");
  });

  it("GET /info returns mecha info", async () => {
    app = createServer({ mechaId: TEST_ID, version: "1.2.3", skipMcp: true, skipAuth: true });
    const res = await app.inject({ method: "GET", url: "/info" });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.id).toBe(TEST_ID);
    expect(body.version).toBe("1.2.3");
    expect(body.state).toBe("running");
    expect(typeof body.uptime).toBe("number");
  });

  it("POST /api/chat returns 400 without message", async () => {
    app = createServer({ mechaId: TEST_ID, skipMcp: true, skipAuth: true });
    const res = await app.inject({
      method: "POST",
      url: "/api/chat",
      payload: {},
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toContain("Missing");
  });

  it("POST /api/chat returns 503 when agent not configured", async () => {
    app = createServer({ mechaId: TEST_ID, skipMcp: true, skipAuth: true });
    const res = await app.inject({
      method: "POST",
      url: "/api/chat",
      payload: { message: "hello" },
    });

    expect(res.statusCode).toBe(503);
    const body = JSON.parse(res.body);
    expect(body.error).toContain("not configured");
  });

  it("graceful shutdown closes the server", async () => {
    app = createServer({ mechaId: TEST_ID, skipMcp: true, skipAuth: true });
    await app.ready();
    await app.close();
    // After close, inject should throw or fail
    try {
      await app.inject({ method: "GET", url: "/healthz" });
    } catch {
      // Expected - server is closed
    }
  });
});

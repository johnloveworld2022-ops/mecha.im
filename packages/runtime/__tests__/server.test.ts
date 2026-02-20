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
    app = createServer({ mechaId: TEST_ID });
    const res = await app.inject({ method: "GET", url: "/healthz" });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe("ok");
    expect(typeof body.uptime).toBe("number");
  });

  it("GET /info returns mecha info", async () => {
    app = createServer({ mechaId: TEST_ID, version: "1.2.3" });
    const res = await app.inject({ method: "GET", url: "/info" });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.id).toBe(TEST_ID);
    expect(body.version).toBe("1.2.3");
    expect(body.state).toBe("running");
    expect(typeof body.uptime).toBe("number");
  });

  it("POST /mcp returns 501 stub", async () => {
    app = createServer({ mechaId: TEST_ID });
    const res = await app.inject({ method: "POST", url: "/mcp" });

    expect(res.statusCode).toBe(501);
  });

  it("POST /api/chat returns 501 stub", async () => {
    app = createServer({ mechaId: TEST_ID });
    const res = await app.inject({ method: "POST", url: "/api/chat" });

    expect(res.statusCode).toBe(501);
  });

  it("graceful shutdown closes the server", async () => {
    app = createServer({ mechaId: TEST_ID });
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

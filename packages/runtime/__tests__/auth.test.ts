import { describe, it, expect, afterEach } from "vitest";
import { generateToken, createAuthMiddleware } from "../src/auth/token.js";
import { createServer } from "../src/server.js";
import type { MechaId } from "@mecha/core";

const TEST_ID = "mx-test-abc123" as MechaId;

describe("Auth token", () => {
  it("generates a 64-character hex token", () => {
    const token = generateToken();
    expect(token).toHaveLength(64);
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it("generates unique tokens each time", () => {
    const t1 = generateToken();
    const t2 = generateToken();
    expect(t1).not.toBe(t2);
  });
});

describe("Auth middleware", () => {
  let app: ReturnType<typeof createServer>;
  const token = generateToken();

  afterEach(async () => {
    if (app) await app.close();
  });

  function makeApp() {
    app = createServer({ mechaId: TEST_ID, skipMcp: true, authToken: token });
    return app;
  }

  it("allows requests with valid Bearer token", async () => {
    makeApp();
    const res = await app.inject({
      method: "GET",
      url: "/info",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
  });

  it("rejects requests without token", async () => {
    makeApp();
    const res = await app.inject({
      method: "GET",
      url: "/info",
    });
    expect(res.statusCode).toBe(401);
  });

  it("rejects requests with invalid token", async () => {
    makeApp();
    const res = await app.inject({
      method: "GET",
      url: "/info",
      headers: { authorization: "Bearer invalid-token" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("bypasses auth for /healthz", async () => {
    makeApp();
    const res = await app.inject({
      method: "GET",
      url: "/healthz",
    });
    expect(res.statusCode).toBe(200);
  });
});

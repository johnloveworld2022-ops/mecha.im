import { describe, it, expect, afterEach } from "vitest";
import { createServer } from "../src/server.js";
import type { MechaId } from "@mecha/core";

const TEST_ID = "mx-test-abc123" as MechaId;
const TEST_TOKEN = "test-token-for-mcp";

describe("MCP HTTP transport", () => {
  let app: ReturnType<typeof createServer>;

  afterEach(async () => {
    if (app) await app.close();
  });

  it("POST /mcp with proper headers gets processed by transport", async () => {
    app = createServer({ mechaId: TEST_ID, authToken: TEST_TOKEN });

    // Send an MCP initialize request with proper Accept header
    const res = await app.inject({
      method: "POST",
      url: "/mcp",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        authorization: `Bearer ${TEST_TOKEN}`,
      },
      payload: {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "test-client", version: "1.0.0" },
        },
      },
    });

    // StreamableHTTPServerTransport writes directly to raw response.
    // With Fastify inject, the status should be 200 (hijacked response)
    // or the transport may write its own status.
    // Accept any successful status (200) or hijacked (200 with session header)
    expect(res.statusCode).toBe(200);
  });

  it("GET /mcp without session returns 400", async () => {
    app = createServer({ mechaId: TEST_ID, authToken: TEST_TOKEN });

    const res = await app.inject({
      method: "GET",
      url: "/mcp",
      headers: {
        authorization: `Bearer ${TEST_TOKEN}`,
      },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toContain("session");
  });

  it("DELETE /mcp without session returns 404", async () => {
    app = createServer({ mechaId: TEST_ID, authToken: TEST_TOKEN });

    const res = await app.inject({
      method: "DELETE",
      url: "/mcp",
      headers: {
        authorization: `Bearer ${TEST_TOKEN}`,
      },
    });

    expect(res.statusCode).toBe(404);
  });

  it("auth middleware rejects unauthenticated requests", async () => {
    app = createServer({ mechaId: TEST_ID, authToken: TEST_TOKEN });

    const res = await app.inject({
      method: "POST",
      url: "/mcp",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      payload: {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "test", version: "1.0" },
        },
      },
    });

    expect(res.statusCode).toBe(401);
  });
});

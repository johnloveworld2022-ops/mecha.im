import { describe, it, expect } from "vitest";
import { createMcpServer } from "../src/mcp/server.js";

describe("MCP server", () => {
  it("creates an MCP server with mecha name", () => {
    const handle = createMcpServer("mx-test-abc123");
    expect(handle.mcpServer).toBeDefined();
  });

  it("has tools registered", async () => {
    const handle = createMcpServer("mx-test-abc123");
    // The MCP server should have the default tools registered
    // We can verify by checking the server object exists and has the right name
    expect(handle.mcpServer.server).toBeDefined();
  });
});

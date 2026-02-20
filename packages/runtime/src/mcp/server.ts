import type { FastifyInstance } from "fastify";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { randomUUID } from "node:crypto";

export interface McpServerHandle {
  mcpServer: McpServer;
}

/**
 * Create and configure an MCP server with default tools.
 */
export function createMcpServer(mechaId: string): McpServerHandle {
  const mcpServer = new McpServer(
    { name: `mecha-${mechaId}`, version: "0.1.0" },
    { capabilities: { tools: {} } },
  );

  // Register built-in tools
  registerDefaultTools(mcpServer);

  return { mcpServer };
}

/**
 * Register MCP routes on Fastify using StreamableHTTPServerTransport.
 * Each session gets its own transport (stateful mode).
 */
export function registerMcpRoutes(
  app: FastifyInstance,
  handle: McpServerHandle,
): void {
  const sessions = new Map<string, StreamableHTTPServerTransport>();

  // POST /mcp — main MCP endpoint
  app.post("/mcp", async (req, reply) => {
    const sessionId = (req.headers["mcp-session-id"] as string) || undefined;

    let transport: StreamableHTTPServerTransport;

    if (sessionId && sessions.has(sessionId)) {
      transport = sessions.get(sessionId)!;
    } else {
      // New session
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
      });

      await handle.mcpServer.connect(transport);

      // Extract session ID from transport after connect
      const newSessionId = transport.sessionId;
      if (newSessionId) {
        sessions.set(newSessionId, transport);
        transport.onclose = () => {
          sessions.delete(newSessionId);
        };
      }
    }

    // Forward the raw Node.js request/response to the transport
    await transport.handleRequest(req.raw, reply.raw, req.body);

    // Mark reply as sent since we wrote directly to raw response
    reply.hijack();
  });

  // GET /mcp — SSE stream for server-to-client notifications
  app.get("/mcp", async (req, reply) => {
    const sessionId = (req.headers["mcp-session-id"] as string) || undefined;
    if (!sessionId || !sessions.has(sessionId)) {
      return reply.code(400).send({ error: "Invalid or missing session ID" });
    }

    const transport = sessions.get(sessionId)!;
    await transport.handleRequest(req.raw, reply.raw);
    reply.hijack();
  });

  // DELETE /mcp — close session
  app.delete("/mcp", async (req, reply) => {
    const sessionId = (req.headers["mcp-session-id"] as string) || undefined;
    if (!sessionId || !sessions.has(sessionId)) {
      return reply.code(404).send({ error: "Session not found" });
    }

    const transport = sessions.get(sessionId)!;
    await transport.handleRequest(req.raw, reply.raw);
    reply.hijack();
  });
}

/**
 * Register default MCP tools for a Mecha runtime.
 */
function registerDefaultTools(mcpServer: McpServer): void {
  mcpServer.tool(
    "mecha_status",
    "Get the current status of this Mecha instance",
    {},
    async () => {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              status: "running",
              timestamp: new Date().toISOString(),
            }),
          },
        ],
      };
    },
  );

  mcpServer.tool(
    "mecha_workspace_list",
    "List files in the Mecha workspace",
    { path: z.string().optional().describe("Subdirectory path within /workspace") },
    async ({ path }) => {
      const { readdir } = await import("node:fs/promises");
      const targetPath = path ? `/workspace/${path}` : "/workspace";
      try {
        const entries = await readdir(targetPath, { withFileTypes: true });
        const items = entries.map((e) => ({
          name: e.name,
          type: e.isDirectory() ? "directory" : "file",
        }));
        return {
          content: [{ type: "text" as const, text: JSON.stringify(items) }],
        };
      } catch {
        return {
          content: [
            { type: "text" as const, text: `Error: cannot read ${targetPath}` },
          ],
          isError: true,
        };
      }
    },
  );

  mcpServer.tool(
    "mecha_workspace_read",
    "Read a file from the Mecha workspace",
    { path: z.string().describe("File path relative to /workspace") },
    async ({ path: filePath }) => {
      const { readFile } = await import("node:fs/promises");
      try {
        const content = await readFile(`/workspace/${filePath}`, "utf-8");
        return {
          content: [{ type: "text" as const, text: content }],
        };
      } catch {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: cannot read /workspace/${filePath}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}

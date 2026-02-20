import type { FastifyInstance } from "fastify";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { resolve, relative } from "node:path";

const WORKSPACE_ROOT = "/workspace";
const MAX_SESSIONS = 100;
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Resolve a user-provided path safely within /workspace.
 * Rejects absolute paths and parent traversal attempts.
 */
function safePath(userPath: string): string {
  const resolved = resolve(WORKSPACE_ROOT, userPath);
  const rel = relative(WORKSPACE_ROOT, resolved);
  if (rel.startsWith("..") || resolve("/", rel) !== resolve("/", rel)) {
    throw new Error("Path traversal detected: access denied");
  }
  if (!resolved.startsWith(WORKSPACE_ROOT)) {
    throw new Error("Path traversal detected: access denied");
  }
  return resolved;
}

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
  const sessions = new Map<string, { transport: StreamableHTTPServerTransport; lastAccess: number }>();

  // Periodic cleanup of idle sessions
  const cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [sid, entry] of sessions) {
      if (now - entry.lastAccess > SESSION_TTL_MS) {
        sessions.delete(sid);
      }
    }
  }, 60_000);
  cleanupTimer.unref();

  // POST /mcp — main MCP endpoint
  app.post("/mcp", async (req, reply) => {
    const sessionId = (req.headers["mcp-session-id"] as string) || undefined;

    let transport: StreamableHTTPServerTransport;

    if (sessionId && sessions.has(sessionId)) {
      const entry = sessions.get(sessionId)!;
      entry.lastAccess = Date.now();
      transport = entry.transport;
    } else {
      // Enforce session cap
      if (sessions.size >= MAX_SESSIONS) {
        return reply.code(429).send({ error: "Too many active sessions" });
      }

      // New session
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
      });

      await handle.mcpServer.connect(transport);

      // Extract session ID from transport after connect
      const newSessionId = transport.sessionId;
      if (newSessionId) {
        sessions.set(newSessionId, { transport, lastAccess: Date.now() });
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

    const entry = sessions.get(sessionId)!;
    entry.lastAccess = Date.now();
    await entry.transport.handleRequest(req.raw, reply.raw);
    reply.hijack();
  });

  // DELETE /mcp — close session
  app.delete("/mcp", async (req, reply) => {
    const sessionId = (req.headers["mcp-session-id"] as string) || undefined;
    if (!sessionId || !sessions.has(sessionId)) {
      return reply.code(404).send({ error: "Session not found" });
    }

    const entry = sessions.get(sessionId)!;
    await entry.transport.handleRequest(req.raw, reply.raw);
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
      let targetPath: string;
      try {
        targetPath = path ? safePath(path) : WORKSPACE_ROOT;
      } catch {
        return {
          content: [{ type: "text" as const, text: "Error: path traversal denied" }],
          isError: true,
        };
      }
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
      let resolvedPath: string;
      try {
        resolvedPath = safePath(filePath);
      } catch {
        return {
          content: [{ type: "text" as const, text: "Error: path traversal denied" }],
          isError: true,
        };
      }
      try {
        const content = await readFile(resolvedPath, "utf-8");
        return {
          content: [{ type: "text" as const, text: content }],
        };
      } catch {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: cannot read ${filePath}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}

import type { FastifyInstance } from "fastify";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { resolve, relative } from "node:path";
import { readdir, readFile } from "node:fs/promises";

const WORKSPACE_ROOT = "/home/mecha";
const MAX_SESSIONS = 100;
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes

/** Resolve a user-provided path safely within /workspace. */
function safePath(userPath: string): string {
  const resolved = resolve(WORKSPACE_ROOT, userPath);
  const rel = relative(WORKSPACE_ROOT, resolved);
  if (rel.startsWith("..") || !resolved.startsWith(WORKSPACE_ROOT)) {
    throw new Error("Path traversal detected: access denied");
  }
  return resolved;
}

function textContent(text: string, isError = false) {
  return { content: [{ type: "text" as const, text }], ...(isError && { isError: true }) };
}

export interface McpServerHandle {
  mcpServer: McpServer;
}

export interface CreateMcpServerOptions {
  mechaId: string;
  authToken: string;
}

/**
 * Create and configure an MCP server with default tools.
 */
export function createMcpServer(opts: CreateMcpServerOptions): McpServerHandle {
  const mcpServer = new McpServer(
    { name: `mecha-${opts.mechaId}`, version: "0.1.0" },
    { capabilities: { tools: {} } },
  );

  // Register built-in tools
  registerDefaultTools(mcpServer, opts.authToken);

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

  const getSessionId = (req: { headers: Record<string, string | string[] | undefined> }) =>
    (req.headers["mcp-session-id"] as string) || undefined;

  // POST /mcp — main MCP endpoint
  app.post("/mcp", async (req, reply) => {
    const sessionId = getSessionId(req);
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
    const sessionId = getSessionId(req);
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
    const sessionId = getSessionId(req);
    if (!sessionId || !sessions.has(sessionId)) {
      return reply.code(404).send({ error: "Session not found" });
    }

    const entry = sessions.get(sessionId)!;
    await entry.transport.handleRequest(req.raw, reply.raw);
    reply.hijack();
  });
}

/** JSON endpoints — 30s timeout */
async function agentFetch(
  path: string,
  authToken: string,
  init?: RequestInit,
): Promise<Response> {
  return fetch(`http://127.0.0.1:3000${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`,
      ...(init?.headers as Record<string, string> | undefined),
    },
    signal: init?.signal ?? AbortSignal.timeout(30_000),
  });
}

/** SSE streaming endpoints — 5min timeout, returns parsed text */
async function agentStream(
  path: string,
  authToken: string,
  init?: RequestInit,
): Promise<string> {
  const res = await fetch(`http://127.0.0.1:3000${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`,
      ...(init?.headers as Record<string, string> | undefined),
    },
    signal: init?.signal ?? AbortSignal.timeout(300_000),
  });
  if (!res.ok) throw new Error(`Agent error: ${res.status} ${res.statusText}`);
  return consumeSseText(res);
}

/**
 * Consume an SSE response and extract text content from `data:` frames.
 * Each SSE `data:` line contains a JSON message from the Claude agent SDK.
 * We aggregate all `text` fields from content blocks.
 */
async function consumeSseText(res: Response): Promise<string> {
  const raw = await res.text();
  const lines = raw.split("\n");
  const parts: string[] = [];
  for (const line of lines) {
    if (!line.startsWith("data: ")) continue;
    const payload = line.slice(6).trim();
    if (payload === "[DONE]" || !payload) continue;
    try {
      const msg = JSON.parse(payload);
      // Claude Agent SDK streams content_block_delta with text
      if (msg.type === "content_block_delta" && msg.delta?.text) {
        parts.push(msg.delta.text);
      } else if (msg.type === "message" && Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type === "text" && block.text) parts.push(block.text);
        }
      } else if (typeof msg.text === "string") {
        parts.push(msg.text);
      }
    } catch {
      // Non-JSON data line — include as raw text
      parts.push(payload);
    }
  }
  return parts.length > 0 ? parts.join("") : raw;
}

/**
 * Register default MCP tools for a Mecha runtime.
 */
function registerDefaultTools(mcpServer: McpServer, authToken: string): void {
  mcpServer.tool("mecha_status", "Get the current status of this Mecha instance", {}, async () =>
    textContent(JSON.stringify({ status: "running", timestamp: new Date().toISOString() })),
  );

  mcpServer.tool(
    "mecha_workspace_list",
    "List files in the Mecha workspace",
    { path: z.string().optional().describe("Subdirectory path within the workspace") },
    async ({ path }) => {
      let targetPath: string;
      try { targetPath = path ? safePath(path) : WORKSPACE_ROOT; }
      catch { return textContent("Error: path traversal denied", true); }
      try {
        const entries = await readdir(targetPath, { withFileTypes: true });
        return textContent(JSON.stringify(entries.map((e) => ({ name: e.name, type: e.isDirectory() ? "directory" : "file" }))));
      } catch { return textContent(`Error: cannot read ${targetPath}`, true); }
    },
  );

  mcpServer.tool(
    "mecha_workspace_read",
    "Read a file from the Mecha workspace",
    { path: z.string().describe("File path relative to the workspace") },
    async ({ path: filePath }) => {
      let resolvedPath: string;
      try { resolvedPath = safePath(filePath); }
      catch { return textContent("Error: path traversal denied", true); }
      try { return textContent(await readFile(resolvedPath, "utf-8")); }
      catch { return textContent(`Error: cannot read ${filePath}`, true); }
    },
  );

  // --- Agent interaction tools ---

  mcpServer.tool(
    "mecha_chat",
    "Send a message to the Claude agent running in this Mecha",
    { message: z.string().describe("The message to send to the agent") },
    async ({ message }) => {
      try {
        const text = await agentStream("/api/chat", authToken, {
          method: "POST",
          body: JSON.stringify({ message }),
        });
        return textContent(text);
      } catch (err) {
        return textContent(`Chat request failed: ${err instanceof Error ? err.message : String(err)}`, true);
      }
    },
  );

  // --- Session management tools ---

  mcpServer.tool(
    "mecha_session_list",
    "List all conversation sessions",
    {},
    async () => {
      try {
        const res = await agentFetch("/api/sessions", authToken);
        if (!res.ok) return textContent(`Error: ${res.status} ${res.statusText}`, true);
        return textContent(await res.text());
      } catch (err) {
        return textContent(`Request failed: ${err instanceof Error ? err.message : String(err)}`, true);
      }
    },
  );

  mcpServer.tool(
    "mecha_session_create",
    "Create a new conversation session",
    { title: z.string().optional().describe("Optional title for the session") },
    async ({ title }) => {
      try {
        const res = await agentFetch("/api/sessions", authToken, {
          method: "POST",
          body: JSON.stringify({ title }),
        });
        if (!res.ok) return textContent(`Error: ${res.status} ${res.statusText}`, true);
        return textContent(await res.text());
      } catch (err) {
        return textContent(`Request failed: ${err instanceof Error ? err.message : String(err)}`, true);
      }
    },
  );

  mcpServer.tool(
    "mecha_session_message",
    "Send a message within a specific session",
    {
      sessionId: z.string().describe("The session ID to send the message to"),
      message: z.string().describe("The message to send"),
    },
    async ({ sessionId, message }) => {
      try {
        const sid = encodeURIComponent(sessionId);
        const text = await agentStream(`/api/sessions/${sid}/message`, authToken, {
          method: "POST",
          body: JSON.stringify({ message }),
        });
        return textContent(text);
      } catch (err) {
        return textContent(`Request failed: ${err instanceof Error ? err.message : String(err)}`, true);
      }
    },
  );

  mcpServer.tool(
    "mecha_session_delete",
    "Delete a conversation session",
    { sessionId: z.string().describe("The session ID to delete") },
    async ({ sessionId }) => {
      try {
        const sid = encodeURIComponent(sessionId);
        const res = await agentFetch(`/api/sessions/${sid}`, authToken, { method: "DELETE" });
        if (!res.ok) return textContent(`Error: ${res.status} ${res.statusText}`, true);
        return textContent(JSON.stringify({ deleted: true, sessionId }));
      } catch (err) {
        return textContent(`Request failed: ${err instanceof Error ? err.message : String(err)}`, true);
      }
    },
  );
}

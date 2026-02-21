import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer, type McpServerHandle, type CreateMcpServerOptions } from "../src/mcp/server.js";

const TEST_ID = "mx-test-abc123";
const TEST_TOKEN = "test-auth-token-abc123";

function makeHandle(overrides?: Partial<CreateMcpServerOptions>): McpServerHandle {
  return createMcpServer({ mechaId: TEST_ID, authToken: TEST_TOKEN, ...overrides });
}

async function connectClient(handle: McpServerHandle): Promise<Client> {
  const client = new Client({ name: "test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await handle.mcpServer.connect(serverTransport);
  await client.connect(clientTransport);
  return client;
}

describe("MCP server", () => {
  it("creates an MCP server with mecha name", () => {
    const handle = makeHandle();
    expect(handle.mcpServer).toBeDefined();
  });
});

describe("MCP tools - mecha_status", () => {
  let handle: McpServerHandle;
  let client: Client;

  beforeAll(async () => {
    handle = makeHandle();
    client = await connectClient(handle);
  });

  afterAll(async () => {
    await client.close();
  });

  it("returns running status with timestamp", async () => {
    const result = await client.callTool({ name: "mecha_status", arguments: {} });
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content).toHaveLength(1);
    expect(content[0]!.type).toBe("text");
    const parsed = JSON.parse(content[0]!.text);
    expect(parsed.status).toBe("running");
    expect(parsed.timestamp).toBeDefined();
  });
});

describe("MCP tools - mecha_workspace_list", () => {
  let handle: McpServerHandle;
  let client: Client;

  beforeAll(async () => {
    handle = makeHandle();
    client = await connectClient(handle);
  });

  afterAll(async () => {
    await client.close();
  });

  it("returns text content for workspace root", async () => {
    const result = await client.callTool({
      name: "mecha_workspace_list",
      arguments: {},
    });
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content).toHaveLength(1);
    // Will error because /home/mecha doesn't exist in test env, but returns text
    expect(content[0]!.type).toBe("text");
  });

  it("rejects path traversal", async () => {
    const result = await client.callTool({
      name: "mecha_workspace_list",
      arguments: { path: "../../etc" },
    });
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0]!.text).toContain("path traversal denied");
    expect(result.isError).toBe(true);
  });
});

describe("MCP tools - mecha_workspace_read", () => {
  let handle: McpServerHandle;
  let client: Client;

  beforeAll(async () => {
    handle = makeHandle();
    client = await connectClient(handle);
  });

  afterAll(async () => {
    await client.close();
  });

  it("rejects path traversal", async () => {
    const result = await client.callTool({
      name: "mecha_workspace_read",
      arguments: { path: "../../../etc/passwd" },
    });
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0]!.text).toContain("path traversal denied");
    expect(result.isError).toBe(true);
  });

  it("returns error for non-existent file", async () => {
    const result = await client.callTool({
      name: "mecha_workspace_read",
      arguments: { path: "nonexistent.txt" },
    });
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0]!.text).toContain("Error:");
    expect(result.isError).toBe(true);
  });
});

describe("MCP tools - mecha_chat", () => {
  let handle: McpServerHandle;
  let client: Client;

  beforeEach(async () => {
    vi.stubGlobal("fetch", vi.fn());
    handle = makeHandle();
    client = await connectClient(handle);
  });

  afterEach(async () => {
    await client.close();
    vi.unstubAllGlobals();
  });

  it("sends message and returns response text", async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce(new Response("Agent reply here", { status: 200 }));

    const result = await client.callTool({
      name: "mecha_chat",
      arguments: { message: "Hello agent" },
    });

    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0]!.text).toBe("Agent reply here");
    expect(result.isError).toBeUndefined();

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, init] = mockFetch.mock.calls[0]!;
    expect(url).toBe("http://127.0.0.1:3000/api/chat");
    expect((init as RequestInit).method).toBe("POST");
    const headers = (init as RequestInit).headers as Headers;
    expect(headers.get("Authorization")).toBe(`Bearer ${TEST_TOKEN}`);
  });

  it("parses SSE frames from agent response", async () => {
    const sseBody = [
      'data: {"type":"content_block_delta","delta":{"text":"Hello"}}',
      'data: {"type":"content_block_delta","delta":{"text":" world"}}',
      "data: [DONE]",
    ].join("\n");
    vi.mocked(fetch).mockResolvedValueOnce(new Response(sseBody, { status: 200 }));

    const result = await client.callTool({
      name: "mecha_chat",
      arguments: { message: "Hi" },
    });

    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0]!.text).toBe("Hello world");
  });

  it("returns error when agent responds with non-ok status", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response("", { status: 500, statusText: "Internal Server Error" }));

    const result = await client.callTool({
      name: "mecha_chat",
      arguments: { message: "Hello" },
    });

    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0]!.text).toContain("Agent error: 500");
    expect(result.isError).toBe(true);
  });

  it("returns error when fetch throws", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("Connection refused"));

    const result = await client.callTool({
      name: "mecha_chat",
      arguments: { message: "Hello" },
    });

    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0]!.text).toContain("Chat request failed:");
    expect(content[0]!.text).toContain("Connection refused");
    expect(result.isError).toBe(true);
  });
});

describe("MCP tools - session management", () => {
  let handle: McpServerHandle;
  let client: Client;

  beforeEach(async () => {
    vi.stubGlobal("fetch", vi.fn());
    handle = makeHandle();
    client = await connectClient(handle);
  });

  afterEach(async () => {
    await client.close();
    vi.unstubAllGlobals();
  });

  it("mecha_session_list returns sessions array", async () => {
    const sessions = [{ id: "s1", title: "Test" }];
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(sessions), { status: 200 }));

    const result = await client.callTool({
      name: "mecha_session_list",
      arguments: {},
    });

    const content = result.content as Array<{ type: string; text: string }>;
    expect(JSON.parse(content[0]!.text)).toEqual(sessions);
  });

  it("mecha_session_list returns error on failure", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response("", { status: 503, statusText: "Service Unavailable" }));

    const result = await client.callTool({
      name: "mecha_session_list",
      arguments: {},
    });

    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0]!.text).toContain("503");
    expect(result.isError).toBe(true);
  });

  it("mecha_session_create creates and returns session", async () => {
    const session = { id: "s-new", title: "My Session" };
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(session), { status: 200 }));

    const result = await client.callTool({
      name: "mecha_session_create",
      arguments: { title: "My Session" },
    });

    const content = result.content as Array<{ type: string; text: string }>;
    expect(JSON.parse(content[0]!.text)).toEqual(session);

    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ title: "My Session" });
  });

  it("mecha_session_create handles error", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response("", { status: 429, statusText: "Too Many Requests" }));

    const result = await client.callTool({
      name: "mecha_session_create",
      arguments: {},
    });

    expect(result.isError).toBe(true);
  });

  it("mecha_session_message sends message in session", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response("Response text", { status: 200 }));

    const result = await client.callTool({
      name: "mecha_session_message",
      arguments: { sessionId: "s1", message: "Hello" },
    });

    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0]!.text).toBe("Response text");

    const [url] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe("http://127.0.0.1:3000/api/sessions/s1/message");
  });

  it("mecha_session_message handles error", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response("", { status: 404, statusText: "Not Found" }));

    const result = await client.callTool({
      name: "mecha_session_message",
      arguments: { sessionId: "bad-id", message: "Hello" },
    });

    expect(result.isError).toBe(true);
  });

  it("mecha_session_delete removes session", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response("", { status: 200 }));

    const result = await client.callTool({
      name: "mecha_session_delete",
      arguments: { sessionId: "s1" },
    });

    const content = result.content as Array<{ type: string; text: string }>;
    const parsed = JSON.parse(content[0]!.text);
    expect(parsed.deleted).toBe(true);
    expect(parsed.sessionId).toBe("s1");

    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe("http://127.0.0.1:3000/api/sessions/s1");
    expect((init as RequestInit).method).toBe("DELETE");
  });

  it("mecha_session_delete handles error", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response("", { status: 404, statusText: "Not Found" }));

    const result = await client.callTool({
      name: "mecha_session_delete",
      arguments: { sessionId: "bad-id" },
    });

    expect(result.isError).toBe(true);
  });

  it("session tools handle fetch exceptions", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("Network error"));

    const result = await client.callTool({
      name: "mecha_session_list",
      arguments: {},
    });

    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0]!.text).toContain("Network error");
    expect(result.isError).toBe(true);
  });
});

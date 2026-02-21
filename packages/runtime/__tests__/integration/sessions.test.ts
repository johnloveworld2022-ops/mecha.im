/**
 * Integration test for session endpoints against a live Docker container.
 *
 * Requires Docker and a running mecha container. Reuses the image built
 * by docker.test.ts or uses an existing mecha-runtime:test image.
 *
 * Run with: INTEGRATION=1 pnpm --filter @mecha/runtime test -- --testPathPattern integration/sessions
 *
 * Skipped by default — enable by setting INTEGRATION=1
 *
 * NOTE: These tests call real Claude API endpoints and incur costs.
 * They're designed to be fast (simple prompts, maxTurns: 1).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "node:child_process";

const SKIP = !process.env.INTEGRATION;
const IMAGE_NAME = "mecha-runtime:test";
const CONTAINER_NAME = "mecha-runtime-session-integration";
const HOST_PORT = 7798;
const AUTH_TOKEN = "test-session-integration-token-1234567890";
const BASE = `http://localhost:${HOST_PORT}`;
const HEADERS = {
  Authorization: `Bearer ${AUTH_TOKEN}`,
  "Content-Type": "application/json",
};

function run(cmd: string, timeout = 120_000): string {
  return execSync(cmd, { encoding: "utf-8", timeout }).trim();
}

async function waitForReady(maxSeconds = 30): Promise<void> {
  for (let i = 0; i < maxSeconds; i++) {
    try {
      const res = await fetch(`${BASE}/healthz`);
      if (res.ok) return;
    } catch {
      // Not ready yet
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Container did not become ready in ${maxSeconds} seconds`);
}

/** Parse SSE stream into array of parsed events */
async function collectSSE(res: Response): Promise<Array<Record<string, unknown>>> {
  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";
  const events: Array<Record<string, unknown>> = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(":")) continue;
      if (trimmed === "data: [DONE]") continue;
      if (trimmed.startsWith("data: ")) {
        try {
          events.push(JSON.parse(trimmed.slice(6)) as Record<string, unknown>);
        } catch {
          // skip malformed
        }
      }
    }
  }
  return events;
}

describe.skipIf(SKIP)("Session integration tests", () => {
  beforeAll(async () => {
    // Build image
    const root = new URL("../../../../", import.meta.url).pathname;
    run(
      `docker build -f ${root}Dockerfile.mecha-runtime -t ${IMAGE_NAME} ${root}`,
      300_000,
    );

    // Clean up any leftover container
    try { run(`docker rm -f ${CONTAINER_NAME}`); } catch { /* ignore */ }

    // Start container with tmpfs for state DB (no persistent volume needed)
    run(
      `docker run -d --name ${CONTAINER_NAME} -p ${HOST_PORT}:3000 ` +
        `-e MECHA_ID=mx-test-sessions ` +
        `-e MECHA_AUTH_TOKEN=${AUTH_TOKEN} ` +
        `--read-only --tmpfs /tmp:rw,noexec,nosuid ` +
        `--tmpfs /var/lib/mecha:rw ` +
        `${IMAGE_NAME}`,
    );

    await waitForReady();
  }, 300_000);

  afterAll(() => {
    try { run(`docker rm -f ${CONTAINER_NAME}`); } catch { /* ignore */ }
  });

  // --- CRUD ---

  it("POST /api/sessions creates a session", async () => {
    const res = await fetch(`${BASE}/api/sessions`, {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify({ title: "integration-test" }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.sessionId).toBeDefined();
    expect(body.title).toBe("integration-test");
    expect(body.state).toBe("idle");
    expect(body.messageCount).toBe(0);
  });

  it("GET /api/sessions lists sessions", async () => {
    const res = await fetch(`${BASE}/api/sessions`, { headers: HEADERS });
    expect(res.status).toBe(200);
    const sessions = await res.json();
    expect(Array.isArray(sessions)).toBe(true);
    expect(sessions.length).toBeGreaterThanOrEqual(1);
    const found = sessions.find((s: Record<string, unknown>) => s.title === "integration-test");
    expect(found).toBeDefined();
  });

  it("GET /api/sessions/:id returns session detail", async () => {
    // Create a session first
    const createRes = await fetch(`${BASE}/api/sessions`, {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify({ title: "detail-test" }),
    });
    const { sessionId } = await createRes.json();

    const res = await fetch(`${BASE}/api/sessions/${sessionId}`, { headers: HEADERS });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sessionId).toBe(sessionId);
    expect(body.title).toBe("detail-test");
    expect(body.messages).toEqual([]);
    expect(body.totalMessages).toBe(0);
  });

  it("GET /api/sessions/:id returns 404 for nonexistent", async () => {
    const res = await fetch(`${BASE}/api/sessions/nonexistent-id`, { headers: HEADERS });
    expect(res.status).toBe(404);
  });

  it("DELETE /api/sessions/:id deletes session", async () => {
    const createRes = await fetch(`${BASE}/api/sessions`, {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify({ title: "delete-me" }),
    });
    const { sessionId } = await createRes.json();

    const delRes = await fetch(`${BASE}/api/sessions/${sessionId}`, {
      method: "DELETE",
      headers: HEADERS,
    });
    expect(delRes.status).toBe(204);

    // Verify gone
    const getRes = await fetch(`${BASE}/api/sessions/${sessionId}`, { headers: HEADERS });
    expect(getRes.status).toBe(404);
  });

  it("DELETE /api/sessions/:id returns 404 for nonexistent", async () => {
    const res = await fetch(`${BASE}/api/sessions/nonexistent-id`, {
      method: "DELETE",
      headers: HEADERS,
    });
    expect(res.status).toBe(404);
  });

  // --- Config ---

  it("PUT /api/sessions/:id/config updates config", async () => {
    const createRes = await fetch(`${BASE}/api/sessions`, {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify({ title: "config-test" }),
    });
    const { sessionId } = await createRes.json();

    const res = await fetch(`${BASE}/api/sessions/${sessionId}/config`, {
      method: "PUT",
      headers: HEADERS,
      body: JSON.stringify({ maxTurns: 5, model: "claude-sonnet-4-6" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.config.maxTurns).toBe(5);
    expect(body.config.model).toBe("claude-sonnet-4-6");
  });

  // --- Validation ---

  it("POST /api/sessions/:id/message returns 400 for missing message", async () => {
    const createRes = await fetch(`${BASE}/api/sessions`, {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify({ title: "validation-test" }),
    });
    const { sessionId } = await createRes.json();

    const res = await fetch(`${BASE}/api/sessions/${sessionId}/message`, {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it("POST /api/sessions/:id/message returns 404 for nonexistent session", async () => {
    const res = await fetch(`${BASE}/api/sessions/nonexistent-id/message`, {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify({ message: "hello" }),
    });
    expect(res.status).toBe(404);
  });

  // --- Interrupt ---

  it("POST /api/sessions/:id/interrupt on idle returns interrupted: false", async () => {
    const createRes = await fetch(`${BASE}/api/sessions`, {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify({ title: "interrupt-test" }),
    });
    const { sessionId } = await createRes.json();

    const res = await fetch(`${BASE}/api/sessions/${sessionId}/interrupt`, {
      method: "POST",
      headers: HEADERS,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.interrupted).toBe(false);
  });

  it("POST /api/sessions/:id/interrupt returns 404 for nonexistent", async () => {
    const res = await fetch(`${BASE}/api/sessions/nonexistent-id/interrupt`, {
      method: "POST",
      headers: HEADERS,
    });
    expect(res.status).toBe(404);
  });

  // --- Auth ---

  it("rejects requests without auth token", async () => {
    const res = await fetch(`${BASE}/api/sessions`, {
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(401);
  });

  // --- SSE Streaming (requires Claude API — only runs with INTEGRATION_LIVE=1) ---

  const SKIP_LIVE = !process.env.INTEGRATION_LIVE;

  it.skipIf(SKIP_LIVE)("POST /api/sessions/:id/message streams SSE with session event", async () => {
    const createRes = await fetch(`${BASE}/api/sessions`, {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify({ title: "stream-test" }),
    });
    const { sessionId } = await createRes.json();

    const res = await fetch(`${BASE}/api/sessions/${sessionId}/message`, {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify({ message: "Say hi in one word" }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/event-stream");

    const events = await collectSSE(res);

    // First event should be our session event
    expect(events[0]?.type).toBe("session");
    expect(events[0]?.session_id).toBe(sessionId);

    // Should have system init
    const init = events.find((e) => e.type === "system" && e.subtype === "init");
    expect(init).toBeDefined();

    // Should have assistant message with text
    const assistant = events.find((e) => e.type === "assistant");
    expect(assistant).toBeDefined();

    // Should have success result
    const result = events.find((e) => e.type === "result" && e.subtype === "success");
    expect(result).toBeDefined();

    // Session should be idle after streaming
    const getRes = await fetch(`${BASE}/api/sessions/${sessionId}`, { headers: HEADERS });
    const detail = await getRes.json();
    expect(detail.state).toBe("idle");
    expect(detail.messageCount).toBe(2); // user + assistant
  }, 60_000);

  it.skipIf(SKIP_LIVE)("multi-turn context is preserved via resume", async () => {
    const createRes = await fetch(`${BASE}/api/sessions`, {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify({ title: "multiturn-test" }),
    });
    const { sessionId } = await createRes.json();

    // First message: introduce name
    const res1 = await fetch(`${BASE}/api/sessions/${sessionId}/message`, {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify({ message: "My name is Zephyr. Remember this." }),
    });
    await collectSSE(res1);

    // Second message: ask for name
    const res2 = await fetch(`${BASE}/api/sessions/${sessionId}/message`, {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify({ message: "What is my name? Reply with just the name." }),
    });
    const events2 = await collectSSE(res2);

    // Find assistant text in second response
    const assistant = events2.find((e) => e.type === "assistant");
    const msg = assistant?.message as Record<string, unknown> | undefined;
    const content = msg?.content as Array<Record<string, unknown>> | undefined;
    const texts = content
      ?.filter((c) => c.type === "text" && typeof c.text === "string")
      .map((c) => c.text as string) ?? [];
    const fullText = texts.join("");

    expect(fullText.toLowerCase()).toContain("zephyr");

    // Verify messages persisted
    const getRes = await fetch(`${BASE}/api/sessions/${sessionId}`, { headers: HEADERS });
    const detail = await getRes.json();
    expect(detail.messageCount).toBe(4); // 2 user + 2 assistant
  }, 120_000);
});

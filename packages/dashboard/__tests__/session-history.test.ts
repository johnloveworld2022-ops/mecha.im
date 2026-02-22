import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  convertSessionMessages,
  fetchSessionHistory,
  type SessionMessage,
} from "../src/lib/session-history";

describe("convertSessionMessages", () => {
  it("converts an empty array", () => {
    expect(convertSessionMessages([])).toEqual([]);
  });

  it("converts a single user message", () => {
    const input: SessionMessage[] = [
      { role: "user", content: "hello", createdAt: "2026-01-15T10:00:00.000Z" },
    ];
    const result = convertSessionMessages(input);

    expect(result).toHaveLength(1);
    expect(result[0].role).toBe("user");
    expect(result[0].content).toBe("hello");
    expect(result[0].createdAt).toEqual(new Date("2026-01-15T10:00:00.000Z"));
  });

  it("converts a multi-turn conversation preserving order", () => {
    const input: SessionMessage[] = [
      { role: "user", content: "What is 2+2?", createdAt: "2026-01-15T10:00:00.000Z" },
      { role: "assistant", content: "4", createdAt: "2026-01-15T10:00:01.000Z" },
      { role: "user", content: "And 3+3?", createdAt: "2026-01-15T10:00:05.000Z" },
      { role: "assistant", content: "6", createdAt: "2026-01-15T10:00:06.000Z" },
    ];
    const result = convertSessionMessages(input);

    expect(result).toHaveLength(4);
    expect(result.map((m) => m.role)).toEqual(["user", "assistant", "user", "assistant"]);
    expect(result.map((m) => m.content)).toEqual(["What is 2+2?", "4", "And 3+3?", "6"]);
  });

  it("preserves multiline and special character content", () => {
    const input: SessionMessage[] = [
      {
        role: "assistant",
        content: "Here's some code:\n```ts\nconst x = 1;\n```\nDone!",
        createdAt: "2026-01-15T10:00:00.000Z",
      },
    ];
    const result = convertSessionMessages(input);

    expect(result[0].content).toBe("Here's some code:\n```ts\nconst x = 1;\n```\nDone!");
  });

  it("creates Date objects from ISO timestamp strings", () => {
    const input: SessionMessage[] = [
      { role: "user", content: "test", createdAt: "2026-06-15T14:30:45.123Z" },
    ];
    const result = convertSessionMessages(input);

    expect(result[0].createdAt).toBeInstanceOf(Date);
    expect(result[0].createdAt!.toISOString()).toBe("2026-06-15T14:30:45.123Z");
  });
});

describe("fetchSessionHistory", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("fetches session detail and returns converted messages", async () => {
    const mockDetail = {
      sessionId: "sess-1",
      messages: [
        { role: "user", content: "hi", createdAt: "2026-01-15T10:00:00.000Z" },
        { role: "assistant", content: "hello", createdAt: "2026-01-15T10:00:01.000Z" },
      ],
      totalMessages: 2,
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockDetail),
    });

    const result = await fetchSessionHistory("mecha-1", "sess-1");

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/mechas/mecha-1/sessions/sess-1?limit=200",
    );
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      role: "user",
      content: "hi",
      createdAt: new Date("2026-01-15T10:00:00.000Z"),
    });
    expect(result[1]).toEqual({
      role: "assistant",
      content: "hello",
      createdAt: new Date("2026-01-15T10:00:01.000Z"),
    });
  });

  it("passes custom limit to the API", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ sessionId: "s", messages: [], totalMessages: 0 }),
    });

    await fetchSessionHistory("m-1", "s-1", 50);

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/mechas/m-1/sessions/s-1?limit=50",
    );
  });

  it("returns empty array on HTTP error", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    });

    const result = await fetchSessionHistory("mecha-1", "missing-session");

    expect(result).toEqual([]);
  });

  it("returns empty array when messages field is missing", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ sessionId: "s" }),
    });

    const result = await fetchSessionHistory("mecha-1", "sess-empty");

    expect(result).toEqual([]);
  });

  it("returns empty array when fetch rejects (network error)", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));

    const result = await fetchSessionHistory("mecha-1", "sess-1");

    expect(result).toEqual([]);
  });

  it("returns empty array when JSON parsing throws", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.reject(new SyntaxError("Unexpected token")),
    });

    const result = await fetchSessionHistory("mecha-1", "sess-1");

    expect(result).toEqual([]);
  });
});

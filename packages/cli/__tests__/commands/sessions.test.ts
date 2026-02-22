import { describe, it, expect, vi, beforeEach } from "vitest";
import { Command } from "commander";
import type { CommandDeps } from "../../src/types.js";
import type { Formatter } from "../../src/output/formatter.js";
import { registerSessionsCommand } from "../../src/commands/sessions.js";

const mockMechaSessionList = vi.fn();
const mockMechaSessionGet = vi.fn();
const mockMechaSessionDelete = vi.fn();
const mockMechaSessionInterrupt = vi.fn();
const mockMechaSessionRename = vi.fn();

vi.mock("@mecha/service", () => ({
  mechaSessionList: (...args: unknown[]) => mockMechaSessionList(...args),
  mechaSessionGet: (...args: unknown[]) => mockMechaSessionGet(...args),
  mechaSessionDelete: (...args: unknown[]) => mockMechaSessionDelete(...args),
  mechaSessionInterrupt: (...args: unknown[]) => mockMechaSessionInterrupt(...args),
  mechaSessionRename: (...args: unknown[]) => mockMechaSessionRename(...args),
}));

function createMockFormatter(): Formatter {
  return { info: vi.fn(), error: vi.fn(), success: vi.fn(), json: vi.fn(), table: vi.fn() };
}

const ZERO_USAGE = {
  totalCostUsd: 0,
  totalInputTokens: 0,
  totalOutputTokens: 0,
  totalDurationMs: 0,
  turnCount: 0,
};

describe("mecha sessions", () => {
  let formatter: Formatter;
  let deps: CommandDeps;

  beforeEach(() => {
    formatter = createMockFormatter();
    deps = { dockerClient: { docker: {} } as any, formatter };
    process.exitCode = undefined;
    vi.clearAllMocks();
  });

  // --- sessions list ---

  it("sessions list calls mechaSessionList and outputs table with TURNS and COST", async () => {
    mockMechaSessionList.mockResolvedValueOnce([
      {
        sessionId: "abcdef1234567890",
        title: "My Session",
        state: "idle",
        messageCount: 5,
        lastMessageAt: "2026-01-01T00:00:00Z",
        createdAt: "2026-01-01T00:00:00Z",
        usage: { totalCostUsd: 0.0035, totalInputTokens: 200, totalOutputTokens: 100, totalDurationMs: 1500, turnCount: 3 },
      },
    ]);
    const program = new Command();
    registerSessionsCommand(program, deps);
    await program.parseAsync(["sessions", "list", "mx-test"], { from: "user" });

    expect(mockMechaSessionList).toHaveBeenCalledWith(deps.dockerClient, { id: "mx-test" });
    expect(formatter.table).toHaveBeenCalledWith(
      [
        {
          ID: "abcdef12",
          TITLE: "My Session",
          STATE: "idle",
          MESSAGES: "5",
          TURNS: "3",
          COST: "$0.0035",
          "LAST ACTIVITY": "2026-01-01T00:00:00Z",
        },
      ],
      ["ID", "TITLE", "STATE", "MESSAGES", "TURNS", "COST", "LAST ACTIVITY"],
    );
  });

  it("sessions list shows (untitled) and dash for missing title/lastMessageAt", async () => {
    mockMechaSessionList.mockResolvedValueOnce([
      {
        sessionId: "abcdef1234567890",
        title: "",
        state: "idle",
        messageCount: 0,
        lastMessageAt: null,
        createdAt: "2026-01-01T00:00:00Z",
        usage: ZERO_USAGE,
      },
    ]);
    const program = new Command();
    registerSessionsCommand(program, deps);
    await program.parseAsync(["sessions", "list", "mx-test"], { from: "user" });

    expect(formatter.table).toHaveBeenCalledWith(
      [
        {
          ID: "abcdef12",
          TITLE: "(untitled)",
          STATE: "idle",
          MESSAGES: "0",
          TURNS: "0",
          COST: "-",
          "LAST ACTIVITY": "-",
        },
      ],
      ["ID", "TITLE", "STATE", "MESSAGES", "TURNS", "COST", "LAST ACTIVITY"],
    );
  });

  it("sessions list shows (no results) for empty list", async () => {
    mockMechaSessionList.mockResolvedValueOnce([]);
    const program = new Command();
    registerSessionsCommand(program, deps);
    await program.parseAsync(["sessions", "list", "mx-test"], { from: "user" });

    expect(formatter.table).toHaveBeenCalledWith([], expect.any(Array));
  });

  it("sessions list reports error on failure", async () => {
    mockMechaSessionList.mockRejectedValueOnce(new Error("connection refused"));
    const program = new Command();
    registerSessionsCommand(program, deps);
    await program.parseAsync(["sessions", "list", "mx-test"], { from: "user" });

    expect(formatter.error).toHaveBeenCalledWith(expect.stringContaining("connection refused"));
    expect(process.exitCode).toBe(1);
  });

  it("sessions list handles missing usage gracefully", async () => {
    mockMechaSessionList.mockResolvedValueOnce([
      {
        sessionId: "abcdef1234567890",
        title: "No Usage",
        state: "idle",
        messageCount: 1,
        lastMessageAt: null,
        createdAt: "2026-01-01T00:00:00Z",
        // no usage field
      },
    ]);
    const program = new Command();
    registerSessionsCommand(program, deps);
    await program.parseAsync(["sessions", "list", "mx-test"], { from: "user" });

    expect(formatter.table).toHaveBeenCalledWith(
      [expect.objectContaining({ TURNS: "0", COST: "-" })],
      expect.any(Array),
    );
  });

  // --- sessions show ---

  it("sessions show calls mechaSessionGet and shows detail with usage", async () => {
    mockMechaSessionGet.mockResolvedValueOnce({
      sessionId: "sess-abc",
      title: "Test Session",
      state: "idle",
      messageCount: 2,
      lastMessageAt: null,
      createdAt: "2026-01-01T00:00:00Z",
      config: {},
      usage: { totalCostUsd: 0.15, totalInputTokens: 500, totalOutputTokens: 250, totalDurationMs: 3000, turnCount: 5 },
      messages: [
        { role: "user", content: "Hello", createdAt: "2026-01-01T00:00:01Z" },
        { role: "assistant", content: "Hi!", createdAt: "2026-01-01T00:00:02Z" },
      ],
    });
    const program = new Command();
    registerSessionsCommand(program, deps);
    await program.parseAsync(["sessions", "show", "mx-test", "sess-abc"], { from: "user" });

    expect(mockMechaSessionGet).toHaveBeenCalledWith(deps.dockerClient, { id: "mx-test", sessionId: "sess-abc" });
    expect(formatter.info).toHaveBeenCalledWith("Session: sess-abc");
    expect(formatter.info).toHaveBeenCalledWith("Title: Test Session");
    expect(formatter.info).toHaveBeenCalledWith("State: idle");
    expect(formatter.info).toHaveBeenCalledWith("Messages: 2");
    expect(formatter.info).toHaveBeenCalledWith("Turns: 5");
    expect(formatter.info).toHaveBeenCalledWith("Cost: $0.15");
    expect(formatter.info).toHaveBeenCalledWith("Input tokens: 500");
    expect(formatter.info).toHaveBeenCalledWith("Output tokens: 250");
    expect(formatter.info).toHaveBeenCalledWith("Duration: 3000ms");
    expect(formatter.info).toHaveBeenCalledWith("---");
    expect(formatter.info).toHaveBeenCalledWith("[user] Hello");
    expect(formatter.info).toHaveBeenCalledWith("[assistant] Hi!");
  });

  it("sessions show handles untitled session", async () => {
    mockMechaSessionGet.mockResolvedValueOnce({
      sessionId: "sess-abc",
      title: "",
      state: "idle",
      messageCount: 0,
      lastMessageAt: null,
      createdAt: "2026-01-01T00:00:00Z",
      config: {},
      usage: ZERO_USAGE,
      messages: [],
    });
    const program = new Command();
    registerSessionsCommand(program, deps);
    await program.parseAsync(["sessions", "show", "mx-test", "sess-abc"], { from: "user" });

    expect(formatter.info).toHaveBeenCalledWith("Title: (untitled)");
  });

  it("sessions show reports error on failure", async () => {
    mockMechaSessionGet.mockRejectedValueOnce(new Error("not found"));
    const program = new Command();
    registerSessionsCommand(program, deps);
    await program.parseAsync(["sessions", "show", "mx-test", "sess-bad"], { from: "user" });

    expect(formatter.error).toHaveBeenCalledWith(expect.stringContaining("not found"));
    expect(process.exitCode).toBe(1);
  });

  // --- sessions delete ---

  it("sessions delete calls mechaSessionDelete and shows success", async () => {
    mockMechaSessionDelete.mockResolvedValueOnce(undefined);
    const program = new Command();
    registerSessionsCommand(program, deps);
    await program.parseAsync(["sessions", "delete", "mx-test", "sess-del"], { from: "user" });

    expect(mockMechaSessionDelete).toHaveBeenCalledWith(deps.dockerClient, { id: "mx-test", sessionId: "sess-del" });
    expect(formatter.success).toHaveBeenCalledWith("Session sess-del deleted");
  });

  it("sessions delete reports error on failure", async () => {
    mockMechaSessionDelete.mockRejectedValueOnce(new Error("delete failed"));
    const program = new Command();
    registerSessionsCommand(program, deps);
    await program.parseAsync(["sessions", "delete", "mx-test", "sess-del"], { from: "user" });

    expect(formatter.error).toHaveBeenCalledWith(expect.stringContaining("delete failed"));
    expect(process.exitCode).toBe(1);
  });

  // --- sessions interrupt ---

  it("sessions interrupt shows success when interrupted", async () => {
    mockMechaSessionInterrupt.mockResolvedValueOnce({ interrupted: true });
    const program = new Command();
    registerSessionsCommand(program, deps);
    await program.parseAsync(["sessions", "interrupt", "mx-test", "sess-int"], { from: "user" });

    expect(mockMechaSessionInterrupt).toHaveBeenCalledWith(deps.dockerClient, { id: "mx-test", sessionId: "sess-int" });
    expect(formatter.success).toHaveBeenCalledWith("Session sess-int interrupted");
  });

  it("sessions interrupt shows 'was not busy' when not interrupted", async () => {
    mockMechaSessionInterrupt.mockResolvedValueOnce({ interrupted: false });
    const program = new Command();
    registerSessionsCommand(program, deps);
    await program.parseAsync(["sessions", "interrupt", "mx-test", "sess-int"], { from: "user" });

    expect(formatter.info).toHaveBeenCalledWith("Session sess-int was not busy");
  });

  it("sessions interrupt reports error on failure", async () => {
    mockMechaSessionInterrupt.mockRejectedValueOnce(new Error("interrupt failed"));
    const program = new Command();
    registerSessionsCommand(program, deps);
    await program.parseAsync(["sessions", "interrupt", "mx-test", "sess-int"], { from: "user" });

    expect(formatter.error).toHaveBeenCalledWith(expect.stringContaining("interrupt failed"));
    expect(process.exitCode).toBe(1);
  });

  // --- sessions rename ---

  it("sessions rename calls mechaSessionRename and shows success", async () => {
    mockMechaSessionRename.mockResolvedValueOnce({
      sessionId: "sess-ren",
      title: "New Title",
      state: "idle",
      messageCount: 3,
      lastMessageAt: null,
      createdAt: "2026-01-01T00:00:00Z",
      usage: ZERO_USAGE,
    });
    const program = new Command();
    registerSessionsCommand(program, deps);
    await program.parseAsync(["sessions", "rename", "mx-test", "sess-ren", "New Title"], { from: "user" });

    expect(mockMechaSessionRename).toHaveBeenCalledWith(deps.dockerClient, { id: "mx-test", sessionId: "sess-ren", title: "New Title" });
    expect(formatter.success).toHaveBeenCalledWith('Session sess-ren renamed to "New Title"');
  });

  it("sessions rename reports error on failure", async () => {
    mockMechaSessionRename.mockRejectedValueOnce(new Error("rename failed"));
    const program = new Command();
    registerSessionsCommand(program, deps);
    await program.parseAsync(["sessions", "rename", "mx-test", "sess-ren", "Title"], { from: "user" });

    expect(formatter.error).toHaveBeenCalledWith(expect.stringContaining("rename failed"));
    expect(process.exitCode).toBe(1);
  });
});

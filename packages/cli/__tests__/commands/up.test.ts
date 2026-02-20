import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { registerUpCommand } from "../../src/commands/up.js";
import { Command } from "commander";
import type { CommandDeps } from "../../src/types.js";
import type { Formatter } from "../../src/output/formatter.js";
import { tmpdir } from "node:os";
import { writeFileSync, unlinkSync, mkdirSync, rmdirSync } from "node:fs";
import { join } from "node:path";

function createMockFormatter(): Formatter {
  return {
    info: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
    json: vi.fn(),
    table: vi.fn(),
  };
}

const mockEnsureNetwork = vi.fn().mockResolvedValue(undefined);
const mockEnsureVolume = vi.fn().mockResolvedValue(undefined);
const mockCreateContainer = vi.fn().mockResolvedValue({});
const mockStartContainer = vi.fn().mockResolvedValue(undefined);

vi.mock("@mecha/docker", () => ({
  ensureNetwork: (...args: unknown[]) => mockEnsureNetwork(...args),
  ensureVolume: (...args: unknown[]) => mockEnsureVolume(...args),
  createContainer: (...args: unknown[]) => mockCreateContainer(...args),
  startContainer: (...args: unknown[]) => mockStartContainer(...args),
}));

describe("mecha up", () => {
  let formatter: Formatter;
  const originalEnv = process.env;

  beforeEach(() => {
    formatter = createMockFormatter();
    process.exitCode = undefined;
    process.env = { ...originalEnv };
    vi.clearAllMocks();
    mockEnsureNetwork.mockResolvedValue(undefined);
    mockEnsureVolume.mockResolvedValue(undefined);
    mockCreateContainer.mockResolvedValue({});
    mockStartContainer.mockResolvedValue(undefined);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("starts a container for a valid path", async () => {
    const deps: CommandDeps = { dockerClient: { docker: {} } as any, formatter };
    const program = new Command();
    registerUpCommand(program, deps);

    await program.parseAsync(["up", tmpdir()], { from: "user" });

    expect(formatter.success).toHaveBeenCalledWith(expect.stringContaining("started successfully"));
    expect(process.exitCode).toBeUndefined();
  });

  it("errors on non-existent path", async () => {
    const deps: CommandDeps = { dockerClient: { docker: {} } as any, formatter };
    const program = new Command();
    registerUpCommand(program, deps);

    await program.parseAsync(["up", "/nonexistent/path/that/does/not/exist"], { from: "user" });

    expect(formatter.error).toHaveBeenCalledWith(expect.stringContaining("Path does not exist"));
    expect(process.exitCode).toBe(1);
  });

  it("errors on invalid port", async () => {
    const deps: CommandDeps = { dockerClient: { docker: {} } as any, formatter };
    const program = new Command();
    registerUpCommand(program, deps);

    await program.parseAsync(["up", tmpdir(), "-p", "abc"], { from: "user" });

    expect(formatter.error).toHaveBeenCalledWith(expect.stringContaining("Invalid port"));
    expect(process.exitCode).toBe(1);
  });

  it("errors on port below 1024", async () => {
    const deps: CommandDeps = { dockerClient: { docker: {} } as any, formatter };
    const program = new Command();
    registerUpCommand(program, deps);

    await program.parseAsync(["up", tmpdir(), "-p", "80"], { from: "user" });

    expect(formatter.error).toHaveBeenCalledWith(expect.stringContaining("Invalid port"));
    expect(process.exitCode).toBe(1);
  });

  it("errors on invalid permission mode", async () => {
    const deps: CommandDeps = { dockerClient: { docker: {} } as any, formatter };
    const program = new Command();
    registerUpCommand(program, deps);

    await program.parseAsync(["up", tmpdir(), "--permission-mode", "yolo"], { from: "user" });

    expect(formatter.error).toHaveBeenCalledWith(expect.stringContaining("Invalid permission mode"));
    expect(process.exitCode).toBe(1);
  });

  it("passes claude-token and otp from cli flags", async () => {
    const deps: CommandDeps = { dockerClient: { docker: {} } as any, formatter };
    const program = new Command();
    registerUpCommand(program, deps);

    await program.parseAsync([
      "up", tmpdir(),
      "--claude-token", "my-token",
      "--otp", "my-secret",
      "--permission-mode", "full-auto",
    ], { from: "user" });

    expect(mockCreateContainer).toHaveBeenCalledTimes(1);
    const opts = mockCreateContainer.mock.calls[0][1];
    expect(opts.env).toContain("CLAUDE_CODE_OAUTH_TOKEN=my-token");
    expect(opts.env).toContain("MECHA_OTP=my-secret");
    expect(opts.env).toContain("MECHA_PERMISSION_MODE=full-auto");
  });

  it("falls back to env vars for claude-token and otp", async () => {
    process.env["CLAUDE_CODE_OAUTH_TOKEN"] = "env-token";
    process.env["MECHA_OTP"] = "env-otp";

    const deps: CommandDeps = { dockerClient: { docker: {} } as any, formatter };
    const program = new Command();
    registerUpCommand(program, deps);

    await program.parseAsync(["up", tmpdir()], { from: "user" });

    const opts = mockCreateContainer.mock.calls[0][1];
    expect(opts.env).toContain("CLAUDE_CODE_OAUTH_TOKEN=env-token");
    expect(opts.env).toContain("MECHA_OTP=env-otp");
  });

  it("shows full token with --show-token", async () => {
    const deps: CommandDeps = { dockerClient: { docker: {} } as any, formatter };
    const program = new Command();
    registerUpCommand(program, deps);

    await program.parseAsync(["up", tmpdir(), "--show-token"], { from: "user" });

    const infoCalls = (formatter.info as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0] as string);
    const authLine = infoCalls.find((c) => c.includes("Auth:"));
    // With --show-token, should NOT have "..." truncation
    expect(authLine).toBeDefined();
    expect(authLine).not.toContain("...");
  });

  it("reports docker errors", async () => {
    mockCreateContainer.mockRejectedValueOnce(new Error("image not found"));

    const deps: CommandDeps = { dockerClient: { docker: {} } as any, formatter };
    const program = new Command();
    registerUpCommand(program, deps);

    await program.parseAsync(["up", tmpdir()], { from: "user" });

    expect(formatter.error).toHaveBeenCalledWith("image not found");
    expect(process.exitCode).toBe(1);
  });

  it("loads .env file from project path", async () => {
    const testDir = join(tmpdir(), `mecha-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    writeFileSync(join(testDir, ".env"), "TEST_MECHA_VAR=from-dotenv\n# comment\n\nBAD_LINE");

    const deps: CommandDeps = { dockerClient: { docker: {} } as any, formatter };
    const program = new Command();
    registerUpCommand(program, deps);

    await program.parseAsync(["up", testDir], { from: "user" });

    expect(process.env["TEST_MECHA_VAR"]).toBe("from-dotenv");

    // Cleanup
    unlinkSync(join(testDir, ".env"));
    rmdirSync(testDir);
    delete process.env["TEST_MECHA_VAR"];
  });
});

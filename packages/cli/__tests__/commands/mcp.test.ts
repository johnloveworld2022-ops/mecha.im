import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerMcpCommand } from "../../src/commands/mcp.js";
import { Command } from "commander";
import type { CommandDeps } from "../../src/types.js";
import type { Formatter } from "../../src/output/formatter.js";

const mockResolveMcpEndpoint = vi.fn();

vi.mock("@mecha/service", () => ({
  resolveMcpEndpoint: (...args: unknown[]) => mockResolveMcpEndpoint(...args),
}));

function createMockFormatter(): Formatter {
  return { info: vi.fn(), error: vi.fn(), success: vi.fn(), json: vi.fn(), table: vi.fn() };
}

describe("mecha mcp", () => {
  let formatter: Formatter;
  let deps: CommandDeps;

  beforeEach(() => {
    formatter = createMockFormatter();
    deps = { dockerClient: { docker: {} } as any, formatter };
    process.exitCode = undefined;
    vi.clearAllMocks();
  });

  it("prints endpoint and masked token", async () => {
    mockResolveMcpEndpoint.mockResolvedValue({
      endpoint: "http://127.0.0.1:7700/mcp",
      token: "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
    });

    const program = new Command();
    registerMcpCommand(program, deps);
    await program.parseAsync(["mcp", "mx-test-abc123"], { from: "user" });

    expect(formatter.info).toHaveBeenCalledWith(expect.stringContaining("/mcp"));
    expect(formatter.info).toHaveBeenCalledWith(expect.stringContaining("abcd"));
    expect(formatter.info).toHaveBeenCalledWith(expect.stringContaining("--show-token"));
  });

  it("prints full token with --show-token", async () => {
    const fullToken = "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";
    mockResolveMcpEndpoint.mockResolvedValue({
      endpoint: "http://127.0.0.1:7700/mcp",
      token: fullToken,
    });

    const program = new Command();
    registerMcpCommand(program, deps);
    await program.parseAsync(["mcp", "mx-test-abc123", "--show-token"], { from: "user" });

    expect(formatter.info).toHaveBeenCalledWith(expect.stringContaining(fullToken));
  });

  it("prints (not found) when token is missing", async () => {
    mockResolveMcpEndpoint.mockResolvedValue({
      endpoint: "http://127.0.0.1:7700/mcp",
      token: undefined,
    });

    const program = new Command();
    registerMcpCommand(program, deps);
    await program.parseAsync(["mcp", "mx-test-abc123"], { from: "user" });

    expect(formatter.info).toHaveBeenCalledWith(expect.stringContaining("not found"));
  });

  it("outputs JSON with masked token when --json flag is set", async () => {
    mockResolveMcpEndpoint.mockResolvedValue({
      endpoint: "http://127.0.0.1:7700/mcp",
      token: "abcdef1234567890",
    });

    const program = new Command();
    program.option("--json", "JSON output");
    registerMcpCommand(program, deps);
    await program.parseAsync(["--json", "mcp", "mx-test-abc123"], { from: "user" });

    expect(formatter.json).toHaveBeenCalledTimes(1);
    const data = (formatter.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(data.endpoint).toContain("/mcp");
    expect(data.token).toBe("abcd...7890");
  });

  it("outputs JSON with full token when --json --show-token", async () => {
    const fullToken = "abcdef1234567890";
    mockResolveMcpEndpoint.mockResolvedValue({
      endpoint: "http://127.0.0.1:7700/mcp",
      token: fullToken,
    });

    const program = new Command();
    program.option("--json", "JSON output");
    registerMcpCommand(program, deps);
    await program.parseAsync(["--json", "mcp", "mx-test-abc123", "--show-token"], { from: "user" });

    const data = (formatter.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(data.token).toBe(fullToken);
  });

  it("outputs config JSON with --config flag", async () => {
    mockResolveMcpEndpoint.mockResolvedValue({
      endpoint: "http://127.0.0.1:7700/mcp",
      token: "abc123",
    });

    const program = new Command();
    registerMcpCommand(program, deps);
    await program.parseAsync(["mcp", "mx-test-abc123", "--config"], { from: "user" });

    expect(formatter.json).toHaveBeenCalledTimes(1);
    const data = (formatter.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(data.mcpServers).toBeDefined();
    expect(data.mcpServers["mecha-mx-test-abc123"]).toBeDefined();
    expect(data.mcpServers["mecha-mx-test-abc123"].url).toContain("/mcp");
    expect(data.mcpServers["mecha-mx-test-abc123"].headers.Authorization).toContain("Bearer");
  });

  it("outputs config JSON without headers when no token", async () => {
    mockResolveMcpEndpoint.mockResolvedValue({
      endpoint: "http://127.0.0.1:7700/mcp",
      token: undefined,
    });

    const program = new Command();
    registerMcpCommand(program, deps);
    await program.parseAsync(["mcp", "mx-test-abc123", "--config"], { from: "user" });

    const data = (formatter.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(data.mcpServers["mecha-mx-test-abc123"].headers).toBeUndefined();
  });

  it("errors when no port binding", async () => {
    mockResolveMcpEndpoint.mockRejectedValueOnce(new Error("No port binding for mx-test-abc123"));

    const program = new Command();
    registerMcpCommand(program, deps);
    await program.parseAsync(["mcp", "mx-test-abc123"], { from: "user" });

    expect(formatter.error).toHaveBeenCalledWith(expect.stringContaining("No port"));
    expect(process.exitCode).toBe(1);
  });

  it("errors with --config when service fails", async () => {
    mockResolveMcpEndpoint.mockRejectedValueOnce(new Error("not found"));

    const program = new Command();
    registerMcpCommand(program, deps);
    await program.parseAsync(["mcp", "mx-bad", "--config"], { from: "user" });

    expect(formatter.error).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it("reports errors on inspect failure", async () => {
    mockResolveMcpEndpoint.mockRejectedValueOnce(new Error("not found"));

    const program = new Command();
    registerMcpCommand(program, deps);
    await program.parseAsync(["mcp", "mx-bad"], { from: "user" });

    expect(formatter.error).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});

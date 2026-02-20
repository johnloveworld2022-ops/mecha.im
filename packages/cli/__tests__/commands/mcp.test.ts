import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerMcpCommand } from "../../src/commands/mcp.js";
import { Command } from "commander";
import type { CommandDeps } from "../../src/types.js";
import type { Formatter } from "../../src/output/formatter.js";

const mockInspectContainer = vi.fn();

vi.mock("@mecha/docker", () => ({
  inspectContainer: (...args: unknown[]) => mockInspectContainer(...args),
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

  it("prints endpoint and token info", async () => {
    mockInspectContainer.mockResolvedValue({
      NetworkSettings: { Ports: { "3000/tcp": [{ HostPort: "7700" }] } },
    });

    const program = new Command();
    registerMcpCommand(program, deps);
    await program.parseAsync(["mcp", "mx-test-abc123"], { from: "user" });

    expect(formatter.info).toHaveBeenCalledWith(expect.stringContaining("/mcp"));
  });

  it("outputs JSON when --json flag is set", async () => {
    mockInspectContainer.mockResolvedValue({
      NetworkSettings: { Ports: { "3000/tcp": [{ HostPort: "7700" }] } },
    });

    const program = new Command();
    program.option("--json", "JSON output");
    registerMcpCommand(program, deps);
    await program.parseAsync(["--json", "mcp", "mx-test-abc123"], { from: "user" });

    expect(formatter.json).toHaveBeenCalledTimes(1);
    const data = (formatter.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(data.endpoint).toContain("/mcp");
  });

  it("errors when no port binding", async () => {
    mockInspectContainer.mockResolvedValue({
      NetworkSettings: { Ports: { "3000/tcp": null } },
    });

    const program = new Command();
    registerMcpCommand(program, deps);
    await program.parseAsync(["mcp", "mx-test-abc123"], { from: "user" });

    expect(formatter.error).toHaveBeenCalledWith(expect.stringContaining("No port"));
    expect(process.exitCode).toBe(1);
  });

  it("reports errors on inspect failure", async () => {
    mockInspectContainer.mockRejectedValueOnce(new Error("not found"));

    const program = new Command();
    registerMcpCommand(program, deps);
    await program.parseAsync(["mcp", "mx-bad"], { from: "user" });

    expect(formatter.error).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});

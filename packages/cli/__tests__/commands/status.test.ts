import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerStatusCommand } from "../../src/commands/status.js";
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

const fakeInfo = {
  Name: "/mecha-mx-test-abc123",
  State: { Status: "running", Running: true, StartedAt: "2024-01-01T00:00:00Z", FinishedAt: "" },
  Config: { Labels: { "mecha.path": "/home/user/project" } },
};

describe("mecha status", () => {
  let formatter: Formatter;
  let deps: CommandDeps;

  beforeEach(() => {
    formatter = createMockFormatter();
    deps = { dockerClient: { docker: {} } as any, formatter };
    process.exitCode = undefined;
    vi.clearAllMocks();
    mockInspectContainer.mockResolvedValue(fakeInfo);
  });

  it("shows status info", async () => {
    const program = new Command();
    registerStatusCommand(program, deps);
    await program.parseAsync(["status", "mx-test-abc123"], { from: "user" });

    expect(formatter.info).toHaveBeenCalled();
    const calls = (formatter.info as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
    expect(calls.some((c: string) => c.includes("running"))).toBe(true);
  });

  it("outputs JSON when --json flag is set", async () => {
    const program = new Command();
    program.option("--json", "JSON output");
    registerStatusCommand(program, deps);
    await program.parseAsync(["--json", "status", "mx-test-abc123"], { from: "user" });

    expect(formatter.json).toHaveBeenCalledTimes(1);
    const data = (formatter.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(data.id).toBe("mx-test-abc123");
    expect(data.state).toBe("running");
  });

  it("reports errors", async () => {
    mockInspectContainer.mockRejectedValueOnce(new Error("not found"));

    const program = new Command();
    registerStatusCommand(program, deps);
    await program.parseAsync(["status", "mx-bad"], { from: "user" });

    expect(formatter.error).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});

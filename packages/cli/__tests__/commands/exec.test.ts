import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerExecCommand } from "../../src/commands/exec.js";
import { Command } from "commander";
import type { CommandDeps } from "../../src/types.js";
import type { Formatter } from "../../src/output/formatter.js";

const mockMechaExec = vi.fn();

vi.mock("@mecha/service", () => ({
  mechaExec: (...args: unknown[]) => mockMechaExec(...args),
}));

function createMockFormatter(): Formatter {
  return { info: vi.fn(), error: vi.fn(), success: vi.fn(), json: vi.fn(), table: vi.fn() };
}

describe("mecha exec", () => {
  let formatter: Formatter;
  let deps: CommandDeps;

  beforeEach(() => {
    formatter = createMockFormatter();
    deps = { dockerClient: { docker: {} } as any, formatter };
    process.exitCode = undefined;
    vi.clearAllMocks();
  });

  it("executes command and writes output", async () => {
    const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    mockMechaExec.mockResolvedValue({ exitCode: 0, output: "hello\n" });

    const program = new Command();
    registerExecCommand(program, deps);
    await program.parseAsync(["exec", "mx-test-abc123", "echo", "hello"], { from: "user" });

    expect(mockMechaExec).toHaveBeenCalledWith(
      deps.dockerClient,
      { id: "mx-test-abc123", cmd: ["echo", "hello"] },
    );
    expect(writeSpy).toHaveBeenCalledWith("hello\n");
    expect(process.exitCode).toBe(0);
    writeSpy.mockRestore();
  });

  it("reports errors", async () => {
    mockMechaExec.mockRejectedValueOnce(new Error("container not found"));

    const program = new Command();
    registerExecCommand(program, deps);
    await program.parseAsync(["exec", "mx-bad", "ls"], { from: "user" });

    expect(formatter.error).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});

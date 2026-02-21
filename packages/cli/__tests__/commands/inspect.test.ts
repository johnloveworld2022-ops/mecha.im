import { describe, it, expect, vi, beforeEach } from "vitest";
import { Command } from "commander";
import type { CommandDeps } from "../../src/types.js";
import type { Formatter } from "../../src/output/formatter.js";
import { registerInspectCommand } from "../../src/commands/inspect.js";

const mockMechaInspect = vi.fn();

vi.mock("@mecha/service", () => ({
  mechaInspect: (...args: unknown[]) => mockMechaInspect(...args),
}));

function createMockFormatter(): Formatter {
  return { info: vi.fn(), error: vi.fn(), success: vi.fn(), json: vi.fn(), table: vi.fn() };
}

describe("mecha inspect", () => {
  let formatter: Formatter;
  let deps: CommandDeps;

  beforeEach(() => {
    formatter = createMockFormatter();
    deps = { dockerClient: { docker: {} } as any, formatter };
    process.exitCode = undefined;
    vi.clearAllMocks();
  });

  it("outputs JSON for a valid container", async () => {
    const fakeInfo = { Id: "abc123", State: { Status: "running" } };
    mockMechaInspect.mockResolvedValueOnce(fakeInfo);
    const program = new Command();
    registerInspectCommand(program, deps);
    await program.parseAsync(["inspect", "mx-test"], { from: "user" });

    expect(formatter.json).toHaveBeenCalledWith(fakeInfo);
  });

  it("reports error for missing container", async () => {
    mockMechaInspect.mockRejectedValueOnce(new Error("not found"));
    const program = new Command();
    registerInspectCommand(program, deps);
    await program.parseAsync(["inspect", "mx-bad"], { from: "user" });

    expect(formatter.error).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});

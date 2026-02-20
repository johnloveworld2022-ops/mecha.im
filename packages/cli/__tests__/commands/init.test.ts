import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerInitCommand } from "../../src/commands/init.js";
import { Command } from "commander";
import type { CommandDeps } from "../../src/types.js";
import type { Formatter } from "../../src/output/formatter.js";

const mockEnsureNetwork = vi.fn();

vi.mock("@mecha/docker", () => ({
  ensureNetwork: (...args: unknown[]) => mockEnsureNetwork(...args),
}));

vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
}));

function createMockFormatter(): Formatter {
  return { info: vi.fn(), error: vi.fn(), success: vi.fn(), json: vi.fn(), table: vi.fn() };
}

describe("mecha init", () => {
  let formatter: Formatter;
  let deps: CommandDeps;

  beforeEach(() => {
    formatter = createMockFormatter();
    deps = { dockerClient: { docker: {} } as any, formatter };
    process.exitCode = undefined;
    vi.clearAllMocks();
    mockEnsureNetwork.mockResolvedValue(undefined);
  });

  it("creates network and config directory", async () => {
    const program = new Command();
    registerInitCommand(program, deps);
    await program.parseAsync(["init"], { from: "user" });

    expect(mockEnsureNetwork).toHaveBeenCalled();
    expect(formatter.success).toHaveBeenCalledWith(expect.stringContaining("initialized"));
  });

  it("reports error when network creation fails", async () => {
    mockEnsureNetwork.mockRejectedValueOnce(new Error("network failed"));

    const program = new Command();
    registerInitCommand(program, deps);
    await program.parseAsync(["init"], { from: "user" });

    expect(formatter.error).toHaveBeenCalledWith(expect.stringContaining("network"));
    expect(process.exitCode).toBe(1);
  });

  it("reports error when mkdir fails", async () => {
    const { mkdir } = await import("node:fs/promises");
    vi.mocked(mkdir).mockRejectedValueOnce(new Error("permission denied"));

    const program = new Command();
    registerInitCommand(program, deps);
    await program.parseAsync(["init"], { from: "user" });

    expect(formatter.error).toHaveBeenCalledWith(expect.stringContaining("config directory"));
    expect(process.exitCode).toBe(1);
  });
});

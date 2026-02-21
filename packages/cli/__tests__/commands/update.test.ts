import { describe, it, expect, vi, beforeEach } from "vitest";
import { Command } from "commander";
import type { CommandDeps } from "../../src/types.js";
import type { Formatter } from "../../src/output/formatter.js";
import { registerUpdateCommand } from "../../src/commands/update.js";

const mockMechaUpdate = vi.fn();

vi.mock("@mecha/service", () => ({
  mechaUpdate: (...args: unknown[]) => mockMechaUpdate(...args),
}));

function createMockFormatter(): Formatter {
  return { info: vi.fn(), error: vi.fn(), success: vi.fn(), json: vi.fn(), table: vi.fn() };
}

describe("mecha update", () => {
  let formatter: Formatter;
  let deps: CommandDeps;

  beforeEach(() => {
    formatter = createMockFormatter();
    deps = { dockerClient: { docker: {} } as any, formatter };
    process.exitCode = undefined;
    vi.clearAllMocks();
  });

  it("pulls and recreates by default", async () => {
    mockMechaUpdate.mockResolvedValueOnce({
      id: "mx-test", image: "mecha-runtime:latest", previousImage: "mecha-runtime:old",
    });
    const program = new Command();
    registerUpdateCommand(program, deps);
    await program.parseAsync(["update", "mx-test"], { from: "user" });

    expect(mockMechaUpdate).toHaveBeenCalledWith(deps.dockerClient, { id: "mx-test", noPull: false });
    expect(formatter.info).toHaveBeenCalledWith("Pulling latest image...");
    expect(formatter.success).toHaveBeenCalledWith(expect.stringContaining("updated"));
  });

  it("skips pull with --no-pull", async () => {
    mockMechaUpdate.mockResolvedValueOnce({
      id: "mx-test", image: "mecha-runtime:latest", previousImage: "mecha-runtime:old",
    });
    const program = new Command();
    registerUpdateCommand(program, deps);
    await program.parseAsync(["update", "--no-pull", "mx-test"], { from: "user" });

    expect(mockMechaUpdate).toHaveBeenCalledWith(deps.dockerClient, { id: "mx-test", noPull: true });
    expect(formatter.info).not.toHaveBeenCalledWith("Pulling latest image...");
  });

  it("outputs JSON with --json and suppresses info logs", async () => {
    const result = { id: "mx-test", image: "new", previousImage: "old" };
    mockMechaUpdate.mockResolvedValueOnce(result);
    const program = new Command();
    program.option("--json", "JSON output");
    registerUpdateCommand(program, deps);
    await program.parseAsync(["--json", "update", "mx-test"], { from: "user" });

    expect(formatter.json).toHaveBeenCalledWith(result);
    expect(formatter.info).not.toHaveBeenCalledWith("Pulling latest image...");
  });

  it("reports error when container not found", async () => {
    mockMechaUpdate.mockRejectedValueOnce(new Error("not found"));
    const program = new Command();
    registerUpdateCommand(program, deps);
    await program.parseAsync(["update", "mx-bad"], { from: "user" });

    expect(formatter.error).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});

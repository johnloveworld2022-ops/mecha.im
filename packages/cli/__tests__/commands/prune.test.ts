import { describe, it, expect, vi, beforeEach } from "vitest";
import { Command } from "commander";
import type { CommandDeps } from "../../src/types.js";
import type { Formatter } from "../../src/output/formatter.js";
import { registerPruneCommand } from "../../src/commands/prune.js";

const mockMechaPrune = vi.fn();
const mockMechaLs = vi.fn();

vi.mock("@mecha/service", () => ({
  mechaPrune: (...args: unknown[]) => mockMechaPrune(...args),
  mechaLs: (...args: unknown[]) => mockMechaLs(...args),
}));

let readlineAnswer = "y";
vi.mock("node:readline", () => ({
  createInterface: () => ({
    question: (_msg: string, cb: (answer: string) => void) => cb(readlineAnswer),
    close: vi.fn(),
  }),
}));

function createMockFormatter(): Formatter {
  return { info: vi.fn(), error: vi.fn(), success: vi.fn(), json: vi.fn(), table: vi.fn() };
}

describe("mecha prune", () => {
  let formatter: Formatter;
  let deps: CommandDeps;

  beforeEach(() => {
    formatter = createMockFormatter();
    deps = { dockerClient: { docker: {} } as any, formatter };
    process.exitCode = undefined;
    vi.clearAllMocks();
    readlineAnswer = "y";
  });

  it("removes stopped containers with --force", async () => {
    mockMechaPrune.mockResolvedValueOnce({ removedContainers: ["mecha-a", "mecha-b"], removedVolumes: [] });
    const program = new Command();
    registerPruneCommand(program, deps);
    await program.parseAsync(["prune", "--force"], { from: "user" });

    expect(mockMechaPrune).toHaveBeenCalledWith(deps.dockerClient, { volumes: undefined });
    expect(formatter.success).toHaveBeenCalledWith(expect.stringContaining("2 container(s)"));
  });

  it("removes volumes with --volumes --force", async () => {
    mockMechaPrune.mockResolvedValueOnce({ removedContainers: ["mecha-a"], removedVolumes: ["vol-a"] });
    const program = new Command();
    registerPruneCommand(program, deps);
    await program.parseAsync(["prune", "--volumes", "--force"], { from: "user" });

    expect(mockMechaPrune).toHaveBeenCalledWith(deps.dockerClient, { volumes: true });
    expect(formatter.success).toHaveBeenCalledWith(expect.stringContaining("1 volume(s)"));
  });

  it("shows message when no stopped containers", async () => {
    mockMechaLs.mockResolvedValueOnce([{ state: "running" }, { state: "paused" }]);
    const program = new Command();
    registerPruneCommand(program, deps);
    await program.parseAsync(["prune"], { from: "user" });

    expect(formatter.info).toHaveBeenCalledWith("No stopped Mechas to remove.");
    expect(mockMechaPrune).not.toHaveBeenCalled();
  });

  it("prompts for confirmation without --force", async () => {
    mockMechaLs.mockResolvedValueOnce([{ state: "exited" }]);
    mockMechaPrune.mockResolvedValueOnce({ removedContainers: ["mecha-a"], removedVolumes: [] });
    const program = new Command();
    registerPruneCommand(program, deps);
    await program.parseAsync(["prune"], { from: "user" });

    expect(mockMechaPrune).toHaveBeenCalled();
    expect(formatter.success).toHaveBeenCalled();
  });

  it("aborts when user declines confirmation", async () => {
    readlineAnswer = "n";
    mockMechaLs.mockResolvedValueOnce([{ state: "exited" }]);
    const program = new Command();
    registerPruneCommand(program, deps);
    await program.parseAsync(["prune"], { from: "user" });

    expect(formatter.info).toHaveBeenCalledWith("Aborted.");
    expect(mockMechaPrune).not.toHaveBeenCalled();
  });

  it("outputs JSON with --json --force", async () => {
    mockMechaPrune.mockResolvedValueOnce({ removedContainers: ["a"], removedVolumes: [] });
    const program = new Command();
    program.option("--json", "JSON output");
    registerPruneCommand(program, deps);
    await program.parseAsync(["--json", "prune", "--force"], { from: "user" });

    expect(formatter.json).toHaveBeenCalledWith({ removedContainers: ["a"], removedVolumes: [] });
  });

  it("reports error on failure", async () => {
    mockMechaPrune.mockRejectedValueOnce(new Error("docker error"));
    const program = new Command();
    registerPruneCommand(program, deps);
    await program.parseAsync(["prune", "--force"], { from: "user" });

    expect(formatter.error).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});

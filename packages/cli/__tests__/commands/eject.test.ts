import { describe, it, expect, vi, beforeEach } from "vitest";
import { Command } from "commander";
import type { CommandDeps } from "../../src/types.js";
import type { Formatter } from "../../src/output/formatter.js";
import { registerEjectCommand } from "../../src/commands/eject.js";

const mockMechaEject = vi.fn();

vi.mock("@mecha/service", () => ({
  mechaEject: (...args: unknown[]) => mockMechaEject(...args),
}));

function createMockFormatter(): Formatter {
  return { info: vi.fn(), error: vi.fn(), success: vi.fn(), json: vi.fn(), table: vi.fn() };
}

describe("mecha eject", () => {
  let formatter: Formatter;
  let deps: CommandDeps;

  beforeEach(() => {
    formatter = createMockFormatter();
    deps = { dockerClient: { docker: {} } as any, formatter };
    process.exitCode = undefined;
    vi.clearAllMocks();
  });

  it("calls mechaEject with id and force=false by default", async () => {
    mockMechaEject.mockResolvedValueOnce({
      id: "mx-abc",
      composePath: "/tmp/proj/docker-compose.yml",
      envPath: "/tmp/proj/.env",
    });
    const program = new Command();
    registerEjectCommand(program, deps);
    await program.parseAsync(["eject", "mx-abc"], { from: "user" });

    expect(mockMechaEject).toHaveBeenCalledWith(
      deps.dockerClient,
      { id: "mx-abc", force: false },
    );
    expect(formatter.success).toHaveBeenCalledWith(
      expect.stringContaining("docker-compose.yml"),
    );
  });

  it("passes --force flag correctly", async () => {
    mockMechaEject.mockResolvedValueOnce({
      id: "mx-abc",
      composePath: "/tmp/proj/docker-compose.yml",
      envPath: "/tmp/proj/.env",
    });
    const program = new Command();
    registerEjectCommand(program, deps);
    await program.parseAsync(["eject", "mx-abc", "--force"], { from: "user" });

    expect(mockMechaEject).toHaveBeenCalledWith(
      deps.dockerClient,
      { id: "mx-abc", force: true },
    );
  });

  it("passes -f short flag correctly", async () => {
    mockMechaEject.mockResolvedValueOnce({
      id: "mx-abc",
      composePath: "/tmp/proj/docker-compose.yml",
      envPath: "/tmp/proj/.env",
    });
    const program = new Command();
    registerEjectCommand(program, deps);
    await program.parseAsync(["eject", "mx-abc", "-f"], { from: "user" });

    expect(mockMechaEject).toHaveBeenCalledWith(
      deps.dockerClient,
      { id: "mx-abc", force: true },
    );
  });

  it("outputs success message with file paths", async () => {
    mockMechaEject.mockResolvedValueOnce({
      id: "mx-abc",
      composePath: "/home/user/proj/docker-compose.yml",
      envPath: "/home/user/proj/.env",
    });
    const program = new Command();
    registerEjectCommand(program, deps);
    await program.parseAsync(["eject", "mx-abc"], { from: "user" });

    expect(formatter.success).toHaveBeenCalledWith(
      expect.stringContaining("/home/user/proj/docker-compose.yml"),
    );
    expect(formatter.success).toHaveBeenCalledWith(
      expect.stringContaining("/home/user/proj/.env"),
    );
  });

  it("outputs JSON with --json flag", async () => {
    mockMechaEject.mockResolvedValueOnce({
      id: "mx-abc",
      composePath: "/tmp/proj/docker-compose.yml",
      envPath: "/tmp/proj/.env",
    });
    const program = new Command();
    program.option("--json", "JSON output");
    registerEjectCommand(program, deps);
    await program.parseAsync(["--json", "eject", "mx-abc"], { from: "user" });

    expect(formatter.json).toHaveBeenCalledWith({
      id: "mx-abc",
      composePath: "/tmp/proj/docker-compose.yml",
      envPath: "/tmp/proj/.env",
    });
  });

  it("reports errors with exit code 1", async () => {
    mockMechaEject.mockRejectedValueOnce(new Error("File already exists: /tmp/docker-compose.yml. Use --force to overwrite."));
    const program = new Command();
    registerEjectCommand(program, deps);
    await program.parseAsync(["eject", "mx-bad"], { from: "user" });

    expect(formatter.error).toHaveBeenCalledWith(expect.stringContaining("File already exists"));
    expect(process.exitCode).toBe(1);
  });
});

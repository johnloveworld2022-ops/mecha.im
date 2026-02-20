import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerUpCommand } from "../../src/commands/up.js";
import { Command } from "commander";
import type { CommandDeps } from "../../src/types.js";
import type { Formatter } from "../../src/output/formatter.js";
import { tmpdir } from "node:os";

function createMockFormatter(): Formatter {
  return {
    info: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
    json: vi.fn(),
    table: vi.fn(),
  };
}

// We need to mock the @mecha/docker module
vi.mock("@mecha/docker", () => ({
  ensureNetwork: vi.fn().mockResolvedValue(undefined),
  ensureVolume: vi.fn().mockResolvedValue(undefined),
  createContainer: vi.fn().mockResolvedValue({}),
  startContainer: vi.fn().mockResolvedValue(undefined),
}));

describe("mecha up", () => {
  let formatter: Formatter;

  beforeEach(() => {
    formatter = createMockFormatter();
    process.exitCode = undefined;
    vi.clearAllMocks();
  });

  it("starts a container for a valid path", async () => {
    const mockDocker = { docker: {} };
    const deps: CommandDeps = {
      dockerClient: mockDocker as any,
      formatter,
    };

    const program = new Command();
    registerUpCommand(program, deps);

    // Use tmpdir which should always exist
    const validPath = tmpdir();
    await program.parseAsync(["up", validPath], { from: "user" });

    expect(formatter.success).toHaveBeenCalledWith(
      expect.stringContaining("started successfully"),
    );
    expect(process.exitCode).toBeUndefined();
  });

  it("errors on non-existent path", async () => {
    const mockDocker = { docker: {} };
    const deps: CommandDeps = {
      dockerClient: mockDocker as any,
      formatter,
    };

    const program = new Command();
    registerUpCommand(program, deps);

    await program.parseAsync(["up", "/nonexistent/path/that/does/not/exist"], {
      from: "user",
    });

    expect(formatter.error).toHaveBeenCalledWith(
      expect.stringContaining("Path does not exist"),
    );
    expect(process.exitCode).toBe(1);
  });
});

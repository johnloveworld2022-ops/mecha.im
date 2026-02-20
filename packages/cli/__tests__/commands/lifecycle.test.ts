import { describe, it, expect, vi, beforeEach } from "vitest";
import { Command } from "commander";
import type { CommandDeps } from "../../src/types.js";
import type { Formatter } from "../../src/output/formatter.js";
import { registerStopCommand, registerStartCommand, registerRestartCommand } from "../../src/commands/lifecycle.js";
import { registerRmCommand } from "../../src/commands/rm.js";

const mockStopContainer = vi.fn().mockResolvedValue(undefined);
const mockStartContainer = vi.fn().mockResolvedValue(undefined);
const mockRemoveContainer = vi.fn().mockResolvedValue(undefined);
const mockRemoveVolume = vi.fn().mockResolvedValue(undefined);

vi.mock("@mecha/docker", () => ({
  stopContainer: (...args: unknown[]) => mockStopContainer(...args),
  startContainer: (...args: unknown[]) => mockStartContainer(...args),
  removeContainer: (...args: unknown[]) => mockRemoveContainer(...args),
  removeVolume: (...args: unknown[]) => mockRemoveVolume(...args),
}));

function createMockFormatter(): Formatter {
  return {
    info: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
    json: vi.fn(),
    table: vi.fn(),
  };
}

describe("lifecycle commands", () => {
  let formatter: Formatter;
  let deps: CommandDeps;

  beforeEach(() => {
    formatter = createMockFormatter();
    deps = {
      dockerClient: { docker: {} } as any,
      formatter,
    };
    process.exitCode = undefined;
    vi.clearAllMocks();
  });

  describe("mecha stop", () => {
    it("stops a container by id", async () => {
      const program = new Command();
      registerStopCommand(program, deps);
      await program.parseAsync(["stop", "mx-test-abc123"], { from: "user" });

      expect(mockStopContainer).toHaveBeenCalledWith(
        deps.dockerClient,
        "mecha-mx-test-abc123",
      );
      expect(formatter.success).toHaveBeenCalledWith(
        expect.stringContaining("stopped"),
      );
    });

    it("reports errors", async () => {
      mockStopContainer.mockRejectedValueOnce(new Error("not found"));
      const program = new Command();
      registerStopCommand(program, deps);
      await program.parseAsync(["stop", "mx-bad"], { from: "user" });

      expect(formatter.error).toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    });
  });

  describe("mecha start", () => {
    it("starts a container by id", async () => {
      const program = new Command();
      registerStartCommand(program, deps);
      await program.parseAsync(["start", "mx-test-abc123"], { from: "user" });

      expect(mockStartContainer).toHaveBeenCalledWith(
        deps.dockerClient,
        "mecha-mx-test-abc123",
      );
      expect(formatter.success).toHaveBeenCalledWith(
        expect.stringContaining("started"),
      );
    });
  });

  describe("mecha restart", () => {
    it("stops then starts a container", async () => {
      const program = new Command();
      registerRestartCommand(program, deps);
      await program.parseAsync(["restart", "mx-test-abc123"], { from: "user" });

      expect(mockStopContainer).toHaveBeenCalledWith(
        deps.dockerClient,
        "mecha-mx-test-abc123",
      );
      expect(mockStartContainer).toHaveBeenCalledWith(
        deps.dockerClient,
        "mecha-mx-test-abc123",
      );
      expect(formatter.success).toHaveBeenCalledWith(
        expect.stringContaining("restarted"),
      );
    });
  });

  describe("mecha rm (error)", () => {
    it("reports error when remove fails", async () => {
      mockRemoveContainer.mockRejectedValueOnce(new Error("remove failed"));
      const program = new Command();
      registerRmCommand(program, deps);
      await program.parseAsync(["rm", "mx-bad"], { from: "user" });

      expect(formatter.error).toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    });
  });

  describe("mecha rm", () => {
    it("removes a container", async () => {
      const program = new Command();
      registerRmCommand(program, deps);
      await program.parseAsync(["rm", "mx-test-abc123"], { from: "user" });

      expect(mockRemoveContainer).toHaveBeenCalledWith(
        deps.dockerClient,
        "mecha-mx-test-abc123",
        false,
      );
      expect(formatter.success).toHaveBeenCalledWith(
        expect.stringContaining("removed"),
      );
    });

    it("removes container and volume with --with-state", async () => {
      const program = new Command();
      registerRmCommand(program, deps);
      await program.parseAsync(["rm", "--with-state", "mx-test-abc123"], {
        from: "user",
      });

      expect(mockRemoveContainer).toHaveBeenCalled();
      expect(mockRemoveVolume).toHaveBeenCalledWith(
        deps.dockerClient,
        "mecha-state-mx-test-abc123",
      );
    });

    it("force removes with --force", async () => {
      const program = new Command();
      registerRmCommand(program, deps);
      await program.parseAsync(["rm", "--force", "mx-test-abc123"], {
        from: "user",
      });

      expect(mockRemoveContainer).toHaveBeenCalledWith(
        deps.dockerClient,
        "mecha-mx-test-abc123",
        true,
      );
    });
  });
});

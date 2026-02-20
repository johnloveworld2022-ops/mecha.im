import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerDoctorCommand } from "../../src/commands/doctor.js";
import { Command } from "commander";
import type { CommandDeps } from "../../src/types.js";
import type { Formatter } from "../../src/output/formatter.js";

function createMockFormatter(): Formatter & {
  calls: { method: string; args: unknown[] }[];
} {
  const calls: { method: string; args: unknown[] }[] = [];
  return {
    calls,
    info: vi.fn((...args: unknown[]) => calls.push({ method: "info", args })),
    error: vi.fn((...args: unknown[]) =>
      calls.push({ method: "error", args }),
    ),
    success: vi.fn((...args: unknown[]) =>
      calls.push({ method: "success", args }),
    ),
    json: vi.fn((...args: unknown[]) => calls.push({ method: "json", args })),
    table: vi.fn((...args: unknown[]) =>
      calls.push({ method: "table", args }),
    ),
  };
}

describe("mecha doctor", () => {
  let formatter: ReturnType<typeof createMockFormatter>;

  beforeEach(() => {
    formatter = createMockFormatter();
    process.exitCode = undefined;
  });

  it("reports healthy when Docker is available and network exists", async () => {
    const mockDocker = {
      docker: {
        ping: vi.fn().mockResolvedValue("OK"),
        listNetworks: vi.fn().mockResolvedValue([{ Name: "mecha-net" }]),
      },
    };

    const deps: CommandDeps = {
      dockerClient: mockDocker as any,
      formatter,
    };

    const program = new Command();
    registerDoctorCommand(program, deps);
    await program.parseAsync(["doctor"], { from: "user" });

    expect(formatter.success).toHaveBeenCalled();
    const successMessages = formatter.calls
      .filter((c) => c.method === "success")
      .map((c) => c.args[0]);
    expect(successMessages).toContainEqual(
      expect.stringContaining("All checks passed"),
    );
    expect(process.exitCode).toBeUndefined();
  });

  it("reports unhealthy when Docker ping fails", async () => {
    const mockDocker = {
      docker: {
        ping: vi.fn().mockRejectedValue(new Error("connection refused")),
        listNetworks: vi.fn().mockResolvedValue([]),
      },
    };

    const deps: CommandDeps = {
      dockerClient: mockDocker as any,
      formatter,
    };

    const program = new Command();
    registerDoctorCommand(program, deps);
    await program.parseAsync(["doctor"], { from: "user" });

    expect(formatter.error).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it("reports unhealthy when network is missing", async () => {
    const mockDocker = {
      docker: {
        ping: vi.fn().mockResolvedValue("OK"),
        listNetworks: vi.fn().mockResolvedValue([]),
      },
    };

    const deps: CommandDeps = {
      dockerClient: mockDocker as any,
      formatter,
    };

    const program = new Command();
    registerDoctorCommand(program, deps);
    await program.parseAsync(["doctor"], { from: "user" });

    expect(formatter.error).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});

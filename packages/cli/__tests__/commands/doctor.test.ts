import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerDoctorCommand } from "../../src/commands/doctor.js";
import { Command } from "commander";
import type { CommandDeps } from "../../src/types.js";
import type { Formatter } from "../../src/output/formatter.js";

const mockMechaDoctor = vi.fn();

vi.mock("@mecha/service", () => ({
  mechaDoctor: (...args: unknown[]) => mockMechaDoctor(...args),
}));

function createMockFormatter(): Formatter & {
  calls: { method: string; args: unknown[] }[];
} {
  const calls: { method: string; args: unknown[] }[] = [];
  return {
    calls,
    info: vi.fn((...args: unknown[]) => calls.push({ method: "info", args })),
    error: vi.fn((...args: unknown[]) => calls.push({ method: "error", args })),
    success: vi.fn((...args: unknown[]) => calls.push({ method: "success", args })),
    json: vi.fn((...args: unknown[]) => calls.push({ method: "json", args })),
    table: vi.fn((...args: unknown[]) => calls.push({ method: "table", args })),
  };
}

describe("mecha doctor", () => {
  let formatter: ReturnType<typeof createMockFormatter>;

  beforeEach(() => {
    formatter = createMockFormatter();
    process.exitCode = undefined;
    vi.clearAllMocks();
  });

  it("reports healthy when Docker is available and network exists", async () => {
    mockMechaDoctor.mockResolvedValue({
      dockerAvailable: true,
      networkExists: true,
      issues: [],
    });

    const deps: CommandDeps = { dockerClient: { docker: {} } as any, formatter };
    const program = new Command();
    registerDoctorCommand(program, deps);
    await program.parseAsync(["doctor"], { from: "user" });

    expect(formatter.success).toHaveBeenCalled();
    const successMessages = formatter.calls
      .filter((c) => c.method === "success")
      .map((c) => c.args[0]);
    expect(successMessages).toContainEqual(expect.stringContaining("All checks passed"));
    expect(process.exitCode).toBeUndefined();
  });

  it("reports unhealthy when Docker ping fails", async () => {
    mockMechaDoctor.mockResolvedValue({
      dockerAvailable: false,
      networkExists: false,
      issues: ["Docker is not available. Is Docker/Colima running?"],
    });

    const deps: CommandDeps = { dockerClient: { docker: {} } as any, formatter };
    const program = new Command();
    registerDoctorCommand(program, deps);
    await program.parseAsync(["doctor"], { from: "user" });

    expect(formatter.error).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it("reports unhealthy when network check throws", async () => {
    mockMechaDoctor.mockResolvedValue({
      dockerAvailable: true,
      networkExists: false,
      issues: ["Failed to check network status."],
    });

    const deps: CommandDeps = { dockerClient: { docker: {} } as any, formatter };
    const program = new Command();
    registerDoctorCommand(program, deps);
    await program.parseAsync(["doctor"], { from: "user" });

    expect(formatter.error).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it("reports unhealthy when network is missing", async () => {
    mockMechaDoctor.mockResolvedValue({
      dockerAvailable: true,
      networkExists: false,
      issues: ["Network 'mecha-net' not found. Run 'mecha init' first."],
    });

    const deps: CommandDeps = { dockerClient: { docker: {} } as any, formatter };
    const program = new Command();
    registerDoctorCommand(program, deps);
    await program.parseAsync(["doctor"], { from: "user" });

    expect(formatter.error).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});

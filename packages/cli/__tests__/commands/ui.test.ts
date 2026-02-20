import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerUiCommand, resolveHostPort } from "../../src/commands/ui.js";
import { Command } from "commander";
import type { CommandDeps } from "../../src/types.js";
import type { Formatter } from "../../src/output/formatter.js";

const mockInspectContainer = vi.fn();

vi.mock("@mecha/docker", () => ({
  inspectContainer: (...args: unknown[]) => mockInspectContainer(...args),
}));

function createMockFormatter(): Formatter {
  return { info: vi.fn(), error: vi.fn(), success: vi.fn(), json: vi.fn(), table: vi.fn() };
}

describe("resolveHostPort", () => {
  let deps: CommandDeps;

  beforeEach(() => {
    deps = { dockerClient: { docker: {} } as any, formatter: createMockFormatter() };
    vi.clearAllMocks();
  });

  it("returns host port from container info", async () => {
    mockInspectContainer.mockResolvedValue({
      NetworkSettings: { Ports: { "3000/tcp": [{ HostPort: "7700" }] } },
    });

    const port = await resolveHostPort(deps, "mx-test-abc123");
    expect(port).toBe("7700");
  });

  it("returns undefined when no port binding", async () => {
    mockInspectContainer.mockResolvedValue({
      NetworkSettings: { Ports: { "3000/tcp": null } },
    });

    const port = await resolveHostPort(deps, "mx-test-abc123");
    expect(port).toBeUndefined();
  });
});

describe("mecha ui", () => {
  let formatter: Formatter;
  let deps: CommandDeps;

  beforeEach(() => {
    formatter = createMockFormatter();
    deps = { dockerClient: { docker: {} } as any, formatter };
    process.exitCode = undefined;
    vi.clearAllMocks();
  });

  it("prints URL when port is found", async () => {
    mockInspectContainer.mockResolvedValue({
      NetworkSettings: { Ports: { "3000/tcp": [{ HostPort: "7700" }] } },
    });

    const program = new Command();
    registerUiCommand(program, deps);
    await program.parseAsync(["ui", "mx-test-abc123"], { from: "user" });

    expect(formatter.info).toHaveBeenCalledWith(expect.stringContaining("7700"));
  });

  it("errors when no port binding", async () => {
    mockInspectContainer.mockResolvedValue({
      NetworkSettings: { Ports: { "3000/tcp": null } },
    });

    const program = new Command();
    registerUiCommand(program, deps);
    await program.parseAsync(["ui", "mx-test-abc123"], { from: "user" });

    expect(formatter.error).toHaveBeenCalledWith(expect.stringContaining("No port"));
    expect(process.exitCode).toBe(1);
  });

  it("reports errors on inspect failure", async () => {
    mockInspectContainer.mockRejectedValueOnce(new Error("not found"));

    const program = new Command();
    registerUiCommand(program, deps);
    await program.parseAsync(["ui", "mx-bad"], { from: "user" });

    expect(formatter.error).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});

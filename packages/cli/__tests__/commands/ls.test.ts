import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerLsCommand } from "../../src/commands/ls.js";
import { Command } from "commander";
import type { CommandDeps } from "../../src/types.js";
import type { Formatter } from "../../src/output/formatter.js";
import { LABELS } from "@mecha/core";

function createMockFormatter(): Formatter {
  return {
    info: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
    json: vi.fn(),
    table: vi.fn(),
  };
}

const mockListMechaContainers = vi.fn();

vi.mock("@mecha/docker", () => ({
  listMechaContainers: (...args: unknown[]) =>
    mockListMechaContainers(...args),
}));

function makeFakeContainers() {
  return [
    {
      Names: ["/mecha-mx-test-abc123"],
      State: "running",
      Status: "Up 5 minutes",
      Labels: {
        [LABELS.IS_MECHA]: "true",
        [LABELS.MECHA_ID]: "mx-test-abc123",
        [LABELS.MECHA_PATH]: "/home/user/project",
      },
    },
  ];
}

describe("mecha ls", () => {
  let formatter: Formatter;

  beforeEach(() => {
    formatter = createMockFormatter();
    process.exitCode = undefined;
    mockListMechaContainers.mockResolvedValue(makeFakeContainers());
  });

  it("lists containers as a table", async () => {
    const mockDocker = { docker: {} };
    const deps: CommandDeps = {
      dockerClient: mockDocker as any,
      formatter,
    };

    const program = new Command();
    program.option("--json", "JSON output");
    registerLsCommand(program, deps);

    await program.parseAsync(["ls"], { from: "user" });

    expect(formatter.table).toHaveBeenCalledTimes(1);
    const rows = (formatter.table as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as Record<string, string>[];
    expect(rows).toHaveLength(1);
    expect(rows[0]!.ID).toBe("mx-test-abc123");
    expect(rows[0]!.STATE).toBe("running");
  });

  it("outputs JSON when --json flag is set", async () => {
    const mockDocker = { docker: {} };
    const deps: CommandDeps = {
      dockerClient: mockDocker as any,
      formatter,
    };

    const program = new Command();
    program.option("--json", "JSON output");
    registerLsCommand(program, deps);

    await program.parseAsync(["--json", "ls"], { from: "user" });

    expect(formatter.json).toHaveBeenCalledTimes(1);
    const data = (formatter.json as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as Array<{ id: string }>;
    expect(data).toHaveLength(1);
    expect(data[0]!.id).toBe("mx-test-abc123");
  });
});

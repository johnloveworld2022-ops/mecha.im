import { describe, it, expect, vi, beforeEach } from "vitest";
import { PassThrough } from "node:stream";
import { registerLogsCommand } from "../../src/commands/logs.js";
import { Command } from "commander";
import type { CommandDeps } from "../../src/types.js";
import type { Formatter } from "../../src/output/formatter.js";

const mockGetContainerLogs = vi.fn();

vi.mock("@mecha/docker", () => ({
  getContainerLogs: (...args: unknown[]) => mockGetContainerLogs(...args),
}));

function createMockFormatter(): Formatter {
  return { info: vi.fn(), error: vi.fn(), success: vi.fn(), json: vi.fn(), table: vi.fn() };
}

describe("mecha logs", () => {
  let formatter: Formatter;
  let deps: CommandDeps;

  beforeEach(() => {
    formatter = createMockFormatter();
    deps = { dockerClient: { docker: {} } as any, formatter };
    process.exitCode = undefined;
    vi.clearAllMocks();
  });

  it("streams log output to stdout", async () => {
    const stream = new PassThrough();
    mockGetContainerLogs.mockResolvedValue(stream);
    const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    const program = new Command();
    registerLogsCommand(program, deps);

    // Write data before parsing so the data event fires after the handler is attached
    setTimeout(() => {
      stream.write(Buffer.from("log line\n"));
      stream.end();
    }, 10);

    await program.parseAsync(["logs", "mx-test-abc123"], { from: "user" });

    // Give the stream events a tick to propagate
    await new Promise((r) => setTimeout(r, 20));

    expect(writeSpy).toHaveBeenCalled();
    writeSpy.mockRestore();
  });

  it("respects --tail option", async () => {
    const stream = new PassThrough();
    mockGetContainerLogs.mockResolvedValue(stream);
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    const program = new Command();
    registerLogsCommand(program, deps);
    const p = program.parseAsync(["logs", "-n", "50", "mx-test-abc123"], { from: "user" });
    stream.end();
    await p;

    expect(mockGetContainerLogs).toHaveBeenCalledWith(
      deps.dockerClient,
      "mecha-mx-test-abc123",
      expect.objectContaining({ tail: 50 }),
    );
  });

  it("respects --since option", async () => {
    const stream = new PassThrough();
    mockGetContainerLogs.mockResolvedValue(stream);
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    const program = new Command();
    registerLogsCommand(program, deps);
    const p = program.parseAsync(["logs", "--since", "2024-01-01T00:00:00Z", "mx-test-abc123"], { from: "user" });
    stream.end();
    await p;

    expect(mockGetContainerLogs).toHaveBeenCalledWith(
      deps.dockerClient,
      "mecha-mx-test-abc123",
      expect.objectContaining({ since: expect.any(Number) }),
    );
  });

  it("errors on invalid --tail value", async () => {
    const program = new Command();
    registerLogsCommand(program, deps);
    await program.parseAsync(["logs", "-n", "abc", "mx-test-abc123"], { from: "user" });

    expect(formatter.error).toHaveBeenCalledWith(expect.stringContaining("--tail"));
    expect(process.exitCode).toBe(1);
  });

  it("errors on invalid --since value", async () => {
    const program = new Command();
    registerLogsCommand(program, deps);
    await program.parseAsync(["logs", "--since", "not-a-date", "mx-test-abc123"], { from: "user" });

    expect(formatter.error).toHaveBeenCalledWith(expect.stringContaining("--since"));
    expect(process.exitCode).toBe(1);
  });

  it("handles stream errors", async () => {
    const stream = new PassThrough();
    // Prevent unhandled error
    stream.on("error", () => {});
    mockGetContainerLogs.mockResolvedValue(stream);
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    const program = new Command();
    registerLogsCommand(program, deps);

    setTimeout(() => {
      stream.emit("error", new Error("stream broken"));
      stream.end();
    }, 10);

    await program.parseAsync(["logs", "mx-test-abc123"], { from: "user" });
    await new Promise((r) => setTimeout(r, 20));

    expect(formatter.error).toHaveBeenCalledWith("stream broken");
    expect(process.exitCode).toBe(1);
  });

  it("sets up SIGINT handler when --follow is used", async () => {
    const stream = new PassThrough();
    mockGetContainerLogs.mockResolvedValue(stream);
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const onSpy = vi.spyOn(process, "on");

    const program = new Command();
    registerLogsCommand(program, deps);

    setTimeout(() => stream.end(), 10);

    await program.parseAsync(["logs", "-f", "mx-test-abc123"], { from: "user" });
    await new Promise((r) => setTimeout(r, 20));

    expect(onSpy).toHaveBeenCalledWith("SIGINT", expect.any(Function));
    onSpy.mockRestore();
  });

  it("reports errors when getContainerLogs fails", async () => {
    mockGetContainerLogs.mockRejectedValueOnce(new Error("not found"));

    const program = new Command();
    registerLogsCommand(program, deps);
    await program.parseAsync(["logs", "mx-bad"], { from: "user" });

    expect(formatter.error).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});

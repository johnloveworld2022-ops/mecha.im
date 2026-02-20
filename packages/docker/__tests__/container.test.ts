import { describe, it, expect, vi, beforeEach } from "vitest";
import { PassThrough } from "node:stream";
import {
  createContainer,
  startContainer,
  stopContainer,
  removeContainer,
  inspectContainer,
  listMechaContainers,
  getContainerLogs,
  execInContainer,
} from "../src/container.js";
import { ContainerNotFoundError, LABELS, SECURITY } from "@mecha/core";
import type { MechaId } from "@mecha/core";
import type { DockerClient } from "../src/client.js";

function createMockClient(): DockerClient {
  return {
    docker: {
      createContainer: vi.fn(),
      getContainer: vi.fn(),
      listContainers: vi.fn(),
      modem: {
        demuxStream: vi.fn(),
      },
    },
  } as unknown as DockerClient;
}

describe("createContainer", () => {
  let client: DockerClient;

  beforeEach(() => {
    client = createMockClient();
  });

  it("creates container with security defaults", async () => {
    const mockContainer = { id: "abc123" };
    (client.docker.createContainer as ReturnType<typeof vi.fn>).mockResolvedValue(mockContainer);

    const result = await createContainer(client, {
      containerName: "mecha-mx-test-abc123",
      image: "mecha-runtime:latest",
      mechaId: "mx-test-abc123" as MechaId,
      projectPath: "/home/user/project",
      volumeName: "mecha-state-mx-test-abc123",
      hostPort: 7700,
    });

    expect(result).toBe(mockContainer);

    const callArgs = (client.docker.createContainer as ReturnType<typeof vi.fn>).mock.calls[0][0];

    // Verify security defaults
    expect(callArgs.HostConfig.ReadonlyRootfs).toBe(true);
    expect(callArgs.HostConfig.CapDrop).toEqual(["ALL"]);
    expect(callArgs.HostConfig.SecurityOpt).toEqual(["no-new-privileges"]);
    expect(callArgs.User).toBe(`${SECURITY.UID}:${SECURITY.GID}`);

    // Verify labels
    expect(callArgs.Labels[LABELS.IS_MECHA]).toBe("true");
    expect(callArgs.Labels[LABELS.MECHA_ID]).toBe("mx-test-abc123");
    expect(callArgs.Labels[LABELS.MECHA_PATH]).toBe("/home/user/project");

    // Verify mounts
    expect(callArgs.HostConfig.Binds).toContain("/home/user/project:/workspace");
    expect(callArgs.HostConfig.Binds).toContain("mecha-state-mx-test-abc123:/var/lib/mecha");

    // Verify tmpfs
    expect(callArgs.HostConfig.Tmpfs["/tmp"]).toBeDefined();

    // Verify port binding to localhost
    expect(callArgs.HostConfig.PortBindings["3000/tcp"][0].HostIp).toBe("127.0.0.1");
  });

  it("includes custom env vars", async () => {
    (client.docker.createContainer as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "abc" });

    await createContainer(client, {
      containerName: "mecha-mx-test-abc123",
      image: "mecha-runtime:latest",
      mechaId: "mx-test-abc123" as MechaId,
      projectPath: "/home/user/project",
      volumeName: "mecha-state-mx-test-abc123",
      hostPort: 7700,
      env: ["FOO=bar"],
    });

    const callArgs = (client.docker.createContainer as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArgs.Env).toContain("MECHA_ID=mx-test-abc123");
    expect(callArgs.Env).toContain("FOO=bar");
  });
});

describe("startContainer", () => {
  it("starts a container by name", async () => {
    const client = createMockClient();
    const startFn = vi.fn().mockResolvedValue({});
    (client.docker.getContainer as ReturnType<typeof vi.fn>).mockReturnValue({
      start: startFn,
    });

    await startContainer(client, "mecha-mx-test-abc123");

    expect(client.docker.getContainer).toHaveBeenCalledWith("mecha-mx-test-abc123");
    expect(startFn).toHaveBeenCalled();
  });
});

describe("stopContainer", () => {
  it("stops a container with custom timeout", async () => {
    const client = createMockClient();
    const stopFn = vi.fn().mockResolvedValue({});
    (client.docker.getContainer as ReturnType<typeof vi.fn>).mockReturnValue({
      stop: stopFn,
    });

    await stopContainer(client, "mecha-mx-test-abc123", 15);

    expect(stopFn).toHaveBeenCalledWith({ t: 15 });
  });

  it("uses default timeout when not specified", async () => {
    const client = createMockClient();
    const stopFn = vi.fn().mockResolvedValue({});
    (client.docker.getContainer as ReturnType<typeof vi.fn>).mockReturnValue({
      stop: stopFn,
    });

    await stopContainer(client, "mecha-mx-test-abc123");

    expect(stopFn).toHaveBeenCalledWith({ t: 10 });
  });
});

describe("removeContainer", () => {
  it("removes a container", async () => {
    const client = createMockClient();
    const removeFn = vi.fn().mockResolvedValue({});
    (client.docker.getContainer as ReturnType<typeof vi.fn>).mockReturnValue({
      remove: removeFn,
    });

    await removeContainer(client, "mecha-mx-test-abc123");

    expect(removeFn).toHaveBeenCalledWith({ force: false });
  });

  it("force-removes a container", async () => {
    const client = createMockClient();
    const removeFn = vi.fn().mockResolvedValue({});
    (client.docker.getContainer as ReturnType<typeof vi.fn>).mockReturnValue({
      remove: removeFn,
    });

    await removeContainer(client, "mecha-mx-test-abc123", true);

    expect(removeFn).toHaveBeenCalledWith({ force: true });
  });
});

describe("inspectContainer", () => {
  it("returns container info", async () => {
    const client = createMockClient();
    const info = { State: { Status: "running" } };
    (client.docker.getContainer as ReturnType<typeof vi.fn>).mockReturnValue({
      inspect: vi.fn().mockResolvedValue(info),
    });

    const result = await inspectContainer(client, "mecha-mx-test-abc123");

    expect(result).toBe(info);
  });

  it("throws ContainerNotFoundError on 404", async () => {
    const client = createMockClient();
    const error = Object.assign(new Error("not found"), { statusCode: 404 });
    (client.docker.getContainer as ReturnType<typeof vi.fn>).mockReturnValue({
      inspect: vi.fn().mockRejectedValue(error),
    });

    await expect(inspectContainer(client, "mecha-mx-test-abc123")).rejects.toThrow(
      ContainerNotFoundError,
    );
  });

  it("rethrows non-404 errors", async () => {
    const client = createMockClient();
    const error = new Error("internal error");
    (client.docker.getContainer as ReturnType<typeof vi.fn>).mockReturnValue({
      inspect: vi.fn().mockRejectedValue(error),
    });

    await expect(inspectContainer(client, "mecha-mx-test-abc123")).rejects.toThrow(
      "internal error",
    );
  });
});

describe("listMechaContainers", () => {
  it("lists containers with mecha label", async () => {
    const client = createMockClient();
    const containers = [{ Names: ["/mecha-mx-test-abc123"] }];
    (client.docker.listContainers as ReturnType<typeof vi.fn>).mockResolvedValue(containers);

    const result = await listMechaContainers(client);

    expect(result).toBe(containers);
    expect(client.docker.listContainers).toHaveBeenCalledWith({
      all: true,
      filters: { label: ["mecha=true"] },
    });
  });
});

describe("getContainerLogs", () => {
  it("returns logs without follow (non-streaming)", async () => {
    const client = createMockClient();
    const logBuffer = Buffer.from("log output");
    const logsFn = vi.fn().mockResolvedValue(logBuffer);
    (client.docker.getContainer as ReturnType<typeof vi.fn>).mockReturnValue({
      logs: logsFn,
    });

    const stream = await getContainerLogs(client, "test-container");

    expect(stream).toBeDefined();
    expect(logsFn).toHaveBeenCalledWith({
      stdout: true,
      stderr: true,
      tail: 100,
      since: undefined,
    });
  });

  it("returns follow stream when follow is true", async () => {
    const client = createMockClient();
    const mockStream = new PassThrough();
    const logsFn = vi.fn().mockResolvedValue(mockStream);
    (client.docker.getContainer as ReturnType<typeof vi.fn>).mockReturnValue({
      logs: logsFn,
    });

    const stream = await getContainerLogs(client, "test-container", { follow: true });

    expect(stream).toBe(mockStream);
    expect(logsFn).toHaveBeenCalledWith({
      stdout: true,
      stderr: true,
      tail: 100,
      since: undefined,
      follow: true,
    });
  });

  it("respects tail and since options", async () => {
    const client = createMockClient();
    const logsFn = vi.fn().mockResolvedValue(Buffer.from(""));
    (client.docker.getContainer as ReturnType<typeof vi.fn>).mockReturnValue({
      logs: logsFn,
    });

    await getContainerLogs(client, "test-container", { tail: 50, since: 1700000000 });

    expect(logsFn).toHaveBeenCalledWith({
      stdout: true,
      stderr: true,
      tail: 50,
      since: 1700000000,
    });
  });
});

describe("execInContainer", () => {
  it("executes command and returns output", async () => {
    const client = createMockClient();

    const stream = new PassThrough();
    const stdout = new PassThrough();
    const stderr = new PassThrough();

    const execObj = {
      start: vi.fn().mockResolvedValue(stream),
      inspect: vi.fn().mockResolvedValue({ ExitCode: 0 }),
    };

    (client.docker.getContainer as ReturnType<typeof vi.fn>).mockReturnValue({
      exec: vi.fn().mockResolvedValue(execObj),
    });

    // Mock demuxStream to pipe data to stdout
    (client.docker.modem.demuxStream as ReturnType<typeof vi.fn>).mockImplementation(
      (_stream: PassThrough, outStream: PassThrough, _errStream: PassThrough) => {
        outStream.write(Buffer.from("hello world"));
        // End the source stream to trigger the 'end' event
        setTimeout(() => stream.emit("end"), 10);
      },
    );

    const result = await execInContainer(client, "test-container", ["echo", "hello"]);

    expect(result.exitCode).toBe(0);
    expect(result.output).toBe("hello world");
  });

  it("handles null ExitCode", async () => {
    const client = createMockClient();
    const stream = new PassThrough();

    const execObj = {
      start: vi.fn().mockResolvedValue(stream),
      inspect: vi.fn().mockResolvedValue({ ExitCode: null }),
    };

    (client.docker.getContainer as ReturnType<typeof vi.fn>).mockReturnValue({
      exec: vi.fn().mockResolvedValue(execObj),
    });

    (client.docker.modem.demuxStream as ReturnType<typeof vi.fn>).mockImplementation(
      () => { setTimeout(() => stream.emit("end"), 10); },
    );

    const result = await execInContainer(client, "test-container", ["false"]);

    expect(result.exitCode).toBe(1);
  });

  it("truncates output exceeding 10MB", async () => {
    const client = createMockClient();
    const stream = new PassThrough();

    const execObj = {
      start: vi.fn().mockResolvedValue(stream),
      inspect: vi.fn().mockResolvedValue({ ExitCode: 0 }),
    };

    (client.docker.getContainer as ReturnType<typeof vi.fn>).mockReturnValue({
      exec: vi.fn().mockResolvedValue(execObj),
    });

    (client.docker.modem.demuxStream as ReturnType<typeof vi.fn>).mockImplementation(
      (_stream: PassThrough, outStream: PassThrough, _errStream: PassThrough) => {
        // Write chunks that exceed 10MB
        const bigChunk = Buffer.alloc(6 * 1024 * 1024, "x");
        outStream.write(bigChunk);
        outStream.write(bigChunk); // second chunk pushes past limit
        outStream.write(Buffer.from("ignored")); // third chunk after truncation
        setTimeout(() => stream.emit("end"), 10);
      },
    );

    const result = await execInContainer(client, "test-container", ["cat", "bigfile"]);

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("[output truncated]");
  });

  it("rejects on stream error", async () => {
    const client = createMockClient();
    const stream = new PassThrough();

    const execObj = {
      start: vi.fn().mockResolvedValue(stream),
      inspect: vi.fn(),
    };

    (client.docker.getContainer as ReturnType<typeof vi.fn>).mockReturnValue({
      exec: vi.fn().mockResolvedValue(execObj),
    });

    (client.docker.modem.demuxStream as ReturnType<typeof vi.fn>).mockImplementation(
      () => { setTimeout(() => stream.emit("error", new Error("stream failed")), 10); },
    );

    await expect(execInContainer(client, "test-container", ["bad"])).rejects.toThrow(
      "stream failed",
    );
  });

  it("rejects when exec.inspect fails", async () => {
    const client = createMockClient();
    const stream = new PassThrough();

    const execObj = {
      start: vi.fn().mockResolvedValue(stream),
      inspect: vi.fn().mockRejectedValue(new Error("inspect failed")),
    };

    (client.docker.getContainer as ReturnType<typeof vi.fn>).mockReturnValue({
      exec: vi.fn().mockResolvedValue(execObj),
    });

    (client.docker.modem.demuxStream as ReturnType<typeof vi.fn>).mockImplementation(
      () => { setTimeout(() => stream.emit("end"), 10); },
    );

    await expect(execInContainer(client, "test-container", ["test"])).rejects.toThrow(
      "inspect failed",
    );
  });

  it("collects stderr output too", async () => {
    const client = createMockClient();
    const stream = new PassThrough();

    const execObj = {
      start: vi.fn().mockResolvedValue(stream),
      inspect: vi.fn().mockResolvedValue({ ExitCode: 1 }),
    };

    (client.docker.getContainer as ReturnType<typeof vi.fn>).mockReturnValue({
      exec: vi.fn().mockResolvedValue(execObj),
    });

    (client.docker.modem.demuxStream as ReturnType<typeof vi.fn>).mockImplementation(
      (_stream: PassThrough, _outStream: PassThrough, errStream: PassThrough) => {
        errStream.write(Buffer.from("error output"));
        setTimeout(() => stream.emit("end"), 10);
      },
    );

    const result = await execInContainer(client, "test-container", ["fail"]);

    expect(result.exitCode).toBe(1);
    expect(result.output).toBe("error output");
  });
});

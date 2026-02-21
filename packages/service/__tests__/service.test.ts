import { describe, it, expect, vi, beforeEach } from "vitest";
import type { DockerClient } from "@mecha/docker";
import {
  mechaUp,
  mechaRm,
  mechaStart,
  mechaStop,
  mechaRestart,
  mechaLs,
  mechaStatus,
  mechaLogs,
  mechaExec,
  mechaConfigure,
  mechaDoctor,
  mechaInit,
  resolveUiUrl,
  resolveMcpEndpoint,
} from "../src/service.js";
import {
  PathNotFoundError,
  PathNotDirectoryError,
  InvalidPermissionModeError,
  ContainerStartError,
  NoPortBindingError,
  ConfigureNoFieldsError,
} from "@mecha/contracts";
import { ContainerNotFoundError } from "@mecha/core";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { PassThrough } from "node:stream";

// --- Mocks ---
const mockEnsureNetwork = vi.fn().mockResolvedValue(undefined);
const mockEnsureVolume = vi.fn().mockResolvedValue(undefined);
const mockRemoveVolume = vi.fn().mockResolvedValue(undefined);
const mockCreateContainer = vi.fn().mockResolvedValue({ id: "abc" });
const mockGetContainerPort = vi.fn().mockResolvedValue(7700);
const mockStartContainer = vi.fn().mockResolvedValue(undefined);
const mockStopContainer = vi.fn().mockResolvedValue(undefined);
const mockRemoveContainer = vi.fn().mockResolvedValue(undefined);
const mockInspectContainer = vi.fn().mockResolvedValue({});
const mockListMechaContainers = vi.fn().mockResolvedValue([]);
const mockGetContainerLogs = vi.fn().mockResolvedValue(new PassThrough());
const mockExecInContainer = vi.fn().mockResolvedValue({ exitCode: 0, output: "" });
const mockPing = vi.fn().mockResolvedValue(undefined);

vi.mock("@mecha/docker", () => ({
  ensureNetwork: (...a: unknown[]) => mockEnsureNetwork(...a),
  ensureVolume: (...a: unknown[]) => mockEnsureVolume(...a),
  removeVolume: (...a: unknown[]) => mockRemoveVolume(...a),
  createContainer: (...a: unknown[]) => mockCreateContainer(...a),
  getContainerPort: (...a: unknown[]) => mockGetContainerPort(...a),
  startContainer: (...a: unknown[]) => mockStartContainer(...a),
  stopContainer: (...a: unknown[]) => mockStopContainer(...a),
  removeContainer: (...a: unknown[]) => mockRemoveContainer(...a),
  inspectContainer: (...a: unknown[]) => mockInspectContainer(...a),
  listMechaContainers: (...a: unknown[]) => mockListMechaContainers(...a),
  getContainerLogs: (...a: unknown[]) => mockGetContainerLogs(...a),
  execInContainer: (...a: unknown[]) => mockExecInContainer(...a),
  ping: (...a: unknown[]) => mockPing(...a),
}));

const client = {} as DockerClient;

beforeEach(() => {
  vi.clearAllMocks();
  mockEnsureNetwork.mockResolvedValue(undefined);
  mockEnsureVolume.mockResolvedValue(undefined);
  mockRemoveVolume.mockResolvedValue(undefined);
  mockCreateContainer.mockResolvedValue({ id: "abc" });
  mockGetContainerPort.mockResolvedValue(7700);
  mockStartContainer.mockResolvedValue(undefined);
  mockStopContainer.mockResolvedValue(undefined);
  mockRemoveContainer.mockResolvedValue(undefined);
  mockInspectContainer.mockResolvedValue({});
  mockListMechaContainers.mockResolvedValue([]);
  mockGetContainerLogs.mockResolvedValue(new PassThrough());
  mockExecInContainer.mockResolvedValue({ exitCode: 0, output: "" });
  mockPing.mockResolvedValue(undefined);
});

describe("mechaUp", () => {
  it("creates and starts a container, returns result", async () => {
    const result = await mechaUp(client, { projectPath: tmpdir() });

    expect(mockEnsureNetwork).toHaveBeenCalledTimes(1);
    expect(mockEnsureVolume).toHaveBeenCalledTimes(1);
    expect(mockCreateContainer).toHaveBeenCalledTimes(1);
    expect(mockStartContainer).toHaveBeenCalledTimes(1);
    expect(result.id).toBeDefined();
    expect(result.name).toBeDefined();
    expect(result.port).toBe(7700);
    expect(result.authToken).toHaveLength(64);
  });

  it("uses explicit port when provided", async () => {
    const result = await mechaUp(client, { projectPath: tmpdir(), port: 8080 });

    const opts = mockCreateContainer.mock.calls[0][1];
    expect(opts.hostPort).toBe(8080);
    expect(result.port).toBe(8080);
  });

  it("passes env vars to container", async () => {
    await mechaUp(client, {
      projectPath: tmpdir(),
      claudeToken: "tok",
      anthropicApiKey: "sk-key",
      otp: "secret",
      permissionMode: "full-auto",
    });

    const opts = mockCreateContainer.mock.calls[0][1];
    expect(opts.env).toContain("CLAUDE_CODE_OAUTH_TOKEN=tok");
    expect(opts.env).toContain("ANTHROPIC_API_KEY=sk-key");
    expect(opts.env).toContain("MECHA_OTP=secret");
    expect(opts.env).toContain("MECHA_PERMISSION_MODE=full-auto");
  });

  it("throws PathNotFoundError for non-existent path", async () => {
    await expect(mechaUp(client, { projectPath: "/nonexistent/path" })).rejects.toThrow(PathNotFoundError);
  });

  it("throws PathNotDirectoryError for a file path", async () => {
    const testDir = join(tmpdir(), `mecha-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    const filePath = join(testDir, "file.txt");
    writeFileSync(filePath, "");

    await expect(mechaUp(client, { projectPath: filePath })).rejects.toThrow(PathNotDirectoryError);
    rmSync(testDir, { recursive: true, force: true });
  });

  it("throws for port below 1024 (schema validation)", async () => {
    await expect(mechaUp(client, { projectPath: tmpdir(), port: 80 })).rejects.toThrow();
  });

  it("throws for invalid permission mode (schema validation)", async () => {
    await expect(mechaUp(client, { projectPath: tmpdir(), permissionMode: "yolo" as any })).rejects.toThrow();
  });

  it("throws NoPortBindingError when dynamic port is unavailable", async () => {
    mockGetContainerPort.mockResolvedValueOnce(undefined);

    await expect(mechaUp(client, { projectPath: tmpdir() })).rejects.toThrow(NoPortBindingError);
  });

  it("removes container on start failure (rollback)", async () => {
    mockStartContainer.mockRejectedValueOnce(new Error("port in use"));

    await expect(mechaUp(client, { projectPath: tmpdir() })).rejects.toThrow(ContainerStartError);
    expect(mockRemoveContainer).toHaveBeenCalledTimes(1);
  });

  it("includes custom env entries", async () => {
    await mechaUp(client, { projectPath: tmpdir(), env: ["MY_VAR=hello"] });

    const opts = mockCreateContainer.mock.calls[0][1];
    expect(opts.env).toContain("MY_VAR=hello");
  });

  it("rejects blocked env keys via schema validation", async () => {
    await expect(
      mechaUp(client, { projectPath: tmpdir(), env: ["MECHA_AUTH_TOKEN=hacked"] }),
    ).rejects.toThrow();
    expect(mockCreateContainer).not.toHaveBeenCalled();
  });

  it("rejects malformed env entries via schema validation", async () => {
    await expect(
      mechaUp(client, { projectPath: tmpdir(), env: ["no-equals"] } as any),
    ).rejects.toThrow();
    expect(mockCreateContainer).not.toHaveBeenCalled();
  });
});

describe("mechaRm", () => {
  it("removes container", async () => {
    await mechaRm(client, { id: "mx-foo", withState: false, force: false });

    expect(mockRemoveContainer).toHaveBeenCalledTimes(1);
    expect(mockRemoveVolume).not.toHaveBeenCalled();
  });

  it("removes container and volume with withState", async () => {
    await mechaRm(client, { id: "mx-foo", withState: true, force: true });

    expect(mockRemoveContainer).toHaveBeenCalledWith(expect.anything(), expect.any(String), true);
    expect(mockRemoveVolume).toHaveBeenCalledTimes(1);
  });
});

describe("mechaStart", () => {
  it("starts container by id", async () => {
    await mechaStart(client, "mx-foo");
    expect(mockStartContainer).toHaveBeenCalledTimes(1);
  });
});

describe("mechaStop", () => {
  it("stops container by id", async () => {
    await mechaStop(client, "mx-foo");
    expect(mockStopContainer).toHaveBeenCalledTimes(1);
  });
});

describe("mechaRestart", () => {
  it("stops then starts container", async () => {
    await mechaRestart(client, "mx-foo");
    expect(mockStopContainer).toHaveBeenCalledTimes(1);
    expect(mockStartContainer).toHaveBeenCalledTimes(1);
  });

  it("tolerates already-stopped container (409)", async () => {
    const err = Object.assign(new Error("already stopped"), { statusCode: 409 });
    mockStopContainer.mockRejectedValueOnce(err);

    await mechaRestart(client, "mx-foo");
    expect(mockStartContainer).toHaveBeenCalledTimes(1);
  });

  it("rethrows non-409 stop errors", async () => {
    mockStopContainer.mockRejectedValueOnce(new Error("internal error"));
    await expect(mechaRestart(client, "mx-foo")).rejects.toThrow("internal error");
  });
});

describe("mechaLs", () => {
  it("returns formatted list items", async () => {
    mockListMechaContainers.mockResolvedValue([
      {
        Labels: { "mecha.id": "mx-foo", "mecha.path": "/tmp" },
        Names: ["/mecha-mx-foo"],
        State: "running",
        Status: "Up 5 min",
        Ports: [{ PrivatePort: 3000, PublicPort: 7700 }],
        Created: 1700000000,
      },
    ]);

    const result = await mechaLs(client);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("mx-foo");
    expect(result[0].name).toBe("mecha-mx-foo");
    expect(result[0].port).toBe(7700);
    expect(result[0].created).toBe(1700000000);
  });

  it("handles containers with missing labels, names, and ports", async () => {
    mockListMechaContainers.mockResolvedValue([
      {
        Labels: {},
        Names: [],
        State: "exited",
        Status: "Exited (0)",
        Ports: [],
        Created: 1700000000,
      },
    ]);

    const result = await mechaLs(client);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("");
    expect(result[0].name).toBe("");
    expect(result[0].path).toBe("");
    expect(result[0].port).toBeUndefined();
  });
});

describe("mechaStatus", () => {
  it("returns status from inspect data", async () => {
    mockInspectContainer.mockResolvedValue({
      Name: "/mecha-mx-foo",
      State: { Status: "running", Running: true, StartedAt: "2025-01-01", FinishedAt: "" },
      Config: { Image: "mecha-runtime:latest", Labels: { "mecha.path": "/tmp" } },
      NetworkSettings: { Ports: { "3000/tcp": [{ HostPort: "7700" }] } },
    });

    const result = await mechaStatus(client, "mx-foo");
    expect(result.id).toBe("mx-foo");
    expect(result.running).toBe(true);
    expect(result.port).toBe(7700);
    expect(result.image).toBe("mecha-runtime:latest");
  });

  it("handles missing state, config, and port data", async () => {
    mockInspectContainer.mockResolvedValue({
      Name: "/mecha-mx-foo",
      State: undefined,
      Config: undefined,
      NetworkSettings: undefined,
    });

    const result = await mechaStatus(client, "mx-foo");
    expect(result.state).toBe("unknown");
    expect(result.running).toBe(false);
    expect(result.port).toBeUndefined();
    expect(result.path).toBe("");
    expect(result.image).toBe("");
  });
});

describe("mechaLogs", () => {
  it("returns log stream", async () => {
    const stream = await mechaLogs(client, { id: "mx-foo", follow: false, tail: 50 });
    expect(stream).toBeDefined();
    expect(mockGetContainerLogs).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(String),
      { follow: false, tail: 50, since: undefined },
    );
  });
});

describe("mechaExec", () => {
  it("executes command and returns result", async () => {
    mockExecInContainer.mockResolvedValue({ exitCode: 0, output: "hello" });

    const result = await mechaExec(client, { id: "mx-foo", cmd: ["echo", "hello"] });
    expect(result.exitCode).toBe(0);
    expect(result.output).toBe("hello");
  });
});

describe("mechaConfigure", () => {
  beforeEach(() => {
    mockInspectContainer.mockResolvedValue({
      Config: {
        Image: "mecha-runtime:latest",
        Env: ["MECHA_ID=mx-foo", "MECHA_AUTH_TOKEN=tok123"],
        Labels: { "mecha.path": "/tmp" },
      },
      NetworkSettings: { Ports: { "3000/tcp": [{ HostPort: "7700" }] } },
      Mounts: [{ Destination: "/var/lib/mecha", Name: "mecha-state-mx-foo" }],
    });
  });

  it("reconfigures container with new env vars", async () => {
    await mechaConfigure(client, { id: "mx-foo", claudeToken: "new-token" });

    expect(mockStopContainer).toHaveBeenCalledTimes(1);
    expect(mockRemoveContainer).toHaveBeenCalledTimes(1);
    expect(mockCreateContainer).toHaveBeenCalledTimes(1);
    expect(mockStartContainer).toHaveBeenCalledTimes(1);

    const opts = mockCreateContainer.mock.calls[0][1];
    expect(opts.env).toContain("CLAUDE_CODE_OAUTH_TOKEN=new-token");
  });

  it("throws ConfigureNoFieldsError when no fields provided", async () => {
    await expect(mechaConfigure(client, { id: "mx-foo" })).rejects.toThrow(ConfigureNoFieldsError);
  });

  it("throws InvalidPermissionModeError for invalid mode", async () => {
    await expect(mechaConfigure(client, { id: "mx-foo", permissionMode: "nope" as any })).rejects.toThrow(InvalidPermissionModeError);
  });

  it("rolls back on start failure", async () => {
    mockStartContainer
      .mockRejectedValueOnce(new Error("start failed"))  // new container start fails
      .mockResolvedValueOnce(undefined);                   // rollback start succeeds
    mockRemoveContainer.mockResolvedValue(undefined);

    await expect(mechaConfigure(client, { id: "mx-foo", otp: "newval" })).rejects.toThrow(ContainerStartError);

    // Should have removed failed container and recreated original
    expect(mockRemoveContainer).toHaveBeenCalledTimes(2); // once for old, once for failed new
    expect(mockCreateContainer).toHaveBeenCalledTimes(2); // once for new, once for rollback
    expect(mockStartContainer).toHaveBeenCalledTimes(2);  // once failed, once rollback
  });

  it("supports anthropicApiKey", async () => {
    await mechaConfigure(client, { id: "mx-foo", anthropicApiKey: "sk-ant-123" });

    const opts = mockCreateContainer.mock.calls[0][1];
    expect(opts.env).toContain("ANTHROPIC_API_KEY=sk-ant-123");
  });

  it("tolerates 409 from stopTolerant (already stopped)", async () => {
    const err409 = Object.assign(new Error("already stopped"), { statusCode: 409 });
    mockStopContainer.mockRejectedValueOnce(err409);

    await mechaConfigure(client, { id: "mx-foo", otp: "newval" });

    // Should proceed to recreate despite 409
    expect(mockRemoveContainer).toHaveBeenCalledTimes(1);
    expect(mockCreateContainer).toHaveBeenCalledTimes(1);
    expect(mockStartContainer).toHaveBeenCalledTimes(1);
  });

  it("rethrows non-409 error from stopTolerant", async () => {
    const serverError = new Error("server error");
    mockStopContainer.mockRejectedValueOnce(serverError);

    await expect(mechaConfigure(client, { id: "mx-foo", otp: "newval" })).rejects.toThrow("server error");
  });

  it("still throws original error when rollback also fails (recreateWithRollback outer catch)", async () => {
    // removeContainer succeeds, createContainer fails (not ContainerStartError)
    // Then in outer catch: rollback createContainer succeeds but startContainer fails
    mockRemoveContainer
      .mockResolvedValueOnce(undefined);  // initial remove succeeds
    mockCreateContainer
      .mockRejectedValueOnce(new Error("image not found"))  // new container create fails
      .mockResolvedValueOnce({ id: "rollback" });            // rollback create succeeds
    mockStartContainer
      .mockRejectedValueOnce(new Error("rollback start also failed")); // rollback start fails

    await expect(mechaConfigure(client, { id: "mx-foo", otp: "newval" })).rejects.toThrow("image not found");

    // Verify rollback was attempted (createContainer called twice)
    expect(mockCreateContainer).toHaveBeenCalledTimes(2);
    expect(mockStartContainer).toHaveBeenCalledTimes(1);
  });

  it("handles missing Env and Mounts in inspect data", async () => {
    mockInspectContainer.mockResolvedValue({
      Config: {
        Image: "mecha-runtime:latest",
        Env: undefined,
        Labels: {},
      },
      NetworkSettings: {},
      Mounts: undefined,
    });

    await mechaConfigure(client, { id: "mx-foo", otp: "newval" });

    const opts = mockCreateContainer.mock.calls[0][1];
    expect(opts.env).toContain("MECHA_OTP=newval");
    expect(opts.volumeName).toBe("");
    expect(opts.projectPath).toBe("");
  });

  it("handles env entry without equals sign", async () => {
    mockInspectContainer.mockResolvedValue({
      Config: {
        Image: "mecha-runtime:latest",
        Env: ["MECHA_ID=mx-foo", "NOEQUALS"],
        Labels: { "mecha.path": "/tmp" },
      },
      NetworkSettings: { Ports: { "3000/tcp": [{ HostPort: "7700" }] } },
      Mounts: [{ Destination: "/var/lib/mecha", Name: "vol" }],
    });

    await mechaConfigure(client, { id: "mx-foo", otp: "newval" });

    const opts = mockCreateContainer.mock.calls[0][1];
    // "NOEQUALS" has indexOf("=") === -1 which is not > 0, so should be skipped
    const envStr = (opts.env as string[]).join("|");
    expect(envStr).not.toContain("NOEQUALS");
  });

  it("clears env var when set to empty string", async () => {
    mockInspectContainer.mockResolvedValue({
      Config: {
        Image: "mecha-runtime:latest",
        Env: ["MECHA_ID=mx-foo", "CLAUDE_CODE_OAUTH_TOKEN=existing"],
        Labels: { "mecha.path": "/tmp" },
      },
      NetworkSettings: { Ports: { "3000/tcp": [{ HostPort: "7700" }] } },
      Mounts: [{ Destination: "/var/lib/mecha", Name: "vol" }],
    });

    await mechaConfigure(client, { id: "mx-foo", claudeToken: "" });

    const opts = mockCreateContainer.mock.calls[0][1];
    const envStr = (opts.env as string[]).join("|");
    expect(envStr).not.toContain("CLAUDE_CODE_OAUTH_TOKEN");
  });
});

describe("mechaDoctor", () => {
  it("returns healthy when docker and network available", async () => {
    const listNetworks = vi.fn().mockResolvedValue([{ Name: "mecha-net" }]);
    const doctorClient = { docker: { listNetworks } } as unknown as DockerClient;

    const result = await mechaDoctor(doctorClient);
    expect(result.dockerAvailable).toBe(true);
    expect(result.networkExists).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it("reports docker unavailable", async () => {
    mockPing.mockRejectedValueOnce(new Error("no docker"));

    const result = await mechaDoctor(client);
    expect(result.dockerAvailable).toBe(false);
    expect(result.issues).toContain("Docker is not available. Is Docker/Colima running?");
  });

  it("reports network check failure when listNetworks throws", async () => {
    const listNetworks = vi.fn().mockRejectedValue(new Error("network error"));
    const doctorClient = { docker: { listNetworks } } as unknown as DockerClient;

    const result = await mechaDoctor(doctorClient);
    expect(result.dockerAvailable).toBe(true);
    expect(result.networkExists).toBe(false);
    expect(result.issues).toContain("Failed to check network status.");
  });

  it("reports missing network", async () => {
    const listNetworks = vi.fn().mockResolvedValue([]);
    const doctorClient = { docker: { listNetworks } } as unknown as DockerClient;

    const result = await mechaDoctor(doctorClient);
    expect(result.dockerAvailable).toBe(true);
    expect(result.networkExists).toBe(false);
    expect(result.issues.some((i) => i.includes("not found"))).toBe(true);
  });
});

describe("mechaInit", () => {
  it("creates network and config directory", async () => {
    await mechaInit(client);
    expect(mockEnsureNetwork).toHaveBeenCalledTimes(1);
  });
});

describe("resolveUiUrl", () => {
  it("returns url with port", async () => {
    mockGetContainerPort.mockResolvedValue(7700);

    const result = await resolveUiUrl(client, "mx-foo");
    expect(result.url).toBe("http://127.0.0.1:7700");
  });

  it("throws NoPortBindingError when no port", async () => {
    mockGetContainerPort.mockResolvedValue(undefined);

    await expect(resolveUiUrl(client, "mx-foo")).rejects.toThrow(NoPortBindingError);
  });
});

describe("resolveMcpEndpoint", () => {
  it("returns endpoint with port", async () => {
    mockGetContainerPort.mockResolvedValue(7700);

    const result = await resolveMcpEndpoint(client, "mx-foo");
    expect(result.endpoint).toBe("http://127.0.0.1:7700/mcp");
    expect(result.note).toBeDefined();
  });

  it("throws NoPortBindingError when no port", async () => {
    mockGetContainerPort.mockResolvedValue(undefined);

    await expect(resolveMcpEndpoint(client, "mx-foo")).rejects.toThrow(NoPortBindingError);
  });
});

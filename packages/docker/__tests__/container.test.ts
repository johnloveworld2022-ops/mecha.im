import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createContainer,
  startContainer,
  stopContainer,
  removeContainer,
  inspectContainer,
  listMechaContainers,
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
  it("stops a container with timeout", async () => {
    const client = createMockClient();
    const stopFn = vi.fn().mockResolvedValue({});
    (client.docker.getContainer as ReturnType<typeof vi.fn>).mockReturnValue({
      stop: stopFn,
    });

    await stopContainer(client, "mecha-mx-test-abc123", 15);

    expect(stopFn).toHaveBeenCalledWith({ t: 15 });
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

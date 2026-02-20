import { describe, it, expect, vi, beforeEach } from "vitest";
import { ensureVolume, removeVolume } from "../src/volume.js";
import type { DockerClient } from "../src/client.js";

function createMockClient(): DockerClient {
  return {
    docker: {
      listVolumes: vi.fn(),
      createVolume: vi.fn(),
      getVolume: vi.fn(),
    },
  } as unknown as DockerClient;
}

describe("ensureVolume", () => {
  let client: DockerClient;

  beforeEach(() => {
    client = createMockClient();
  });

  it("creates volume if it does not exist", async () => {
    (client.docker.listVolumes as ReturnType<typeof vi.fn>).mockResolvedValue({
      Volumes: [],
    });
    (client.docker.createVolume as ReturnType<typeof vi.fn>).mockResolvedValue({});

    await ensureVolume(client, "mecha-state-mx-test-abc123");

    expect(client.docker.createVolume).toHaveBeenCalledWith({
      Name: "mecha-state-mx-test-abc123",
    });
  });

  it("does not create volume if it already exists", async () => {
    (client.docker.listVolumes as ReturnType<typeof vi.fn>).mockResolvedValue({
      Volumes: [{ Name: "mecha-state-mx-test-abc123" }],
    });

    await ensureVolume(client, "mecha-state-mx-test-abc123");

    expect(client.docker.createVolume).not.toHaveBeenCalled();
  });

  it("handles null Volumes array", async () => {
    (client.docker.listVolumes as ReturnType<typeof vi.fn>).mockResolvedValue({
      Volumes: null,
    });
    (client.docker.createVolume as ReturnType<typeof vi.fn>).mockResolvedValue({});

    await ensureVolume(client, "test-vol");

    expect(client.docker.createVolume).toHaveBeenCalled();
  });
});

describe("removeVolume", () => {
  let client: DockerClient;

  beforeEach(() => {
    client = createMockClient();
  });

  it("removes existing volume", async () => {
    const removeFn = vi.fn().mockResolvedValue({});
    (client.docker.getVolume as ReturnType<typeof vi.fn>).mockReturnValue({
      remove: removeFn,
    });

    await removeVolume(client, "test-vol");

    expect(removeFn).toHaveBeenCalled();
  });

  it("is idempotent when volume does not exist", async () => {
    const error = Object.assign(new Error("not found"), { statusCode: 404 });
    (client.docker.getVolume as ReturnType<typeof vi.fn>).mockReturnValue({
      remove: vi.fn().mockRejectedValue(error),
    });

    await removeVolume(client, "test-vol");
  });

  it("rethrows non-404 errors", async () => {
    const error = new Error("in use");
    (client.docker.getVolume as ReturnType<typeof vi.fn>).mockReturnValue({
      remove: vi.fn().mockRejectedValue(error),
    });

    await expect(removeVolume(client, "test-vol")).rejects.toThrow("in use");
  });
});

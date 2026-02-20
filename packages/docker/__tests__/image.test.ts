import { describe, it, expect, vi } from "vitest";
import { imageExists, pullImage } from "../src/image.js";
import type { DockerClient } from "../src/client.js";

function createMockClient(): DockerClient {
  return {
    docker: {
      getImage: vi.fn(),
      pull: vi.fn(),
      modem: {
        followProgress: vi.fn(),
      },
    },
  } as unknown as DockerClient;
}

describe("imageExists", () => {
  it("returns true when image exists", async () => {
    const client = createMockClient();
    (client.docker.getImage as ReturnType<typeof vi.fn>).mockReturnValue({
      inspect: vi.fn().mockResolvedValue({}),
    });

    const result = await imageExists(client, "mecha-runtime:latest");

    expect(result).toBe(true);
  });

  it("returns false when image does not exist", async () => {
    const client = createMockClient();
    (client.docker.getImage as ReturnType<typeof vi.fn>).mockReturnValue({
      inspect: vi.fn().mockRejectedValue(new Error("not found")),
    });

    const result = await imageExists(client, "mecha-runtime:latest");

    expect(result).toBe(false);
  });
});

describe("pullImage", () => {
  it("pulls image and follows progress", async () => {
    const client = createMockClient();
    const stream = {};
    (client.docker.pull as ReturnType<typeof vi.fn>).mockResolvedValue(stream);
    (client.docker.modem.followProgress as ReturnType<typeof vi.fn>).mockImplementation(
      (_stream: unknown, onFinish: (err: Error | null) => void) => {
        onFinish(null);
      },
    );

    await pullImage(client, "mecha-runtime:latest");

    expect(client.docker.pull).toHaveBeenCalledWith("mecha-runtime:latest");
    expect(client.docker.modem.followProgress).toHaveBeenCalled();
  });

  it("rejects on pull error", async () => {
    const client = createMockClient();
    const stream = {};
    (client.docker.pull as ReturnType<typeof vi.fn>).mockResolvedValue(stream);
    (client.docker.modem.followProgress as ReturnType<typeof vi.fn>).mockImplementation(
      (_stream: unknown, onFinish: (err: Error | null) => void) => {
        onFinish(new Error("pull failed"));
      },
    );

    await expect(pullImage(client, "mecha-runtime:latest")).rejects.toThrow("pull failed");
  });
});

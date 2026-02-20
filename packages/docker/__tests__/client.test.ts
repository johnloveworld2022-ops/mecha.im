import { describe, it, expect, vi } from "vitest";
import { ping } from "../src/client.js";
import { DockerNotAvailableError } from "@mecha/core";
import type { DockerClient } from "../src/client.js";

function createMockClient(): DockerClient {
  return {
    docker: {
      ping: vi.fn(),
    },
  } as unknown as DockerClient;
}

describe("ping", () => {
  it("returns true when Docker responds", async () => {
    const client = createMockClient();
    (client.docker.ping as ReturnType<typeof vi.fn>).mockResolvedValue("OK");

    const result = await ping(client);

    expect(result).toBe(true);
  });

  it("throws DockerNotAvailableError when Docker is unreachable", async () => {
    const client = createMockClient();
    (client.docker.ping as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("ECONNREFUSED"),
    );

    await expect(ping(client)).rejects.toThrow(DockerNotAvailableError);
  });
});

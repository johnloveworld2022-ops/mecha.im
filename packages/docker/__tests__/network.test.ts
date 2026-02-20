import { describe, it, expect, vi, beforeEach } from "vitest";
import { ensureNetwork, removeNetwork } from "../src/network.js";
import type { DockerClient } from "../src/client.js";

function createMockClient(): DockerClient {
  return {
    docker: {
      listNetworks: vi.fn(),
      createNetwork: vi.fn(),
      getNetwork: vi.fn(),
    },
  } as unknown as DockerClient;
}

describe("ensureNetwork", () => {
  let client: DockerClient;

  beforeEach(() => {
    client = createMockClient();
  });

  it("creates network if it does not exist", async () => {
    (client.docker.listNetworks as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (client.docker.createNetwork as ReturnType<typeof vi.fn>).mockResolvedValue({});

    await ensureNetwork(client, "mecha-net");

    expect(client.docker.createNetwork).toHaveBeenCalledWith({
      Name: "mecha-net",
      Driver: "bridge",
    });
  });

  it("does not create network if it already exists", async () => {
    (client.docker.listNetworks as ReturnType<typeof vi.fn>).mockResolvedValue([
      { Name: "mecha-net" },
    ]);

    await ensureNetwork(client, "mecha-net");

    expect(client.docker.createNetwork).not.toHaveBeenCalled();
  });
});

describe("removeNetwork", () => {
  let client: DockerClient;

  beforeEach(() => {
    client = createMockClient();
  });

  it("removes existing network", async () => {
    const removeFn = vi.fn().mockResolvedValue({});
    (client.docker.getNetwork as ReturnType<typeof vi.fn>).mockReturnValue({
      remove: removeFn,
    });

    await removeNetwork(client, "mecha-net");

    expect(removeFn).toHaveBeenCalled();
  });

  it("is idempotent when network does not exist", async () => {
    const error = Object.assign(new Error("not found"), { statusCode: 404 });
    (client.docker.getNetwork as ReturnType<typeof vi.fn>).mockReturnValue({
      remove: vi.fn().mockRejectedValue(error),
    });

    // Should not throw
    await removeNetwork(client, "mecha-net");
  });

  it("rethrows non-404 errors", async () => {
    const error = new Error("internal error");
    (client.docker.getNetwork as ReturnType<typeof vi.fn>).mockReturnValue({
      remove: vi.fn().mockRejectedValue(error),
    });

    await expect(removeNetwork(client, "mecha-net")).rejects.toThrow("internal error");
  });
});

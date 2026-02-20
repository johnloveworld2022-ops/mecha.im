import type { DockerClient } from "./client.js";

/** Ensure a Docker network exists (idempotent) */
export async function ensureNetwork(
  client: DockerClient,
  name: string,
): Promise<void> {
  const networks = await client.docker.listNetworks({
    filters: { name: [name] },
  });
  const exists = networks.some((n) => n.Name === name);
  if (!exists) {
    await client.docker.createNetwork({ Name: name, Driver: "bridge" });
  }
}

/** Remove a Docker network (idempotent) */
export async function removeNetwork(
  client: DockerClient,
  name: string,
): Promise<void> {
  try {
    const network = client.docker.getNetwork(name);
    await network.remove();
  } catch (err: unknown) {
    if (isNotFoundError(err)) return;
    throw err;
  }
}

function isNotFoundError(err: unknown): boolean {
  return (
    err instanceof Error &&
    "statusCode" in err &&
    (err as { statusCode: number }).statusCode === 404
  );
}

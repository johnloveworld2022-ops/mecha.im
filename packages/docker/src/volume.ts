import type { DockerClient } from "./client.js";

/** Ensure a Docker volume exists (idempotent) */
export async function ensureVolume(
  client: DockerClient,
  name: string,
): Promise<void> {
  const volumes = await client.docker.listVolumes({
    filters: { name: [name] },
  });
  const exists = (volumes.Volumes || []).some((v) => v.Name === name);
  if (!exists) {
    await client.docker.createVolume({ Name: name });
  }
}

/** Remove a Docker volume (idempotent) */
export async function removeVolume(
  client: DockerClient,
  name: string,
): Promise<void> {
  try {
    const volume = client.docker.getVolume(name);
    await volume.remove();
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

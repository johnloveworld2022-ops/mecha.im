import type { DockerClient } from "./client.js";
import { isNotFoundError } from "./utils.js";

export async function ensureVolume(client: DockerClient, name: string): Promise<void> {
  const volumes = await client.docker.listVolumes({ filters: { name: [name] } });
  if (!(volumes.Volumes ?? []).some((v) => v.Name === name)) {
    await client.docker.createVolume({ Name: name });
  }
}

export async function removeVolume(client: DockerClient, name: string): Promise<void> {
  try {
    await client.docker.getVolume(name).remove();
  } catch (err: unknown) {
    if (isNotFoundError(err)) return;
    throw err;
  }
}

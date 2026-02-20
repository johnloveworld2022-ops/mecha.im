import type { DockerClient } from "./client.js";
import { isNotFoundError } from "./utils.js";

export async function ensureNetwork(client: DockerClient, name: string): Promise<void> {
  const networks = await client.docker.listNetworks({ filters: { name: [name] } });
  if (!networks.some((n) => n.Name === name)) {
    await client.docker.createNetwork({ Name: name, Driver: "bridge" });
  }
}

export async function removeNetwork(client: DockerClient, name: string): Promise<void> {
  try {
    await client.docker.getNetwork(name).remove();
  } catch (err: unknown) {
    if (isNotFoundError(err)) return;
    throw err;
  }
}

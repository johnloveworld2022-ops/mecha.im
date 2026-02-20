import Dockerode from "dockerode";
import { DockerNotAvailableError } from "@mecha/core";

export interface DockerClient {
  docker: Dockerode;
}

/** Create a Dockerode client instance */
export function createDockerClient(opts?: Dockerode.DockerOptions): DockerClient {
  const docker = new Dockerode(opts);
  return { docker };
}

/** Check if Docker daemon is reachable */
export async function ping(client: DockerClient): Promise<boolean> {
  try {
    await client.docker.ping();
    return true;
  } catch {
    throw new DockerNotAvailableError();
  }
}

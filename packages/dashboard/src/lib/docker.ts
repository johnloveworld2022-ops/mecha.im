import { createDockerClient } from "@mecha/docker";

type DockerClient = ReturnType<typeof createDockerClient>;

let client: DockerClient | undefined;

export function getDockerClient(): DockerClient {
  if (!client) {
    client = createDockerClient();
  }
  return client;
}

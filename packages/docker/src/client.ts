import Dockerode from "dockerode";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { DockerNotAvailableError } from "@mecha/core";

export interface DockerClient {
  docker: Dockerode;
}

/**
 * Resolve the Docker socket path by checking:
 * 1. DOCKER_HOST env var
 * 2. Docker context (docker context inspect)
 * 3. Common socket paths (default, Colima, Rancher, Podman)
 */
function resolveSocketPath(): string | undefined {
  // 1. DOCKER_HOST env var
  const dockerHost = process.env["DOCKER_HOST"];
  if (dockerHost) {
    return dockerHost.replace(/^unix:\/\//, "");
  }

  // 2. Docker context
  try {
    const host = execSync(
      "docker context inspect -f '{{.Endpoints.docker.Host}}'",
      { encoding: "utf-8", timeout: 5000, stdio: ["pipe", "pipe", "pipe"] },
    ).trim();
    if (host) {
      return host.replace(/^unix:\/\//, "");
    }
  } catch {
    // docker CLI not available or context not set
  }

  // 3. Common socket paths
  const candidates = [
    "/var/run/docker.sock",
    join(homedir(), ".orbstack/run/docker.sock"),
    join(homedir(), ".colima/default/docker.sock"),
    join(homedir(), ".rd/docker.sock"),
    join(homedir(), ".local/share/containers/podman/machine/podman.sock"),
  ];
  for (const sock of candidates) {
    if (existsSync(sock)) {
      return sock;
    }
  }

  return undefined;
}

/** Create a Dockerode client instance */
export function createDockerClient(opts?: Dockerode.DockerOptions): DockerClient {
  if (!opts) {
    const socketPath = resolveSocketPath();
    if (socketPath) {
      opts = { socketPath };
    }
  }
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

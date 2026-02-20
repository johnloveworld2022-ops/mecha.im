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
 * Parse a Docker host URI into Dockerode options.
 * Supports unix://, tcp://, http://, https:// schemes.
 */
function parseDockerHost(host: string): Dockerode.DockerOptions {
  if (host.startsWith("unix://")) {
    return { socketPath: host.replace(/^unix:\/\//, "") };
  }
  if (host.startsWith("tcp://") || host.startsWith("http://") || host.startsWith("https://")) {
    const url = new URL(host.replace(/^tcp:\/\//, "http://"));
    const protocol = host.startsWith("https://") ? "https" : "http";
    return {
      host: url.hostname,
      port: url.port ? Number(url.port) : (protocol === "https" ? 2376 : 2375),
      protocol,
    };
  }
  // Assume it's a socket path
  return { socketPath: host };
}

/**
 * Resolve Docker connection options by checking:
 * 1. DOCKER_HOST env var
 * 2. Docker context (docker context inspect)
 * 3. Common socket paths (default, OrbStack, Colima, Rancher, Podman)
 */
function resolveDockerOpts(): Dockerode.DockerOptions | undefined {
  // 1. DOCKER_HOST env var
  const dockerHost = process.env["DOCKER_HOST"];
  if (dockerHost) {
    return parseDockerHost(dockerHost);
  }

  // 2. Docker context
  try {
    const host = execSync(
      "docker context inspect -f '{{.Endpoints.docker.Host}}'",
      { encoding: "utf-8", timeout: 5000, stdio: ["pipe", "pipe", "pipe"] },
    ).trim();
    if (host) {
      return parseDockerHost(host);
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
      return { socketPath: sock };
    }
  }

  return undefined;
}

/** Create a Dockerode client instance */
export function createDockerClient(opts?: Dockerode.DockerOptions): DockerClient {
  return { docker: new Dockerode(opts ?? resolveDockerOpts()) };
}

/** Check if Docker daemon is reachable */
export async function ping(client: DockerClient): Promise<boolean> {
  try { await client.docker.ping(); return true; }
  catch { throw new DockerNotAvailableError(); }
}

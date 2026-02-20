import type Dockerode from "dockerode";
import {
  LABELS,
  MOUNT_PATHS,
  SECURITY,
  DEFAULTS,
  ContainerNotFoundError,
} from "@mecha/core";
import type { MechaId } from "@mecha/core";
import type { DockerClient } from "./client.js";

export interface CreateContainerOptions {
  containerName: string;
  image: string;
  mechaId: MechaId;
  projectPath: string;
  volumeName: string;
  hostPort: number;
  env?: string[];
}

/** Create a Mecha container with security defaults baked in */
export async function createContainer(
  client: DockerClient,
  opts: CreateContainerOptions,
): Promise<Dockerode.Container> {
  const container = await client.docker.createContainer({
    name: opts.containerName,
    Image: opts.image,
    Env: [
      `MECHA_ID=${opts.mechaId}`,
      // Forward Claude setup token for subscription-based auth (§11.2)
      ...(process.env["CLAUDE_CODE_OAUTH_TOKEN"]
        ? [`CLAUDE_CODE_OAUTH_TOKEN=${process.env["CLAUDE_CODE_OAUTH_TOKEN"]}`]
        : []),
      ...(opts.env || []),
    ],
    Labels: {
      [LABELS.IS_MECHA]: "true",
      [LABELS.MECHA_ID]: opts.mechaId,
      [LABELS.MECHA_PATH]: opts.projectPath,
    },
    ExposedPorts: {
      [`${DEFAULTS.CONTAINER_PORT}/tcp`]: {},
    },
    HostConfig: {
      // Security: read-only root, drop all caps, no privilege escalation
      ReadonlyRootfs: true,
      CapDrop: [...SECURITY.CAP_DROP],
      SecurityOpt: [...SECURITY.SECURITY_OPT],
      // Non-root user
      UsernsMode: "",
      // Port mapping
      PortBindings: {
        [`${DEFAULTS.CONTAINER_PORT}/tcp`]: [
          { HostIp: "127.0.0.1", HostPort: String(opts.hostPort) },
        ],
      },
      // Mounts
      Binds: [
        `${opts.projectPath}:${MOUNT_PATHS.WORKSPACE}`,
        `${opts.volumeName}:${MOUNT_PATHS.STATE}`,
      ],
      // Writable tmpfs
      Tmpfs: {
        [MOUNT_PATHS.TMP]: "rw,noexec,nosuid,size=256m",
        // Claude Code needs writable home for config, sessions, and npm cache
        "/home/mecha": `rw,nosuid,size=256m,uid=${SECURITY.UID},gid=${SECURITY.GID}`,
      },
      // Network
      NetworkMode: DEFAULTS.NETWORK,
    },
    User: `${SECURITY.UID}:${SECURITY.GID}`,
  });
  return container;
}

/** Start a container by name */
export async function startContainer(
  client: DockerClient,
  name: string,
): Promise<void> {
  const container = client.docker.getContainer(name);
  await container.start();
}

/** Stop a container by name */
export async function stopContainer(
  client: DockerClient,
  name: string,
  timeout = DEFAULTS.STOP_TIMEOUT_SECONDS,
): Promise<void> {
  const container = client.docker.getContainer(name);
  await container.stop({ t: timeout });
}

/** Remove a container by name */
export async function removeContainer(
  client: DockerClient,
  name: string,
  force = false,
): Promise<void> {
  const container = client.docker.getContainer(name);
  await container.remove({ force });
}

/** Inspect a container and return its info */
export async function inspectContainer(
  client: DockerClient,
  name: string,
): Promise<Dockerode.ContainerInspectInfo> {
  try {
    const container = client.docker.getContainer(name);
    return await container.inspect();
  } catch (err: unknown) {
    if (isNotFoundError(err)) {
      throw new ContainerNotFoundError(name);
    }
    throw err;
  }
}

/** List all mecha containers */
export async function listMechaContainers(
  client: DockerClient,
): Promise<Dockerode.ContainerInfo[]> {
  return client.docker.listContainers({
    all: true,
    filters: {
      label: [`${LABELS.IS_MECHA}=true`],
    },
  });
}

/** Get container logs */
export async function getContainerLogs(
  client: DockerClient,
  name: string,
  opts: { follow?: boolean; tail?: number; since?: number } = {},
): Promise<NodeJS.ReadableStream> {
  const container = client.docker.getContainer(name);
  if (opts.follow) {
    return container.logs({
      stdout: true,
      stderr: true,
      follow: true,
      tail: opts.tail ?? 100,
      since: opts.since,
    });
  }
  const buf = await container.logs({
    stdout: true,
    stderr: true,
    tail: opts.tail ?? 100,
    since: opts.since,
  });
  const { Readable } = await import("node:stream");
  return Readable.from([buf]);
}

/** Execute a command inside a running container */
export async function execInContainer(
  client: DockerClient,
  name: string,
  cmd: string[],
): Promise<{ exitCode: number; output: string }> {
  const container = client.docker.getContainer(name);
  const exec = await container.exec({
    Cmd: cmd,
    AttachStdout: true,
    AttachStderr: true,
  });
  const stream = await exec.start({ hijack: true, stdin: false });

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (chunk: Buffer) => chunks.push(chunk));
    stream.on("end", async () => {
      try {
        const inspect = await exec.inspect();
        resolve({
          exitCode: inspect.ExitCode ?? 1,
          output: Buffer.concat(chunks).toString("utf-8"),
        });
      } catch (err) {
        reject(err);
      }
    });
    stream.on("error", reject);
  });
}

function isNotFoundError(err: unknown): boolean {
  return (
    err instanceof Error &&
    "statusCode" in err &&
    (err as { statusCode: number }).statusCode === 404
  );
}

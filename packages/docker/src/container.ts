import type Dockerode from "dockerode";
import { Readable, PassThrough } from "node:stream";
import { LABELS, MOUNT_PATHS, SECURITY, DEFAULTS, ContainerNotFoundError } from "@mecha/core";
import type { MechaId } from "@mecha/core";
import type { DockerClient } from "./client.js";
import { isNotFoundError } from "./utils.js";

export interface CreateContainerOptions {
  containerName: string;
  image: string;
  mechaId: MechaId;
  projectPath: string;
  volumeName: string;
  hostPort?: number;
  env?: string[];
}

/** Create a Mecha container with security defaults baked in */
export async function createContainer(
  client: DockerClient,
  opts: CreateContainerOptions,
): Promise<Dockerode.Container> {
  return client.docker.createContainer({
    name: opts.containerName,
    Image: opts.image,
    Env: [
      `MECHA_ID=${opts.mechaId}`,
      ...(opts.env || []),
    ],
    Labels: {
      [LABELS.IS_MECHA]: "true",
      [LABELS.MECHA_ID]: opts.mechaId,
      [LABELS.MECHA_PATH]: opts.projectPath,
    },
    ExposedPorts: { [`${DEFAULTS.CONTAINER_PORT}/tcp`]: {} },
    HostConfig: {
      ReadonlyRootfs: true,
      CapDrop: [...SECURITY.CAP_DROP],
      SecurityOpt: [...SECURITY.SECURITY_OPT],
      UsernsMode: "",
      PortBindings: {
        [`${DEFAULTS.CONTAINER_PORT}/tcp`]: [
          { HostIp: "127.0.0.1", HostPort: opts.hostPort ? String(opts.hostPort) : "" },
        ],
      },
      Binds: [
        `${opts.projectPath}:${MOUNT_PATHS.WORKSPACE}`,
        `${opts.volumeName}:${MOUNT_PATHS.STATE}`,
      ],
      Tmpfs: {
        [MOUNT_PATHS.TMP]: "rw,noexec,nosuid,size=256m",
      },
      NetworkMode: DEFAULTS.NETWORK,
    },
    User: `${SECURITY.UID}:${SECURITY.GID}`,
  });
}

/** Get the host port assigned to a running container (from inspect data) */
export async function getContainerPort(client: DockerClient, name: string): Promise<number | undefined> {
  const info = await inspectContainer(client, name);
  const bindings = info.NetworkSettings?.Ports?.[`${DEFAULTS.CONTAINER_PORT}/tcp`];
  const portStr = bindings?.[0]?.HostPort;
  return portStr ? parseInt(portStr, 10) : undefined;
}

export async function startContainer(client: DockerClient, name: string): Promise<void> {
  await client.docker.getContainer(name).start();
}

export async function stopContainer(client: DockerClient, name: string, timeout = DEFAULTS.STOP_TIMEOUT_SECONDS): Promise<void> {
  await client.docker.getContainer(name).stop({ t: timeout });
}

export async function removeContainer(client: DockerClient, name: string, force = false): Promise<void> {
  await client.docker.getContainer(name).remove({ force });
}

export async function inspectContainer(client: DockerClient, name: string): Promise<Dockerode.ContainerInspectInfo> {
  try {
    return await client.docker.getContainer(name).inspect();
  } catch (err: unknown) {
    if (isNotFoundError(err)) throw new ContainerNotFoundError(name);
    throw err;
  }
}

export async function listMechaContainers(client: DockerClient): Promise<Dockerode.ContainerInfo[]> {
  return client.docker.listContainers({
    all: true,
    filters: { label: [`${LABELS.IS_MECHA}=true`] },
  });
}

export async function getContainerLogs(
  client: DockerClient,
  name: string,
  opts: { follow?: boolean; tail?: number; since?: number } = {},
): Promise<NodeJS.ReadableStream> {
  const container = client.docker.getContainer(name);
  const logOpts = { stdout: true, stderr: true, tail: opts.tail ?? 100, since: opts.since };
  if (opts.follow) return container.logs({ ...logOpts, follow: true });
  return Readable.from([await container.logs(logOpts)]);
}

const MAX_EXEC_OUTPUT = 10 * 1024 * 1024;

export async function execInContainer(
  client: DockerClient,
  name: string,
  cmd: string[],
): Promise<{ exitCode: number; output: string }> {
  const exec = await client.docker.getContainer(name).exec({
    Cmd: cmd, AttachStdout: true, AttachStderr: true,
  });
  const stream = await exec.start({ hijack: true, stdin: false });

  const stdout = new PassThrough();
  const stderr = new PassThrough();
  client.docker.modem.demuxStream(stream, stdout, stderr);

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalSize = 0;
    let truncated = false;

    const onData = (chunk: Buffer) => {
      if (truncated) return;
      totalSize += chunk.length;
      if (totalSize > MAX_EXEC_OUTPUT) { truncated = true; return; }
      chunks.push(chunk);
    };

    stdout.on("data", onData);
    stderr.on("data", onData);
    stream.on("end", async () => {
      try {
        const info = await exec.inspect();
        resolve({
          exitCode: info.ExitCode ?? 1,
          output: Buffer.concat(chunks).toString("utf-8") + (truncated ? "\n[output truncated]" : ""),
        });
      } catch (err) { reject(err); }
    });
    stream.on("error", reject);
  });
}

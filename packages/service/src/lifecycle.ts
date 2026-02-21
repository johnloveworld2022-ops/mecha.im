import { randomBytes } from "node:crypto";
import type { DockerClient } from "@mecha/docker";
import {
  ensureNetwork,
  ensureVolume,
  removeVolume,
  createContainer,
  getContainerPort,
  startContainer,
  stopContainer,
  removeContainer,
  listMechaContainers,
  inspectContainer,
  execInContainer,
  pullImage,
} from "@mecha/docker";
import {
  computeMechaId,
  containerName,
  volumeName,
  networkName,
  DEFAULTS,
  LABELS,
} from "@mecha/core";
import type { MechaId } from "@mecha/core";
import {
  ContainerStartError,
  NoPortBindingError,
} from "@mecha/contracts";
import { MechaUpInput } from "@mecha/contracts";
import type {
  MechaUpInputType,
  MechaUpResultType,
  MechaRmInputType,
  MechaExecInputType,
  MechaPruneResultType,
  MechaUpdateResultType,
} from "@mecha/contracts";
import {
  validateProjectPath,
  extractContainerOpts,
  stopTolerant,
  recreateWithRollback,
} from "./helpers.js";

// --- mechaUp ---
export async function mechaUp(
  client: DockerClient,
  input: MechaUpInputType,
): Promise<MechaUpResultType> {
  MechaUpInput.parse(input);
  await validateProjectPath(input.projectPath);

  const id = computeMechaId(input.projectPath);
  const cName = containerName(id);
  const vName = volumeName(id);

  await ensureNetwork(client, networkName());
  await ensureVolume(client, vName);

  const extraEnv: string[] = [];
  const authToken = randomBytes(32).toString("hex");
  extraEnv.push(`MECHA_AUTH_TOKEN=${authToken}`);

  if (input.claudeToken) extraEnv.push(`CLAUDE_CODE_OAUTH_TOKEN=${input.claudeToken}`);
  if (input.anthropicApiKey) extraEnv.push(`ANTHROPIC_API_KEY=${input.anthropicApiKey}`);
  if (input.otp) extraEnv.push(`MECHA_OTP=${input.otp}`);
  if (input.permissionMode) extraEnv.push(`MECHA_PERMISSION_MODE=${input.permissionMode}`);
  if (input.env) extraEnv.push(...input.env);

  await createContainer(client, {
    containerName: cName,
    image: DEFAULTS.IMAGE,
    mechaId: id,
    projectPath: input.projectPath,
    volumeName: vName,
    hostPort: input.port,
    env: extraEnv,
  });

  try {
    await startContainer(client, cName);
  } catch (err) {
    try { await removeContainer(client, cName, true); } catch { /* best effort */ }
    throw new ContainerStartError(cName,
      /* v8 ignore next */
      err instanceof Error ? err : undefined);
  }

  // Resolve the actual port (may be Docker-assigned)
  const actualPort = input.port ?? await getContainerPort(client, cName);
  if (!actualPort) throw new NoPortBindingError(id);

  return { id, name: cName, port: actualPort, authToken };
}

// --- mechaRm ---
export async function mechaRm(
  client: DockerClient,
  input: MechaRmInputType,
): Promise<void> {
  const cName = containerName(input.id as MechaId);
  await removeContainer(client, cName, input.force);
  if (input.withState) {
    const vName = volumeName(input.id as MechaId);
    await removeVolume(client, vName);
  }
}

// --- mechaStart ---
export async function mechaStart(client: DockerClient, id: string): Promise<void> {
  await startContainer(client, containerName(id as MechaId));
}

// --- mechaStop ---
export async function mechaStop(client: DockerClient, id: string): Promise<void> {
  await stopContainer(client, containerName(id as MechaId));
}

// --- mechaRestart ---
export async function mechaRestart(client: DockerClient, id: string): Promise<void> {
  const cName = containerName(id as MechaId);
  await stopTolerant(client, cName);
  await startContainer(client, cName);
}

// --- mechaExec ---
export async function mechaExec(
  client: DockerClient,
  input: MechaExecInputType,
): Promise<{ exitCode: number; output: string }> {
  return execInContainer(client, containerName(input.id as MechaId), input.cmd);
}

// --- mechaPrune ---
export async function mechaPrune(
  client: DockerClient,
  opts: { volumes?: boolean },
): Promise<MechaPruneResultType> {
  const containers = await listMechaContainers(client);
  const PRUNABLE_STATES = new Set(["exited", "dead", "created"]);
  const stopped = containers.filter((c) => PRUNABLE_STATES.has(c.State));
  const removedContainers: string[] = [];
  const removedVolumes: string[] = [];
  for (const c of stopped) {
    const name = c.Names[0]?.replace(/^\//, "");
    if (!name) continue;
    try {
      await removeContainer(client, name, true);
      removedContainers.push(name);
    } catch { /* best effort */ }
    if (opts.volumes) {
      const id = c.Labels[LABELS.MECHA_ID] ?? "";
      if (id) {
        try {
          const vName = volumeName(id as MechaId);
          await removeVolume(client, vName);
          removedVolumes.push(vName);
        } catch { /* best effort */ }
      }
    }
  }
  return { removedContainers, removedVolumes };
}

// --- mechaUpdate ---
export async function mechaUpdate(
  client: DockerClient,
  input: { id: string; noPull?: boolean },
): Promise<MechaUpdateResultType> {
  const mechaId = input.id as MechaId;
  const cName = containerName(mechaId);
  const info = await inspectContainer(client, cName);
  const originalOpts = extractContainerOpts(info, cName, mechaId);
  const previousImage = originalOpts.image;
  if (!input.noPull) await pullImage(client, DEFAULTS.IMAGE);
  const newOpts = { ...originalOpts, image: DEFAULTS.IMAGE };
  await stopTolerant(client, cName);
  await recreateWithRollback(client, cName, newOpts, originalOpts);
  return { id: input.id, image: DEFAULTS.IMAGE, previousImage };
}

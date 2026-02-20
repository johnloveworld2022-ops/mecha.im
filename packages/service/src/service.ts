import { randomBytes } from "node:crypto";
import { stat, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
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
  inspectContainer,
  listMechaContainers,
  getContainerLogs,
  execInContainer,
  ping,
} from "@mecha/docker";
import {
  computeMechaId,
  containerName,
  volumeName,
  networkName,
  DEFAULTS,
  LABELS,
  MOUNT_PATHS,
  ContainerNotFoundError,
} from "@mecha/core";
import type { MechaId } from "@mecha/core";
import {
  PathNotFoundError,
  PathNotDirectoryError,
  InvalidPortError,
  InvalidPermissionModeError,
  ContainerStartError,
  NoPortBindingError,
  ConfigureNoFieldsError,
} from "@mecha/contracts";
import type {
  MechaUpInputType,
  MechaUpResultType,
  MechaRmInputType,
  MechaLogsInputType,
  MechaExecInputType,
  MechaConfigureInputType,
  MechaLsItemType,
  MechaStatusResultType,
  DoctorResultType,
  UiUrlResultType,
  McpEndpointResultType,
} from "@mecha/contracts";
import { PERMISSION_MODES } from "@mecha/contracts";

// --- Helper: validate path exists and is a directory ---
async function validateProjectPath(projectPath: string): Promise<void> {
  let st;
  try {
    st = await stat(projectPath);
  } catch {
    throw new PathNotFoundError(projectPath);
  }
  if (!st.isDirectory()) throw new PathNotDirectoryError(projectPath);
}

// --- Helper: validate port range ---
function validatePort(port: number | undefined): void {
  if (port !== undefined && (!Number.isInteger(port) || port < 1024 || port > 65535)) {
    throw new InvalidPortError(port);
  }
}

// --- Helper: validate permission mode ---
function validatePermissionMode(mode: string | undefined): void {
  if (mode !== undefined && !(PERMISSION_MODES as readonly string[]).includes(mode)) {
    throw new InvalidPermissionModeError(mode);
  }
}

// --- 1. mechaUp ---
export async function mechaUp(
  client: DockerClient,
  input: MechaUpInputType,
): Promise<MechaUpResultType> {
  await validateProjectPath(input.projectPath);
  validatePort(input.port);
  validatePermissionMode(input.permissionMode);

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
    throw new ContainerStartError(cName, err instanceof Error ? err : undefined);
  }

  // Resolve the actual port (may be Docker-assigned)
  const actualPort = input.port ?? await getContainerPort(client, cName) ?? 0;

  return { id, name: cName, port: actualPort, authToken };
}

// --- 2. mechaRm ---
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

// --- 3. mechaStart ---
export async function mechaStart(client: DockerClient, id: string): Promise<void> {
  await startContainer(client, containerName(id as MechaId));
}

// --- 4. mechaStop ---
export async function mechaStop(client: DockerClient, id: string): Promise<void> {
  await stopContainer(client, containerName(id as MechaId));
}

// --- 5. mechaRestart ---
export async function mechaRestart(client: DockerClient, id: string): Promise<void> {
  const cName = containerName(id as MechaId);
  try {
    await stopContainer(client, cName);
  } catch (err) {
    // Tolerate already-stopped containers (409 Conflict)
    if (err instanceof Error && "statusCode" in err && (err as { statusCode: number }).statusCode === 409) {
      // already stopped, continue
    } else {
      throw err;
    }
  }
  await startContainer(client, cName);
}

// --- 6. mechaLs ---
export async function mechaLs(client: DockerClient): Promise<MechaLsItemType[]> {
  const containers = await listMechaContainers(client);
  return containers.map((c) => ({
    id: c.Labels[LABELS.MECHA_ID] ?? "",
    name: c.Names[0]?.replace(/^\//, "") ?? "",
    state: c.State,
    status: c.Status,
    path: c.Labels[LABELS.MECHA_PATH] ?? "",
    port: c.Ports?.find((p) => p.PrivatePort === DEFAULTS.CONTAINER_PORT)?.PublicPort,
    created: c.Created,
  }));
}

// --- 7. mechaStatus ---
export async function mechaStatus(client: DockerClient, id: string): Promise<MechaStatusResultType> {
  const cName = containerName(id as MechaId);
  const info = await inspectContainer(client, cName);
  const portBindings = info.NetworkSettings?.Ports?.[`${DEFAULTS.CONTAINER_PORT}/tcp`];
  const portStr = portBindings?.[0]?.HostPort;
  return {
    id,
    name: info.Name.replace(/^\//, ""),
    state: info.State?.Status ?? "unknown",
    running: info.State?.Running ?? false,
    port: portStr ? parseInt(portStr, 10) : undefined,
    path: info.Config?.Labels?.[LABELS.MECHA_PATH] ?? "",
    image: info.Config?.Image ?? "",
    startedAt: info.State?.StartedAt,
    finishedAt: info.State?.FinishedAt,
  };
}

// --- 8. mechaLogs ---
export async function mechaLogs(
  client: DockerClient,
  input: MechaLogsInputType,
): Promise<NodeJS.ReadableStream> {
  const cName = containerName(input.id as MechaId);
  return getContainerLogs(client, cName, {
    follow: input.follow,
    tail: input.tail,
    since: input.since,
  });
}

// --- 9. mechaExec ---
export async function mechaExec(
  client: DockerClient,
  input: MechaExecInputType,
): Promise<{ exitCode: number; output: string }> {
  return execInContainer(client, containerName(input.id as MechaId), input.cmd);
}

// --- 10. mechaConfigure ---
export async function mechaConfigure(
  client: DockerClient,
  input: MechaConfigureInputType,
): Promise<void> {
  const hasUpdate = input.claudeToken !== undefined ||
    input.anthropicApiKey !== undefined ||
    input.otp !== undefined ||
    input.permissionMode !== undefined;
  if (!hasUpdate) throw new ConfigureNoFieldsError();

  validatePermissionMode(input.permissionMode);

  const cName = containerName(input.id as MechaId);
  const info = await inspectContainer(client, cName);

  // Extract current config for rollback
  const projectPath = info.Config?.Labels?.[LABELS.MECHA_PATH] ?? "";
  const portBindings = info.NetworkSettings?.Ports?.[`${DEFAULTS.CONTAINER_PORT}/tcp`];
  const hostPort = Number(portBindings?.[0]?.HostPort ?? 0) || undefined;
  const volumeBind = info.Mounts?.find((m) => m.Destination === MOUNT_PATHS.STATE);
  const vName = volumeBind?.Name ?? "";

  // Parse existing env vars
  const envMap = new Map<string, string>();
  for (const entry of info.Config?.Env ?? []) {
    const eqIdx = entry.indexOf("=");
    if (eqIdx > 0) envMap.set(entry.slice(0, eqIdx), entry.slice(eqIdx + 1));
  }

  // Update fields
  if (input.claudeToken !== undefined) {
    if (input.claudeToken) envMap.set("CLAUDE_CODE_OAUTH_TOKEN", input.claudeToken);
    else envMap.delete("CLAUDE_CODE_OAUTH_TOKEN");
  }
  if (input.anthropicApiKey !== undefined) {
    if (input.anthropicApiKey) envMap.set("ANTHROPIC_API_KEY", input.anthropicApiKey);
    else envMap.delete("ANTHROPIC_API_KEY");
  }
  if (input.otp !== undefined) {
    if (input.otp) envMap.set("MECHA_OTP", input.otp);
    else envMap.delete("MECHA_OTP");
  }
  if (input.permissionMode !== undefined) {
    if (input.permissionMode) envMap.set("MECHA_PERMISSION_MODE", input.permissionMode);
    else envMap.delete("MECHA_PERMISSION_MODE");
  }

  const newEnv = Array.from(envMap.entries())
    .filter(([k]) => k !== "MECHA_ID")
    .map(([k, v]) => `${k}=${v}`);

  const originalEnv = (info.Config?.Env ?? []).filter((e: string) => !e.startsWith("MECHA_ID="));
  const originalOpts = {
    containerName: cName,
    image: info.Config?.Image ?? DEFAULTS.IMAGE,
    mechaId: input.id as MechaId,
    projectPath,
    volumeName: vName,
    hostPort,
    env: originalEnv,
  };

  // Stop (tolerate already-stopped)
  try {
    await stopContainer(client, cName);
  } catch (err) {
    if (err instanceof Error && "statusCode" in err && (err as { statusCode: number }).statusCode === 409) {
      // already stopped
    } else if (err instanceof ContainerNotFoundError) {
      throw err;
    } else {
      throw err;
    }
  }

  // Remove → Create → Start with rollback
  try {
    await removeContainer(client, cName, true);
    await createContainer(client, {
      containerName: cName,
      image: DEFAULTS.IMAGE,
      mechaId: input.id as MechaId,
      projectPath,
      volumeName: vName,
      hostPort,
      env: newEnv,
    });
    try {
      await startContainer(client, cName);
    } catch (startErr) {
      try { await removeContainer(client, cName, true); } catch { /* best effort */ }
      await createContainer(client, originalOpts);
      await startContainer(client, cName);
      throw new ContainerStartError(cName, startErr instanceof Error ? startErr : undefined);
    }
  } catch (err) {
    if (!(err instanceof ContainerStartError)) {
      try {
        await createContainer(client, originalOpts);
        await startContainer(client, cName);
      } catch { /* rollback also failed */ }
    }
    throw err;
  }
}

// --- 11. mechaDoctor ---
export async function mechaDoctor(client: DockerClient): Promise<DoctorResultType> {
  const issues: string[] = [];
  let dockerAvailable = false;
  let networkExists = false;

  try {
    await ping(client);
    dockerAvailable = true;
  } catch {
    issues.push("Docker is not available. Is Docker/Colima running?");
  }

  if (dockerAvailable) {
    try {
      const net = networkName();
      const networks = await client.docker.listNetworks({ filters: { name: [net] } });
      networkExists = networks.some((n: { Name: string }) => n.Name === net);
      if (!networkExists) {
        issues.push(`Network '${net}' not found. Run 'mecha init' first.`);
      }
    } catch {
      issues.push("Failed to check network status.");
    }
  }

  return { dockerAvailable, networkExists, issues };
}

// --- 12. mechaInit ---
export async function mechaInit(client: DockerClient): Promise<void> {
  const net = networkName();
  await ensureNetwork(client, net);

  const mechaHome = join(homedir(), DEFAULTS.HOME_DIR);
  await mkdir(mechaHome, { recursive: true });
}

// --- 13. resolveUiUrl ---
export async function resolveUiUrl(client: DockerClient, id: string): Promise<UiUrlResultType> {
  const port = await getContainerPort(client, containerName(id as MechaId));
  if (!port) throw new NoPortBindingError(id);
  return { url: `http://127.0.0.1:${port}` };
}

// --- 14. resolveMcpEndpoint ---
export async function resolveMcpEndpoint(client: DockerClient, id: string): Promise<McpEndpointResultType> {
  const port = await getContainerPort(client, containerName(id as MechaId));
  if (!port) throw new NoPortBindingError(id);
  return {
    endpoint: `http://127.0.0.1:${port}/mcp`,
    note: "check container logs for auth token",
  };
}

// --- 15. loadDotEnvFiles (re-exported from env.ts) ---
export { loadDotEnvFiles } from "./env.js";

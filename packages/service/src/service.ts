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
  getContainerPortAndEnv,
  startContainer,
  stopContainer,
  removeContainer,
  inspectContainer,
  listMechaContainers,
  getContainerLogs,
  execInContainer,
  ping,
  pullImage,
} from "@mecha/docker";
import {
  computeMechaId,
  containerName,
  volumeName,
  networkName,
  DEFAULTS,
  LABELS,
  MOUNT_PATHS,
} from "@mecha/core";
import type { MechaId } from "@mecha/core";
import {
  PathNotFoundError,
  PathNotDirectoryError,
  InvalidPermissionModeError,
  ContainerStartError,
  NoPortBindingError,
  ConfigureNoFieldsError,
  TokenNotFoundError,
  ChatRequestFailedError,
  SessionNotFoundError,
  SessionBusyError,
  SessionCapReachedError,
} from "@mecha/contracts";
import { MechaUpInput } from "@mecha/contracts";
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
  MechaTokenResultType,
  MechaEnvResultType,
  MechaPruneResultType,
  MechaUpdateResultType,
  MechaChatInputType,
  SessionCreateInputType,
  SessionListInputType,
  SessionGetInputType,
  SessionDeleteInputType,
  SessionMessageInputType,
  SessionInterruptInputType,
  SessionConfigUpdateInputType,
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

// --- Helper: validate permission mode ---
function validatePermissionMode(mode: string | undefined): void {
  if (mode !== undefined && !(PERMISSION_MODES as readonly string[]).includes(mode)) {
    throw new InvalidPermissionModeError(mode);
  }
}

// --- Helpers ---

/** Update or delete env vars in a map based on input fields. */
type EnvFieldMap = Record<string, { envKey: string; value: string | undefined }>;
function applyEnvUpdates(envMap: Map<string, string>, fields: EnvFieldMap): void {
  for (const { envKey, value } of Object.values(fields)) {
    if (value === undefined) continue;
    if (value) envMap.set(envKey, value);
    else envMap.delete(envKey);
  }
}

/** Extract container options from inspect info for rollback purposes. */
function extractContainerOpts(
  info: Record<string, any>,
  cName: string,
  mechaId: MechaId,
): { containerName: string; image: string; mechaId: MechaId; projectPath: string; volumeName: string; hostPort: number | undefined; env: string[] } {
  const projectPath = info.Config?.Labels?.[LABELS.MECHA_PATH] ?? "";
  const portBindings = info.NetworkSettings?.Ports?.[`${DEFAULTS.CONTAINER_PORT}/tcp`];
  const hostPort = Number(portBindings?.[0]?.HostPort ?? 0) || undefined;
  const volumeBind = info.Mounts?.find((m: { Destination: string }) => m.Destination === MOUNT_PATHS.STATE);
  const vName = volumeBind?.Name ?? "";
  const env = (info.Config?.Env ?? []).filter((e: string) => !e.startsWith("MECHA_ID="));
  return {
    containerName: cName,
    /* v8 ignore next */
    image: info.Config?.Image ?? DEFAULTS.IMAGE,
    mechaId, projectPath, volumeName: vName, hostPort, env,
  };
}

/** Stop a container, tolerating already-stopped (409) state. */
async function stopTolerant(client: DockerClient, cName: string): Promise<void> {
  try {
    await stopContainer(client, cName);
  } catch (err) {
    if (err instanceof Error && "statusCode" in err && (err as { statusCode: number }).statusCode === 409) {
      return; // already stopped
    }
    throw err;
  }
}

/** Recreate a container with rollback: remove → create → start. On failure, restore original config. */
async function recreateWithRollback(
  client: DockerClient,
  cName: string,
  newOpts: Parameters<typeof createContainer>[1],
  originalOpts: Parameters<typeof createContainer>[1],
): Promise<void> {
  try {
    await removeContainer(client, cName, true);
    await createContainer(client, newOpts);
    try {
      await startContainer(client, cName);
    } catch (startErr) {
      try { await removeContainer(client, cName, true); } catch { /* best effort */ }
      await createContainer(client, originalOpts);
      await startContainer(client, cName);
      throw new ContainerStartError(cName,
        /* v8 ignore next */
        startErr instanceof Error ? startErr : undefined);
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

// --- 1. mechaUp ---
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

  const mechaId = input.id as MechaId;
  const cName = containerName(mechaId);
  const info = await inspectContainer(client, cName);
  const originalOpts = extractContainerOpts(info, cName, mechaId);

  // Build updated env
  const envMap = new Map<string, string>();
  for (const entry of info.Config?.Env ?? []) {
    const eqIdx = entry.indexOf("=");
    if (eqIdx > 0) envMap.set(entry.slice(0, eqIdx), entry.slice(eqIdx + 1));
  }

  applyEnvUpdates(envMap, {
    claudeToken: { envKey: "CLAUDE_CODE_OAUTH_TOKEN", value: input.claudeToken },
    anthropicApiKey: { envKey: "ANTHROPIC_API_KEY", value: input.anthropicApiKey },
    otp: { envKey: "MECHA_OTP", value: input.otp },
    permissionMode: { envKey: "MECHA_PERMISSION_MODE", value: input.permissionMode },
  });

  const newEnv = Array.from(envMap.entries())
    .filter(([k]) => k !== "MECHA_ID")
    .map(([k, v]) => `${k}=${v}`);

  const newOpts = { ...originalOpts, env: newEnv };

  await stopTolerant(client, cName);
  await recreateWithRollback(client, cName, newOpts, originalOpts);
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
  const cName = containerName(id as MechaId);
  const { port, env } = await getContainerPortAndEnv(client, cName);
  if (!port) throw new NoPortBindingError(id);
  const tokenEntry = env.find((e) => e.startsWith("MECHA_AUTH_TOKEN="));
  const token = tokenEntry ? tokenEntry.split("=").slice(1).join("=") : undefined;
  return { endpoint: `http://127.0.0.1:${port}/mcp`, token };
}

// --- 15. mechaToken ---
export async function mechaToken(
  client: DockerClient,
  id: string,
): Promise<MechaTokenResultType> {
  const { env } = await getContainerPortAndEnv(client, containerName(id as MechaId));
  const entry = env.find((e) => e.startsWith("MECHA_AUTH_TOKEN="));
  if (!entry) throw new TokenNotFoundError(id);
  return { id, token: entry.split("=").slice(1).join("=") };
}

// --- 16. mechaInspect ---
export async function mechaInspect(
  client: DockerClient,
  id: string,
): Promise<Record<string, unknown>> {
  return inspectContainer(client, containerName(id as MechaId)) as unknown as Record<string, unknown>;
}

// --- 17. mechaEnv ---
export async function mechaEnv(
  client: DockerClient,
  id: string,
): Promise<MechaEnvResultType> {
  const info = await inspectContainer(client, containerName(id as MechaId));
  const env = (info.Config?.Env ?? []).map((e: string) => {
    const eq = e.indexOf("=");
    return eq > 0 ? { key: e.slice(0, eq), value: e.slice(eq + 1) } : { key: e, value: "" };
  });
  return { id, env };
}

// --- 18. mechaPrune ---
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

// --- 19. mechaUpdate ---
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

// --- 20. mechaChat ---
// Uses getRuntimeAccess directly (not runtimeFetch) because chat errors
// throw ChatRequestFailedError, not the session-specific mapSessionError.
export async function mechaChat(
  client: DockerClient,
  input: MechaChatInputType,
): Promise<Response> {
  const { url, token } = await getRuntimeAccess(client, input.id);
  const res = await fetch(`${url}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ message: input.message }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new ChatRequestFailedError(input.id, res.status, res.statusText);
  return res;
}

// --- 21. loadDotEnvFiles (re-exported from env.ts) ---
export { loadDotEnvFiles } from "./env.js";

// --- Helper: get runtime URL and auth token ---
async function getRuntimeAccess(client: DockerClient, mechaId: string): Promise<{ url: string; token: string }> {
  const cName = containerName(mechaId as MechaId);
  const { port, env } = await getContainerPortAndEnv(client, cName);
  if (!port) throw new NoPortBindingError(mechaId);
  const tokenEntry = env.find((e) => e.startsWith("MECHA_AUTH_TOKEN="));
  if (!tokenEntry) throw new TokenNotFoundError(mechaId);
  const token = tokenEntry.split("=").slice(1).join("=");
  return { url: `http://127.0.0.1:${port}`, token };
}

/** Map runtime session error status codes to domain errors */
function mapSessionError(status: number, body: string, sessionId?: string): Error {
  if (status === 404) return new SessionNotFoundError(sessionId ?? "unknown");
  if (status === 409) return new SessionBusyError(sessionId ?? "unknown");
  if (status === 429) return new SessionCapReachedError();
  if (status === 400) return new Error(`Bad request: ${body}`);
  if (status === 503) return new Error(`Service unavailable: ${body}`);
  return new Error(`Session request failed: ${status} ${body}`);
}

/** Fetch from a mecha's runtime API with auth, error mapping, and default timeout.
 *  Pass `signal: undefined` explicitly to disable the default 30s timeout (for streaming). */
async function runtimeFetch(
  client: DockerClient,
  mechaId: string,
  path: string,
  init?: RequestInit & { sessionId?: string },
): Promise<Response> {
  const { url, token } = await getRuntimeAccess(client, mechaId);
  const { sessionId, ...fetchInit } = init ?? {};
  // Only apply default timeout if caller did not explicitly provide a signal key
  const hasExplicitSignal = init !== undefined && "signal" in init;
  // Use Headers API to guarantee auth cannot be overridden (case-insensitive dedup)
  const headers = new Headers(fetchInit.headers as Record<string, string>);
  headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(`${url}${path}`, {
    ...fetchInit,
    headers,
    signal: hasExplicitSignal ? fetchInit.signal : AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw mapSessionError(res.status, await res.text(), sessionId);
  return res;
}

// --- 22. mechaSessionCreate ---
export async function mechaSessionCreate(
  client: DockerClient,
  input: SessionCreateInputType,
): Promise<unknown> {
  const res = await runtimeFetch(client, input.id, "/api/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: input.title, config: input.config }),
  });
  return res.json();
}

// --- 23. mechaSessionList ---
export async function mechaSessionList(
  client: DockerClient,
  input: SessionListInputType,
): Promise<unknown> {
  const res = await runtimeFetch(client, input.id, "/api/sessions");
  return res.json();
}

// --- 24. mechaSessionGet ---
export async function mechaSessionGet(
  client: DockerClient,
  input: SessionGetInputType,
): Promise<unknown> {
  const sid = encodeURIComponent(input.sessionId);
  const res = await runtimeFetch(client, input.id, `/api/sessions/${sid}`, { sessionId: input.sessionId });
  return res.json();
}

// --- 25. mechaSessionDelete ---
export async function mechaSessionDelete(
  client: DockerClient,
  input: SessionDeleteInputType,
): Promise<void> {
  const sid = encodeURIComponent(input.sessionId);
  await runtimeFetch(client, input.id, `/api/sessions/${sid}`, { method: "DELETE", sessionId: input.sessionId });
}

// --- 26. mechaSessionMessage ---
export async function mechaSessionMessage(
  client: DockerClient,
  input: SessionMessageInputType,
  signal?: AbortSignal,
): Promise<Response> {
  const sid = encodeURIComponent(input.sessionId);
  return runtimeFetch(client, input.id, `/api/sessions/${sid}/message`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: input.message }),
    signal,
    sessionId: input.sessionId,
  });
}

// --- 27. mechaSessionInterrupt ---
export async function mechaSessionInterrupt(
  client: DockerClient,
  input: SessionInterruptInputType,
): Promise<{ interrupted: boolean }> {
  const sid = encodeURIComponent(input.sessionId);
  const res = await runtimeFetch(client, input.id, `/api/sessions/${sid}/interrupt`, {
    method: "POST",
    sessionId: input.sessionId,
  });
  return res.json() as Promise<{ interrupted: boolean }>;
}

// --- 28. mechaSessionConfigUpdate ---
export async function mechaSessionConfigUpdate(
  client: DockerClient,
  input: SessionConfigUpdateInputType,
): Promise<unknown> {
  const sid = encodeURIComponent(input.sessionId);
  const res = await runtimeFetch(client, input.id, `/api/sessions/${sid}/config`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input.config),
    sessionId: input.sessionId,
  });
  return res.json();
}

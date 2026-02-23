import { stat } from "node:fs/promises";
import type { DockerClient } from "@mecha/docker";
import {
  createContainer,
  getContainerPortAndEnv,
  startContainer,
  stopContainer,
  removeContainer,
  inspectContainer,
} from "@mecha/docker";
import {
  containerName,
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
  TokenNotFoundError,
  SessionNotFoundError,
  SessionBusyError,
  SessionCapReachedError,
} from "@mecha/contracts";
import { PERMISSION_MODES } from "@mecha/contracts";

/** Validate path exists and is a directory. */
export async function validateProjectPath(projectPath: string): Promise<void> {
  let st;
  try {
    st = await stat(projectPath);
  } catch {
    throw new PathNotFoundError(projectPath);
  }
  if (!st.isDirectory()) throw new PathNotDirectoryError(projectPath);
}

/** Validate permission mode. */
export function validatePermissionMode(mode: string | undefined): void {
  if (mode !== undefined && !(PERMISSION_MODES as readonly string[]).includes(mode)) {
    throw new InvalidPermissionModeError(mode);
  }
}

/** Extract a value from Docker env array (KEY=value format). */
export function readEnvValue(env: string[], key: string): string | undefined {
  const entry = env.find((e) => e.startsWith(`${key}=`));
  return entry ? entry.split("=").slice(1).join("=") : undefined;
}

/** Update or delete env vars in a map based on input fields. */
export type EnvFieldMap = Record<string, { envKey: string; value: string | undefined }>;
export function applyEnvUpdates(envMap: Map<string, string>, fields: EnvFieldMap): void {
  for (const { envKey, value } of Object.values(fields)) {
    if (value === undefined) continue;
    if (value) envMap.set(envKey, value);
    else envMap.delete(envKey);
  }
}

/** Extract container options from inspect info for rollback purposes. */
export function extractContainerOpts(
  info: Awaited<ReturnType<typeof inspectContainer>>,
  cName: string,
  mechaId: MechaId,
): { containerName: string; image: string; mechaId: MechaId; projectPath: string; volumeName: string; hostPort: number | undefined; env: string[] } {
  const projectPath = info.Config?.Labels?.[LABELS.MECHA_PATH] ?? "";
  const portBindings = info.NetworkSettings?.Ports?.[`${DEFAULTS.CONTAINER_PORT}/tcp`];
  const hostPort = Number(portBindings?.[0]?.HostPort ?? 0) || undefined;
  const volumeBind = (info.Mounts as Array<{ Destination: string; Name: string }> | undefined)?.find(
    (m) => m.Destination === MOUNT_PATHS.STATE,
  );
  const vName = volumeBind?.Name ?? "";
  const env = ((info.Config?.Env ?? []) as string[]).filter((e) => !e.startsWith("MECHA_ID="));
  return {
    containerName: cName,
    /* v8 ignore next */
    image: info.Config?.Image ?? DEFAULTS.IMAGE,
    mechaId, projectPath, volumeName: vName, hostPort, env,
  };
}

/** Stop a container, tolerating already-stopped (409) state. */
export async function stopTolerant(client: DockerClient, cName: string): Promise<void> {
  try {
    await stopContainer(client, cName);
  } catch (err) {
    if (err instanceof Error && "statusCode" in err && (err as { statusCode: number }).statusCode === 409) {
      return; // already stopped
    }
    throw err;
  }
}

/** Recreate a container with rollback: remove -> create -> start. On failure, restore original config. */
export async function recreateWithRollback(
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

/** Get runtime URL and auth token for a mecha. */
export async function getRuntimeAccess(client: DockerClient, mechaId: string): Promise<{ url: string; token: string }> {
  const cName = containerName(mechaId as MechaId);
  const { port, env } = await getContainerPortAndEnv(client, cName);
  if (!port) throw new NoPortBindingError(mechaId);
  const token = readEnvValue(env, "MECHA_AUTH_TOKEN");
  if (!token) throw new TokenNotFoundError(mechaId);
  return { url: `http://127.0.0.1:${port}`, token };
}

/** Map runtime session error status codes to domain errors. */
export function mapSessionError(status: number, body: string, sessionId?: string): Error {
  if (status === 404) return new SessionNotFoundError(sessionId ?? "unknown");
  if (status === 409) return new SessionBusyError(sessionId ?? "unknown");
  if (status === 429) return new SessionCapReachedError();
  if (status === 400) return new Error(`Bad request: ${body}`);
  if (status === 503) return new Error(`Service unavailable: ${body}`);
  return new Error(`Session request failed: ${status} ${body}`);
}

/** Fetch from a mecha's runtime API with auth, error mapping, and default timeout.
 *  Pass `signal: undefined` explicitly to disable the default 30s timeout (for streaming). */
export async function runtimeFetch(
  client: DockerClient,
  mechaId: string,
  path: string,
  init: RequestInit & { sessionId?: string } = {},
): Promise<Response> {
  const { url, token } = await getRuntimeAccess(client, mechaId);
  const { sessionId, ...fetchInit } = init;
  // Only apply default timeout if caller did not explicitly provide a signal key
  const hasExplicitSignal = "signal" in init;
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

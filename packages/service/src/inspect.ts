import type { DockerClient } from "@mecha/docker";
import {
  getContainerPort,
  getContainerPortAndEnv,
  inspectContainer,
  listMechaContainers,
  getContainerLogs,
} from "@mecha/docker";
import {
  containerName,
  DEFAULTS,
  LABELS,
} from "@mecha/core";
import type { MechaId } from "@mecha/core";
import {
  NoPortBindingError,
  TokenNotFoundError,
} from "@mecha/contracts";
import type {
  MechaLogsInputType,
  MechaLsItemType,
  MechaStatusResultType,
  UiUrlResultType,
  McpEndpointResultType,
  MechaTokenResultType,
  MechaEnvResultType,
} from "@mecha/contracts";
import { readEnvValue } from "./helpers.js";

// --- mechaLs ---
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

// --- mechaStatus ---
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

// --- mechaLogs ---
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

// --- mechaInspect ---
export async function mechaInspect(
  client: DockerClient,
  id: string,
): Promise<Record<string, unknown>> {
  const info = await inspectContainer(client, containerName(id as MechaId));
  return JSON.parse(JSON.stringify(info)) as Record<string, unknown>;
}

// --- mechaEnv ---
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

// --- mechaToken ---
export async function mechaToken(
  client: DockerClient,
  id: string,
): Promise<MechaTokenResultType> {
  const { env } = await getContainerPortAndEnv(client, containerName(id as MechaId));
  const token = readEnvValue(env, "MECHA_AUTH_TOKEN");
  if (!token) throw new TokenNotFoundError(id);
  return { id, token };
}

// --- resolveUiUrl ---
export async function resolveUiUrl(client: DockerClient, id: string): Promise<UiUrlResultType> {
  const port = await getContainerPort(client, containerName(id as MechaId));
  if (!port) throw new NoPortBindingError(id);
  return { url: `http://127.0.0.1:${port}` };
}

// --- resolveMcpEndpoint ---
export async function resolveMcpEndpoint(client: DockerClient, id: string): Promise<McpEndpointResultType> {
  const cName = containerName(id as MechaId);
  const { port, env } = await getContainerPortAndEnv(client, cName);
  if (!port) throw new NoPortBindingError(id);
  const token = readEnvValue(env, "MECHA_AUTH_TOKEN");
  return { endpoint: `http://127.0.0.1:${port}/mcp`, token };
}

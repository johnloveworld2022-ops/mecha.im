import type { DockerClient } from "@mecha/docker";
import type {
  SessionCreateInputType,
  SessionListInputType,
  SessionGetInputType,
  SessionDeleteInputType,
  SessionMessageInputType,
  SessionInterruptInputType,
  SessionConfigUpdateInputType,
} from "@mecha/contracts";
import { runtimeFetch } from "./helpers.js";

// --- mechaSessionCreate ---
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

// --- mechaSessionList ---
export async function mechaSessionList(
  client: DockerClient,
  input: SessionListInputType,
): Promise<unknown> {
  const res = await runtimeFetch(client, input.id, "/api/sessions");
  return res.json();
}

// --- mechaSessionGet ---
export async function mechaSessionGet(
  client: DockerClient,
  input: SessionGetInputType,
): Promise<unknown> {
  const sid = encodeURIComponent(input.sessionId);
  const res = await runtimeFetch(client, input.id, `/api/sessions/${sid}`, { sessionId: input.sessionId });
  return res.json();
}

// --- mechaSessionDelete ---
export async function mechaSessionDelete(
  client: DockerClient,
  input: SessionDeleteInputType,
): Promise<void> {
  const sid = encodeURIComponent(input.sessionId);
  await runtimeFetch(client, input.id, `/api/sessions/${sid}`, { method: "DELETE", sessionId: input.sessionId });
}

// --- mechaSessionMessage ---
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

// --- mechaSessionInterrupt ---
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

// --- mechaSessionConfigUpdate ---
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

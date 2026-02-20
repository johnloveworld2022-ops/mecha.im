import { randomBytes } from "node:crypto";
import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";

// Simple mutex to serialize container creation and prevent port races
let creationLock: Promise<void> = Promise.resolve();
function withCreationLock<T>(fn: () => Promise<T>): Promise<T> {
  const prev = creationLock;
  let resolve: () => void;
  creationLock = new Promise<void>((r) => { resolve = r; });
  return prev.then(fn).finally(() => resolve!());
}
import { NextResponse, type NextRequest } from "next/server";
import { listMechaContainers, createContainer, startContainer, ensureNetwork, ensureVolume } from "@mecha/docker";
import { computeMechaId, containerName, volumeName, networkName, DEFAULTS, LABELS } from "@mecha/core";
import { getDockerClient } from "@/lib/docker";
import { withAuth } from "@/lib/api-auth";
import { getOtpSecret } from "@/lib/auth";

/** Allowed env var key pattern (alphanumeric + underscore, no secrets) */
const ALLOWED_ENV_KEY = /^[A-Z][A-Z0-9_]*$/;
const BLOCKED_ENV_KEYS = new Set([
  "PATH", "HOME", "USER", "SHELL", "LD_PRELOAD", "LD_LIBRARY_PATH",
]);

function validateEnv(env: unknown): string[] | null {
  if (!env) return [];
  if (!Array.isArray(env)) return null;
  for (const entry of env) {
    if (typeof entry !== "string") return null;
    const eqIdx = entry.indexOf("=");
    if (eqIdx <= 0) return null;
    const key = entry.slice(0, eqIdx);
    if (!ALLOWED_ENV_KEY.test(key) || BLOCKED_ENV_KEYS.has(key)) return null;
  }
  return env as string[];
}

export const GET = withAuth(async () => {
  const client = getDockerClient();
  const containers = await listMechaContainers(client);

  const mechas = containers.map((c) => ({
    id: c.Labels[LABELS.MECHA_ID] ?? "",
    name: c.Names[0]?.replace(/^\//, "") ?? "",
    state: c.State,
    status: c.Status,
    path: c.Labels[LABELS.MECHA_PATH] ?? "",
    ports: c.Ports,
    created: c.Created,
  }));

  return NextResponse.json(mechas);
});

export const POST = withAuth(async (request: NextRequest) => {
  let body: { path?: string; env?: unknown };
  try {
    body = await request.json() as { path?: string; env?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const projectPath = body.path;
  if (!projectPath || typeof projectPath !== "string") {
    return NextResponse.json({ error: "Missing path" }, { status: 400 });
  }

  // Validate path exists and is a directory
  const resolved = resolve(projectPath);
  if (!existsSync(resolved) || !statSync(resolved).isDirectory()) {
    return NextResponse.json({ error: "Path does not exist or is not a directory" }, { status: 400 });
  }

  // Validate env vars
  const env = validateEnv(body.env);
  if (env === null) {
    return NextResponse.json({ error: "Invalid env format" }, { status: 400 });
  }

  // Serialize container creation to prevent port allocation races
  return withCreationLock(async () => {
    const client = getDockerClient();
    const id = computeMechaId(resolved);
    const cName = containerName(id);
    const vName = volumeName(id);

    await ensureNetwork(client, networkName());
    await ensureVolume(client, vName);

    // Find an available port
    const containers = await listMechaContainers(client);
    const usedPorts = new Set<number>();
    for (const c of containers) {
      for (const p of c.Ports) {
        if (p.PublicPort) usedPorts.add(p.PublicPort);
      }
    }
    let hostPort = DEFAULTS.PORT_BASE;
    while (usedPorts.has(hostPort) && hostPort <= DEFAULTS.PORT_MAX) {
      hostPort++;
    }
    if (hostPort > DEFAULTS.PORT_MAX) {
      return NextResponse.json({ error: "No available ports" }, { status: 503 });
    }

    // Inject auth env vars (same as CLI `up` command)
    const authToken = randomBytes(32).toString("hex");
    const containerEnv = [
      `MECHA_AUTH_TOKEN=${authToken}`,
      ...env,
    ];
    const otpSecret = getOtpSecret();
    if (otpSecret) {
      containerEnv.push(`MECHA_OTP=${otpSecret}`);
    }

    await createContainer(client, {
      containerName: cName,
      image: DEFAULTS.IMAGE,
      mechaId: id,
      projectPath: resolved,
      volumeName: vName,
      hostPort,
      env: containerEnv,
    });

    await startContainer(client, cName);

    return NextResponse.json({ id, name: cName, port: hostPort }, { status: 201 });
  });
});

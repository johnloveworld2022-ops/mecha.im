import { randomBytes } from "node:crypto";
import { access, stat } from "node:fs/promises";
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
import { listMechaContainers, createContainer, startContainer, removeContainer, ensureNetwork, ensureVolume } from "@mecha/docker";
import { computeMechaId, containerName, volumeName, networkName, DEFAULTS, LABELS } from "@mecha/core";
import { getDockerClient } from "@/lib/docker";
import { withAuth } from "@/lib/api-auth";
import { getOtpSecret } from "@/lib/auth";

/** Allowed env var key pattern (alphanumeric + underscore, no secrets) */
const ALLOWED_ENV_KEY = /^[A-Z][A-Z0-9_]*$/;
const BLOCKED_ENV_KEYS = new Set([
  "PATH", "HOME", "USER", "SHELL", "LD_PRELOAD", "LD_LIBRARY_PATH",
  "CLAUDE_CODE_OAUTH_TOKEN", "ANTHROPIC_API_KEY", "MECHA_OTP", "MECHA_PERMISSION_MODE", "MECHA_AUTH_TOKEN",
]);

const VALID_PERMISSION_MODES = ["default", "plan", "full-auto"] as const;

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
  let body: { path?: string; env?: unknown; claudeToken?: string; otp?: string; permissionMode?: string };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const projectPath = body.path;
  if (!projectPath || typeof projectPath !== "string") {
    return NextResponse.json({ error: "Missing path" }, { status: 400 });
  }

  // Validate path exists and is a directory
  const resolved = resolve(projectPath);
  try {
    const st = await stat(resolved);
    if (!st.isDirectory()) {
      return NextResponse.json({ error: "Path is not a directory" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Path does not exist" }, { status: 400 });
  }

  // Validate env vars
  const env = validateEnv(body.env);
  if (env === null) {
    return NextResponse.json({ error: "Invalid env format" }, { status: 400 });
  }

  if (body.claudeToken !== undefined && typeof body.claudeToken !== "string") {
    return NextResponse.json({ error: "claudeToken must be a string" }, { status: 400 });
  }
  if (body.otp !== undefined && typeof body.otp !== "string") {
    return NextResponse.json({ error: "otp must be a string" }, { status: 400 });
  }
  if (body.permissionMode !== undefined && !VALID_PERMISSION_MODES.includes(body.permissionMode as typeof VALID_PERMISSION_MODES[number])) {
    return NextResponse.json({ error: `permissionMode must be one of: ${VALID_PERMISSION_MODES.join(", ")}` }, { status: 400 });
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

    const claudeToken = body.claudeToken || process.env["CLAUDE_CODE_OAUTH_TOKEN"];
    if (claudeToken) containerEnv.push(`CLAUDE_CODE_OAUTH_TOKEN=${claudeToken}`);

    const otpSecret = body.otp || getOtpSecret();
    if (otpSecret) containerEnv.push(`MECHA_OTP=${otpSecret}`);

    if (body.permissionMode) containerEnv.push(`MECHA_PERMISSION_MODE=${body.permissionMode}`);

    await createContainer(client, {
      containerName: cName,
      image: DEFAULTS.IMAGE,
      mechaId: id,
      projectPath: resolved,
      volumeName: vName,
      hostPort,
      env: containerEnv,
    });

    try {
      await startContainer(client, cName);
    } catch (startErr) {
      try { await removeContainer(client, cName, true); } catch { /* best effort cleanup */ }
      throw startErr;
    }

    return NextResponse.json({ id, name: cName, port: hostPort }, { status: 201 });
  });
});

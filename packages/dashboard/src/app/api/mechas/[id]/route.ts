import { NextResponse, type NextRequest } from "next/server";
import { inspectContainer, removeContainer, stopContainer, createContainer, startContainer } from "@mecha/docker";
import { containerName, ContainerNotFoundError, DEFAULTS, LABELS, MOUNT_PATHS } from "@mecha/core";
import type { MechaId } from "@mecha/core";
import { getDockerClient } from "@/lib/docker";
import { withAuth } from "@/lib/api-auth";
import { isConflictError } from "@/lib/docker-errors";

const VALID_PERMISSION_MODES = ["default", "plan", "full-auto"] as const;

export const GET = withAuth(async (_request: NextRequest, { params }) => {
  const { id } = await params;
  const client = getDockerClient();
  const name = containerName(id as MechaId);

  try {
    const info = await inspectContainer(client, name);
    // Omit Config.Env, host mount sources, labels, and PID to avoid leaking internals
    const portBindings = info.NetworkSettings?.Ports ?? {};
    return NextResponse.json({
      id,
      name: info.Name.replace(/^\//, ""),
      state: {
        status: info.State?.Status,
        running: info.State?.Running,
        startedAt: info.State?.StartedAt,
        finishedAt: info.State?.FinishedAt,
      },
      image: info.Config?.Image,
      ports: portBindings,
      mounts: info.Mounts?.map((m) => ({
        type: m.Type,
        destination: m.Destination,
        rw: m.RW,
      })),
      created: info.Created,
    });
  } catch (err) {
    if (err instanceof ContainerNotFoundError) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    throw err;
  }
});

export const PATCH = withAuth(async (request: NextRequest, { params }) => {
  const { id } = await params;
  const mechaId = id as MechaId;
  const client = getDockerClient();
  const name = containerName(mechaId);

  let body: { claudeToken?: string; anthropicApiKey?: string; otp?: string; permissionMode?: string };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const hasUpdate = body.claudeToken !== undefined || body.anthropicApiKey !== undefined || body.otp !== undefined || body.permissionMode !== undefined;
  if (!hasUpdate) {
    return NextResponse.json({ error: "At least one field required: claudeToken, anthropicApiKey, otp, permissionMode" }, { status: 400 });
  }

  if (body.claudeToken !== undefined && typeof body.claudeToken !== "string") {
    return NextResponse.json({ error: "claudeToken must be a string" }, { status: 400 });
  }
  if (body.anthropicApiKey !== undefined && typeof body.anthropicApiKey !== "string") {
    return NextResponse.json({ error: "anthropicApiKey must be a string" }, { status: 400 });
  }
  if (body.otp !== undefined && typeof body.otp !== "string") {
    return NextResponse.json({ error: "otp must be a string" }, { status: 400 });
  }
  if (body.permissionMode !== undefined && !VALID_PERMISSION_MODES.includes(body.permissionMode as typeof VALID_PERMISSION_MODES[number])) {
    return NextResponse.json({ error: `permissionMode must be one of: ${VALID_PERMISSION_MODES.join(", ")}` }, { status: 400 });
  }

  let info;
  try {
    info = await inspectContainer(client, name);
  } catch (err) {
    if (err instanceof ContainerNotFoundError) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    throw err;
  }

  // Extract current config from running container
  const projectPath = info.Config?.Labels?.[LABELS.MECHA_PATH] ?? "";
  const portBindings = info.NetworkSettings?.Ports?.[`${DEFAULTS.CONTAINER_PORT}/tcp`];
  const hostPort = Number(portBindings?.[0]?.HostPort ?? DEFAULTS.PORT_BASE);
  const volumeBind = info.Mounts?.find((m) => m.Destination === MOUNT_PATHS.STATE);
  const vName = volumeBind?.Name ?? "";

  // Parse existing env vars into a map
  const envMap = new Map<string, string>();
  for (const entry of info.Config?.Env ?? []) {
    const eqIdx = entry.indexOf("=");
    if (eqIdx > 0) envMap.set(entry.slice(0, eqIdx), entry.slice(eqIdx + 1));
  }

  // Update only the specified fields
  if (body.claudeToken !== undefined) {
    if (body.claudeToken) envMap.set("CLAUDE_CODE_OAUTH_TOKEN", body.claudeToken);
    else envMap.delete("CLAUDE_CODE_OAUTH_TOKEN");
  }
  if (body.anthropicApiKey !== undefined) {
    if (body.anthropicApiKey) envMap.set("ANTHROPIC_API_KEY", body.anthropicApiKey);
    else envMap.delete("ANTHROPIC_API_KEY");
  }
  if (body.otp !== undefined) {
    if (body.otp) envMap.set("MECHA_OTP", body.otp);
    else envMap.delete("MECHA_OTP");
  }
  if (body.permissionMode !== undefined) {
    if (body.permissionMode) envMap.set("MECHA_PERMISSION_MODE", body.permissionMode);
    else envMap.delete("MECHA_PERMISSION_MODE");
  }

  // Convert back to env array, excluding MECHA_ID (createContainer adds it)
  const newEnv = Array.from(envMap.entries())
    .filter(([k]) => k !== "MECHA_ID")
    .map(([k, v]) => `${k}=${v}`);

  // Save original config for rollback
  const originalOpts = {
    containerName: name,
    image: info.Config?.Image ?? DEFAULTS.IMAGE,
    mechaId,
    projectPath,
    volumeName: vName,
    hostPort,
    env: (info.Config?.Env ?? []).filter((e: string) => !e.startsWith("MECHA_ID=")),
  };

  // Recreate container: stop → remove → create → start (with rollback)
  try {
    await stopContainer(client, name);
  } catch (err) {
    if (!isConflictError(err)) {
      if (err instanceof ContainerNotFoundError) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      throw err;
    }
  }

  try {
    await removeContainer(client, name, true);
    await createContainer(client, {
      containerName: name,
      image: DEFAULTS.IMAGE,
      mechaId,
      projectPath,
      volumeName: vName,
      hostPort,
      env: newEnv,
    });
    try {
      await startContainer(client, name);
    } catch (startErr) {
      // Start failed: remove new container, restore original
      try { await removeContainer(client, name, true); } catch { /* best effort */ }
      await createContainer(client, originalOpts);
      await startContainer(client, name);
      throw startErr;
    }
  } catch (err) {
    // If we got here from the outer catch (remove/create failed), try rollback
    if (!(err instanceof Error && err.message?.includes("start"))) {
      try {
        await createContainer(client, originalOpts);
        await startContainer(client, name);
      } catch { /* rollback also failed — surface original error */ }
    }
    throw err;
  }

  return NextResponse.json({ ok: true });
});

export const DELETE = withAuth(async (_request: NextRequest, { params }) => {
  const { id } = await params;
  const client = getDockerClient();
  const name = containerName(id as MechaId);

  try {
    await removeContainer(client, name, true);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ContainerNotFoundError) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    throw err;
  }
});

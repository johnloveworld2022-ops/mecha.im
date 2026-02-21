import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { DockerClient } from "@mecha/docker";
import {
  ensureNetwork,
  inspectContainer,
} from "@mecha/docker";
import {
  containerName,
  networkName,
  DEFAULTS,
} from "@mecha/core";
import type { MechaId } from "@mecha/core";
import {
  ConfigureNoFieldsError,
} from "@mecha/contracts";
import type {
  MechaConfigureInputType,
} from "@mecha/contracts";
import {
  validatePermissionMode,
  applyEnvUpdates,
  extractContainerOpts,
  stopTolerant,
  recreateWithRollback,
} from "./helpers.js";

// --- mechaConfigure ---
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

// --- mechaInit ---
export async function mechaInit(client: DockerClient): Promise<void> {
  const net = networkName();
  await ensureNetwork(client, net);

  const mechaHome = join(homedir(), DEFAULTS.HOME_DIR);
  await mkdir(mechaHome, { recursive: true });
}

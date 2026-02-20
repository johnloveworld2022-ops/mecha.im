/**
 * Container entrypoint — starts the Fastify runtime server.
 */
import { createServer } from "./server.js";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { MechaId } from "@mecha/core";

// Ensure Claude onboarding flag exists (tmpfs at /home/mecha wipes baked-in files)
const homeDir = process.env["HOME"] ?? "/home/mecha";
const claudeJson = join(homeDir, ".claude.json");
const claudeDir = join(homeDir, ".claude");
if (!existsSync(claudeJson)) {
  writeFileSync(claudeJson, '{"hasCompletedOnboarding": true}\n');
}
if (!existsSync(claudeDir)) {
  mkdirSync(claudeDir, { recursive: true });
}

const mechaId = process.env["MECHA_ID"] as MechaId;
if (!mechaId) {
  console.error("MECHA_ID environment variable is required");
  process.exit(1);
}

const port = Number(process.env["PORT"] ?? 3000);
const host = process.env["HOST"] ?? "0.0.0.0";

// Agent is always registered; it returns 503 if Claude auth
// is not configured. Auth is via `claude setup-token` credentials
// persisted in the state volume, NOT via ANTHROPIC_API_KEY.
// API-key auth is disabled by default per product spec (§11.2).
const app = createServer({
  mechaId,
  version: process.env["MECHA_VERSION"] ?? "0.1.0",
  logger: true,
  authToken: process.env["MECHA_AUTH_TOKEN"],
  otp: process.env["MECHA_OTP"],
  agent: {
    workingDirectory: process.env["MECHA_WORKSPACE"] ?? "/workspace",
    permissionMode: (process.env["MECHA_PERMISSION_MODE"] ?? "default") as "default" | "plan" | "full-auto",
  },
});

app.listen({ port, host }, (err, address) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`Mecha runtime ${mechaId} listening on ${address}`);
});

/**
 * Container entrypoint — starts the Fastify runtime server.
 */
import { createServer } from "./server.js";
import type { MechaId } from "@mecha/core";

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
  agent: {
    workingDirectory: process.env["MECHA_WORKSPACE"] ?? "/workspace",
    permissionMode: (process.env["MECHA_PERMISSION_MODE"] as "default" | "plan" | "full-auto") ?? "default",
  },
});

app.listen({ port, host }, (err, address) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`Mecha runtime ${mechaId} listening on ${address}`);
});

import { serve } from "@hono/node-server";
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { mkdirSync } from "node:fs";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { botConfigSchema } from "./types.js";
import { createApp } from "./server.js";
import { Scheduler } from "./scheduler.js";
import { createPtyManager } from "./pty-manager.js";
import { attachTerminalWs } from "./ws-terminal.js";
import { log } from "../shared/logger.js";
import { resolveRuntime } from "../shared/runtime.js";

const CREDENTIALS_PATH = "/state/credentials.yaml";

// Crash handlers — log before dying so we know what happened
process.on("unhandledRejection", (reason) => {
  log.error("Unhandled rejection", { error: reason instanceof Error ? reason.message : String(reason) });
  process.exit(1);
});
process.on("uncaughtException", (err) => {
  log.error("Uncaught exception", { error: err.message, stack: err.stack });
  process.exit(1);
});

const DEFAULT_PORT = 3000;
const portEnv = process.env.MECHA_PORT;
let PORT = DEFAULT_PORT;
if (portEnv) {
  const parsed = parseInt(portEnv, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    log.error(`Invalid MECHA_PORT: "${portEnv}" (must be 1-65535)`);
    process.exit(1);
  }
  PORT = parsed;
}
const STATE_DIR = process.env.MECHA_STATE_DIR ?? "/state";
const CONFIG_PATH = process.env.MECHA_CONFIG_PATH ?? "/config/bot.yaml";

function loadConfig() {
  const name = process.env.MECHA_BOT_NAME;
  if (!name) {
    log.error("MECHA_BOT_NAME env var is required");
    process.exit(1);
  }

  // Re-resolve auth from credentials.yaml if available (supports runtime auth switching)
  // Read partial config first to determine runtime and auth profile if present.
  let configAuth: string | undefined;
  let configRuntime: string | undefined;
  let configModel: string | undefined;
  try {
    const configRaw = readFileSync(CONFIG_PATH, "utf-8");
    const configParsed = parseYaml(configRaw) as { auth?: string; runtime?: string; model?: string };
    configAuth = configParsed.auth;
    configRuntime = configParsed.runtime;
    configModel = configParsed.model;
  } catch { /* config will be parsed again below */ }
  const runtime = resolveRuntime(process.env.MECHA_RUNTIME ?? configRuntime, configModel ?? process.env.MECHA_MODEL);

  if (configAuth && existsSync(CREDENTIALS_PATH)) {
    // Profile is set — clear old env vars and resolve from credentials (fail fast on any error).
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
    delete process.env.OPENAI_API_KEY;
    try {
      const credsRaw = readFileSync(CREDENTIALS_PATH, "utf-8");
      const credsParsed = parseYaml(credsRaw) as { credentials?: Array<{ name: string; type: string; env: string; key: string }> };
      const cred = credsParsed.credentials?.find((c) => c.name === configAuth);
      const valid = runtime === "claude"
        ? !!cred && (cred.type === "api_key" || cred.type === "oauth_token")
        : !!cred && cred.type === "api_key" && cred.env === "OPENAI_API_KEY";
      if (valid && cred) {
        process.env[cred.env] = cred.key;
        log.info(`Auth resolved from credentials.yaml: profile="${configAuth}" type=${cred.type}`);
      } else {
        log.error(`Auth profile "${configAuth}" not found or invalid for runtime "${runtime}"`);
        process.exit(1);
      }
    } catch (err) {
      log.error(`Failed to resolve auth profile "${configAuth}" from credentials.yaml`, {
        error: err instanceof Error ? err.message : String(err),
      });
      process.exit(1);
    }
  }

  if (runtime === "claude") {
    if (!process.env.ANTHROPIC_API_KEY && !process.env.CLAUDE_CODE_OAUTH_TOKEN) {
      log.error("ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN env var is required for runtime=claude");
      process.exit(1);
    }
  } else {
    const hasCodexAuthFile = existsSync("/home/appuser/.codex/auth.json");
    if (!process.env.OPENAI_API_KEY && !hasCodexAuthFile) {
      log.error("OPENAI_API_KEY or /home/appuser/.codex/auth.json is required for runtime=codex");
      process.exit(1);
    }
  }

  try {
    const raw = readFileSync(CONFIG_PATH, "utf-8");
    const parsed = parseYaml(raw);
    const result = botConfigSchema.safeParse(parsed);
    if (!result.success) {
      log.error("Invalid bot config", { detail: JSON.stringify(result.error.format()) });
      process.exit(1);
    }
    return result.data;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      const result = botConfigSchema.safeParse({
        name,
        system: process.env.MECHA_SYSTEM_PROMPT ?? "You are a helpful assistant.",
        runtime,
        model: process.env.MECHA_MODEL ?? "sonnet",
      });
      if (!result.success) {
        log.error("Failed to build config from env", { detail: JSON.stringify(result.error.format()) });
        process.exit(1);
      }
      return result.data;
    }
    throw err;
  }
}

const config = loadConfig();
const startedAt = Date.now();

// Ensure state directories exist
mkdirSync(`${STATE_DIR}/sessions`, { recursive: true });
mkdirSync(`${STATE_DIR}/logs`, { recursive: true });

// PTY manager for interactive terminal sessions (created before app so it can be passed)
let ptyManager: ReturnType<typeof createPtyManager> | undefined;
try {
  const { createNodePtySpawn } = await import("./node-pty-adapter.js");
  ptyManager = createPtyManager({ spawnFn: createNodePtySpawn(), botConfig: config });
  log.info("PTY terminal support enabled (node-pty)");
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  log.info("PTY terminal support disabled", { reason: msg });
}

const { app, isBusy, handlePrompt, setScheduler, botToken } = createApp(config, startedAt, ptyManager);

// Persist schedule changes back to bot.yaml
function onScheduleConfigChange(entries: Array<{ cron: string; prompt: string }>) {
  try {
    const raw = readFileSync(CONFIG_PATH, "utf-8");
    const parsed = parseYaml(raw) as Record<string, unknown>;
    parsed.schedule = entries.length > 0 ? entries : undefined;
    writeFileSync(CONFIG_PATH, stringifyYaml(parsed));
    log.info(`Schedule config persisted: ${entries.length} entries`);
  } catch (err) {
    log.error("Failed to persist schedule config", { error: err instanceof Error ? err.message : String(err) });
  }
}

// Start scheduler (always, so CRUD works even with no initial entries)
const scheduler = new Scheduler(config.schedule ?? [], handlePrompt, isBusy, onScheduleConfigChange);
setScheduler(scheduler);
scheduler.start();

const server = serve({ fetch: app.fetch, port: PORT }, () => {
  log.info(`mecha-agent "${config.name}" listening on :${PORT}`);
});

// Attach WebSocket terminal server if PTY is available
if (ptyManager) {
  attachTerminalWs(server, ptyManager, botToken);
}

function gracefulShutdown(signal: string) {
  log.info(`${signal} received, shutting down...`);
  ptyManager?.shutdown();
  scheduler?.stop();
  const forceTimer = setTimeout(() => {
    log.warn("Graceful shutdown timeout, forcing exit");
    process.exit(1);
  }, 5000);
  forceTimer.unref();
  server.close(() => process.exit(0));
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

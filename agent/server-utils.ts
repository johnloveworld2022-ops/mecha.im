import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { timingSafeEqual, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { query } from "@anthropic-ai/claude-agent-sdk";
import type { BotConfig } from "./types.js";
import type { TaskSource } from "./session.js";
import {
  type QueryResult, type SdkEvent, type SdkSystemEvent, type SdkAssistantEvent, type SdkResultEvent,
} from "./server.types.js";
import type { PromptOverrides } from "./server-schema.js";
import { resolveRuntime } from "../shared/runtime.js";

export function getWorkspaceContext(): { cwd: string; settingSources: Array<"user" | "project"> | ["user"] } {
  const configuredCwd = process.env.MECHA_WORKSPACE_CWD;
  const enableProjectSettings = process.env.MECHA_ENABLE_PROJECT_SETTINGS === "1";
  if (configuredCwd) {
    return {
      cwd: configuredCwd,
      settingSources: enableProjectSettings ? ["user", "project"] : ["user"],
    };
  }

  if (existsSync("/home/appuser/workspace")) {
    return {
      cwd: "/home/appuser/workspace",
      settingSources: ["user", "project"],
    };
  }

  return {
    cwd: "/state/home-workspace",
    settingSources: ["user"],
  };
}

export function buildClaudeOptions(
  config: BotConfig,
  resumeSessionId?: string,
  mcpServers?: Record<string, unknown>[],
  overrides?: PromptOverrides,
): Record<string, unknown> {
  const workspace = getWorkspaceContext();
  const options: Record<string, unknown> = {
    model: overrides?.model ?? config.model,
    cwd: workspace.cwd,
    maxTurns: overrides?.max_turns ?? config.max_turns ?? 25,
    env: { ...process.env },
    permissionMode: config.permission_mode,
    settingSources: [...workspace.settingSources],
  };

  if (config.permission_mode === "bypassPermissions") {
    options.allowDangerouslySkipPermissions = true;
  }

  const systemPrompt = overrides?.system ?? config.system;
  if (systemPrompt) {
    options.systemPrompt = systemPrompt;
  }

  const budget = overrides?.max_budget_usd ?? config.max_budget_usd;
  if (budget) {
    options.maxBudgetUsd = budget;
  }

  if (overrides?.effort) {
    options.effort = overrides.effort;
  }

  const resumeId = overrides?.resume ?? resumeSessionId;
  if (resumeId) {
    options.resume = resumeId;
  }

  if (mcpServers?.length) {
    options.mcpServers = mcpServers;
  }

  return options;
}

function buildCodexArgs(config: BotConfig, workspaceCwd: string): string[] {
  const args: string[] = [];

  if (config.permission_mode === "bypassPermissions") {
    args.push("--dangerously-bypass-approvals-and-sandbox");
  } else {
    args.push("-a", "never");
    args.push("--sandbox", config.permission_mode === "plan" ? "read-only" : "workspace-write");
  }

  args.push("exec", "--json", "--skip-git-repo-check", "-C", workspaceCwd);

  if (config.model) {
    args.push("-m", config.model);
  }

  return args;
}

function buildCodexPrompt(message: string, config: BotConfig, overrides?: PromptOverrides): string {
  const systemPrompt = overrides?.system ?? config.system;
  if (!systemPrompt) return message;
  return `<system>\n${systemPrompt}\n</system>\n\n${message}`;
}

function parseJsonlLines(chunk: string, state: { buffer: string }, onLine: (line: string) => void): void {
  state.buffer += chunk;
  let idx = state.buffer.indexOf("\n");
  while (idx >= 0) {
    const line = state.buffer.slice(0, idx).trim();
    state.buffer = state.buffer.slice(idx + 1);
    if (line) onLine(line);
    idx = state.buffer.indexOf("\n");
  }
}

export async function runCodex(
  message: string,
  config: BotConfig,
  _resumeSessionId?: string,
  onEvent?: (event: { type: string; data: unknown }) => void,
  _mcpServers?: Record<string, unknown>[],
  overrides?: PromptOverrides,
): Promise<QueryResult> {
  const startedAt = Date.now();
  const workspace = getWorkspaceContext();
  const lastMessagePath = `/tmp/mecha-codex-${randomUUID()}.txt`;
  const timeoutMs = Math.max(1_000, parseInt(process.env.MECHA_CODEX_EXEC_TIMEOUT_MS ?? "600000", 10) || 600_000);

  const effectiveConfig: BotConfig = {
    ...config,
    model: overrides?.model ?? config.model,
  };

  const args = buildCodexArgs(effectiveConfig, workspace.cwd);
  args.push("--output-last-message", lastMessagePath);

  const prompt = buildCodexPrompt(message, config, overrides);
  let resultText = "";
  let stderrText = "";
  const stdoutState = { buffer: "" };
  const stderrState = { buffer: "" };

  const child = spawn("codex", args, {
    cwd: workspace.cwd,
    env: { ...process.env },
    stdio: ["pipe", "pipe", "pipe"],
  });
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    child.kill("SIGTERM");
    setTimeout(() => child.kill("SIGKILL"), 5_000).unref();
  }, timeoutMs);
  timeout.unref();

  child.stdin.write(prompt);
  child.stdin.end();

  child.stdout.on("data", (chunk: Buffer) => {
    parseJsonlLines(chunk.toString("utf-8"), stdoutState, (line) => {
      try {
        const parsed = JSON.parse(line) as {
          type?: string;
          item?: { type?: string; text?: string };
          msg?: { type?: string; message?: string; text?: string };
        };
        const msg = parsed.msg;
        if (msg) {
          if (msg.type === "agent_message" && typeof msg.message === "string") {
            resultText += msg.message;
            onEvent?.({ type: "text", data: { content: msg.message } });
          } else if (msg.type === "agent_reasoning" && typeof msg.text === "string") {
            onEvent?.({ type: "reasoning", data: { content: msg.text } });
          }
          return;
        }

        // Newer/older codex JSON stream format:
        // {"type":"item.completed","item":{"type":"agent_message","text":"..."}}
        if (parsed.type === "item.completed" && parsed.item?.type === "agent_message" && typeof parsed.item.text === "string") {
          resultText += parsed.item.text;
          onEvent?.({ type: "text", data: { content: parsed.item.text } });
        }
      } catch {
        // Ignore non-JSON lines in JSONL stream.
      }
    });
  });

  child.stderr.on("data", (chunk: Buffer) => {
    parseJsonlLines(chunk.toString("utf-8"), stderrState, (line) => {
      stderrText += (stderrText ? "\n" : "") + line;
    });
  });

  const exitCode = await new Promise<number>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => resolve(code ?? 1));
  });
  clearTimeout(timeout);

  if (!resultText && existsSync(lastMessagePath)) {
    resultText = readFileSync(lastMessagePath, "utf-8").trim();
  }

  if (existsSync(lastMessagePath)) {
    try { unlinkSync(lastMessagePath); } catch { /* best-effort */ }
  }

  if (timedOut) {
    throw new Error(`codex exec timed out after ${timeoutMs}ms`);
  }

  if (exitCode !== 0) {
    const tail = stderrText || "unknown error";
    throw new Error(`codex exec failed (exit ${exitCode}): ${tail}`);
  }

  return {
    text: resultText,
    costUsd: 0,
    sessionId: "",
    durationMs: Date.now() - startedAt,
    success: true,
  };
}

export async function runClaude(
  message: string,
  config: BotConfig,
  resumeSessionId?: string,
  onEvent?: (event: { type: string; data: unknown }) => void,
  mcpServers?: Record<string, unknown>[],
  overrides?: PromptOverrides,
): Promise<QueryResult> {
  const options = buildClaudeOptions(config, resumeSessionId, mcpServers, overrides);
  const response = query({ prompt: message, options });

  let resultText = "";
  let costUsd = 0;
  let sessionId = "";
  let durationMs = 0;
  let success = false;

  for await (const rawEvent of response) {
    const event = rawEvent as SdkEvent;

    if (event.type === "system") {
      const sysEvent = event as SdkSystemEvent;
      if (sysEvent.subtype === "init" && sysEvent.session_id) {
        sessionId = sysEvent.session_id;
      }
    }

    if (event.type === "assistant") {
      const assistEvent = event as SdkAssistantEvent;
      if (assistEvent.message?.content) {
        for (const block of assistEvent.message.content) {
          if (block.type === "text" && block.text) {
            resultText += block.text;
            onEvent?.({ type: "text", data: { content: block.text } });
          }
          if (block.type === "tool_use") {
            onEvent?.({ type: "tool_use", data: { tool: block.name, input: block.input } });
          }
        }
      }
    }

    if (event.type === "result") {
      const resEvent = event as SdkResultEvent;
      costUsd = resEvent.total_cost_usd ?? 0;
      sessionId = resEvent.session_id ?? sessionId;
      durationMs = resEvent.duration_ms ?? 0;
      success = resEvent.subtype === "success";
      resultText = resEvent.result ?? resultText;
    }
  }

  return { text: resultText, costUsd, sessionId, durationMs, success };
}

export async function runAgent(
  message: string,
  config: BotConfig,
  resumeSessionId?: string,
  onEvent?: (event: { type: string; data: unknown }) => void,
  mcpServers?: Record<string, unknown>[],
  overrides?: PromptOverrides,
): Promise<QueryResult> {
  const runtime = resolveRuntime(config.runtime, overrides?.model ?? config.model);
  if (runtime === "codex") {
    return runCodex(message, config, resumeSessionId, onEvent, mcpServers, overrides);
  }
  return runClaude(message, config, resumeSessionId, onEvent, mcpServers, overrides);
}

export function hasInternalAuthHeader(value: string | undefined, secret: string | undefined): boolean {
  if (!secret || !value) return false;
  const received = Buffer.from(value);
  const expected = Buffer.from(secret);
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export function promptSourceForRequest(c: import("hono").Context, secret: string | undefined, header: string): TaskSource {
  return hasInternalAuthHeader(c.req.header(header), secret) ? "interbot" : "interactive";
}

export function activityStateForSource(source: TaskSource): "thinking" | "calling" | "scheduled" | "webhook" {
  if (source === "interbot") return "calling";
  if (source === "schedule") return "scheduled";
  if (source === "webhook") return "webhook";
  return "thinking";
}

export function formatToolContext(toolName: string, input: unknown): string {
  if (!input || typeof input !== "object") return "";
  const obj = input as Record<string, unknown>;
  switch (toolName) {
    case "Read": case "Edit": case "Write": return String(obj.file_path ?? "");
    case "Bash": return String(obj.command ?? "").slice(0, 80);
    case "Grep": case "Glob": return String(obj.pattern ?? "");
    case "WebSearch": return String(obj.query ?? "");
    default: return "";
  }
}

export const BOT_RUNTIMES = ["claude", "codex"] as const;

export type BotRuntime = (typeof BOT_RUNTIMES)[number];

const CLAUDE_MODEL_HINTS = ["claude", "sonnet", "opus", "haiku"];
const CODEX_MODEL_HINTS = ["codex", "gpt", "o1", "o3", "o4"];

export function inferRuntimeFromModel(model?: string): BotRuntime {
  const value = (model ?? "").trim().toLowerCase();
  if (!value) return "claude";
  if (CLAUDE_MODEL_HINTS.some((hint) => value.includes(hint))) return "claude";
  if (CODEX_MODEL_HINTS.some((hint) => value.startsWith(hint) || value.includes(`-${hint}`))) return "codex";
  return "claude";
}

export function resolveRuntime(runtime: string | undefined, model?: string): BotRuntime {
  if (runtime === "claude" || runtime === "codex") return runtime;
  return inferRuntimeFromModel(model);
}

export function isClaudeRuntime(runtime: string | undefined, model?: string): boolean {
  return resolveRuntime(runtime, model) === "claude";
}

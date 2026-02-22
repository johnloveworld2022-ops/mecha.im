import type { Command } from "commander";
import type { CommandDeps } from "../types.js";
import {
  mechaSessionList,
  mechaSessionGet,
  mechaSessionDelete,
  mechaSessionInterrupt,
  mechaSessionRename,
} from "@mecha/service";
import { toUserMessage, toExitCode, type SessionUsageType as UsageStats } from "@mecha/contracts";

interface SessionSummary {
  sessionId: string;
  title: string;
  state: string;
  messageCount: number;
  lastMessageAt: string | null;
  createdAt: string;
  usage?: UsageStats;
}

interface SessionMessage {
  role: string;
  content: string;
  createdAt: string;
}

interface SessionDetail extends SessionSummary {
  config: Record<string, unknown>;
  messages: SessionMessage[];
}

function formatCost(usd: number): string {
  if (usd === 0) return "-";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

export function registerSessionsCommand(parent: Command, deps: CommandDeps): void {
  const sessions = parent
    .command("sessions")
    .description("Manage chat sessions for a Mecha");

  sessions
    .command("list <id>")
    .description("List all sessions for a Mecha")
    .action(async (id: string) => {
      const { dockerClient, formatter } = deps;
      try {
        const result = await mechaSessionList(dockerClient, { id }) as SessionSummary[];
        formatter.table(
          result.map((s) => ({
            ID: s.sessionId.slice(0, 8),
            TITLE: s.title || "(untitled)",
            STATE: s.state,
            MESSAGES: String(s.messageCount),
            TURNS: String(s.usage?.turnCount ?? 0),
            COST: formatCost(s.usage?.totalCostUsd ?? 0),
            "LAST ACTIVITY": s.lastMessageAt ?? "-",
          })),
          ["ID", "TITLE", "STATE", "MESSAGES", "TURNS", "COST", "LAST ACTIVITY"],
        );
      } catch (err) {
        formatter.error(toUserMessage(err));
        process.exitCode = toExitCode(err);
      }
    });

  sessions
    .command("show <id> <sessionId>")
    .description("Show session details and messages")
    .action(async (id: string, sessionId: string) => {
      const { dockerClient, formatter } = deps;
      try {
        const detail = await mechaSessionGet(dockerClient, { id, sessionId }) as SessionDetail;
        formatter.info(`Session: ${detail.sessionId}`);
        formatter.info(`Title: ${detail.title || "(untitled)"}`);
        formatter.info(`State: ${detail.state}`);
        formatter.info(`Messages: ${detail.messageCount}`);
        formatter.info(`Created: ${detail.createdAt}`);
        formatter.info(`Turns: ${detail.usage?.turnCount ?? 0}`);
        formatter.info(`Cost: ${formatCost(detail.usage?.totalCostUsd ?? 0)}`);
        formatter.info(`Input tokens: ${detail.usage?.totalInputTokens ?? 0}`);
        formatter.info(`Output tokens: ${detail.usage?.totalOutputTokens ?? 0}`);
        formatter.info(`Duration: ${detail.usage?.totalDurationMs ?? 0}ms`);
        if (detail.messages.length > 0) {
          formatter.info("---");
          for (const msg of detail.messages) {
            formatter.info(`[${msg.role}] ${msg.content}`);
          }
        }
      } catch (err) {
        formatter.error(toUserMessage(err));
        process.exitCode = toExitCode(err);
      }
    });

  sessions
    .command("delete <id> <sessionId>")
    .description("Delete a session")
    .action(async (id: string, sessionId: string) => {
      const { dockerClient, formatter } = deps;
      try {
        await mechaSessionDelete(dockerClient, { id, sessionId });
        formatter.success(`Session ${sessionId} deleted`);
      } catch (err) {
        formatter.error(toUserMessage(err));
        process.exitCode = toExitCode(err);
      }
    });

  sessions
    .command("interrupt <id> <sessionId>")
    .description("Interrupt an active session")
    .action(async (id: string, sessionId: string) => {
      const { dockerClient, formatter } = deps;
      try {
        const result = await mechaSessionInterrupt(dockerClient, { id, sessionId });
        if (result.interrupted) {
          formatter.success(`Session ${sessionId} interrupted`);
        } else {
          formatter.info(`Session ${sessionId} was not busy`);
        }
      } catch (err) {
        formatter.error(toUserMessage(err));
        process.exitCode = toExitCode(err);
      }
    });

  sessions
    .command("rename <id> <sessionId> <title>")
    .description("Rename a session")
    .action(async (id: string, sessionId: string, title: string) => {
      const { dockerClient, formatter } = deps;
      try {
        const result = await mechaSessionRename(dockerClient, { id, sessionId, title }) as SessionSummary;
        formatter.success(`Session ${sessionId} renamed to "${result.title}"`);
      } catch (err) {
        formatter.error(toUserMessage(err));
        process.exitCode = toExitCode(err);
      }
    });
}

import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import type { AgentOptions } from "./casa.js";
import type { SessionConfigType } from "@mecha/contracts";
import {
  SessionNotFoundError,
  SessionBusyError,
  SessionCapReachedError,
} from "@mecha/contracts";

export const MAX_SESSIONS = 50;
export const SESSION_TTL_MS = 3_600_000; // 1 hour

type PermissionMode = "acceptEdits" | "plan" | "default";
const PERMISSION_MAP: Record<string, PermissionMode> = {
  "full-auto": "acceptEdits",
  plan: "plan",
  default: "default",
};

export interface SessionSummary {
  sessionId: string;
  title: string;
  state: "idle" | "busy";
  messageCount: number;
  lastMessageAt: string | null;
  createdAt: string;
}

export interface SessionMessage {
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export interface SessionDetail extends SessionSummary {
  config: SessionConfigType;
  messages: SessionMessage[];
  totalMessages: number;
}

interface ActiveSession {
  abortController: AbortController;
}

export class SessionManager {
  private active = new Map<string, ActiveSession>();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    private db: Database.Database,
    private agentOpts: AgentOptions,
  ) {}

  create(opts?: { title?: string; config?: SessionConfigType }): SessionSummary {
    const id = randomUUID();
    const title = opts?.title ?? "";
    const config = JSON.stringify(opts?.config ?? {});

    const insertSession = this.db.transaction(() => {
      const count = (this.db.prepare("SELECT COUNT(*) as cnt FROM sessions").get() as { cnt: number }).cnt;
      if (count >= MAX_SESSIONS) throw new SessionCapReachedError();
      this.db.prepare(
        "INSERT INTO sessions (id, title, config) VALUES (?, ?, ?)",
      ).run(id, title, config);
    });
    insertSession.immediate();

    const row = this.db.prepare("SELECT created_at FROM sessions WHERE id = ?").get(id) as { created_at: string };

    return {
      sessionId: id,
      title,
      state: "idle",
      messageCount: 0,
      lastMessageAt: null,
      createdAt: row.created_at,
    };
  }

  get(id: string, limit = 50, offset = 0): SessionDetail | undefined {
    const row = this.db.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as {
      id: string; sdk_session_id: string | null; title: string; state: string;
      config: string; created_at: string; updated_at: string; last_message_at: string | null;
    } | undefined;
    if (!row) return undefined;

    const messages = this.db.prepare(
      "SELECT role, content, created_at FROM session_messages WHERE session_id = ? ORDER BY created_at ASC LIMIT ? OFFSET ?",
    ).all(id, limit, offset) as Array<{ role: string; content: string; created_at: string }>;

    const totalMessages = (this.db.prepare(
      "SELECT COUNT(*) as cnt FROM session_messages WHERE session_id = ?",
    ).get(id) as { cnt: number }).cnt;

    const messageCount = totalMessages;

    return {
      sessionId: row.id,
      title: row.title,
      state: row.state as "idle" | "busy",
      messageCount,
      lastMessageAt: row.last_message_at,
      createdAt: row.created_at,
      config: JSON.parse(row.config) as SessionConfigType,
      messages: messages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
        createdAt: m.created_at,
      })),
      totalMessages,
    };
  }

  list(): SessionSummary[] {
    const rows = this.db.prepare(
      `SELECT s.id, s.title, s.state, s.created_at, s.last_message_at,
              (SELECT COUNT(*) FROM session_messages WHERE session_id = s.id) as message_count
       FROM sessions s
       ORDER BY COALESCE(s.last_message_at, s.created_at) DESC`,
    ).all() as Array<{
      id: string; title: string; state: string; created_at: string;
      last_message_at: string | null; message_count: number;
    }>;

    return rows.map((r) => ({
      sessionId: r.id,
      title: r.title,
      state: r.state as "idle" | "busy",
      messageCount: r.message_count,
      lastMessageAt: r.last_message_at,
      createdAt: r.created_at,
    }));
  }

  delete(id: string): boolean {
    // If session is active/busy, abort first
    const entry = this.active.get(id);
    if (entry) {
      entry.abortController.abort();
      this.active.delete(id);
    }
    const result = this.db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
    return result.changes > 0;
  }

  async *sendMessage(sessionId: string, message: string): AsyncIterable<unknown> {
    const row = this.db.prepare("SELECT id, sdk_session_id, state, config FROM sessions WHERE id = ?").get(sessionId) as {
      id: string; sdk_session_id: string | null; state: string; config: string;
    } | undefined;
    if (!row) throw new SessionNotFoundError(sessionId);
    if (row.state === "busy") throw new SessionBusyError(sessionId);

    // Mark busy
    this.db.prepare("UPDATE sessions SET state = 'busy', updated_at = datetime('now') WHERE id = ?").run(sessionId);
    const abortController = new AbortController();
    this.active.set(sessionId, { abortController });

    // Insert user message
    this.db.prepare(
      "INSERT INTO session_messages (session_id, role, content) VALUES (?, 'user', ?)",
    ).run(sessionId, message);

    let assistantText = "";
    try {
      const { query } = await import("@anthropic-ai/claude-agent-sdk");

      const config = JSON.parse(row.config) as SessionConfigType;
      const options: Record<string, unknown> = {
        abortController,
        cwd: this.agentOpts.workingDirectory ?? "/home/mecha",
        permissionMode: PERMISSION_MAP[config.permissionMode ?? this.agentOpts.permissionMode ?? "default"] ?? "default",
      };
      if (config.model) options.model = config.model;
      if (config.maxTurns) options.maxTurns = config.maxTurns;
      if (config.systemPrompt) options.systemPrompt = config.systemPrompt;
      if (row.sdk_session_id) options.resume = row.sdk_session_id;

      const stream = query({ prompt: message, options });

      for await (const msg of stream) {
        if (abortController.signal.aborted) break;

        // Capture sdk_session_id from messages
        const sdkMsg = msg as Record<string, unknown>;
        if (sdkMsg.session_id && !row.sdk_session_id) {
          row.sdk_session_id = sdkMsg.session_id as string;
          this.db.prepare("UPDATE sessions SET sdk_session_id = ? WHERE id = ?").run(row.sdk_session_id, sessionId);
        }

        // Accumulate assistant text

        if (sdkMsg.type === "assistant" && sdkMsg.message) {
          const content = (sdkMsg.message as Record<string, unknown>).content as Array<Record<string, unknown>> | undefined;
    
          if (Array.isArray(content)) {
            const textParts = content
              .filter((b) => b.type === "text" && typeof b.text === "string")
              .map((b) => b.text as string);

            if (textParts.length > 0) assistantText = textParts.join("");
          }
        }

        yield msg;
      }

      // Insert assistant message and mark idle

      if (assistantText) {
        this.db.prepare(
          "INSERT INTO session_messages (session_id, role, content) VALUES (?, 'assistant', ?)",
        ).run(sessionId, assistantText);
      }
      this.db.prepare(
        "UPDATE sessions SET state = 'idle', updated_at = datetime('now'), last_message_at = datetime('now') WHERE id = ?",
      ).run(sessionId);
    } catch (err) {
      // On error: save partial content, mark idle
      if (assistantText) {
        this.db.prepare(
          "INSERT INTO session_messages (session_id, role, content) VALUES (?, 'assistant', ?)",
        ).run(sessionId, assistantText);
      }
      this.db.prepare(
        "UPDATE sessions SET state = 'idle', updated_at = datetime('now'), last_message_at = datetime('now') WHERE id = ?",
      ).run(sessionId);
      this.active.delete(sessionId);
      throw err;
    }
    this.active.delete(sessionId);
  }

  interrupt(sessionId: string): boolean {
    const entry = this.active.get(sessionId);
    if (!entry) {
      // Check if session exists
      const row = this.db.prepare("SELECT state FROM sessions WHERE id = ?").get(sessionId) as { state: string } | undefined;
      if (!row) throw new SessionNotFoundError(sessionId);
      return false; // idle, nothing to interrupt
    }
    entry.abortController.abort();
    this.active.delete(sessionId);
    this.db.prepare(
      "UPDATE sessions SET state = 'idle', updated_at = datetime('now') WHERE id = ?",
    ).run(sessionId);
    return true;
  }

  updateConfig(sessionId: string, config: SessionConfigType): SessionDetail {
    const row = this.db.prepare("SELECT state FROM sessions WHERE id = ?").get(sessionId) as { state: string } | undefined;
    if (!row) throw new SessionNotFoundError(sessionId);
    if (row.state === "busy") throw new SessionBusyError(sessionId);

    this.db.prepare(
      "UPDATE sessions SET config = ?, updated_at = datetime('now') WHERE id = ?",
    ).run(JSON.stringify(config), sessionId);

    return this.get(sessionId)!;
  }

  cleanup(): number {
    const cutoff = new Date(Date.now() - SESSION_TTL_MS).toISOString().replace("T", " ").slice(0, 19);
    const result = this.db.prepare(
      "DELETE FROM sessions WHERE state = 'idle' AND updated_at < ? AND last_message_at IS NULL OR (state = 'idle' AND last_message_at < ? AND updated_at < ?)",
    ).run(cutoff, cutoff, cutoff);

    // Also clean up from active map
    for (const id of this.active.keys()) {
      const exists = this.db.prepare("SELECT id FROM sessions WHERE id = ?").get(id);

      if (!exists) this.active.delete(id);
    }

    return result.changes;
  }

  resetBusySessions(): void {
    this.db.prepare("UPDATE sessions SET state = 'idle' WHERE state = 'busy'").run();
  }

  startCleanup(): void {
    this.cleanupInterval = setInterval(() => this.cleanup(), 60_000);
    this.cleanupInterval.unref();
  }

  shutdown(): void {
    // Abort all active sessions
    for (const [id, entry] of this.active) {
      entry.abortController.abort();
      this.active.delete(id);
    }
    // Clear cleanup interval
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    // Mark all busy as idle
    this.db.prepare("UPDATE sessions SET state = 'idle' WHERE state = 'busy'").run();
  }
}

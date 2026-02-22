import type { DockerClient } from "@mecha/docker";
import { mechaSessionCreate, mechaSessionMessage } from "@mecha/service";
import type { ChannelStore } from "../db/store.js";
import type { ChannelAdapter, InboundMessage } from "../adapters/types.js";

export interface GatewayDeps {
  store: ChannelStore;
  adapters: Map<string, ChannelAdapter>;
  dockerClient: DockerClient;
}

function parseSSELines(lines: string[], accumulated: string): string {
  for (const line of lines) {
    if (!line.startsWith("data: ")) continue;
    const jsonStr = line.slice(6).trim();
    if (!jsonStr || jsonStr === "[DONE]") continue;
    try {
      const data = JSON.parse(jsonStr);
      // Support multiple SDK message shapes
      const text = data.text ?? data.content ?? data.delta?.text ?? "";
      if (text) accumulated += text;
    } catch {
      // Skip malformed JSON lines
    }
  }
  return accumulated;
}

/** Parse SSE stream response and extract accumulated text. */
export async function consumeSSEResponse(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let accumulated = "";
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    // Keep last partial line in buffer
    /* v8 ignore start */
    buffer = lines.pop() ?? "";
    /* v8 ignore stop */

    accumulated = parseSSELines(lines, accumulated);
  }

  // Process any remaining data in buffer after stream ends
  if (buffer.trim()) {
    accumulated = parseSSELines([buffer], accumulated);
  }

  return accumulated;
}

// Simple in-memory lock to prevent concurrent session creation for the same chat
const sessionLocks = new Map<string, Promise<void>>();

/** Handle an inbound message from a channel adapter. */
export async function handleInbound(
  deps: GatewayDeps,
  channelId: string,
  msg: InboundMessage,
): Promise<void> {
  const { store, adapters, dockerClient } = deps;
  const adapter = adapters.get(channelId);
  if (!adapter) return;

  const link = store.getLink(channelId, msg.chatId);

  if (!link) {
    await adapter.sendText(
      msg.chatId,
      `Your chat ID is: ${msg.chatId}\n\nThis chat is not linked to a mecha. Use:\n  mecha channel link <channelId> ${msg.chatId} <mechaId>`,
    );
    return;
  }

  // Serialize per-chat to prevent duplicate session creation
  const lockKey = `${channelId}:${msg.chatId}`;
  const prev = sessionLocks.get(lockKey) ?? Promise.resolve();
  const current = prev.then(() => processMessage(deps, adapter, channelId, msg, link));
  sessionLocks.set(lockKey, current.catch(/* v8 ignore next */ () => {}));
  await current;
}

async function processMessage(
  deps: GatewayDeps,
  adapter: ChannelAdapter,
  channelId: string,
  msg: InboundMessage,
  link: { mecha_id: string; session_id: string | null },
): Promise<void> {
  const { store, dockerClient } = deps;
  try {
    // Ensure a session exists
    let sessionId = link.session_id;
    if (!sessionId) {
      // Re-read link in case another message already created the session
      const freshLink = store.getLink(channelId, msg.chatId);
      sessionId = freshLink?.session_id ?? null;
    }
    if (!sessionId) {
      const session = await mechaSessionCreate(dockerClient, {
        id: link.mecha_id,
        title: `telegram-${msg.chatId}`,
      }) as { sessionId: string };
      sessionId = session.sessionId;
      store.updateSessionId(channelId, msg.chatId, sessionId);
    }

    const res = await mechaSessionMessage(dockerClient, {
      id: link.mecha_id,
      sessionId,
      message: msg.text,
    });

    const responseText = await consumeSSEResponse(res);
    if (responseText) {
      await adapter.sendText(msg.chatId, responseText);
    }
  } catch {
    // Don't expose internal error details to Telegram users
    await adapter.sendText(msg.chatId, "Sorry, something went wrong. Please try again later.");
  }
}

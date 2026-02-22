/**
 * Session history: fetch session detail from the API and convert messages
 * to the ThreadMessageLike format expected by assistant-ui's useLocalRuntime.
 */

/** Matches the runtime's SessionMessage shape returned by GET /api/mechas/:id/sessions/:sessionId */
export interface SessionMessage {
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

/** Matches the runtime's SessionDetail shape (subset we need) */
export interface SessionDetail {
  sessionId: string;
  messages: SessionMessage[];
  totalMessages: number;
}

/**
 * Shape expected by assistant-ui useLocalRuntime's `initialMessages` option.
 * Subset of ThreadMessageLike — we only produce text content.
 */
export interface InitialMessage {
  readonly role: "user" | "assistant";
  readonly content: string;
  readonly createdAt?: Date | undefined;
}

/**
 * Convert backend session messages to the format assistant-ui expects.
 * ThreadMessageLike accepts `content: string` directly for text-only messages.
 */
export function convertSessionMessages(messages: SessionMessage[]): InitialMessage[] {
  return messages.map((m) => ({
    role: m.role,
    content: m.content,
    createdAt: new Date(m.createdAt),
  }));
}

/**
 * Fetch a session's message history from the dashboard API.
 * Returns converted messages ready to pass as `initialMessages` to useLocalRuntime.
 *
 * @param mechaId - Container/mecha ID
 * @param sessionId - Session ID to fetch
 * @param limit - Max messages to fetch (default 200, the API maximum)
 */
export async function fetchSessionHistory(
  mechaId: string,
  sessionId: string,
  limit = 200,
): Promise<InitialMessage[]> {
  try {
    const res = await fetch(
      `/api/mechas/${mechaId}/sessions/${sessionId}?limit=${limit}`,
    );
    if (!res.ok) return [];
    const detail = (await res.json()) as SessionDetail;
    return convertSessionMessages(detail.messages ?? []);
  } catch {
    return [];
  }
}

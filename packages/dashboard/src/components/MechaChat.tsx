"use client";

import { useMemo } from "react";
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { useLocalRuntime, type ChatModelAdapter } from "@assistant-ui/react";
import { Thread } from "@/components/assistant-ui/thread";

function createMechaAdapter(mechaId: string, sessionId: string | null): ChatModelAdapter {
  return {
    async *run({ messages, abortSignal }) {
      let res: Response;

      if (sessionId) {
        // Session-based: send only the latest user message
        const lastUserMsg = messages.filter((m) => m.role === "user").pop();
        const message = lastUserMsg?.content
          .filter((c) => c.type === "text")
          .map((c) => c.text)
          .join("") ?? "";

        res = await fetch(`/api/mechas/${mechaId}/sessions/${sessionId}/message`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message }),
          signal: abortSignal,
        });
      } else {
        // Stateless: send full message history
        res = await fetch(`/api/mechas/${mechaId}/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: messages.map((m) => ({
              role: m.role,
              content: m.content
                .filter((c) => c.type === "text")
                .map((c) => c.text)
                .join(""),
            })),
          }),
          signal: abortSignal,
        });
      }

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";
      let fullText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(":") || trimmed === "data: [DONE]") continue;
          if (!trimmed.startsWith("data: ")) continue;

          try {
            const event = JSON.parse(trimmed.slice(6));
            const result = extractText(event);
            if (result) {
              if (result.mode === "full") {
                fullText = result.text;
              } else {
                fullText += result.text;
              }
              yield { content: [{ type: "text" as const, text: fullText }] };
            }
          } catch {
            // skip malformed
          }
        }
      }

      // Flush residual buffer at EOF
      if (buffer.trim()) {
        const trimmed = buffer.trim();
        if (trimmed.startsWith("data: ") && trimmed !== "data: [DONE]") {
          try {
            const event = JSON.parse(trimmed.slice(6));
            const result = extractText(event);
            if (result) {
              if (result.mode === "full") {
                fullText = result.text;
              } else {
                fullText += result.text;
              }
              yield { content: [{ type: "text" as const, text: fullText }] };
            }
          } catch {
            // skip malformed
          }
        }
      }
    },
  };
}

type ExtractResult = { mode: "full" | "delta"; text: string } | null;

function extractText(event: Record<string, unknown>): ExtractResult {
  // Claude Code SSE: {"type":"assistant","message":{"content":[{"type":"text","text":"..."}]}}
  // This sends the full accumulated text each time, so use "full" mode to replace
  if (event.type === "assistant") {
    const msg = event.message as Record<string, unknown> | undefined;
    if (msg && Array.isArray(msg.content)) {
      const texts = (msg.content as Array<Record<string, unknown>>)
        .filter((c) => c.type === "text" && typeof c.text === "string")
        .map((c) => c.text as string);
      if (texts.length > 0) return { mode: "full", text: texts.join("") };
    }
  }
  // Anthropic streaming: content_block_delta (incremental)
  if (event.type === "content_block_delta") {
    const delta = event.delta as Record<string, unknown> | undefined;
    if (delta?.type === "text_delta" && typeof delta.text === "string") return { mode: "delta", text: delta.text };
  }
  if (event.type === "text" && typeof event.text === "string") return { mode: "delta", text: event.text };
  // OpenAI-style (incremental)
  if (Array.isArray(event.choices)) {
    const choice = (event.choices as Array<Record<string, unknown>>)[0];
    const delta = choice?.delta as Record<string, unknown> | undefined;
    if (typeof delta?.content === "string") return { mode: "delta", text: delta.content };
  }
  return null;
}

interface MechaChatProps {
  mechaId: string;
  sessionId?: string | null;
}

export function MechaChat({ mechaId, sessionId = null }: MechaChatProps) {
  const adapter = useMemo(() => createMechaAdapter(mechaId, sessionId), [mechaId, sessionId]);
  const runtime = useLocalRuntime(adapter);

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div style={{ height: "500px", borderRadius: "8px", overflow: "hidden", border: "1px solid var(--border)" }}>
        <Thread />
      </div>
    </AssistantRuntimeProvider>
  );
}

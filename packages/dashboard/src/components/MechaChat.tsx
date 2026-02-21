"use client";

import { useMemo } from "react";
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { useLocalRuntime, type ChatModelAdapter, type ChatModelRunUpdate } from "@assistant-ui/react";
import { Thread } from "@/components/assistant-ui/thread";

type JSONValue = string | number | boolean | null | JSONValue[] | { [key: string]: JSONValue };
type AssistantContentPart = ChatModelRunUpdate["content"][number];

function createMechaAdapter(mechaId: string, sessionId: string | null, onStreamComplete?: () => void): ChatModelAdapter {
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
      let latestParts: AssistantContentPart[] = [];

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
            const result = extractContentParts(event);
            if (result) {
              latestParts = applyResult(latestParts, result);
              yield { content: latestParts };
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
            const result = extractContentParts(event);
            if (result) {
              latestParts = applyResult(latestParts, result);
              yield { content: latestParts };
            }
          } catch {
            // skip malformed
          }
        }
      }

      // Notify parent that stream finished (for refreshing session list counts)
      onStreamComplete?.();
    },
  };
}

function applyResult(current: AssistantContentPart[], result: NonNullable<ExtractResult>): AssistantContentPart[] {
  if (result.mode === "full") return result.parts;
  // Delta mode always produces a single text part
  const deltaPart = result.parts[0];
  if (!deltaPart || deltaPart.type !== "text") return current;
  const lastPart = current[current.length - 1];
  if (lastPart && lastPart.type === "text") {
    return [
      ...current.slice(0, -1),
      { type: "text" as const, text: lastPart.text + deltaPart.text },
    ];
  }
  return [...current, deltaPart];
}

type ExtractResult = { mode: "full" | "delta"; parts: AssistantContentPart[] } | null;

function extractContentParts(event: Record<string, unknown>): ExtractResult {
  // Claude Code SSE: {"type":"assistant","message":{"content":[{"type":"text","text":"..."},{"type":"tool_use","id":"...","name":"...","input":{...}}]}}
  // This sends the full accumulated content each time, so use "full" mode to replace
  if (event.type === "assistant") {
    const msg = event.message as Record<string, unknown> | undefined;
    if (msg && Array.isArray(msg.content)) {
      const parts: AssistantContentPart[] = [];
      for (const block of msg.content as Array<Record<string, unknown>>) {
        if (block.type === "text" && typeof block.text === "string") {
          parts.push({ type: "text" as const, text: block.text });
        } else if (block.type === "tool_use" && typeof block.name === "string") {
          const input = (block.input ?? {}) as Record<string, JSONValue>;
          parts.push({
            type: "tool-call" as const,
            toolCallId: (block.id as string) ?? crypto.randomUUID(),
            toolName: block.name,
            args: input,
            argsText: JSON.stringify(input, null, 2),
          });
        }
      }
      if (parts.length > 0) return { mode: "full", parts };
    }
  }
  // Anthropic streaming: content_block_delta (incremental, text only)
  if (event.type === "content_block_delta") {
    const delta = event.delta as Record<string, unknown> | undefined;
    if (delta?.type === "text_delta" && typeof delta.text === "string") {
      return { mode: "delta", parts: [{ type: "text", text: delta.text }] };
    }
  }
  if (event.type === "text" && typeof event.text === "string") {
    return { mode: "delta", parts: [{ type: "text", text: event.text }] };
  }
  // OpenAI-style (incremental, text only)
  if (Array.isArray(event.choices)) {
    const choice = (event.choices as Array<Record<string, unknown>>)[0];
    const delta = choice?.delta as Record<string, unknown> | undefined;
    if (typeof delta?.content === "string") {
      return { mode: "delta", parts: [{ type: "text", text: delta.content }] };
    }
  }
  return null;
}

interface MechaChatProps {
  mechaId: string;
  sessionId?: string | null;
  onStreamComplete?: () => void;
}

export function MechaChat({ mechaId, sessionId = null, onStreamComplete }: MechaChatProps) {
  const adapter = useMemo(() => createMechaAdapter(mechaId, sessionId, onStreamComplete), [mechaId, sessionId, onStreamComplete]);
  const runtime = useLocalRuntime(adapter);

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div className="h-[500px] rounded-lg overflow-hidden border border-border">
        <Thread />
      </div>
    </AssistantRuntimeProvider>
  );
}

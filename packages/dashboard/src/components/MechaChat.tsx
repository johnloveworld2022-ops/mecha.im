"use client";

import { useMemo } from "react";
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { useLocalRuntime, type ChatModelAdapter } from "@assistant-ui/react";
import { Thread } from "@/components/assistant-ui/thread";

function createMechaAdapter(mechaId: string): ChatModelAdapter {
  return {
    async *run({ messages, abortSignal }) {
      const res = await fetch(`/api/mechas/${mechaId}/chat`, {
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
            const text = extractText(event);
            if (text) {
              fullText += text;
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

function extractText(event: Record<string, unknown>): string | null {
  if (event.type === "content_block_delta") {
    const delta = event.delta as Record<string, unknown> | undefined;
    if (delta?.type === "text_delta" && typeof delta.text === "string") return delta.text;
  }
  if (event.type === "text" && typeof event.text === "string") return event.text;
  if (Array.isArray(event.choices)) {
    const choice = (event.choices as Array<Record<string, unknown>>)[0];
    const delta = choice?.delta as Record<string, unknown> | undefined;
    if (typeof delta?.content === "string") return delta.content;
  }
  return null;
}

export function MechaChat({ mechaId }: { mechaId: string }) {
  const adapter = useMemo(() => createMechaAdapter(mechaId), [mechaId]);
  const runtime = useLocalRuntime(adapter);

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div style={{ height: "500px", borderRadius: "8px", overflow: "hidden", border: "1px solid var(--border)" }}>
        <Thread />
      </div>
    </AssistantRuntimeProvider>
  );
}

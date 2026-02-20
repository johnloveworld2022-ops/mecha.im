"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MessageBubble, type Message } from "./MessageBubble";

const RUNTIME_URL =
  process.env.NEXT_PUBLIC_MECHA_RUNTIME_URL ?? "http://localhost:7700";

export function ChatPanel() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || isStreaming) return;

    const userMessage: Message = { role: "user", content: text };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsStreaming(true);

    // Add a placeholder assistant message that we will stream into
    const assistantIndex =
      messages.length + 1; // index after adding user message
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      const response = await fetch(`${RUNTIME_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, userMessage].map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process SSE lines
        const lines = buffer.split("\n");
        // Keep the last incomplete line in the buffer
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(":")) continue;

          if (trimmed === "data: [DONE]") {
            // Stream finished
            continue;
          }

          if (trimmed.startsWith("data: ")) {
            const jsonStr = trimmed.slice(6);
            try {
              const event = JSON.parse(jsonStr);
              const text = extractText(event);
              if (text) {
                setMessages((prev) => {
                  const updated = [...prev];
                  const last = updated[assistantIndex];
                  if (last && last.role === "assistant") {
                    updated[assistantIndex] = {
                      ...last,
                      content: last.content + text,
                    };
                  }
                  return updated;
                });
              }
            } catch {
              // Skip malformed JSON lines
            }
          }
        }
      }
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : "Unknown error";
      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[assistantIndex];
        if (last && last.role === "assistant" && !last.content) {
          updated[assistantIndex] = {
            ...last,
            content: `[Error: ${errorMsg}]`,
          };
        }
        return updated;
      });
    } finally {
      setIsStreaming(false);
    }
  }, [input, isStreaming, messages]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <>
      {/* Messages area */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "16px 20px",
          display: "flex",
          flexDirection: "column",
          gap: "8px",
        }}
      >
        {messages.length === 0 && (
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--text-muted)",
              fontSize: "14px",
            }}
          >
            Send a message to start chatting.
          </div>
        )}
        {messages.map((msg, i) => (
          <MessageBubble key={i} role={msg.role} content={msg.content} />
        ))}
        {isStreaming && (
          <div
            style={{
              color: "var(--text-muted)",
              fontSize: "13px",
              padding: "4px 0",
            }}
          >
            Thinking...
          </div>
        )}
      </div>

      {/* Input area */}
      <div
        style={{
          padding: "12px 20px",
          borderTop: "1px solid var(--border)",
          display: "flex",
          gap: "8px",
          flexShrink: 0,
        }}
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          disabled={isStreaming}
          style={{
            flex: 1,
            padding: "10px 14px",
            borderRadius: "8px",
            border: "1px solid var(--border)",
            backgroundColor: "var(--bg-secondary)",
            color: "var(--text)",
            fontSize: "14px",
            outline: "none",
          }}
        />
        <button
          onClick={sendMessage}
          disabled={isStreaming || !input.trim()}
          style={{
            padding: "10px 20px",
            borderRadius: "8px",
            border: "none",
            backgroundColor: "var(--accent)",
            color: "#fff",
            fontSize: "14px",
            fontWeight: 500,
            cursor: isStreaming || !input.trim() ? "not-allowed" : "pointer",
            opacity: isStreaming || !input.trim() ? 0.5 : 1,
          }}
        >
          Send
        </button>
      </div>
    </>
  );
}

/**
 * Extract text content from an SDKMessage event.
 *
 * SDKMessage format may vary; we look for common patterns:
 * - { type: "assistant", content: [{ type: "text", text: "..." }] }
 * - { type: "content_block_delta", delta: { type: "text_delta", text: "..." } }
 * - { type: "text", text: "..." }
 * - { choices: [{ delta: { content: "..." } }] } (OpenAI-compatible)
 */
function extractText(event: Record<string, unknown>): string | null {
  // SDKMessage: assistant message with content blocks
  if (event.type === "assistant" && Array.isArray(event.content)) {
    return (event.content as Array<Record<string, unknown>>)
      .filter((b) => b.type === "text" && typeof b.text === "string")
      .map((b) => b.text as string)
      .join("");
  }

  // Anthropic streaming: content_block_delta
  if (event.type === "content_block_delta") {
    const delta = event.delta as Record<string, unknown> | undefined;
    if (delta?.type === "text_delta" && typeof delta.text === "string") {
      return delta.text;
    }
  }

  // Simple text event
  if (event.type === "text" && typeof event.text === "string") {
    return event.text;
  }

  // OpenAI-compatible format
  if (Array.isArray(event.choices)) {
    const choice = (event.choices as Array<Record<string, unknown>>)[0];
    const delta = choice?.delta as Record<string, unknown> | undefined;
    if (typeof delta?.content === "string") {
      return delta.content;
    }
  }

  return null;
}

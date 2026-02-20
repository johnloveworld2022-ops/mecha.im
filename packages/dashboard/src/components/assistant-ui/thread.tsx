"use client";

import {
  ThreadPrimitive,
  MessagePrimitive,
  ComposerPrimitive,
  ActionBarPrimitive,
} from "@assistant-ui/react";
import type { FC } from "react";

export const Thread: FC = () => {
  return (
    <ThreadPrimitive.Root
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        backgroundColor: "var(--bg)",
      }}
    >
      <ThreadPrimitive.Viewport
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "16px 20px",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
        }}
      >
        <ThreadPrimitive.Empty>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              color: "var(--text-muted)",
              fontSize: "14px",
            }}
          >
            Send a message to start chatting with this mecha.
          </div>
        </ThreadPrimitive.Empty>
        <ThreadPrimitive.Messages
          components={{
            UserMessage,
            AssistantMessage,
          }}
        />
      </ThreadPrimitive.Viewport>
      <Composer />
    </ThreadPrimitive.Root>
  );
};

const UserMessage: FC = () => (
  <MessagePrimitive.Root
    style={{
      display: "flex",
      justifyContent: "flex-end",
      padding: "2px 0",
    }}
  >
    <div
      style={{
        maxWidth: "75%",
        padding: "10px 14px",
        borderRadius: "12px 12px 2px 12px",
        backgroundColor: "#1e3a5f",
        color: "var(--text)",
        fontSize: "14px",
        lineHeight: "1.5",
        whiteSpace: "pre-wrap",
      }}
    >
      <MessagePrimitive.Content />
    </div>
  </MessagePrimitive.Root>
);

const AssistantMessage: FC = () => (
  <MessagePrimitive.Root
    style={{
      display: "flex",
      justifyContent: "flex-start",
      padding: "2px 0",
    }}
  >
    <div style={{ maxWidth: "75%" }}>
      <div
        style={{
          padding: "10px 14px",
          borderRadius: "12px 12px 12px 2px",
          backgroundColor: "var(--bg-secondary)",
          color: "var(--text)",
          fontSize: "14px",
          lineHeight: "1.5",
          whiteSpace: "pre-wrap",
          border: "1px solid var(--border)",
        }}
      >
        <MessagePrimitive.Content />
      </div>
      <ActionBarPrimitive.Root
        style={{
          display: "flex",
          gap: "4px",
          marginTop: "4px",
        }}
      >
        <ActionBarPrimitive.Copy
          style={{
            padding: "2px 8px",
            fontSize: "11px",
            borderRadius: "4px",
            border: "1px solid var(--border)",
            backgroundColor: "transparent",
            color: "var(--text-muted)",
            cursor: "pointer",
          }}
        />
        <ActionBarPrimitive.Reload
          style={{
            padding: "2px 8px",
            fontSize: "11px",
            borderRadius: "4px",
            border: "1px solid var(--border)",
            backgroundColor: "transparent",
            color: "var(--text-muted)",
            cursor: "pointer",
          }}
        />
      </ActionBarPrimitive.Root>
    </div>
  </MessagePrimitive.Root>
);

const Composer: FC = () => (
  <ComposerPrimitive.Root
    style={{
      display: "flex",
      gap: "8px",
      padding: "12px 20px",
      borderTop: "1px solid var(--border)",
      flexShrink: 0,
    }}
  >
    <ComposerPrimitive.Input
      placeholder="Type a message..."
      aria-label="Message input"
      style={{
        flex: 1,
        padding: "10px 14px",
        borderRadius: "8px",
        border: "1px solid var(--border)",
        backgroundColor: "var(--bg-secondary)",
        color: "var(--text)",
        fontSize: "14px",
        outline: "none",
        resize: "none",
      }}
    />
    <ComposerPrimitive.Send
      style={{
        padding: "10px 20px",
        borderRadius: "8px",
        border: "none",
        backgroundColor: "var(--accent)",
        color: "#fff",
        fontSize: "14px",
        fontWeight: 500,
        cursor: "pointer",
      }}
    >
      Send
    </ComposerPrimitive.Send>
  </ComposerPrimitive.Root>
);

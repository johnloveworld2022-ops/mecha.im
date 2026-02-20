"use client";

export interface Message {
  role: "user" | "assistant";
  content: string;
}

export function MessageBubble({ role, content }: Message) {
  const isUser = role === "user";

  return (
    <div
      style={{
        display: "flex",
        justifyContent: isUser ? "flex-end" : "flex-start",
        padding: "4px 0",
      }}
    >
      <div
        style={{
          maxWidth: "75%",
          padding: "10px 14px",
          borderRadius: "12px",
          backgroundColor: isUser
            ? "var(--user-bubble)"
            : "var(--assistant-bubble)",
          border: isUser ? "none" : "1px solid var(--border)",
          fontSize: "14px",
          lineHeight: "1.5",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {content}
      </div>
    </div>
  );
}

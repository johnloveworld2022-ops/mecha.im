"use client";

import { cn } from "@/lib/utils";
import type { Session } from "@/lib/store";

interface SessionItemProps {
  session: Session;
  isActive: boolean;
  onClick: () => void;
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

export function SessionItem({ session, isActive, onClick }: SessionItemProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
        isActive
          ? "bg-accent text-accent-foreground"
          : "text-sidebar-foreground hover:bg-sidebar-accent",
      )}
    >
      <span
        className={cn(
          "size-2 shrink-0 rounded-full",
          session.state === "busy" ? "bg-warning" : "bg-success",
        )}
      />
      <span className="flex-1 truncate">
        {session.title || session.sessionId.slice(0, 8)}
      </span>
      <span className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
        <span>{session.messageCount}</span>
        {session.lastMessageAt && (
          <span>{timeAgo(session.lastMessageAt)}</span>
        )}
      </span>
    </button>
  );
}

"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { MoreHorizontalIcon, PencilIcon, TrashIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { TooltipIconButton } from "@/components/assistant-ui/tooltip-icon-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Session } from "@/lib/store";

interface SessionItemProps {
  session: Session;
  isActive: boolean;
  onClick: () => void;
  onRename: (sessionId: string, newTitle: string) => void;
  onDelete: (sessionId: string) => void;
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "";
  const normalized = dateStr.includes("T") ? dateStr : dateStr.replace(" ", "T") + "Z";
  const diff = Date.now() - new Date(normalized).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

export function SessionItem({ session, isActive, onClick, onRename, onDelete }: SessionItemProps) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const committedRef = useRef(false);

  useEffect(() => {
    if (editing && inputRef.current) {
      committedRef.current = false;
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const startRename = () => {
    setEditValue(session.title);
    setEditing(true);
  };

  const commitRename = useCallback(() => {
    if (committedRef.current) return;
    committedRef.current = true;
    const trimmed = editValue.trim();
    setEditing(false);
    if (trimmed && trimmed !== session.title) {
      onRename(session.sessionId, trimmed);
    }
  }, [editValue, session.title, session.sessionId, onRename]);

  const cancelRename = () => {
    committedRef.current = true;
    setEditing(false);
  };

  const displayTitle = session.title || session.sessionId.slice(0, 8);

  return (
    <div
      className={cn(
        "group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
        isActive
          ? "bg-accent text-accent-foreground"
          : "text-sidebar-foreground hover:bg-sidebar-accent",
      )}
    >
      {editing ? (
        <div className="flex flex-1 items-center gap-2 min-w-0">
          <span
            className={cn(
              "size-2 shrink-0 rounded-full",
              session.state === "busy" ? "bg-warning" : "bg-success",
            )}
          />
          <input
            ref={inputRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") cancelRename();
            }}
            onBlur={commitRename}
            maxLength={200}
            className="flex-1 min-w-0 bg-transparent border-none outline-none text-sm text-inherit p-0"
          />
        </div>
      ) : (
        <>
          <button
            onClick={onClick}
            className="flex flex-1 items-center gap-2 min-w-0 bg-transparent border-none p-0 text-left cursor-pointer text-inherit"
          >
            <span
              className={cn(
                "size-2 shrink-0 rounded-full",
                session.state === "busy" ? "bg-warning" : "bg-success",
              )}
            />
            <span className="flex-1 truncate" title={displayTitle}>
              {displayTitle}
            </span>
          </button>

          <span className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
            <span>{session.messageCount}</span>
            {session.lastMessageAt && (
              <span>{timeAgo(session.lastMessageAt)}</span>
            )}
          </span>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <TooltipIconButton
                tooltip="Session actions"
                variant="ghost"
                size="icon-xs"
                className="shrink-0 sm:opacity-0 sm:group-hover:opacity-100"
                onClick={(e: React.MouseEvent) => e.stopPropagation()}
              >
                <MoreHorizontalIcon className="size-3.5" />
              </TooltipIconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-36">
              <DropdownMenuItem onClick={startRename}>
                <PencilIcon className="size-4" />
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onDelete(session.sessionId)}
                variant="destructive"
              >
                <TrashIcon className="size-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      )}
    </div>
  );
}

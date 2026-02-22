"use client";

import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface RailMechaIconProps {
  id: string;
  name: string;
  state: string;
  path: string;
  isActive: boolean;
  onClick: () => void;
}

function getInitials(name: string): string {
  // Use first 2 chars of the mecha id/name
  const clean = name.replace(/^mecha-/, "");
  return clean.slice(0, 2).toUpperCase();
}

function stateDotColor(state: string): string {
  if (state === "running") return "bg-success";
  if (state === "exited" || state === "dead") return "bg-destructive";
  return "bg-warning";
}

export function RailMechaIcon({ id, name, state, path, isActive, onClick }: RailMechaIconProps) {
  const initials = getInitials(id);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={onClick}
          className={cn(
            "relative flex size-11 items-center justify-center rounded-xl text-sm font-semibold transition-all",
            isActive
              ? "bg-primary text-primary-foreground rounded-2xl"
              : "bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground hover:rounded-xl",
          )}
        >
          {initials}
          {/* Status dot */}
          <span
            className={cn(
              "absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-background",
              stateDotColor(state),
            )}
          />
          {/* Active indicator bar */}
          {isActive && (
            <span className="absolute -left-2 top-1/2 -translate-y-1/2 h-5 w-1 rounded-full bg-foreground" />
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" className="flex flex-col gap-0.5">
        <span className="font-mono text-xs">{id}</span>
        <span className="text-xs text-muted-foreground truncate max-w-[200px]">{path}</span>
        <span className="text-xs capitalize">{state}</span>
      </TooltipContent>
    </Tooltip>
  );
}

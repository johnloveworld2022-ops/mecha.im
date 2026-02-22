"use client";

import { BotIcon } from "lucide-react";
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

export function RailMechaIcon({ id, name, state, path, isActive, onClick }: RailMechaIconProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={onClick}
          className={cn(
            "relative flex size-8 items-center justify-center transition-all",
            isActive
              ? "text-primary"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {/* Active left border */}
          <span
            className={cn(
              "absolute left-0 top-1 bottom-1 w-0.5 rounded-full transition-colors",
              isActive ? "bg-primary" : "bg-transparent",
            )}
          />
          <BotIcon className="size-3.5" />
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

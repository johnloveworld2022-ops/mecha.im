"use client";

import { ChevronDownIcon, MonitorIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { RailMechaIcon } from "./RailMechaIcon";
import type { MechaWithNode } from "@/lib/store";

interface RailNodeGroupProps {
  node: string;
  mechas: MechaWithNode[];
  selectedMechaId: string | null;
  onSelectMecha: (id: string) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export function RailNodeGroup({
  node,
  mechas,
  selectedMechaId,
  onSelectMecha,
  collapsed,
  onToggleCollapse,
}: RailNodeGroupProps) {
  return (
    <div className="flex flex-col items-center gap-1">
      {/* Node header — large collapsible button */}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={onToggleCollapse}
            className="relative flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-all"
          >
            <MonitorIcon className="size-5" />
            {/* Collapse indicator */}
            <ChevronDownIcon
              className={cn(
                "absolute -bottom-0.5 left-1/2 -translate-x-1/2 size-2.5 text-muted-foreground transition-transform",
                collapsed && "-rotate-90",
              )}
            />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">
          <span>{node}</span>
          <span className="text-muted-foreground ml-1">({mechas.length})</span>
        </TooltipContent>
      </Tooltip>

      {/* CASA icons — smaller, nested */}
      {!collapsed && (
        <div className="flex flex-col items-center gap-1">
          {mechas.map((m) => (
            <RailMechaIcon
              key={m.id}
              id={m.id}
              name={m.name}
              state={m.state}
              path={m.path}
              isActive={selectedMechaId === m.id}
              onClick={() => onSelectMecha(m.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

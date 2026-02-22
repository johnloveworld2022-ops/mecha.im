"use client";

import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
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
  const allRunning = mechas.every((m) => m.state === "running");
  const anyRunning = mechas.some((m) => m.state === "running");

  return (
    <div className="flex flex-col items-center gap-1">
      <button
        onClick={onToggleCollapse}
        className="flex items-center gap-1 px-1 py-0.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
      >
        <span
          className={cn(
            "size-1.5 rounded-full",
            allRunning ? "bg-success" : anyRunning ? "bg-warning" : "bg-destructive",
          )}
        />
        <span className="truncate max-w-[40px]">{node === "local" ? "L" : node.slice(0, 3)}</span>
      </button>
      {!collapsed && (
        <div className="flex flex-col items-center gap-2">
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
      <Separator className="my-1 w-8" />
    </div>
  );
}

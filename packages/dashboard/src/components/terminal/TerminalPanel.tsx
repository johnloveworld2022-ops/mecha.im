"use client";

import { LogViewer } from "@/components/LogViewer";
import { MechaExec } from "@/components/MechaExec";
import { Separator } from "@/components/ui/separator";

interface TerminalPanelProps {
  mechaId: string;
  isRunning: boolean;
}

export function TerminalPanel({ mechaId, isRunning }: TerminalPanelProps) {
  if (!isRunning) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <p className="text-sm text-muted-foreground">
          Start the mecha to access terminal and logs.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col md:flex-row">
      {/* Exec section */}
      <div className="flex-1 min-h-0 p-4 flex flex-col">
        <h3 className="text-sm font-medium mb-3">Execute Command</h3>
        <div className="flex-1 min-h-0 rounded-lg border border-border bg-card p-4 overflow-auto">
          <MechaExec mechaId={mechaId} />
        </div>
      </div>

      <Separator orientation="vertical" className="hidden md:block" />
      <Separator className="md:hidden" />

      {/* Logs section */}
      <div className="flex-1 min-h-0 p-4 flex flex-col">
        <h3 className="text-sm font-medium mb-3">Logs</h3>
        <div className="flex-1 min-h-0">
          <LogViewer mechaId={mechaId} />
        </div>
      </div>
    </div>
  );
}

"use client";

import { useDashboardStore } from "@/lib/store";
import { PlusIcon, BoxIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function DashboardHome() {
  const mechas = useDashboardStore((s) => s.mechas);
  const selectedMechaId = useDashboardStore((s) => s.selectedMechaId);

  // If we have mechas but none selected, show prompt
  if (mechas.length > 0 && !selectedMechaId) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="flex flex-col items-center gap-4 text-center">
          <BoxIcon className="size-12 text-muted-foreground" />
          <div>
            <h2 className="text-lg font-semibold mb-1">Select a Mecha</h2>
            <p className="text-sm text-muted-foreground max-w-sm">
              Click on a mecha icon in the sidebar to view its sessions and interact with it.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // No mechas at all
  if (mechas.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="flex flex-col items-center gap-4 text-center">
          <BoxIcon className="size-12 text-muted-foreground" />
          <div>
            <h2 className="text-lg font-semibold mb-1">No Mechas Yet</h2>
            <p className="text-sm text-muted-foreground max-w-sm mb-4">
              Create your first mecha to get started, or use <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">mecha up &lt;path&gt;</code> from the CLI.
            </p>
            <Button asChild>
              <Link href="/create">
                <PlusIcon className="size-4 mr-1.5" />
                New Mecha
              </Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Mecha selected - show the active tab content
  return <MechaContent />;
}

function MechaContent() {
  const activeTab = useDashboardStore((s) => s.activeTab);
  const selectedMechaId = useDashboardStore((s) => s.selectedMechaId);
  const selectedSessionId = useDashboardStore((s) => s.selectedSessionId);
  const mechas = useDashboardStore((s) => s.mechas);

  if (!selectedMechaId) return null;

  const mecha = mechas.find((m) => m.id === selectedMechaId);
  if (!mecha) return null;

  const isRunning = mecha.state === "running";

  // Lazy import the tab content components
  switch (activeTab) {
    case "chat":
      return <ChatTab mechaId={selectedMechaId} sessionId={selectedSessionId} isRunning={isRunning} />;
    case "overview":
      return <OverviewTab mechaId={selectedMechaId} isRunning={isRunning} />;
    case "terminal":
      return <TerminalTab mechaId={selectedMechaId} isRunning={isRunning} />;
    case "inspect":
      return <InspectTab mechaId={selectedMechaId} />;
    default:
      return null;
  }
}

// Inline tab components that use existing components

import { MechaChat } from "@/components/MechaChat";
import { MechaOverview } from "@/components/overview/MechaOverview";
import { TerminalPanel } from "@/components/terminal/TerminalPanel";
import { InspectPanel } from "@/components/inspect/InspectPanel";
import { useDashboardStore as useStore } from "@/lib/store";
import { useCallback } from "react";

function ChatTab({ mechaId, sessionId, isRunning }: { mechaId: string; sessionId: string | null; isRunning: boolean }) {
  const setSessions = useStore((s) => s.setSessions);

  const handleStreamComplete = useCallback(async () => {
    try {
      const res = await fetch(`/api/mechas/${mechaId}/sessions`);
      if (res.ok) {
        const data = await res.json();
        setSessions(mechaId, data);
      }
    } catch { /* ignore */ }
  }, [mechaId, setSessions]);

  if (!isRunning) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <p className="text-sm text-muted-foreground">
          Start the mecha to chat with it.
        </p>
      </div>
    );
  }

  if (!sessionId) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <p className="text-sm text-muted-foreground">
          Creating session...
        </p>
      </div>
    );
  }

  return (
    <div className="h-full">
      <MechaChat
        key={sessionId}
        mechaId={mechaId}
        sessionId={sessionId}
        onStreamComplete={handleStreamComplete}
      />
    </div>
  );
}

function OverviewTab({ mechaId, isRunning }: { mechaId: string; isRunning: boolean }) {
  return <MechaOverview mechaId={mechaId} isRunning={isRunning} />;
}

function TerminalTab({ mechaId, isRunning }: { mechaId: string; isRunning: boolean }) {
  return <TerminalPanel mechaId={mechaId} isRunning={isRunning} />;
}

function InspectTab({ mechaId }: { mechaId: string }) {
  return <InspectPanel mechaId={mechaId} />;
}

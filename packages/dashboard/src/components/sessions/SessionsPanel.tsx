"use client";

import { useCallback, useEffect, useState } from "react";
import { PlusIcon } from "lucide-react";
import { TooltipIconButton } from "@/components/assistant-ui/tooltip-icon-button";
import { ScrollArea } from "@/components/ui/scroll-area";

import { Skeleton } from "@/components/ui/skeleton";
import { SessionItem } from "./SessionItem";
import { SessionSearch } from "./SessionSearch";
import { SessionTabs } from "./SessionTabs";
import { useDashboardStore, type Session } from "@/lib/store";

export function SessionsPanel() {
  const selectedMechaId = useDashboardStore((s) => s.selectedMechaId);
  const mechas = useDashboardStore((s) => s.mechas);
  const sessions = useDashboardStore((s) => s.sessions);
  const setSessions = useDashboardStore((s) => s.setSessions);
  const addSession = useDashboardStore((s) => s.addSession);
  const selectedSessionId = useDashboardStore((s) => s.selectedSessionId);
  const setSelectedSessionId = useDashboardStore((s) => s.setSelectedSessionId);
  const activeTab = useDashboardStore((s) => s.activeTab);
  const setActiveTab = useDashboardStore((s) => s.setActiveTab);
  const searchQuery = useDashboardStore((s) => s.searchQuery);
  const setSearchQuery = useDashboardStore((s) => s.setSearchQuery);

  const [loading, setLoading] = useState(false);

  const selectedMecha = mechas.find((m) => m.id === selectedMechaId);
  const mechaSessions = selectedMechaId ? sessions[selectedMechaId] ?? [] : [];
  const isRunning = selectedMecha?.state === "running";

  const filteredSessions = searchQuery
    ? mechaSessions.filter(
        (s) =>
          s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          s.sessionId.includes(searchQuery),
      )
    : mechaSessions;

  const createSession = useCallback(async () => {
    if (!selectedMechaId) return;
    try {
      const res = await fetch(`/api/mechas/${selectedMechaId}/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        const session = await res.json();
        addSession(selectedMechaId, session);
        setSelectedSessionId(session.sessionId);
      }
    } catch { /* ignore */ }
  }, [selectedMechaId, addSession, setSelectedSessionId]);

  useEffect(() => {
    if (!selectedMechaId || !isRunning) return;
    const mechaId = selectedMechaId;
    const controller = new AbortController();

    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/mechas/${mechaId}/sessions`, {
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        if (!res.ok) return;
        const data = (await res.json()) as Session[];
        if (controller.signal.aborted) return;

        setSessions(mechaId, data);

        if (data.length > 0) {
          setSelectedSessionId(data[0].sessionId);
        } else {
          // No sessions — auto-create one
          const createRes = await fetch(`/api/mechas/${mechaId}/sessions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
            signal: controller.signal,
          });
          if (controller.signal.aborted || !createRes.ok) return;
          const session = await createRes.json();
          addSession(mechaId, session);
          setSelectedSessionId(session.sessionId);
        }
      } catch {
        // aborted or network error — ignore
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [selectedMechaId, isRunning, setSessions, addSession, setSelectedSessionId]);

  if (!selectedMechaId) {
    return (
      <div className="flex h-full w-60 flex-col border-r border-border bg-sidebar">
        <div className="flex items-center justify-between px-3 py-3">
          <span className="text-sm font-medium text-sidebar-foreground">Sessions</span>
        </div>
        <div className="flex flex-1 items-center justify-center px-4 text-center text-xs text-muted-foreground">
          Select a mecha from the rail to view sessions
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-60 flex-col border-r border-border bg-sidebar">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-3">
        <div className="flex flex-col min-w-0">
          <span className="text-sm font-medium text-sidebar-foreground truncate">
            {selectedMecha?.name || selectedMechaId}
          </span>
          <span className="text-xs text-muted-foreground truncate">
            {selectedMecha?.path || ""}
          </span>
        </div>
        {isRunning && (
          <TooltipIconButton tooltip="New session" variant="ghost" size="icon-xs" onClick={createSession}>
            <PlusIcon className="size-3.5" />
          </TooltipIconButton>
        )}
      </div>

      {/* Search */}
      {mechaSessions.length > 3 && (
        <div className="pt-2">
          <SessionSearch value={searchQuery} onChange={setSearchQuery} />
        </div>
      )}

      {/* Sessions list */}
      <ScrollArea className="flex-1 px-2 py-1">
        {loading ? (
          <div className="flex flex-col gap-2 p-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : filteredSessions.length === 0 && mechaSessions.length > 0 ? (
          <div className="p-3 text-xs text-muted-foreground text-center">
            No matching sessions
          </div>
        ) : (
          <div className="flex flex-col gap-0.5">
            {filteredSessions.map((s) => (
              <SessionItem
                key={s.sessionId}
                session={s}
                isActive={selectedSessionId === s.sessionId}
                onClick={() => setSelectedSessionId(s.sessionId)}
              />
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Tab switcher */}
      <SessionTabs activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { DownloadIcon, PlusIcon } from "lucide-react";
import { TooltipIconButton } from "@/components/assistant-ui/tooltip-icon-button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { Skeleton } from "@/components/ui/skeleton";
import { SessionItem } from "./SessionItem";
import { SessionSearch } from "./SessionSearch";
import { SessionTabs } from "./SessionTabs";
import { useDashboardStore, type Session } from "@/lib/store";

function parseDateStr(dateStr: string): Date {
  // SQLite datetime format "YYYY-MM-DD HH:MM:SS" → append T and Z for ISO
  const normalized = dateStr.includes("T") ? dateStr : dateStr.replace(" ", "T") + "Z";
  return new Date(normalized);
}

function getDateGroup(dateStr: string | null): string {
  if (!dateStr) return "Older";
  const date = parseDateStr(dateStr);
  if (isNaN(date.getTime())) return "Older";
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);

  if (date >= today) return "Today";
  if (date >= yesterday) return "Yesterday";
  if (date >= weekAgo) return "Previous 7 days";
  return "Older";
}

function groupSessions(sessions: Session[]): Array<{ label: string; sessions: Session[] }> {
  const order = ["Today", "Yesterday", "Previous 7 days", "Older"];
  const groups = new Map<string, Session[]>();

  for (const s of sessions) {
    const label = getDateGroup(s.lastMessageAt ?? s.createdAt);
    const arr = groups.get(label) ?? [];
    arr.push(s);
    groups.set(label, arr);
  }

  return order.filter((l) => groups.has(l)).map((label) => ({ label, sessions: groups.get(label)! }));
}

export function SessionsPanel() {
  const selectedMechaId = useDashboardStore((s) => s.selectedMechaId);
  const mechas = useDashboardStore((s) => s.mechas);
  const sessions = useDashboardStore((s) => s.sessions);
  const setSessions = useDashboardStore((s) => s.setSessions);
  const addSession = useDashboardStore((s) => s.addSession);
  const removeSession = useDashboardStore((s) => s.removeSession);
  const updateSession = useDashboardStore((s) => s.updateSession);
  const selectedSessionId = useDashboardStore((s) => s.selectedSessionId);
  const setSelectedSessionId = useDashboardStore((s) => s.setSelectedSessionId);
  const activeTab = useDashboardStore((s) => s.activeTab);
  const setActiveTab = useDashboardStore((s) => s.setActiveTab);
  const searchQuery = useDashboardStore((s) => s.searchQuery);
  const setSearchQuery = useDashboardStore((s) => s.setSearchQuery);

  const [loading, setLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

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

  const grouped = groupSessions(filteredSessions);

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

  const handleRename = useCallback(async (sessionId: string, title: string) => {
    if (!selectedMechaId) return;
    try {
      const res = await fetch(`/api/mechas/${selectedMechaId}/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (res.ok) {
        const data = await res.json();
        updateSession(selectedMechaId, sessionId, { title: data.title ?? title });
      }
    } catch { /* network error — UI stays unchanged */ }
  }, [selectedMechaId, updateSession]);

  const handleDelete = useCallback(async () => {
    if (!selectedMechaId || !confirmDelete) return;
    const sessionId = confirmDelete;
    setConfirmDelete(null);
    try {
      const res = await fetch(`/api/mechas/${selectedMechaId}/sessions/${sessionId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        removeSession(selectedMechaId, sessionId);

        // If deleted session was active, select next or auto-create
        if (selectedSessionId === sessionId) {
          const remaining = mechaSessions.filter(
            (s) => s.sessionId !== sessionId,
          );
          if (remaining.length > 0) {
            setSelectedSessionId(remaining[0].sessionId);
          } else {
            createSession();
          }
        }
      }
    } catch { /* network error — no state change */ }
  }, [selectedMechaId, confirmDelete, removeSession, selectedSessionId, mechaSessions, setSelectedSessionId, createSession]);

  const handleImport = useCallback(async () => {
    if (!selectedMechaId) return;
    try {
      const res = await fetch(`/api/mechas/${selectedMechaId}/sessions/import`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        if (data.imported > 0) {
          // Re-fetch session list
          const listRes = await fetch(`/api/mechas/${selectedMechaId}/sessions`);
          if (listRes.ok) {
            const newSessions = await listRes.json();
            setSessions(selectedMechaId, newSessions);
          }
        }
      }
    } catch { /* ignore */ }
  }, [selectedMechaId, setSessions]);

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
          <div className="flex items-center gap-0.5 shrink-0">
            <TooltipIconButton tooltip="Import transcripts" variant="ghost" size="icon-xs" onClick={handleImport}>
              <DownloadIcon className="size-3.5" />
            </TooltipIconButton>
            <TooltipIconButton tooltip="New session" variant="ghost" size="icon-xs" onClick={createSession}>
              <PlusIcon className="size-3.5" />
            </TooltipIconButton>
          </div>
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
        ) : mechaSessions.length === 0 ? (
          <div className="flex flex-col items-center gap-3 p-4 text-center">
            <span className="text-xs text-muted-foreground">No sessions yet</span>
            {isRunning && (
              <Button variant="outline" size="sm" onClick={createSession} className="w-full sm:w-auto">
                Start a session
              </Button>
            )}
          </div>
        ) : filteredSessions.length === 0 ? (
          <div className="p-3 text-xs text-muted-foreground text-center">
            No matching sessions
          </div>
        ) : (
          <div className="flex flex-col gap-0.5">
            {grouped.map((group) => (
              <div key={group.label}>
                <div className="px-2 pt-3 pb-1 text-xs font-medium text-muted-foreground">
                  {group.label}
                </div>
                {group.sessions.map((s) => (
                  <SessionItem
                    key={s.sessionId}
                    session={s}
                    isActive={selectedSessionId === s.sessionId}
                    onClick={() => setSelectedSessionId(s.sessionId)}
                    onRename={handleRename}
                    onDelete={(sid) => setConfirmDelete(sid)}
                  />
                ))}
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Tab switcher */}
      <SessionTabs activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Delete confirmation dialog */}
      <Dialog open={!!confirmDelete} onOpenChange={(open) => { if (!open) setConfirmDelete(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Session</DialogTitle>
            <DialogDescription>
              This will permanently delete the session and all its messages. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

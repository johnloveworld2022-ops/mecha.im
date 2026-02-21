"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface SessionSummary {
  sessionId: string;
  title: string;
  state: "idle" | "busy";
  messageCount: number;
  lastMessageAt: string | null;
  createdAt: string;
}

export interface SessionPickerHandle {
  refreshSessions: () => void;
}

interface Props {
  mechaId: string;
  selectedSessionId: string | null;
  onSelectSession: (sessionId: string | null) => void;
}

export const SessionPicker = forwardRef<SessionPickerHandle, Props>(function SessionPicker({ mechaId, selectedSessionId, onSelectSession }, ref) {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch(`/api/mechas/${mechaId}/sessions`);
      if (!res.ok) {
        setError(`Error ${res.status}`);
        return;
      }
      const data = (await res.json()) as SessionSummary[];
      setSessions(data);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch sessions");
    } finally {
      setLoading(false);
    }
  }, [mechaId]);

  useImperativeHandle(ref, () => ({
    refreshSessions: () => { fetchSessions(); },
  }), [fetchSessions]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const createSession = useCallback(async () => {
    try {
      const res = await fetch(`/api/mechas/${mechaId}/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? `Error ${res.status}`);
        return;
      }
      const session = (await res.json()) as SessionSummary;
      setSessions((prev) => [session, ...prev]);
      onSelectSession(session.sessionId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create session");
    }
  }, [mechaId, onSelectSession]);

  const confirmDelete = useCallback(async () => {
    if (!pendingDeleteId) return;
    const sessionId = pendingDeleteId;
    setPendingDeleteId(null);
    try {
      const res = await fetch(`/api/mechas/${mechaId}/sessions/${sessionId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? `Error ${res.status}`);
        return;
      }
      setSessions((prev) => prev.filter((s) => s.sessionId !== sessionId));
      if (selectedSessionId === sessionId) {
        onSelectSession(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete session");
    }
  }, [pendingDeleteId, mechaId, selectedSessionId, onSelectSession]);

  if (loading) {
    return <div className="text-[13px] text-muted-foreground">Loading sessions...</div>;
  }

  return (
    <div className="mb-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[13px] text-muted-foreground">Sessions</span>
        <Button variant="outline" size="xs" onClick={createSession}>
          + New
        </Button>
        <Button
          variant={selectedSessionId === null ? "default" : "outline"}
          size="xs"
          onClick={() => onSelectSession(null)}
        >
          Stateless
        </Button>
      </div>

      {error && (
        <p className="text-xs text-destructive mb-2">{error}</p>
      )}

      {sessions.length > 0 && (
        <div className="flex gap-1.5 flex-wrap">
          {sessions.map((s) => {
            const isSelected = selectedSessionId === s.sessionId;
            return (
              <div
                key={s.sessionId}
                onClick={() => onSelectSession(s.sessionId)}
                className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono rounded cursor-pointer border ${
                  isSelected
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-foreground"
                }`}
              >
                <span className={`size-1.5 rounded-full shrink-0 ${
                  s.state === "busy" ? "bg-warning" : "bg-success"
                }`} />
                <span>{s.title || s.sessionId.slice(0, 8)}</span>
                <span className={`text-[10px] ${
                  isSelected ? "opacity-70" : "text-muted-foreground"
                }`}>
                  ({s.messageCount})
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); setPendingDeleteId(s.sessionId); }}
                  className={`bg-transparent border-none cursor-pointer text-xs leading-none px-0.5 ${
                    isSelected ? "text-primary-foreground/60" : "text-muted-foreground"
                  }`}
                  title="Delete session"
                >
                  x
                </button>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={!!pendingDeleteId} onOpenChange={(open) => { if (!open) setPendingDeleteId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Session</DialogTitle>
            <DialogDescription>
              Delete this session? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDeleteId(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
});

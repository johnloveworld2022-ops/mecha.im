"use client";

import { useCallback, useEffect, useState } from "react";

interface SessionSummary {
  sessionId: string;
  title: string;
  state: "idle" | "busy";
  messageCount: number;
  lastMessageAt: string | null;
  createdAt: string;
}

interface Props {
  mechaId: string;
  selectedSessionId: string | null;
  onSelectSession: (sessionId: string | null) => void;
}

export function SessionPicker({ mechaId, selectedSessionId, onSelectSession }: Props) {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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

  const deleteSession = useCallback(async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Delete this session?")) return;
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
  }, [mechaId, selectedSessionId, onSelectSession]);

  if (loading) {
    return <div style={{ fontSize: "13px", color: "var(--text-muted)" }}>Loading sessions...</div>;
  }

  return (
    <div style={{ marginBottom: "12px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
        <span style={{ fontSize: "13px", color: "var(--text-muted)" }}>Sessions</span>
        <button
          onClick={createSession}
          style={{
            padding: "3px 10px",
            fontSize: "12px",
            borderRadius: "4px",
            border: "1px solid var(--border)",
            backgroundColor: "var(--bg-primary)",
            color: "var(--text-primary)",
            cursor: "pointer",
          }}
        >
          + New
        </button>
        <button
          onClick={() => onSelectSession(null)}
          style={{
            padding: "3px 10px",
            fontSize: "12px",
            borderRadius: "4px",
            border: selectedSessionId === null ? "1px solid var(--accent)" : "1px solid var(--border)",
            backgroundColor: selectedSessionId === null ? "var(--accent)" : "var(--bg-primary)",
            color: selectedSessionId === null ? "#fff" : "var(--text-muted)",
            cursor: "pointer",
          }}
        >
          Stateless
        </button>
      </div>

      {error && (
        <p style={{ fontSize: "12px", color: "var(--danger)", marginBottom: "8px" }}>{error}</p>
      )}

      {sessions.length > 0 && (
        <div style={{
          display: "flex",
          gap: "6px",
          flexWrap: "wrap",
        }}>
          {sessions.map((s) => {
            const isSelected = selectedSessionId === s.sessionId;
            return (
              <div
                key={s.sessionId}
                onClick={() => onSelectSession(s.sessionId)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "4px 10px",
                  fontSize: "12px",
                  fontFamily: "monospace",
                  borderRadius: "4px",
                  border: isSelected ? "1px solid var(--accent)" : "1px solid var(--border)",
                  backgroundColor: isSelected ? "var(--accent)" : "var(--bg-primary)",
                  color: isSelected ? "#fff" : "var(--text-primary)",
                  cursor: "pointer",
                }}
              >
                <span style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  backgroundColor: s.state === "busy" ? "var(--warning)" : "var(--success)",
                  flexShrink: 0,
                }} />
                <span>{s.title || s.sessionId.slice(0, 8)}</span>
                <span style={{
                  fontSize: "10px",
                  color: isSelected ? "rgba(255,255,255,0.7)" : "var(--text-muted)",
                }}>
                  ({s.messageCount})
                </span>
                <button
                  onClick={(e) => deleteSession(s.sessionId, e)}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    fontSize: "12px",
                    color: isSelected ? "rgba(255,255,255,0.6)" : "var(--text-muted)",
                    padding: "0 2px",
                    lineHeight: 1,
                  }}
                  title="Delete session"
                >
                  x
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

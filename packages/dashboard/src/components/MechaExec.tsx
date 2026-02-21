"use client";

import { useCallback, useState } from "react";

interface ExecResult {
  exitCode: number;
  output: string;
}

const MAX_DISPLAY_LEN = 100_000;

export function MechaExec({ mechaId }: { mechaId: string }) {
  const [command, setCommand] = useState("");
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<Array<{ cmd: string; result: ExecResult; ts: number }>>([]);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);

  const runCommand = useCallback(async () => {
    const cmd = command.trim();
    if (!cmd) return;
    setRunning(true);
    setError("");
    try {
      const res = await fetch(`/api/mechas/${mechaId}/exec`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cmd: ["/bin/sh", "-c", cmd] }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        setError(body.error ?? `Error ${res.status}`);
        return;
      }
      const result = await res.json() as ExecResult;
      setResults((prev) => [...prev, { cmd, result, ts: Date.now() }]);
      setHistory((prev) => {
        const next = prev.filter((h) => h !== cmd);
        next.unshift(cmd);
        return next.slice(0, 10);
      });
      setCommand("");
      setHistoryIdx(-1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to execute");
    } finally {
      setRunning(false);
    }
  }, [mechaId, command]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !running) {
      runCommand();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHistoryIdx((prev) => {
        const next = Math.min(prev + 1, history.length - 1);
        if (next >= 0 && history[next]) setCommand(history[next]);
        return next;
      });
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setHistoryIdx((prev) => {
        const next = prev - 1;
        if (next < 0) {
          setCommand("");
          return -1;
        }
        if (history[next]) setCommand(history[next]);
        return next;
      });
    }
  }, [running, runCommand, history]);

  return (
    <div>
      <div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
        <input
          type="text"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Enter command (e.g., ls -la)"
          disabled={running}
          style={{
            flex: 1,
            padding: "6px 10px",
            fontSize: "13px",
            fontFamily: "monospace",
            borderRadius: "4px",
            border: "1px solid var(--border)",
            backgroundColor: "var(--bg-primary)",
            color: "var(--text-primary)",
            outline: "none",
          }}
        />
        <button
          onClick={runCommand}
          disabled={running || !command.trim()}
          style={{
            padding: "6px 14px",
            fontSize: "13px",
            borderRadius: "4px",
            border: "none",
            backgroundColor: "var(--accent)",
            color: "#fff",
            cursor: running || !command.trim() ? "not-allowed" : "pointer",
            opacity: running || !command.trim() ? 0.5 : 1,
          }}
        >
          {running ? "Running..." : "Run"}
        </button>
      </div>
      {error && (
        <p style={{ fontSize: "13px", color: "var(--danger)", marginBottom: "8px" }}>{error}</p>
      )}
      {results.length > 0 && (
        <div style={{
          padding: "12px",
          backgroundColor: "var(--bg-primary)",
          border: "1px solid var(--border)",
          borderRadius: "6px",
          maxHeight: "400px",
          overflow: "auto",
          fontFamily: "monospace",
          fontSize: "12px",
        }}>
          {results.map((r) => (
            <div key={r.ts} style={{ marginBottom: "12px" }}>
              <div style={{ color: "var(--accent)", marginBottom: "4px" }}>
                $ {r.cmd}
              </div>
              <pre style={{
                margin: 0,
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
                color: r.result.exitCode === 0 ? "var(--text-primary)" : "var(--danger)",
              }}>
                {r.result.output.length > MAX_DISPLAY_LEN
                  ? r.result.output.slice(0, MAX_DISPLAY_LEN) + "\n... (output truncated)"
                  : r.result.output || "(no output)"}
              </pre>
              {r.result.exitCode !== 0 && (
                <div style={{ color: "var(--warning)", fontSize: "11px", marginTop: "2px" }}>
                  exit code: {r.result.exitCode}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

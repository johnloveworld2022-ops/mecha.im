"use client";

import { useCallback, useState } from "react";

interface PruneResult {
  removedContainers: string[];
  removedVolumes: string[];
}

export function PruneButton({ prunableCount, onPruned }: { prunableCount: number; onPruned: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [volumes, setVolumes] = useState(false);
  const [pruning, setPruning] = useState(false);
  const [result, setResult] = useState<PruneResult | null>(null);
  const [error, setError] = useState("");

  const doPrune = useCallback(async () => {
    setConfirming(false);
    setPruning(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/prune", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ volumes }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        setError(body.error ?? `Error ${res.status}`);
        return;
      }
      const data = await res.json() as PruneResult;
      setResult(data);
      onPruned();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to prune");
    } finally {
      setPruning(false);
    }
  }, [volumes, onPruned]);

  return (
    <>
      <button
        onClick={() => {
          setResult(null);
          setError("");
          setConfirming(true);
        }}
        disabled={pruning || prunableCount === 0}
        style={{
          padding: "6px 14px",
          fontSize: "13px",
          borderRadius: "6px",
          border: "1px solid var(--warning)",
          backgroundColor: "transparent",
          color: "var(--warning)",
          cursor: pruning || prunableCount === 0 ? "not-allowed" : "pointer",
          opacity: pruning || prunableCount === 0 ? 0.5 : 1,
        }}
      >
        {pruning ? "Pruning..." : "Prune"}
      </button>

      {result && (
        <span style={{ fontSize: "12px", color: "var(--success)", marginLeft: "8px" }}>
          Removed {result.removedContainers.length} container(s)
          {result.removedVolumes.length > 0 && `, ${result.removedVolumes.length} volume(s)`}
        </span>
      )}
      {error && (
        <span style={{ fontSize: "12px", color: "var(--danger)", marginLeft: "8px" }}>{error}</span>
      )}

      {confirming && (
        <div
          onClick={() => setConfirming(false)}
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: "var(--bg-secondary)",
              border: "1px solid var(--border)",
              borderRadius: "12px",
              padding: "24px",
              maxWidth: "400px",
              width: "90%",
            }}
          >
            <h3 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "8px" }}>Prune Mechas</h3>
            <p style={{ fontSize: "14px", color: "var(--text-muted)", marginBottom: "12px" }}>
              Remove {prunableCount} stopped/exited container(s)?
            </p>
            <label style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              fontSize: "13px",
              color: "var(--text-muted)",
              marginBottom: "16px",
              cursor: "pointer",
            }}>
              <input
                type="checkbox"
                checked={volumes}
                onChange={(e) => setVolumes(e.target.checked)}
              />
              Also remove state volumes
            </label>
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <button
                onClick={() => setConfirming(false)}
                style={{
                  padding: "8px 16px",
                  fontSize: "13px",
                  borderRadius: "6px",
                  border: "1px solid var(--border)",
                  backgroundColor: "transparent",
                  color: "var(--text)",
                  cursor: "pointer",
                }}
              >Cancel</button>
              <button
                onClick={doPrune}
                style={{
                  padding: "8px 16px",
                  fontSize: "13px",
                  borderRadius: "6px",
                  border: "none",
                  backgroundColor: "var(--warning)",
                  color: "#fff",
                  cursor: "pointer",
                }}
              >Prune</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";

interface UpdateResult {
  id: string;
  image: string;
  previousImage: string;
}

export function MechaUpdate({ mechaId }: { mechaId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [noPull, setNoPull] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [result, setResult] = useState<UpdateResult | null>(null);
  const [error, setError] = useState("");

  const doUpdate = useCallback(async () => {
    setConfirming(false);
    setUpdating(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch(`/api/mechas/${mechaId}/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ noPull }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        setError(body.error ?? `Error ${res.status}`);
        return;
      }
      const data = await res.json() as UpdateResult;
      setResult(data);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setUpdating(false);
    }
  }, [mechaId, noPull, router]);

  return (
    <>
      <button
        onClick={() => setConfirming(true)}
        disabled={updating}
        style={{
          padding: "4px 10px",
          fontSize: "12px",
          borderRadius: "4px",
          border: "1px solid var(--accent)",
          backgroundColor: "transparent",
          color: "var(--accent)",
          cursor: updating ? "not-allowed" : "pointer",
          opacity: updating ? 0.5 : 1,
        }}
      >
        {updating ? "Updating..." : "Update"}
      </button>

      {result && (
        <span style={{ fontSize: "12px", color: "var(--success)", marginLeft: "8px" }}>
          {result.previousImage} → {result.image}
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
            <h3 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "8px" }}>Update Mecha</h3>
            <p style={{ fontSize: "14px", color: "var(--text-muted)", marginBottom: "12px" }}>
              This will pull the latest image, stop the container, recreate it, and start it again.
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
                checked={noPull}
                onChange={(e) => setNoPull(e.target.checked)}
              />
              Skip image pull (use local image)
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
                onClick={doUpdate}
                style={{
                  padding: "8px 16px",
                  fontSize: "13px",
                  borderRadius: "6px",
                  border: "none",
                  backgroundColor: "var(--accent)",
                  color: "#fff",
                  cursor: "pointer",
                }}
              >Update</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

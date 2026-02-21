"use client";

import { useCallback, useEffect, useState } from "react";

interface EnvEntry {
  key: string;
  value: string;
}

export function MechaEnv({ mechaId }: { mechaId: string }) {
  const [env, setEnv] = useState<EnvEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showSecrets, setShowSecrets] = useState(false);

  const fetchEnv = useCallback(async () => {
    setError("");
    try {
      const url = `/api/mechas/${mechaId}/env${showSecrets ? "?showSecrets=true" : ""}`;
      const res = await fetch(url);
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        setError(body.error ?? `Error ${res.status}`);
        return;
      }
      const data = await res.json() as { env: EnvEntry[] };
      setEnv(data.env);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch");
    } finally {
      setLoading(false);
    }
  }, [mechaId, showSecrets]);

  useEffect(() => {
    fetchEnv();
  }, [fetchEnv]);

  if (loading) {
    return <p style={{ color: "var(--text-muted)", fontSize: "13px" }}>Loading environment...</p>;
  }

  if (error) {
    return <p style={{ color: "var(--danger)", fontSize: "13px" }}>{error}</p>;
  }

  return (
    <div>
      <label style={{
        display: "flex",
        alignItems: "center",
        gap: "6px",
        fontSize: "12px",
        color: "var(--text-muted)",
        marginBottom: "8px",
        cursor: "pointer",
      }}>
        <input
          type="checkbox"
          checked={showSecrets}
          onChange={(e) => setShowSecrets(e.target.checked)}
        />
        Show secrets
      </label>
      {env.length === 0 ? (
        <p style={{ color: "var(--text-muted)", fontSize: "13px" }}>No environment variables.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: "13px",
          }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <th style={{ padding: "8px 12px", textAlign: "left", color: "var(--text-muted)", fontWeight: 500 }}>Key</th>
                <th style={{ padding: "8px 12px", textAlign: "left", color: "var(--text-muted)", fontWeight: 500 }}>Value</th>
              </tr>
            </thead>
            <tbody>
              {env.map((e) => (
                <tr key={e.key} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "8px 12px", fontFamily: "monospace", whiteSpace: "nowrap" }}>{e.key}</td>
                  <td style={{
                    padding: "8px 12px",
                    fontFamily: "monospace",
                    maxWidth: "400px",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    color: e.value === "***" ? "var(--text-muted)" : "var(--text-primary)",
                  }}>{e.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

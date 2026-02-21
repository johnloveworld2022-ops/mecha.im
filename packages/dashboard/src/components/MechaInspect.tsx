"use client";

import { useCallback, useState } from "react";

export function MechaInspect({ mechaId }: { mechaId: string }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const fetchInspect = useCallback(async () => {
    if (data) {
      setOpen((o) => !o);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/mechas/${mechaId}/inspect`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        setError(body.error ?? `Error ${res.status}`);
        return;
      }
      const json = await res.json();
      setData(JSON.stringify(json, null, 2));
      setOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch");
    } finally {
      setLoading(false);
    }
  }, [mechaId, data]);

  const copyToClipboard = useCallback(() => {
    if (!data) return;
    navigator.clipboard.writeText(data).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [data]);

  return (
    <div>
      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
        <button
          onClick={fetchInspect}
          disabled={loading}
          style={{
            padding: "4px 10px",
            fontSize: "12px",
            borderRadius: "4px",
            border: "1px solid var(--border)",
            backgroundColor: "transparent",
            color: "var(--text-muted)",
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.5 : 1,
          }}
        >
          {loading ? "Loading..." : open ? "Hide raw JSON" : "Show raw JSON"}
        </button>
        {open && data && (
          <button
            onClick={copyToClipboard}
            style={{
              padding: "4px 10px",
              fontSize: "12px",
              borderRadius: "4px",
              border: "1px solid var(--border)",
              backgroundColor: "transparent",
              color: "var(--text-muted)",
              cursor: "pointer",
            }}
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        )}
      </div>
      {error && (
        <p style={{ fontSize: "13px", color: "var(--danger)", marginTop: "8px" }}>{error}</p>
      )}
      {open && data && (
        <pre style={{
          marginTop: "8px",
          padding: "12px",
          fontSize: "12px",
          fontFamily: "monospace",
          backgroundColor: "var(--bg-primary)",
          border: "1px solid var(--border)",
          borderRadius: "6px",
          overflow: "auto",
          maxHeight: "500px",
          whiteSpace: "pre-wrap",
          wordBreak: "break-all",
          color: "var(--text-primary)",
        }}>
          {data}
        </pre>
      )}
    </div>
  );
}

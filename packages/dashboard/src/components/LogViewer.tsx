"use client";

import { useEffect, useRef, useState } from "react";

export function LogViewer({ mechaId }: { mechaId: string }) {
  const [lines, setLines] = useState<string[]>([]);
  const [connected, setConnected] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const es = new EventSource(`/api/mechas/${mechaId}/logs?tail=200`);

    es.onopen = () => setConnected(true);
    es.onmessage = (e) => {
      setLines((prev) => [...prev.slice(-999), e.data]);
    };
    es.onerror = () => {
      setConnected(false);
      es.close();
    };

    return () => es.close();
  }, [mechaId]);

  useEffect(() => {
    const el = containerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        fontSize: "13px",
        color: "var(--text-muted)",
      }}>
        <span style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          backgroundColor: connected ? "var(--success)" : "var(--danger)",
        }} />
        {connected ? "Streaming logs" : "Disconnected"}
      </div>
      <div
        ref={containerRef}
        style={{
          height: "400px",
          overflowY: "auto",
          backgroundColor: "#000",
          borderRadius: "8px",
          padding: "12px",
          fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
          fontSize: "12px",
          lineHeight: "1.6",
          color: "#ccc",
          border: "1px solid var(--border)",
        }}
      >
        {lines.length === 0 ? (
          <span style={{ color: "var(--text-muted)" }}>Waiting for logs...</span>
        ) : (
          lines.map((line, i) => <div key={i}>{line}</div>)
        )}
      </div>
    </div>
  );
}

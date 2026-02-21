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
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
        <span className={`size-2 rounded-full ${connected ? "bg-success" : "bg-destructive"}`} />
        {connected ? "Streaming logs" : "Disconnected"}
      </div>
      <div
        ref={containerRef}
        className="h-[400px] overflow-y-auto bg-black rounded-lg p-3 font-mono text-xs leading-relaxed text-[#ccc] border border-border"
      >
        {lines.length === 0 ? (
          <span className="text-muted-foreground">Waiting for logs...</span>
        ) : (
          lines.map((line, i) => <div key={i}>{line}</div>)
        )}
      </div>
    </div>
  );
}

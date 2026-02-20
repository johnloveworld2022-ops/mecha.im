"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

interface Mecha {
  id: string;
  state: string;
  path: string;
  ports: Array<{ PublicPort?: number }>;
}

export function MechaList() {
  const [mechas, setMechas] = useState<Mecha[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);

  const fetchMechas = useCallback(async () => {
    try {
      const res = await fetch("/api/mechas");
      if (res.ok) setMechas(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMechas();
    let interval = setInterval(fetchMechas, 5000);

    // Pause polling when tab is hidden
    function onVisibilityChange() {
      if (document.hidden) {
        clearInterval(interval);
      } else {
        fetchMechas();
        interval = setInterval(fetchMechas, 5000);
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [fetchMechas]);

  async function action(id: string, act: string, method = "POST") {
    setActing(id);
    try {
      await fetch(`/api/mechas/${id}/${act}`, { method });
      await fetchMechas();
    } finally {
      setActing(null);
    }
  }

  async function removeMecha(id: string) {
    setActing(id);
    try {
      await fetch(`/api/mechas/${id}`, { method: "DELETE" });
      await fetchMechas();
    } finally {
      setActing(null);
    }
  }

  if (loading) {
    return <p style={{ color: "var(--text-muted)", padding: "20px" }}>Loading...</p>;
  }

  if (mechas.length === 0) {
    return (
      <div style={{
        padding: "40px 20px",
        textAlign: "center",
        color: "var(--text-muted)",
        fontSize: "14px",
      }}>
        No mechas running. Use <code>mecha up &lt;path&gt;</code> to create one.
      </div>
    );
  }

  const stateColor = (state: string) => {
    if (state === "running") return "var(--success)";
    if (state === "exited" || state === "dead") return "var(--danger)";
    return "var(--warning)";
  };

  const btnStyle = (color: string, disabled: boolean): React.CSSProperties => ({
    padding: "4px 10px",
    fontSize: "12px",
    borderRadius: "4px",
    border: "1px solid " + color,
    backgroundColor: "transparent",
    color,
    opacity: disabled ? 0.4 : 1,
    cursor: disabled ? "not-allowed" : "pointer",
  });

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{
        width: "100%",
        borderCollapse: "collapse",
        fontSize: "13px",
      }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--border)" }}>
            {["ID", "State", "Port", "Path", "Actions"].map((h) => (
              <th key={h} style={{
                padding: "10px 12px",
                textAlign: "left",
                color: "var(--text-muted)",
                fontWeight: 500,
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {mechas.map((m) => {
            const port = m.ports.find((p) => p.PublicPort)?.PublicPort;
            const isActing = acting === m.id;
            const isRunning = m.state === "running";
            return (
              <tr key={m.id} style={{ borderBottom: "1px solid var(--border)" }}>
                <td style={{ padding: "10px 12px" }}>
                  <Link href={`/mechas/${m.id}`} style={{ fontFamily: "monospace" }}>
                    {m.id}
                  </Link>
                </td>
                <td style={{ padding: "10px 12px" }}>
                  <span style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                  }}>
                    <span style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      backgroundColor: stateColor(m.state),
                    }} />
                    {m.state}
                  </span>
                </td>
                <td style={{ padding: "10px 12px", fontFamily: "monospace" }}>
                  {port ?? "—"}
                </td>
                <td style={{
                  padding: "10px 12px",
                  maxWidth: "200px",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  color: "var(--text-muted)",
                }}>
                  {m.path}
                </td>
                <td style={{ padding: "10px 12px" }}>
                  <div style={{ display: "flex", gap: "6px" }}>
                    {!isRunning && (
                      <button
                        disabled={isActing}
                        onClick={() => action(m.id, "start")}
                        style={btnStyle("var(--success)", isActing)}
                      >Start</button>
                    )}
                    {isRunning && (
                      <button
                        disabled={isActing}
                        onClick={() => action(m.id, "stop")}
                        style={btnStyle("var(--warning)", isActing)}
                      >Stop</button>
                    )}
                    <button
                      disabled={isActing}
                      onClick={() => action(m.id, "restart")}
                      style={btnStyle("var(--accent)", isActing)}
                    >Restart</button>
                    <button
                      disabled={isActing}
                      onClick={() => removeMecha(m.id)}
                      style={btnStyle("var(--danger)", isActing)}
                    >Remove</button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

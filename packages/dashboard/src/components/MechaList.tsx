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
  const [showCreate, setShowCreate] = useState(false);
  const [createPath, setCreatePath] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [claudeToken, setClaudeToken] = useState("");
  const [otp, setOtp] = useState("");
  const [permissionMode, setPermissionMode] = useState("default");

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

  async function createMecha(e: React.FormEvent) {
    e.preventDefault();
    if (!createPath.trim()) return;
    setCreating(true);
    setCreateError("");
    try {
      const res = await fetch("/api/mechas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: createPath.trim(),
          ...(claudeToken && { claudeToken }),
          ...(otp && { otp }),
          ...(permissionMode !== "default" && { permissionMode }),
        }),
      });
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        setCreateError(data.error ?? `Error ${res.status}`);
        return;
      }
      setCreatePath("");
      setClaudeToken("");
      setOtp("");
      setPermissionMode("default");
      setShowCreate(false);
      await fetchMechas();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create");
    } finally {
      setCreating(false);
    }
  }

  if (loading) {
    return <p style={{ color: "var(--text-muted)", padding: "20px" }}>Loading...</p>;
  }

  const createButton = (
    <button
      onClick={() => setShowCreate(!showCreate)}
      style={{
        padding: "6px 14px",
        fontSize: "13px",
        borderRadius: "6px",
        border: "1px solid var(--accent)",
        backgroundColor: showCreate ? "var(--accent)" : "transparent",
        color: showCreate ? "#fff" : "var(--accent)",
        cursor: "pointer",
      }}
    >
      {showCreate ? "Cancel" : "+ New Mecha"}
    </button>
  );

  const inputStyle: React.CSSProperties = {
    flex: 1,
    padding: "6px 10px",
    fontSize: "13px",
    fontFamily: "monospace",
    borderRadius: "4px",
    border: "1px solid var(--border)",
    backgroundColor: "var(--bg-primary)",
    color: "var(--text-primary)",
    outline: "none",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: "13px",
    color: "var(--text-muted)",
    whiteSpace: "nowrap",
    minWidth: "110px",
  };

  const createForm = showCreate && (
    <form onSubmit={createMecha} style={{
      display: "flex",
      flexDirection: "column",
      gap: "8px",
      padding: "12px",
      marginBottom: "12px",
      borderRadius: "8px",
      border: "1px solid var(--border)",
      backgroundColor: "var(--bg-secondary)",
    }}>
      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
        <label htmlFor="create-path" style={labelStyle}>Project path:</label>
        <input
          id="create-path"
          type="text"
          value={createPath}
          onChange={(e) => setCreatePath(e.target.value)}
          placeholder="/path/to/project"
          disabled={creating}
          style={inputStyle}
        />
      </div>
      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
        <label htmlFor="create-claude-token" style={labelStyle}>Claude Token:</label>
        <input
          id="create-claude-token"
          type="password"
          value={claudeToken}
          onChange={(e) => setClaudeToken(e.target.value)}
          placeholder="Leave empty to use host default"
          disabled={creating}
          style={inputStyle}
        />
      </div>
      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
        <label htmlFor="create-otp" style={labelStyle}>OTP Secret:</label>
        <input
          id="create-otp"
          type="password"
          value={otp}
          onChange={(e) => setOtp(e.target.value)}
          placeholder="Leave empty to use host default"
          disabled={creating}
          style={inputStyle}
        />
      </div>
      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
        <label htmlFor="create-permission-mode" style={labelStyle}>Permission Mode:</label>
        <select
          id="create-permission-mode"
          value={permissionMode}
          onChange={(e) => setPermissionMode(e.target.value)}
          disabled={creating}
          style={{ ...inputStyle, fontFamily: "inherit" }}
        >
          <option value="default">default</option>
          <option value="plan">plan</option>
          <option value="full-auto">full-auto</option>
        </select>
      </div>
      <div style={{ display: "flex", gap: "8px", alignItems: "center", justifyContent: "flex-end" }}>
        {createError && (
          <span style={{ fontSize: "12px", color: "var(--danger)", marginRight: "auto" }}>{createError}</span>
        )}
        <button
          type="submit"
          disabled={creating || !createPath.trim()}
          style={{
            padding: "6px 14px",
            fontSize: "13px",
            borderRadius: "4px",
            border: "none",
            backgroundColor: "var(--accent)",
            color: "#fff",
            cursor: creating || !createPath.trim() ? "not-allowed" : "pointer",
            opacity: creating || !createPath.trim() ? 0.5 : 1,
          }}
        >
          {creating ? "Creating..." : "Create"}
        </button>
      </div>
    </form>
  );

  if (mechas.length === 0) {
    return (
      <div>
        <div style={{ marginBottom: "16px" }}>{createButton}</div>
        {createForm}
        <div style={{
          padding: "40px 20px",
          textAlign: "center",
          color: "var(--text-muted)",
          fontSize: "14px",
        }}>
          No mechas found. Click &quot;+ New Mecha&quot; or use <code>mecha up &lt;path&gt;</code> to create one.
        </div>
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
    <div>
      <div style={{ marginBottom: "12px" }}>{createButton}</div>
      {createForm}
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
    </div>
  );
}

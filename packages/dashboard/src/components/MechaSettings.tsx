"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function MechaSettings({ mechaId }: { mechaId: string }) {
  const router = useRouter();
  const [claudeToken, setClaudeToken] = useState("");
  const [otp, setOtp] = useState("");
  const [permissionMode, setPermissionMode] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const hasInput = claudeToken || otp || permissionMode;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!hasInput) return;

    setLoading(true);
    setMessage(null);

    const body: Record<string, string> = {};
    if (claudeToken) body.claudeToken = claudeToken;
    if (otp) body.otp = otp;
    if (permissionMode) body.permissionMode = permissionMode;

    try {
      const res = await fetch(`/api/mechas/${mechaId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Request failed" }));
        setMessage({ type: "error", text: data.error ?? `HTTP ${res.status}` });
        return;
      }

      setMessage({ type: "success", text: "Updated — container recreated" });
      setClaudeToken("");
      setOtp("");
      setPermissionMode("");
      router.refresh();
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Unknown error" });
    } finally {
      setLoading(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "8px 12px",
    fontSize: "13px",
    fontFamily: "monospace",
    borderRadius: "6px",
    border: "1px solid var(--border)",
    backgroundColor: "var(--bg-primary)",
    color: "var(--text-primary)",
    outline: "none",
    boxSizing: "border-box",
  };

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: "12px",
    color: "var(--text-muted)",
    marginBottom: "4px",
  };

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px", marginBottom: "12px" }}>
        <div>
          <label style={labelStyle}>Claude Token</label>
          <input
            type="password"
            placeholder="Leave empty to keep current"
            value={claudeToken}
            onChange={(e) => setClaudeToken(e.target.value)}
            style={inputStyle}
            disabled={loading}
          />
        </div>
        <div>
          <label style={labelStyle}>OTP Secret</label>
          <input
            type="password"
            placeholder="Leave empty to keep current"
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            style={inputStyle}
            disabled={loading}
          />
        </div>
        <div>
          <label style={labelStyle}>Permission Mode</label>
          <select
            value={permissionMode}
            onChange={(e) => setPermissionMode(e.target.value)}
            style={inputStyle}
            disabled={loading}
          >
            <option value="">Keep current</option>
            <option value="default">default</option>
            <option value="plan">plan</option>
            <option value="full-auto">full-auto</option>
          </select>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <button
          type="submit"
          disabled={!hasInput || loading}
          style={{
            padding: "6px 16px",
            fontSize: "13px",
            borderRadius: "6px",
            border: "1px solid var(--border)",
            backgroundColor: hasInput && !loading ? "var(--bg-secondary)" : "transparent",
            color: hasInput && !loading ? "var(--text-primary)" : "var(--text-muted)",
            cursor: hasInput && !loading ? "pointer" : "not-allowed",
          }}
        >
          {loading ? "Updating..." : "Update"}
        </button>

        {message && (
          <span style={{
            fontSize: "13px",
            color: message.type === "success" ? "var(--success)" : "var(--danger)",
          }}>
            {message.text}
          </span>
        )}
      </div>
    </form>
  );
}

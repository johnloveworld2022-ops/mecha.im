"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export function LoginForm() {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });

      if (!res.ok) {
        const data = await res.json() as { error?: string };
        setError(data.error ?? "Login failed");
        return;
      }

      router.push("/");
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      minHeight: "100vh",
    }}>
      <form
        onSubmit={handleSubmit}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "16px",
          width: "320px",
          padding: "32px",
          borderRadius: "12px",
          backgroundColor: "var(--bg-secondary)",
          border: "1px solid var(--border)",
        }}
      >
        <h1 style={{ fontSize: "20px", fontWeight: 600, textAlign: "center" }}>
          Mecha Dashboard
        </h1>
        <p style={{ fontSize: "14px", color: "var(--text-muted)", textAlign: "center" }}>
          Enter your 6-digit TOTP code
        </p>

        <label htmlFor="totp-code" className="sr-only" style={{
          position: "absolute",
          width: "1px",
          height: "1px",
          padding: 0,
          margin: "-1px",
          overflow: "hidden",
          clip: "rect(0,0,0,0)",
          border: 0,
        }}>
          TOTP code
        </label>
        <input
          id="totp-code"
          type="text"
          inputMode="numeric"
          pattern="[0-9]{6}"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          placeholder="000000"
          aria-label="6-digit TOTP code"
          autoFocus
          style={{
            padding: "12px 16px",
            fontSize: "24px",
            textAlign: "center",
            letterSpacing: "0.5em",
            borderRadius: "8px",
            border: "1px solid var(--border)",
            backgroundColor: "var(--bg)",
            color: "var(--text)",
            outline: "none",
          }}
        />

        {error && (
          <p style={{ color: "var(--danger)", fontSize: "13px", textAlign: "center" }}>
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={code.length !== 6 || loading}
          style={{
            padding: "10px",
            borderRadius: "8px",
            border: "none",
            backgroundColor: "var(--accent)",
            color: "#fff",
            fontSize: "14px",
            fontWeight: 500,
            opacity: code.length !== 6 || loading ? 0.5 : 1,
            cursor: code.length !== 6 || loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Verifying..." : "Login"}
        </button>
      </form>
    </div>
  );
}

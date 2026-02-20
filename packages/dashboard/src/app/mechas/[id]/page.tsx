import { inspectContainer } from "@mecha/docker";
import { containerName, ContainerNotFoundError, DEFAULTS } from "@mecha/core";
import type { MechaId } from "@mecha/core";
import { getDockerClient } from "@/lib/docker";
import { requireAuth } from "@/lib/require-auth";
import { notFound } from "next/navigation";
import Link from "next/link";
import { LogViewer } from "@/components/LogViewer";
import { MechaChat } from "@/components/MechaChat";

export default async function MechaDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAuth();

  const { id } = await params;
  const client = getDockerClient();
  const name = containerName(id as MechaId);

  let info;
  try {
    info = await inspectContainer(client, name);
  } catch (err) {
    if (err instanceof ContainerNotFoundError) notFound();
    throw err;
  }

  const state = info.State;
  const isRunning = state?.Running ?? false;
  const portBindings = info.NetworkSettings?.Ports?.[`${DEFAULTS.CONTAINER_PORT}/tcp`];
  const hostPort = portBindings?.[0]?.HostPort;
  const runtimeUrl = hostPort ? `http://localhost:${hostPort}` : null;

  const stateColor = isRunning ? "var(--success)" : "var(--danger)";

  return (
    <main style={{ maxWidth: "1200px", margin: "0 auto", padding: "24px" }}>
      <div style={{ marginBottom: "24px" }}>
        <Link href="/" style={{ fontSize: "13px", color: "var(--text-muted)" }}>
          &larr; Back to Dashboard
        </Link>
      </div>

      <div style={{
        display: "flex",
        alignItems: "center",
        gap: "12px",
        marginBottom: "24px",
      }}>
        <h1 style={{ fontSize: "20px", fontWeight: 600, fontFamily: "monospace" }}>{id}</h1>
        <span style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "6px",
          fontSize: "13px",
          padding: "3px 10px",
          borderRadius: "4px",
          border: `1px solid ${stateColor}`,
          color: stateColor,
        }}>
          <span style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            backgroundColor: stateColor,
          }} />
          {state?.Status ?? "unknown"}
        </span>
      </div>

      {/* Status card */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
        gap: "12px",
        marginBottom: "24px",
      }}>
        <InfoCard label="Container" value={name} />
        <InfoCard label="Image" value={info.Config?.Image ?? "—"} />
        <InfoCard label="Port" value={hostPort ? `:${hostPort}` : "—"} />
        <InfoCard label="Created" value={new Date(info.Created).toLocaleString()} />
        <InfoCard label="Path" value={info.Config?.Labels?.[`mecha.path`] ?? "—"} />
        <InfoCard
          label="PID"
          value={state?.Pid ? String(state.Pid) : "—"}
        />
      </div>

      {/* Chat with mecha */}
      {isRunning && (
        <section style={{ marginBottom: "24px" }}>
          <h2 style={{ fontSize: "16px", fontWeight: 500, marginBottom: "12px" }}>Chat</h2>
          <MechaChat mechaId={id} />
        </section>
      )}

      {/* Logs */}
      {isRunning && (
        <section>
          <h2 style={{ fontSize: "16px", fontWeight: 500, marginBottom: "12px" }}>Logs</h2>
          <LogViewer mechaId={id} />
        </section>
      )}

      {!isRunning && (
        <div style={{
          padding: "20px",
          textAlign: "center",
          color: "var(--text-muted)",
          fontSize: "14px",
          backgroundColor: "var(--bg-secondary)",
          borderRadius: "8px",
          border: "1px solid var(--border)",
        }}>
          Container is not running. Start it to view logs and chat.
        </div>
      )}
    </main>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      padding: "12px 16px",
      borderRadius: "8px",
      backgroundColor: "var(--bg-secondary)",
      border: "1px solid var(--border)",
    }}>
      <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "4px" }}>
        {label}
      </div>
      <div style={{
        fontSize: "13px",
        fontFamily: "monospace",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}>
        {value}
      </div>
    </div>
  );
}

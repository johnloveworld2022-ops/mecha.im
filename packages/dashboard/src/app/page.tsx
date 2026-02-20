import { MechaList } from "@/components/MechaList";
import { requireAuth } from "@/lib/require-auth";

export default async function DashboardHome() {
  await requireAuth();

  return (
    <main style={{
      maxWidth: "1200px",
      margin: "0 auto",
      padding: "24px",
    }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: "24px",
      }}>
        <h1 style={{ fontSize: "24px", fontWeight: 600 }}>Mecha Dashboard</h1>
        <DoctorBadge />
      </div>
      <MechaList />
    </main>
  );
}

async function DoctorBadge() {
  let healthy = false;
  try {
    const { ping } = await import("@mecha/docker");
    const { getDockerClient } = await import("@/lib/docker");
    await ping(getDockerClient());
    healthy = true;
  } catch { /* ignore */ }

  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      gap: "6px",
      fontSize: "12px",
      color: healthy ? "var(--success)" : "var(--danger)",
      padding: "4px 10px",
      borderRadius: "4px",
      border: `1px solid ${healthy ? "var(--success)" : "var(--danger)"}`,
    }}>
      <span style={{
        width: 6,
        height: 6,
        borderRadius: "50%",
        backgroundColor: healthy ? "var(--success)" : "var(--danger)",
      }} />
      Docker {healthy ? "connected" : "unavailable"}
    </span>
  );
}

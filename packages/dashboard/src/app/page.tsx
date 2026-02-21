import { MechaList } from "@/components/MechaList";
import { ThemeToggle } from "@/components/ThemeToggle";
import { requireAuth } from "@/lib/require-auth";

export default async function DashboardHome() {
  await requireAuth();

  return (
    <main className="mx-auto max-w-[1200px] p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Mecha Dashboard</h1>
        <div className="flex items-center gap-2">
          <DoctorBadge />
          <ThemeToggle />
        </div>
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
    <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded border ${
      healthy
        ? "text-success border-success"
        : "text-destructive border-destructive"
    }`}>
      <span className={`size-1.5 rounded-full ${
        healthy ? "bg-success" : "bg-destructive"
      }`} />
      Docker {healthy ? "connected" : "unavailable"}
    </span>
  );
}

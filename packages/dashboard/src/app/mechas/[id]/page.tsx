import { inspectContainer } from "@mecha/docker";
import { containerName, ContainerNotFoundError, DEFAULTS } from "@mecha/core";
import type { MechaId } from "@mecha/core";
import { getDockerClient } from "@/lib/docker";
import { requireAuth } from "@/lib/require-auth";
import { notFound } from "next/navigation";
import Link from "next/link";
import { LogViewer } from "@/components/LogViewer";
import { MechaChatWithSessions } from "@/components/MechaChatWithSessions";
import { MechaSettings } from "@/components/MechaSettings";
import { MechaEnv } from "@/components/MechaEnv";
import { MechaExec } from "@/components/MechaExec";
import { MechaInspect } from "@/components/MechaInspect";
import { MechaUpdate } from "@/components/MechaUpdate";
import { ThemeToggle } from "@/components/ThemeToggle";

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

  return (
    <main className="mx-auto max-w-[1200px] p-6">
      <div className="flex items-center justify-between mb-6">
        <Link href="/" className="text-[13px] text-muted-foreground">
          &larr; Back to Dashboard
        </Link>
        <ThemeToggle />
      </div>

      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-xl font-semibold font-mono">{id}</h1>
        <span className={`inline-flex items-center gap-1.5 text-[13px] px-2.5 py-0.5 rounded border ${
          isRunning
            ? "border-success text-success"
            : "border-destructive text-destructive"
        }`}>
          <span className={`size-[7px] rounded-full ${
            isRunning ? "bg-success" : "bg-destructive"
          }`} />
          {state?.Status ?? "unknown"}
        </span>
        <MechaUpdate mechaId={id} />
      </div>

      {/* Chat with mecha */}
      {isRunning && (
        <Section title="Chat">
          <MechaChatWithSessions mechaId={id} />
        </Section>
      )}

      {/* Status cards */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3 mb-6">
        <InfoCard label="Container" value={name} />
        <InfoCard label="Image" value={info.Config?.Image ?? "\u2014"} />
        <InfoCard label="Port" value={hostPort ? `:${hostPort}` : "\u2014"} />
        <InfoCard label="Created" value={new Date(info.Created).toLocaleString()} />
        <InfoCard label="Path" value={info.Config?.Labels?.[`mecha.path`] ?? "\u2014"} />
        <InfoCard
          label="PID"
          value={state?.Pid ? String(state.Pid) : "\u2014"}
        />
      </div>

      {/* Settings */}
      <Section title="Settings">
        <div className="p-4 rounded-lg bg-card border border-border">
          <MechaSettings mechaId={id} />
        </div>
      </Section>

      {/* Environment */}
      <Section title="Environment">
        <div className="p-4 rounded-lg bg-card border border-border">
          <MechaEnv mechaId={id} />
        </div>
      </Section>

      {/* Execute Command (only when running) */}
      {isRunning && (
        <Section title="Execute Command">
          <div className="p-4 rounded-lg bg-card border border-border">
            <MechaExec mechaId={id} />
          </div>
        </Section>
      )}

      {/* Logs */}
      {isRunning && (
        <Section title="Logs">
          <LogViewer mechaId={id} />
        </Section>
      )}

      {/* Inspect */}
      <Section title="Inspect">
        <div className="p-4 rounded-lg bg-card border border-border">
          <MechaInspect mechaId={id} />
        </div>
      </Section>

      {!isRunning && (
        <div className="p-5 text-center text-muted-foreground text-sm bg-card rounded-lg border border-border">
          Container is not running. Start it to view logs, chat, and execute commands.
        </div>
      )}
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="text-base font-medium mb-3">{title}</h2>
      {children}
    </section>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-4 py-3 rounded-lg bg-card border border-border">
      <div className="text-[11px] text-muted-foreground mb-1">
        {label}
      </div>
      <div className="text-[13px] font-mono overflow-hidden text-ellipsis whitespace-nowrap">
        {value}
      </div>
    </div>
  );
}

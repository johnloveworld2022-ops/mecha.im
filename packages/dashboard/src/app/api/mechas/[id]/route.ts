import { NextResponse, type NextRequest } from "next/server";
import { inspectContainer, removeContainer } from "@mecha/docker";
import { containerName, ContainerNotFoundError } from "@mecha/core";
import type { MechaId } from "@mecha/core";
import { getDockerClient } from "@/lib/docker";
import { withAuth } from "@/lib/api-auth";

export const GET = withAuth(async (_request: NextRequest, { params }) => {
  const { id } = await params;
  const client = getDockerClient();
  const name = containerName(id as MechaId);

  try {
    const info = await inspectContainer(client, name);
    // Sanitize: omit Config.Env and other sensitive internals
    const portBindings = info.NetworkSettings?.Ports ?? {};
    return NextResponse.json({
      id,
      name: info.Name.replace(/^\//, ""),
      state: {
        status: info.State?.Status,
        running: info.State?.Running,
        pid: info.State?.Pid,
        startedAt: info.State?.StartedAt,
        finishedAt: info.State?.FinishedAt,
      },
      image: info.Config?.Image,
      labels: info.Config?.Labels,
      ports: portBindings,
      mounts: info.Mounts?.map((m) => ({
        type: m.Type,
        source: m.Source,
        destination: m.Destination,
        rw: m.RW,
      })),
      created: info.Created,
    });
  } catch (err) {
    if (err instanceof ContainerNotFoundError) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    throw err;
  }
});

export const DELETE = withAuth(async (_request: NextRequest, { params }) => {
  const { id } = await params;
  const client = getDockerClient();
  const name = containerName(id as MechaId);

  try {
    await removeContainer(client, name, true);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ContainerNotFoundError) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    throw err;
  }
});

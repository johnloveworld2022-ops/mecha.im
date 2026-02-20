import { NextResponse, type NextRequest } from "next/server";
import { stopContainer, startContainer } from "@mecha/docker";
import { containerName, ContainerNotFoundError } from "@mecha/core";
import type { MechaId } from "@mecha/core";
import { getDockerClient } from "@/lib/docker";
import { withAuth } from "@/lib/api-auth";
import { isConflictError, handleDockerError } from "@/lib/docker-errors";

export const POST = withAuth(async (_request: NextRequest, { params }) => {
  const { id } = await params;
  const client = getDockerClient();
  const name = containerName(id as MechaId);
  try {
    // Tolerate already-stopped containers
    try {
      await stopContainer(client, name);
    } catch (err) {
      if (!isConflictError(err)) {
        if (err instanceof ContainerNotFoundError) {
          return NextResponse.json({ error: "Not found" }, { status: 404 });
        }
        throw err;
      }
    }
    await startContainer(client, name);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleDockerError(err);
  }
});

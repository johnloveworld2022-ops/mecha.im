import { NextResponse, type NextRequest } from "next/server";
import { stopContainer } from "@mecha/docker";
import { containerName } from "@mecha/core";
import type { MechaId } from "@mecha/core";
import { getDockerClient } from "@/lib/docker";
import { withAuth } from "@/lib/api-auth";
import { handleDockerError } from "@/lib/docker-errors";

export const POST = withAuth(async (_request: NextRequest, { params }) => {
  const { id } = await params;
  const client = getDockerClient();
  const name = containerName(id as MechaId);
  try {
    await stopContainer(client, name);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleDockerError(err);
  }
});

import { NextResponse, type NextRequest } from "next/server";
import { mechaRestart } from "@mecha/service";
import { getDockerClient } from "@/lib/docker";
import { withAuth } from "@/lib/api-auth";
import { handleDockerError } from "@/lib/docker-errors";

export const POST = withAuth(async (_request: NextRequest, { params }) => {
  const { id } = await params;
  const client = getDockerClient();
  try {
    await mechaRestart(client, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleDockerError(err);
  }
});

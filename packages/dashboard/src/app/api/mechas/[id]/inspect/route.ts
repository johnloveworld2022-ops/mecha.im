import { NextResponse, type NextRequest } from "next/server";
import { mechaInspect } from "@mecha/service";
import { getDockerClient } from "@/lib/docker";
import { withAuth } from "@/lib/api-auth";
import { handleDockerError } from "@/lib/docker-errors";

export const GET = withAuth(async (_request: NextRequest, { params }) => {
  const { id } = await params;
  const client = getDockerClient();
  try {
    const data = await mechaInspect(client, id);
    return NextResponse.json(data);
  } catch (err) {
    return handleDockerError(err);
  }
});

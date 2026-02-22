import { NextResponse, type NextRequest } from "next/server";
import { mechaSessionImport } from "@mecha/service";
import { getDockerClient } from "@/lib/docker";
import { withAuth } from "@/lib/api-auth";
import { handleDockerError } from "@/lib/docker-errors";

export const POST = withAuth(async (_request: NextRequest, { params }) => {
  const { id } = await params;
  const client = getDockerClient();
  try {
    const result = await mechaSessionImport(client, { id });
    return NextResponse.json(result);
  } catch (err) {
    return handleDockerError(err);
  }
});

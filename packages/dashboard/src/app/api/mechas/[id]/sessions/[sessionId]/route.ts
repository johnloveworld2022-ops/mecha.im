import { NextResponse, type NextRequest } from "next/server";
import { mechaSessionGet, mechaSessionDelete } from "@mecha/service";
import { SessionNotFoundError, toHttpStatus, toSafeMessage } from "@mecha/contracts";
import { getDockerClient } from "@/lib/docker";
import { withAuth } from "@/lib/api-auth";
import { handleDockerError } from "@/lib/docker-errors";

export const GET = withAuth(async (request: NextRequest, { params }) => {
  const { id, sessionId } = await params;
  const limit = Number(request.nextUrl.searchParams.get("limit") ?? "50");
  const offset = Number(request.nextUrl.searchParams.get("offset") ?? "0");
  const client = getDockerClient();
  try {
    const session = await mechaSessionGet(client, { id, sessionId });
    return NextResponse.json(session);
  } catch (err) {
    if (err instanceof SessionNotFoundError) {
      return NextResponse.json({ error: toSafeMessage(err) }, { status: toHttpStatus(err) });
    }
    return handleDockerError(err);
  }
});

export const DELETE = withAuth(async (_request: NextRequest, { params }) => {
  const { id, sessionId } = await params;
  const client = getDockerClient();
  try {
    await mechaSessionDelete(client, { id, sessionId });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (err instanceof SessionNotFoundError) {
      return NextResponse.json({ error: toSafeMessage(err) }, { status: toHttpStatus(err) });
    }
    return handleDockerError(err);
  }
});

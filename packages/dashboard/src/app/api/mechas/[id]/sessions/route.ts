import { NextResponse, type NextRequest } from "next/server";
import { mechaSessionList, mechaSessionCreate } from "@mecha/service";
import { SessionNotFoundError, SessionCapReachedError, toHttpStatus, toSafeMessage } from "@mecha/contracts";
import { getDockerClient } from "@/lib/docker";
import { withAuth } from "@/lib/api-auth";
import { handleDockerError } from "@/lib/docker-errors";

export const GET = withAuth(async (_request: NextRequest, { params }) => {
  const { id } = await params;
  const client = getDockerClient();
  try {
    const sessions = await mechaSessionList(client, { id });
    return NextResponse.json(sessions);
  } catch (err) {
    if (err instanceof SessionNotFoundError) {
      return NextResponse.json({ error: toSafeMessage(err) }, { status: toHttpStatus(err) });
    }
    return handleDockerError(err);
  }
});

export const POST = withAuth(async (request: NextRequest, { params }) => {
  const { id } = await params;
  const client = getDockerClient();
  try {
    const body = (await request.json()) as { title?: string; config?: Record<string, unknown> };
    const session = await mechaSessionCreate(client, { id, title: body.title, config: body.config });
    return NextResponse.json(session, { status: 201 });
  } catch (err) {
    if (err instanceof SessionCapReachedError) {
      return NextResponse.json({ error: toSafeMessage(err) }, { status: toHttpStatus(err) });
    }
    return handleDockerError(err);
  }
});

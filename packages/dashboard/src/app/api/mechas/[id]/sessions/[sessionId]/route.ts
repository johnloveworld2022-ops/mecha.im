import { NextResponse, type NextRequest } from "next/server";
import { mechaSessionGet, mechaSessionDelete, mechaSessionRename } from "@mecha/service";
import { SessionNotFoundError, toHttpStatus, toSafeMessage } from "@mecha/contracts";
import { getDockerClient } from "@/lib/docker";
import { withAuth } from "@/lib/api-auth";
import { handleDockerError } from "@/lib/docker-errors";

export const GET = withAuth(async (_request: NextRequest, { params }) => {
  const { id, sessionId } = await params;
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

export const PATCH = withAuth(async (request: NextRequest, { params }) => {
  const { id, sessionId } = await params;
  const client = getDockerClient();

  let body: { title?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body || typeof body.title !== "string" || !body.title.trim()) {
    return NextResponse.json({ error: "Missing 'title' field" }, { status: 400 });
  }

  try {
    const session = await mechaSessionRename(client, { id, sessionId, title: body.title });
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

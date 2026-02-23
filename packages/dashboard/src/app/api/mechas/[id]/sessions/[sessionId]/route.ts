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

  let body: { title?: string; starred?: boolean };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body || (body.title === undefined && body.starred === undefined)) {
    return NextResponse.json({ error: "Missing 'title' or 'starred' field" }, { status: 400 });
  }

  // Validate title if provided
  if (body.title !== undefined && (typeof body.title !== "string" || !body.title.trim())) {
    return NextResponse.json({ error: "'title' must be a non-empty string" }, { status: 400 });
  }

  // Validate starred if provided
  if (body.starred !== undefined && typeof body.starred !== "boolean") {
    return NextResponse.json({ error: "'starred' must be a boolean" }, { status: 400 });
  }

  try {
    // Handle title rename
    if (typeof body.title === "string") {
      const result = await mechaSessionRename(client, { id, sessionId, title: body.title });
      // If only title was provided, return immediately
      if (body.starred === undefined) {
        return NextResponse.json(result);
      }
    }

    // Handle starred toggle via metadata
    if (body.starred !== undefined) {
      const { setSessionMeta } = await import("@mecha/core");
      setSessionMeta(id, sessionId, { starred: body.starred });
    }

    return NextResponse.json({ ok: true });
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

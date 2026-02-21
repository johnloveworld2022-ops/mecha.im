import { NextResponse, type NextRequest } from "next/server";
import { mechaSessionInterrupt } from "@mecha/service";
import { SessionNotFoundError, toHttpStatus, toSafeMessage } from "@mecha/contracts";
import { getDockerClient } from "@/lib/docker";
import { withAuth } from "@/lib/api-auth";
import { handleDockerError } from "@/lib/docker-errors";

export const POST = withAuth(async (_request: NextRequest, { params }) => {
  const { id, sessionId } = await params;
  const client = getDockerClient();
  try {
    const result = await mechaSessionInterrupt(client, { id, sessionId });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof SessionNotFoundError) {
      return NextResponse.json({ error: toSafeMessage(err) }, { status: toHttpStatus(err) });
    }
    return handleDockerError(err);
  }
});

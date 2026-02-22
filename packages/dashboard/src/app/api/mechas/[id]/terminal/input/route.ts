import { NextResponse, type NextRequest } from "next/server";
import { withAuth } from "@/lib/api-auth";
import { getSession } from "@/lib/terminal-sessions";

export const POST = withAuth(async (request: NextRequest) => {
  let body: { execId?: string; data?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { execId, data } = body;
  if (!execId || typeof data !== "string") {
    return NextResponse.json(
      { error: "Missing execId or data" },
      { status: 400 },
    );
  }

  const session = getSession(execId);
  if (!session) {
    return NextResponse.json(
      { error: "Session not found" },
      { status: 404 },
    );
  }

  session.stream.write(data);
  return NextResponse.json({ ok: true });
});

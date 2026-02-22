import { NextResponse, type NextRequest } from "next/server";
import { withAuth } from "@/lib/api-auth";
import { getSession } from "@/lib/terminal-sessions";

export const POST = withAuth(async (request: NextRequest) => {
  let body: { execId?: string; cols?: number; rows?: number };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { execId, cols, rows } = body;
  if (!execId || typeof cols !== "number" || typeof rows !== "number") {
    return NextResponse.json(
      { error: "Missing execId, cols, or rows" },
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

  try {
    await session.exec.resize({ h: rows, w: cols });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Resize failed" },
      { status: 500 },
    );
  }
});

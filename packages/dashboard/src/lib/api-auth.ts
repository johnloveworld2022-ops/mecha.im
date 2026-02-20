import { NextResponse, type NextRequest } from "next/server";
import { isAuthEnabled, getSessionFromCookies, validateSession } from "./auth";

type RouteHandler = (
  request: NextRequest,
  context: { params: Promise<Record<string, string>> },
) => Promise<NextResponse> | NextResponse;

export function withAuth(handler: RouteHandler): RouteHandler {
  return async (request, context) => {
    if (isAuthEnabled()) {
      const sessionId = await getSessionFromCookies();
      if (!sessionId || !validateSession(sessionId)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }
    return handler(request, context);
  };
}

import { NextResponse, type NextRequest } from "next/server";
import { isAuthEnabled, getSessionFromCookies, validateSession } from "./auth";

/** Returns true if authenticated, false otherwise */
export async function checkAuth(): Promise<boolean> {
  if (!isAuthEnabled()) return true;
  const sessionId = await getSessionFromCookies();
  return !!sessionId && validateSession(sessionId);
}

type RouteHandler = (
  request: NextRequest,
  context: { params: Promise<Record<string, string>> },
) => Promise<NextResponse> | NextResponse;

export function withAuth(handler: RouteHandler): RouteHandler {
  return async (request, context) => {
    if (!(await checkAuth())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return handler(request, context);
  };
}

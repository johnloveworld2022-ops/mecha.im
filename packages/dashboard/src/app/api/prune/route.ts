import { NextResponse, type NextRequest } from "next/server";
import { mechaPrune } from "@mecha/service";
import { toHttpStatus, toSafeMessage } from "@mecha/contracts";
import { getDockerClient } from "@/lib/docker";
import { withAuth } from "@/lib/api-auth";

export const POST = withAuth(async (request: NextRequest) => {
  let body: { volumes?: unknown } = {};
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const volumes = body.volumes === true;
  const client = getDockerClient();
  try {
    const result = await mechaPrune(client, { volumes });
    return NextResponse.json(result);
  } catch (err) {
    const status = toHttpStatus(err);
    return NextResponse.json({ error: toSafeMessage(err) }, { status });
  }
});

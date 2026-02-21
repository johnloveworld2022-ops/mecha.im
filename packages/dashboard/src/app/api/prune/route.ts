import { NextResponse, type NextRequest } from "next/server";
import { mechaPrune } from "@mecha/service";
import { getDockerClient } from "@/lib/docker";
import { withAuth } from "@/lib/api-auth";

export const POST = withAuth(async (request: NextRequest) => {
  let body: { volumes?: boolean } = {};
  try {
    body = await request.json() as typeof body;
  } catch {
    // empty body is fine, defaults apply
  }

  const client = getDockerClient();
  const result = await mechaPrune(client, { volumes: body.volumes });
  return NextResponse.json(result);
});

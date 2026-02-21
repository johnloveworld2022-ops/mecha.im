import { NextResponse, type NextRequest } from "next/server";
import { mechaUpdate } from "@mecha/service";
import { toHttpStatus, toSafeMessage } from "@mecha/contracts";
import { ContainerNotFoundError } from "@mecha/core";
import { getDockerClient } from "@/lib/docker";
import { withAuth } from "@/lib/api-auth";

export const POST = withAuth(async (request: NextRequest, { params }) => {
  const { id } = await params;

  let body: { noPull?: boolean } = {};
  try {
    body = await request.json() as typeof body;
  } catch {
    // empty body is fine, defaults apply
  }

  const client = getDockerClient();
  try {
    const result = await mechaUpdate(client, { id, noPull: body.noPull });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof ContainerNotFoundError) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const status = toHttpStatus(err);
    return NextResponse.json({ error: toSafeMessage(err) }, { status });
  }
});

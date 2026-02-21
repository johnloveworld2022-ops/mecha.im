import { NextResponse, type NextRequest } from "next/server";
import { mechaExec } from "@mecha/service";
import { MechaExecInput, toHttpStatus, toSafeMessage } from "@mecha/contracts";
import { ContainerNotFoundError } from "@mecha/core";
import { getDockerClient } from "@/lib/docker";
import { withAuth } from "@/lib/api-auth";

export const POST = withAuth(async (request: NextRequest, { params }) => {
  const { id } = await params;

  let body: { cmd?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = MechaExecInput.safeParse({ id, cmd: body.cmd });
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Validation failed" },
      { status: 400 },
    );
  }

  const client = getDockerClient();
  try {
    const result = await mechaExec(client, parsed.data);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof ContainerNotFoundError) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const status = toHttpStatus(err);
    return NextResponse.json({ error: toSafeMessage(err) }, { status });
  }
});

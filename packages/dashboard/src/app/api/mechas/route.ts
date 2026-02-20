import { NextResponse, type NextRequest } from "next/server";
import { mechaLs, mechaUp } from "@mecha/service";
import { toHttpStatus } from "@mecha/contracts";
import { getDockerClient } from "@/lib/docker";
import { withAuth } from "@/lib/api-auth";
import { getOtpSecret } from "@/lib/auth";

export const GET = withAuth(async () => {
  const client = getDockerClient();
  const items = await mechaLs(client);
  return NextResponse.json(items);
});

export const POST = withAuth(async (request: NextRequest) => {
  let body: { path?: string; env?: string[]; claudeToken?: string; otp?: string; permissionMode?: string };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const projectPath = body.path;
  if (!projectPath || typeof projectPath !== "string") {
    return NextResponse.json({ error: "Missing path" }, { status: 400 });
  }

  const client = getDockerClient();
  try {
    const result = await mechaUp(client, {
      projectPath,
      claudeToken: body.claudeToken || process.env["CLAUDE_CODE_OAUTH_TOKEN"],
      otp: body.otp || getOtpSecret(),
      permissionMode: body.permissionMode as "default" | "plan" | "full-auto" | undefined,
      env: body.env,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const status = toHttpStatus(err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status });
  }
});

import { NextResponse, type NextRequest } from "next/server";
import { mechaStatus, mechaConfigure, mechaRm } from "@mecha/service";
import { toHttpStatus, toSafeMessage } from "@mecha/contracts";
import { ContainerNotFoundError } from "@mecha/core";
import { getDockerClient } from "@/lib/docker";
import { withAuth } from "@/lib/api-auth";

export const GET = withAuth(async (_request: NextRequest, { params }) => {
  const { id } = await params;
  const client = getDockerClient();
  try {
    const status = await mechaStatus(client, id);
    return NextResponse.json(status);
  } catch (err) {
    if (err instanceof ContainerNotFoundError) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    throw err;
  }
});

export const PATCH = withAuth(async (request: NextRequest, { params }) => {
  const { id } = await params;
  const client = getDockerClient();

  let body: { claudeToken?: string; anthropicApiKey?: string; otp?: string; permissionMode?: string };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    await mechaConfigure(client, {
      id,
      claudeToken: body.claudeToken,
      anthropicApiKey: body.anthropicApiKey,
      otp: body.otp,
      permissionMode: body.permissionMode as "default" | "plan" | "full-auto" | undefined,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ContainerNotFoundError) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const status = toHttpStatus(err);
    return NextResponse.json({ error: toSafeMessage(err) }, { status });
  }
});

export const DELETE = withAuth(async (_request: NextRequest, { params }) => {
  const { id } = await params;
  const client = getDockerClient();
  try {
    await mechaRm(client, { id, force: true, withState: false });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ContainerNotFoundError) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    throw err;
  }
});

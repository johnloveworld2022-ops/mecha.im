import { NextResponse, type NextRequest } from "next/server";
import { mechaInspect } from "@mecha/service";
import { getDockerClient } from "@/lib/docker";
import { withAuth } from "@/lib/api-auth";
import { handleDockerError } from "@/lib/docker-errors";

const SENSITIVE_PATTERN = /(?:TOKEN|SECRET|PASSWORD|API_KEY|PRIVATE_KEY|CREDENTIAL|AUTH|OTP)/i;

function redactEnv(env: string[]): string[] {
  return env.map((entry) => {
    const eqIdx = entry.indexOf("=");
    if (eqIdx === -1) return entry;
    const key = entry.slice(0, eqIdx);
    if (SENSITIVE_PATTERN.test(key)) {
      return `${key}=***`;
    }
    return entry;
  });
}

function redactInspect(data: Record<string, unknown>): Record<string, unknown> {
  const clone = JSON.parse(JSON.stringify(data)) as Record<string, unknown>;
  const config = clone.Config as Record<string, unknown> | undefined;
  if (config?.Env && Array.isArray(config.Env)) {
    config.Env = redactEnv(config.Env as string[]);
  }
  return clone;
}

export const GET = withAuth(async (_request: NextRequest, { params }) => {
  const { id } = await params;
  const client = getDockerClient();
  try {
    const data = await mechaInspect(client, id);
    return NextResponse.json(redactInspect(data as Record<string, unknown>));
  } catch (err) {
    return handleDockerError(err);
  }
});

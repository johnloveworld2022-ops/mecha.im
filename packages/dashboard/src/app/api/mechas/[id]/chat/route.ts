import { type NextRequest } from "next/server";
import { inspectContainer } from "@mecha/docker";
import { containerName, ContainerNotFoundError, DEFAULTS, generateTotp } from "@mecha/core";
import type { MechaId } from "@mecha/core";
import { getDockerClient } from "@/lib/docker";
import { getOtpSecret } from "@/lib/auth";
import { checkAuth } from "@/lib/api-auth";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<Record<string, string>> },
): Promise<Response> {
  if (!(await checkAuth())) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { id } = await params;
  const client = getDockerClient();
  const name = containerName(id as MechaId);

  // Inspect container once for both port and env
  let runtimeUrl: string;
  let authToken: string | undefined;
  let containerOtp: string | undefined;
  try {
    const info = await inspectContainer(client, name);
    const portBindings = info.NetworkSettings?.Ports?.[`${DEFAULTS.CONTAINER_PORT}/tcp`];
    const hostPort = portBindings?.[0]?.HostPort;
    if (!hostPort) {
      return new Response(JSON.stringify({ error: "Container has no exposed port" }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      });
    }
    runtimeUrl = `http://localhost:${hostPort}`;

    // Extract auth credentials from container env
    const envVars = info.Config?.Env ?? [];
    for (const env of envVars) {
      if (env.startsWith("MECHA_AUTH_TOKEN=")) {
        authToken = env.slice("MECHA_AUTH_TOKEN=".length);
      } else if (env.startsWith("MECHA_OTP=")) {
        containerOtp = env.slice("MECHA_OTP=".length);
      }
    }
  } catch (err) {
    if (err instanceof ContainerNotFoundError) {
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }
    throw err;
  }

  // Forward the request body to runtime
  // Runtime expects { message: string }
  // Accept both { message: string } (preferred) and legacy { messages: [...] }
  let body: { message?: string; messages?: Array<{ role: string; content: string }> };
  try {
    body = await request.json() as typeof body;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  let message: string;
  if (typeof body.message === "string") {
    message = body.message;
  } else {
    // Legacy: extract the last user message from the messages array
    const messages = body.messages ?? [];
    const lastUserMsg = messages.filter((m) => m.role === "user").pop();
    message = lastUserMsg?.content ?? "";
  }

  // Build auth headers for runtime request:
  // 1. Bearer token if MECHA_AUTH_TOKEN is in container env
  // 2. TOTP code via x-mecha-otp if container has MECHA_OTP (or dashboard shares it)
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  } else {
    // Fallback: use TOTP from container env or dashboard env
    const otpSecret = containerOtp ?? getOtpSecret();
    if (otpSecret) {
      headers["x-mecha-otp"] = generateTotp(otpSecret);
    }
  }

  const runtimeRes = await fetch(`${runtimeUrl}/api/chat`, {
    method: "POST",
    headers,
    body: JSON.stringify({ message }),
    signal: request.signal,
  });

  if (!runtimeRes.ok) {
    return new Response(runtimeRes.body, {
      status: runtimeRes.status,
      headers: { "Content-Type": runtimeRes.headers.get("Content-Type") ?? "application/json" },
    });
  }

  // Stream the SSE response back to client
  return new Response(runtimeRes.body, {
    headers: {
      "Content-Type": runtimeRes.headers.get("Content-Type") ?? "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

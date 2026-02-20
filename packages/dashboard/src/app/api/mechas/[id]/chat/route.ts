import { type NextRequest } from "next/server";
import { inspectContainer } from "@mecha/docker";
import { containerName, ContainerNotFoundError, DEFAULTS } from "@mecha/core";
import type { MechaId } from "@mecha/core";
import { getDockerClient } from "@/lib/docker";
import { isAuthEnabled, getSessionFromCookies, validateSession } from "@/lib/auth";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<Record<string, string>> },
): Promise<Response> {
  // Auth check
  if (isAuthEnabled()) {
    const sessionId = await getSessionFromCookies();
    if (!sessionId || !validateSession(sessionId)) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  const { id } = await params;
  const client = getDockerClient();
  const name = containerName(id as MechaId);

  // Resolve runtime URL from container port
  let runtimeUrl: string;
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
  } catch (err) {
    if (err instanceof ContainerNotFoundError) {
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }
    throw err;
  }

  // Extract auth token from container env
  let authToken: string | undefined;
  try {
    const info = await inspectContainer(client, name);
    const envVars = info.Config?.Env ?? [];
    for (const env of envVars) {
      if (env.startsWith("MECHA_AUTH_TOKEN=")) {
        authToken = env.slice("MECHA_AUTH_TOKEN=".length);
        break;
      }
    }
  } catch {
    // proceed without token
  }

  // Forward the request body to runtime
  // Runtime expects { message: string }, not { messages: [...] }
  const body = await request.json() as { messages?: Array<{ role: string; content: string }> };
  const messages = body.messages ?? [];
  // Extract the last user message as the prompt
  const lastUserMsg = messages.filter((m) => m.role === "user").pop();
  const message = lastUserMsg?.content ?? "";

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
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

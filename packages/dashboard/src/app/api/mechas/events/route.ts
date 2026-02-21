import { type NextRequest } from "next/server";
import { watchContainerEvents } from "@mecha/docker";
import { getDockerClient } from "@/lib/docker";
import { withStreamAuth } from "@/lib/api-auth";

export const GET = withStreamAuth(async (request: NextRequest) => {
  const client = getDockerClient();
  const encoder = new TextEncoder();

  const readable = new ReadableStream({
    async start(controller) {
      const onAbort = () => {
        try { controller.close(); } catch { /* already closed */ }
      };
      request.signal.addEventListener("abort", onAbort, { once: true });

      try {
        for await (const event of watchContainerEvents(client, { signal: request.signal })) {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
          } catch {
            break;
          }
        }
      } catch {
        /* stream error — clean up */
      }

      try { controller.close(); } catch { /* already closed */ }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
});

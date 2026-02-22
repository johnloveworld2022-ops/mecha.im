import type { FastifyInstance } from "fastify";
import type { DockerClient } from "@mecha/docker";
import { watchContainerEvents } from "@mecha/docker";

export function registerEventRoutes(app: FastifyInstance, docker: DockerClient): void {
  app.get("/events", async (req, reply) => {
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    const ac = new AbortController();
    /* v8 ignore start -- socket close not testable via inject */
    const onClose = () => { ac.abort(); };
    /* v8 ignore stop */
    req.socket.on("close", onClose);

    try {
      for await (const event of watchContainerEvents(docker, { signal: ac.signal })) {
        reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    } catch {
      // Stream ended (abort or Docker error) — close gracefully
    } finally {
      req.socket.removeListener("close", onClose);
      reply.raw.end();
    }

    return reply;
  });
}

import type { FastifyInstance } from "fastify";

export function registerAgentRoutes(app: FastifyInstance): void {
  app.post("/api/chat", async (_req, reply) => {
    return reply.code(501).send({ error: "Not implemented" });
  });
}

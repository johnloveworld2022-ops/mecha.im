import type { FastifyInstance } from "fastify";

export function registerMcpRoutes(app: FastifyInstance): void {
  app.post("/mcp", async (_req, reply) => {
    return reply.code(501).send({ error: "Not implemented" });
  });
}

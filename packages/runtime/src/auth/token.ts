import { randomBytes } from "node:crypto";
import type { FastifyRequest, FastifyReply, HookHandlerDoneFunction } from "fastify";

export function generateToken(): string {
  return randomBytes(32).toString("hex");
}

export function createAuthMiddleware(token: string) {
  return function authMiddleware(
    request: FastifyRequest,
    reply: FastifyReply,
    done: HookHandlerDoneFunction,
  ): void {
    // Skip auth for health check
    if (request.url === "/healthz") {
      done();
      return;
    }

    const authHeader = request.headers.authorization;
    if (!authHeader || authHeader !== `Bearer ${token}`) {
      reply.code(401).send({ error: "Unauthorized" });
      return;
    }

    done();
  };
}

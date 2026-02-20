import { randomBytes } from "node:crypto";
import type { FastifyRequest, FastifyReply, HookHandlerDoneFunction } from "fastify";
import { verifyTotp } from "./totp.js";

export function generateToken(): string {
  return randomBytes(32).toString("hex");
}

export function createAuthMiddleware(token: string, otp?: string) {
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

    // Bearer token auth
    const authHeader = request.headers.authorization;
    if (authHeader === `Bearer ${token}`) {
      done();
      return;
    }

    // TOTP auth (only if OTP secret is configured)
    if (otp) {
      // Check X-Mecha-OTP header
      const otpHeader = request.headers["x-mecha-otp"];
      if (typeof otpHeader === "string" && verifyTotp(otp, otpHeader)) {
        done();
        return;
      }

      // Check ?otp= query parameter
      const url = new URL(request.url, "http://localhost");
      const otpParam = url.searchParams.get("otp");
      if (otpParam && verifyTotp(otp, otpParam)) {
        done();
        return;
      }
    }

    reply.code(401).send({ error: "Unauthorized" });
  };
}

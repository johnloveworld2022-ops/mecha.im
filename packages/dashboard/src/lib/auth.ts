import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const SESSION_COOKIE = "mecha_session";
const SESSION_TTL = 24 * 60 * 60; // 24 hours in seconds
const ALGORITHM = "sha256";

interface SessionPayload {
  /** Subject (random nonce to prevent replay across signing keys) */
  sub: string;
  /** Issued-at (Unix seconds) */
  iat: number;
  /** Expiry (Unix seconds) */
  exp: number;
}

/**
 * Returns the signing key. Uses SESSION_SECRET env var if set,
 * otherwise generates a random key (which resets on process restart — acceptable
 * since the old in-memory sessions also reset on restart).
 */
let _ephemeralKey: string | undefined;
function getSigningKey(): string {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  if (!_ephemeralKey) {
    _ephemeralKey = randomBytes(32).toString("hex");
    console.warn("[auth] No SESSION_SECRET set — using ephemeral key (sessions reset on restart)");
  }
  return _ephemeralKey;
}

function sign(payload: string): string {
  return createHmac(ALGORITHM, getSigningKey()).update(payload).digest("base64url");
}

export function isAuthEnabled(): boolean {
  if (process.env.MECHA_AUTH_DISABLED === "1") return false;
  return !!process.env.MECHA_OTP;
}

export function getOtpSecret(): string | undefined {
  return process.env.MECHA_OTP;
}

/**
 * Create a signed session cookie value.
 * Format: base64url(JSON payload).signature
 */
export function createSession(): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    sub: randomBytes(16).toString("hex"),
    iat: now,
    exp: now + SESSION_TTL,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = sign(encoded);
  return `${encoded}.${signature}`;
}

/**
 * Validate a signed session cookie value.
 * Returns true if signature is valid and session has not expired.
 */
export function validateSession(sessionValue: string): boolean {
  const dotIndex = sessionValue.lastIndexOf(".");
  if (dotIndex === -1) return false;

  const encoded = sessionValue.slice(0, dotIndex);
  const signature = sessionValue.slice(dotIndex + 1);

  // Verify signature using timing-safe comparison
  const expected = sign(encoded);
  if (signature.length !== expected.length) return false;
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (!timingSafeEqual(sigBuf, expBuf)) return false;

  // Decode and check expiry
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString()) as SessionPayload;
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp <= now) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * deleteSession is a no-op for signed cookies (stateless — the cookie
 * is simply cleared from the browser). Kept for API compatibility.
 */
export function deleteSession(_sessionValue: string): void {
  // Stateless sessions: nothing to delete server-side
}

export async function getSessionFromCookies(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE)?.value;
}

export async function setSessionCookie(sessionId: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_TTL,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

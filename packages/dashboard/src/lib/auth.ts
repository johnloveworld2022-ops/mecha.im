import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";

const SESSION_COOKIE = "mecha_session";
const SESSION_TTL = 24 * 60 * 60 * 1000; // 24 hours
const MAX_SESSIONS = 100;
const EVICTION_INTERVAL = 60 * 60 * 1000; // 1 hour

interface Session {
  createdAt: number;
}

const sessions = new Map<string, Session>();

// Periodic eviction of expired sessions
let lastEviction = Date.now();
function evictExpired(): void {
  const now = Date.now();
  if (now - lastEviction < EVICTION_INTERVAL) return;
  lastEviction = now;
  for (const [id, session] of sessions) {
    if (now - session.createdAt > SESSION_TTL) {
      sessions.delete(id);
    }
  }
}

export function isAuthEnabled(): boolean {
  // Auth is enabled when MECHA_OTP is configured, unless explicitly disabled
  if (process.env.MECHA_AUTH_DISABLED === "1") return false;
  return !!process.env.MECHA_OTP;
}

export function getOtpSecret(): string | undefined {
  return process.env.MECHA_OTP;
}

export function createSession(): string {
  evictExpired();
  // Enforce max sessions to prevent unbounded growth
  if (sessions.size >= MAX_SESSIONS) {
    // Remove oldest session
    let oldestId: string | undefined;
    let oldestTime = Infinity;
    for (const [id, session] of sessions) {
      if (session.createdAt < oldestTime) {
        oldestTime = session.createdAt;
        oldestId = id;
      }
    }
    if (oldestId) sessions.delete(oldestId);
  }
  const id = randomBytes(32).toString("hex");
  sessions.set(id, { createdAt: Date.now() });
  return id;
}

export function validateSession(sessionId: string): boolean {
  const session = sessions.get(sessionId);
  if (!session) return false;
  if (Date.now() - session.createdAt > SESSION_TTL) {
    sessions.delete(sessionId);
    return false;
  }
  return true;
}

export function deleteSession(sessionId: string): void {
  sessions.delete(sessionId);
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
    maxAge: SESSION_TTL / 1000,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

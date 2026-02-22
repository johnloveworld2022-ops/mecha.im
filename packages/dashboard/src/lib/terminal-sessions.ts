import type { Duplex } from "node:stream";

/** Minimal interface for a Docker exec instance (avoids importing dockerode types) */
interface DockerExec {
  resize(opts: { h: number; w: number }): Promise<unknown>;
}

interface TerminalSession {
  stream: Duplex;
  exec: DockerExec;
  containerId: string;
}

const sessions = new Map<string, TerminalSession>();

export function addSession(
  id: string,
  stream: Duplex,
  exec: DockerExec,
  containerId: string,
): void {
  sessions.set(id, { stream, exec, containerId });
}

export function getSession(id: string): TerminalSession | undefined {
  return sessions.get(id);
}

export function removeSession(id: string): void {
  const session = sessions.get(id);
  if (session) {
    session.stream.destroy();
    sessions.delete(id);
  }
}

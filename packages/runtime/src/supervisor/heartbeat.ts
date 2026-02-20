import type Database from "better-sqlite3";
import type { MechaId } from "@mecha/core";

export function startHeartbeat(
  db: Database.Database,
  mechaId: MechaId,
  intervalMs: number,
): () => void {
  const stmt = db.prepare(
    "INSERT INTO heartbeats (mecha_id, status, active_tasks, timestamp) VALUES (?, ?, ?, datetime('now'))",
  );

  const write = () => {
    stmt.run(mechaId, "running", 0);
  };

  // Write initial heartbeat immediately
  write();

  const timer = setInterval(write, intervalMs);

  return function stopHeartbeat() {
    clearInterval(timer);
  };
}

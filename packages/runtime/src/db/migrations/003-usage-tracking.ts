import type Database from "better-sqlite3";

export const migration003 = {
  up(db: Database.Database): void {
    // Guard: check if usage columns already exist (SQLite has no ADD COLUMN IF NOT EXISTS)
    const cols = (db.prepare("PRAGMA table_info(sessions)").all() as Array<{ name: string }>)
      .map((c) => c.name);

    if (!cols.includes("total_cost_usd")) {
      db.exec(`
        ALTER TABLE sessions ADD COLUMN total_cost_usd REAL NOT NULL DEFAULT 0.0;
        ALTER TABLE sessions ADD COLUMN total_input_tokens INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE sessions ADD COLUMN total_output_tokens INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE sessions ADD COLUMN total_duration_ms INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE sessions ADD COLUMN turn_count INTEGER NOT NULL DEFAULT 0;
      `);
    }

    db.exec(`
      CREATE TABLE IF NOT EXISTS deleted_sessions (
        sdk_session_id TEXT PRIMARY KEY,
        deleted_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  },
};

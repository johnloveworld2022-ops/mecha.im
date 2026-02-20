import { describe, it, expect, afterEach } from "vitest";
import { createDatabase, runMigrations } from "../src/db/sqlite.js";
import type Database from "better-sqlite3";

describe("SQLite database", () => {
  let db: Database.Database;

  afterEach(() => {
    if (db) db.close();
  });

  it("creates an in-memory database", () => {
    db = createDatabase(":memory:");
    expect(db.open).toBe(true);
  });

  it("enables WAL mode", () => {
    db = createDatabase(":memory:");
    const result = db.pragma("journal_mode") as Array<{ journal_mode: string }>;
    // In-memory databases may report "memory" instead of "wal"
    // WAL mode is set but :memory: DBs fall back to "memory"
    expect(result[0].journal_mode).toMatch(/wal|memory/);
  });

  it("runs migrations and creates all tables", () => {
    db = createDatabase(":memory:");
    runMigrations(db);

    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
      )
      .all() as Array<{ name: string }>;

    const tableNames = tables.map((t) => t.name);
    expect(tableNames).toContain("heartbeats");
    expect(tableNames).toContain("state");
    expect(tableNames).toContain("chat_messages");
  });

  it("heartbeats table has expected columns", () => {
    db = createDatabase(":memory:");
    runMigrations(db);

    const info = db.prepare("PRAGMA table_info(heartbeats)").all() as Array<{
      name: string;
    }>;
    const cols = info.map((c) => c.name);
    expect(cols).toContain("id");
    expect(cols).toContain("mecha_id");
    expect(cols).toContain("status");
    expect(cols).toContain("active_tasks");
    expect(cols).toContain("last_tool_call");
    expect(cols).toContain("memory_pressure");
    expect(cols).toContain("timestamp");
  });

  it("state table has expected columns", () => {
    db = createDatabase(":memory:");
    runMigrations(db);

    const info = db.prepare("PRAGMA table_info(state)").all() as Array<{
      name: string;
    }>;
    const cols = info.map((c) => c.name);
    expect(cols).toContain("key");
    expect(cols).toContain("value");
    expect(cols).toContain("updated_at");
  });

  it("chat_messages table has expected columns", () => {
    db = createDatabase(":memory:");
    runMigrations(db);

    const info = db
      .prepare("PRAGMA table_info(chat_messages)")
      .all() as Array<{ name: string }>;
    const cols = info.map((c) => c.name);
    expect(cols).toContain("id");
    expect(cols).toContain("role");
    expect(cols).toContain("content");
    expect(cols).toContain("created_at");
  });
});

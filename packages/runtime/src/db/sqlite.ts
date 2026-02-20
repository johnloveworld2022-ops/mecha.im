import Database from "better-sqlite3";
import { migration001 } from "./migrations/001-init.js";

export function createDatabase(dbPath: string): Database.Database {
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  return db;
}

export function runMigrations(db: Database.Database): void {
  migration001.up(db);
}

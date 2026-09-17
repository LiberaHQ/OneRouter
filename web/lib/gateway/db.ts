// The gateway's only persistence boundary. Everything in store.ts operates on one
// in-memory State object (mutated in place, then re-read — see the comments there);
// this module is just where that object lives between process restarts. For now
// that's a single-row blob in SQLite rather than a hand-rolled write-tmp-then-rename
// JSON file — real transactional durability without changing anything above it.
// Swapping this for a normalized schema, or a hosted database, only ever touches
// this file and loadState()/saveState() in store.ts.
import fs from "node:fs";
import Database from "better-sqlite3";
import { GATEWAY_DB_PATH, LEGACY_GATEWAY_STATE_PATH } from "../content/paths";

let db: Database.Database | null = null;

function open(): Database.Database {
  if (db) return db;
  fs.mkdirSync(GATEWAY_DB_PATH.slice(0, GATEWAY_DB_PATH.lastIndexOf("/")), { recursive: true });
  db = new Database(GATEWAY_DB_PATH);
  db.pragma("journal_mode = WAL");
  db.exec("CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL)");
  return db;
}

export function loadStateBlob(): string | null {
  const row = open().prepare("SELECT data FROM state WHERE id = 1").get() as { data: string } | undefined;
  if (row) return row.data;
  // First run against this database: carry over the old JSON file's contents once,
  // if one exists, so switching persistence engines doesn't wipe local dev state.
  if (fs.existsSync(LEGACY_GATEWAY_STATE_PATH)) {
    try {
      const legacy = fs.readFileSync(LEGACY_GATEWAY_STATE_PATH, "utf-8");
      JSON.parse(legacy); // don't adopt a truncated/corrupt legacy file
      saveStateBlob(legacy);
      return legacy;
    } catch {
      // fall through to a fresh blank state
    }
  }
  return null;
}

export function saveStateBlob(data: string): void {
  open()
    .prepare("INSERT INTO state (id, data) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data")
    .run(data);
}

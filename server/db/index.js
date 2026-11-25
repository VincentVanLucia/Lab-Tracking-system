// SQLite storage via Node's built-in node:sqlite (no native build step required).

import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const MIGRATIONS = [
  // v1 — initial schema
  `
  CREATE TABLE users (
    id            INTEGER PRIMARY KEY,
    username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
    display_name  TEXT NOT NULL,
    role          TEXT NOT NULL CHECK (role IN ('manager', 'member', 'viewer')),
    password_hash TEXT NOT NULL,
    active        INTEGER NOT NULL DEFAULT 1,
    created_at    TEXT NOT NULL
  );

  CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );
  CREATE INDEX sessions_user ON sessions(user_id);

  CREATE TABLE materials (
    id                       INTEGER PRIMARY KEY,
    code                     TEXT NOT NULL UNIQUE CHECK (length(code) = 4),
    name                     TEXT NOT NULL,
    category                 TEXT NOT NULL,
    quantity                 REAL NOT NULL CHECK (quantity >= 0),
    initial_quantity         REAL NOT NULL,
    unit                     TEXT NOT NULL,
    low_stock_threshold      REAL NOT NULL CHECK (low_stock_threshold >= 0),
    critical_stock_threshold REAL NOT NULL CHECK (critical_stock_threshold >= 0),
    expiry_warning_days      INTEGER NOT NULL DEFAULT 30,
    opening_date             TEXT NOT NULL,
    expiration_date          TEXT NOT NULL,
    storage_condition        TEXT NOT NULL,
    storage_location         TEXT,
    lot_number               TEXT,
    supplier                 TEXT,
    notes                    TEXT,
    created_by               INTEGER REFERENCES users(id),
    created_at               TEXT NOT NULL,
    updated_at               TEXT NOT NULL,
    archived_at              TEXT
  );
  CREATE INDEX materials_name ON materials(name COLLATE NOCASE);

  CREATE TABLE transactions (
    id              INTEGER PRIMARY KEY,
    material_id     INTEGER NOT NULL REFERENCES materials(id),
    user_id         INTEGER NOT NULL REFERENCES users(id),
    type            TEXT NOT NULL CHECK (type IN ('registration', 'usage', 'restock', 'correction')),
    quantity_change REAL NOT NULL,
    quantity_before REAL NOT NULL,
    quantity_after  REAL NOT NULL CHECK (quantity_after >= 0),
    note            TEXT,
    created_at      TEXT NOT NULL
  );
  CREATE INDEX transactions_material ON transactions(material_id, created_at);
  CREATE INDEX transactions_created ON transactions(created_at);

  CREATE TABLE access_log (
    id         INTEGER PRIMARY KEY,
    created_at TEXT NOT NULL,
    user_id    INTEGER,
    username   TEXT,
    role       TEXT,
    action     TEXT NOT NULL,
    method     TEXT,
    path       TEXT,
    outcome    TEXT NOT NULL CHECK (outcome IN ('allowed', 'denied', 'failed')),
    reason     TEXT,
    ip         TEXT
  );
  CREATE INDEX access_log_created ON access_log(created_at);
  `,
];

export function openDatabase(dbPath) {
  if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  if (dbPath !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  migrate(db);
  return db;
}

function migrate(db) {
  const { user_version: current } = db.prepare('PRAGMA user_version').get();
  for (let v = current; v < MIGRATIONS.length; v++) {
    transaction(db, () => {
      db.exec(MIGRATIONS[v]);
      db.exec(`PRAGMA user_version = ${v + 1}`);
    });
  }
}

/** Runs fn inside BEGIN IMMEDIATE … COMMIT, rolling back on any thrown error. */
export function transaction(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export const nowIso = () => new Date().toISOString();

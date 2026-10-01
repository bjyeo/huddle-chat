import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
    display_name  TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS channels (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL UNIQUE,
    topic      TEXT NOT NULL DEFAULT '',
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS messages (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    author_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content    TEXT NOT NULL,
    created_at TEXT NOT NULL,
    edited_at  TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_messages_channel_id ON messages (channel_id, id);
  CREATE INDEX IF NOT EXISTS idx_messages_author_id ON messages (author_id);
`;

export const GENERAL_CHANNEL = { name: 'general', topic: 'Say hi to the group!' };

export function openDatabase(file) {
  const inMemory = file === ':memory:';
  if (!inMemory) fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });

  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON');
  if (!inMemory) db.exec('PRAGMA journal_mode = WAL');
  db.exec(SCHEMA);

  db.prepare(
    'INSERT OR IGNORE INTO channels (name, topic, created_by, created_at) VALUES (?, ?, NULL, ?)',
  ).run(GENERAL_CHANNEL.name, GENERAL_CHANNEL.topic, new Date().toISOString());

  return db;
}

CREATE TABLE IF NOT EXISTS leaderboard (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  name      TEXT    NOT NULL,
  score     INTEGER NOT NULL,
  location  TEXT    NOT NULL DEFAULT 'Outer Space',
  played_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Run this if the table already exists:
-- ALTER TABLE leaderboard ADD COLUMN location TEXT NOT NULL DEFAULT 'Unknown';

CREATE INDEX IF NOT EXISTS idx_score ON leaderboard (score DESC);

CREATE TABLE IF NOT EXISTS presence (
  session_id TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  location   TEXT NOT NULL DEFAULT 'Unknown',
  last_seen  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS chat (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  name     TEXT NOT NULL,
  location TEXT NOT NULL DEFAULT 'Unknown',
  message  TEXT NOT NULL,
  sent_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

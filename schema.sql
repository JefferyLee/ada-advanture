CREATE TABLE IF NOT EXISTS leaderboard (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  name      TEXT    NOT NULL,
  score     INTEGER NOT NULL,
  wave      INTEGER DEFAULT NULL,
  game_type TEXT    NOT NULL DEFAULT 'forest',
  location  TEXT    NOT NULL DEFAULT 'Outer Space',
  played_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Migration for existing table:
-- ALTER TABLE leaderboard ADD COLUMN game_type TEXT NOT NULL DEFAULT 'forest';
-- ALTER TABLE leaderboard ADD COLUMN wave INTEGER DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_score ON leaderboard (score DESC);
CREATE INDEX IF NOT EXISTS idx_game_type ON leaderboard (game_type, score DESC);

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

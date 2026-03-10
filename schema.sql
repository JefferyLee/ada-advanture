CREATE TABLE IF NOT EXISTS leaderboard (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  name      TEXT    NOT NULL,
  score     INTEGER NOT NULL,
  location  TEXT    NOT NULL DEFAULT 'Unknown',
  played_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Run this if the table already exists:
-- ALTER TABLE leaderboard ADD COLUMN location TEXT NOT NULL DEFAULT 'Unknown';

CREATE INDEX IF NOT EXISTS idx_score ON leaderboard (score DESC);

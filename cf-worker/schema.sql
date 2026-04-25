-- Users
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  username TEXT NOT NULL,
  username_lower TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  created_at TEXT NOT NULL,
  souls INTEGER NOT NULL DEFAULT 0,
  meta_json TEXT NOT NULL DEFAULT '{}'
);

-- Runs
CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  username TEXT NOT NULL,
  is_guest INTEGER NOT NULL DEFAULT 0,
  seed INTEGER NOT NULL,
  character_class TEXT NOT NULL,
  character_name TEXT NOT NULL,
  depth INTEGER NOT NULL,
  score INTEGER NOT NULL,
  kills INTEGER NOT NULL,
  duration_seconds INTEGER NOT NULL,
  outcome TEXT NOT NULL,
  level INTEGER NOT NULL,
  souls_earned INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS runs_score_idx ON runs(score DESC, depth DESC, created_at ASC);
CREATE INDEX IF NOT EXISTS runs_user_idx ON runs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS runs_seed_idx ON runs(seed, created_at DESC);

-- Login attempts (basic rate limiting)
CREATE TABLE IF NOT EXISTS login_attempts (
  identifier TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  locked_until TEXT
);


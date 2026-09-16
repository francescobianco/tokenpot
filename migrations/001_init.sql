CREATE TABLE users (
  id            INTEGER PRIMARY KEY,
  github_id     INTEGER NOT NULL UNIQUE,
  login         TEXT NOT NULL,
  name          TEXT,
  avatar_url    TEXT,
  created_at    TEXT NOT NULL,
  last_login_at TEXT
);

-- Sponsorship state as last seen from GitHub (webhooks or sync).
-- Keyed by GitHub id: a sponsor may exist before ever logging in.
CREATE TABLE sponsorships (
  github_id     INTEGER PRIMARY KEY,
  login         TEXT,
  monthly_cents INTEGER NOT NULL DEFAULT 0,
  one_time      INTEGER NOT NULL DEFAULT 0,
  active        INTEGER NOT NULL DEFAULT 0,
  qualifies     INTEGER NOT NULL DEFAULT 0,
  grace_until   TEXT,
  source        TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

-- Only the SHA-256 of a key is stored. `display` is a masked form for the UI.
CREATE TABLE api_keys (
  id           INTEGER PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id),
  hash         TEXT NOT NULL UNIQUE,
  display      TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  revoked_at   TEXT,
  last_used_at TEXT
);
CREATE INDEX api_keys_user ON api_keys(user_id);

CREATE TABLE usage_events (
  id                INTEGER PRIMARY KEY,
  user_id           INTEGER NOT NULL REFERENCES users(id),
  key_id            INTEGER NOT NULL REFERENCES api_keys(id),
  period            TEXT NOT NULL,
  created_at        TEXT NOT NULL,
  model             TEXT NOT NULL,
  provider          TEXT,
  upstream_model    TEXT,
  status            INTEGER NOT NULL,
  prompt_tokens     INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  cost_micro_usd    INTEGER NOT NULL DEFAULT 0,
  retail_micro_usd  INTEGER NOT NULL DEFAULT 0,
  credits           REAL NOT NULL DEFAULT 0,
  overflow          INTEGER NOT NULL DEFAULT 0,
  estimated         INTEGER NOT NULL DEFAULT 0,
  duration_ms       INTEGER
);
CREATE INDEX usage_user_period ON usage_events(user_id, period);
CREATE INDEX usage_user_time ON usage_events(user_id, created_at);
CREATE INDEX usage_period ON usage_events(period);

-- Allocation parameters frozen at the start of each month.
CREATE TABLE allocations (
  period                    TEXT PRIMARY KEY,
  multiplier                REAL NOT NULL,
  previous_utilization      REAL,
  reserve_balance_start_usd REAL NOT NULL,
  reserve_release_usd       REAL NOT NULL,
  -- last observed values during the month; frozen when the period is closed
  members                   INTEGER NOT NULL DEFAULT 0,
  income_usd                REAL NOT NULL DEFAULT 0,
  created_at                TEXT NOT NULL,
  updated_at                TEXT NOT NULL
);

-- Manual accounting entries (infrastructure invoices, corrections).
CREATE TABLE ledger_entries (
  id         INTEGER PRIMARY KEY,
  period     TEXT NOT NULL,
  kind       TEXT NOT NULL CHECK (kind IN ('infrastructure', 'income_adjustment', 'provider_adjustment', 'reserve_adjustment')),
  amount_usd REAL NOT NULL,
  note       TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX ledger_period ON ledger_entries(period);

-- Closed monthly reports: the public ledger.
CREATE TABLE period_reports (
  period      TEXT PRIMARY KEY,
  report_json TEXT NOT NULL,
  closed_at   TEXT NOT NULL
);

CREATE TABLE meta (
  key   TEXT PRIMARY KEY,
  value TEXT
);

-- AOA-RWA D1 schema 0002: OPERATIONAL tables (mutable by design; none of them is a record of what happened. The log is.)
CREATE TABLE passcodes (            -- hash only; digits are never stored
  id TEXT PRIMARY KEY, event_id TEXT NOT NULL, purpose TEXT NOT NULL, subject TEXT NOT NULL, hash TEXT NOT NULL, uniq_hash TEXT NOT NULL,
  issued_ms INTEGER NOT NULL, expires_ms INTEGER NOT NULL, tries INTEGER NOT NULL DEFAULT 0, locked_until_ms INTEGER NOT NULL DEFAULT 0,
  used_ms INTEGER, voided_ms INTEGER, issued_by TEXT, kind TEXT NOT NULL DEFAULT 'official'
);
CREATE INDEX pass_subject ON passcodes(event_id, purpose, subject);
CREATE INDEX pass_uniq ON passcodes(event_id, purpose, uniq_hash);
CREATE TABLE sessions (             -- token hash only
  token_hash TEXT PRIMARY KEY, event_id TEXT, person_id TEXT, flat_no TEXT, kind TEXT NOT NULL CHECK (kind IN ('staff','voter','super')), voter_kind TEXT, created_ms INTEGER NOT NULL, expires_ms INTEGER NOT NULL
);
CREATE TABLE rate_limits (          -- key = salted hash of ip / email, never raw
  k TEXT NOT NULL, bucket INTEGER NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (k, bucket)
) WITHOUT ROWID;
CREATE TABLE mail_outbox (          -- local stub + retry queue; body never kept once sent in production
  id INTEGER PRIMARY KEY AUTOINCREMENT, to_addr TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL, at_ms INTEGER NOT NULL, sent INTEGER NOT NULL DEFAULT 0, provider TEXT
);
CREATE TABLE mail_counter (day TEXT NOT NULL, provider TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (day, provider)) WITHOUT ROWID;
CREATE TABLE event_keys (           -- per-event random data key, wrapped by the master secret. Crypto-shredding = wrapped_key set to NULL.
  event_id TEXT PRIMARY KEY, wrapped_key TEXT, created_ms INTEGER NOT NULL, destroyed_ms INTEGER
);
CREATE TABLE kv_state (k TEXT PRIMARY KEY, v TEXT NOT NULL);

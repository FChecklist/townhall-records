-- AOA-RWA D1 schema 0005: attendance handshake (operational) and printed ballot papers (record tables).
CREATE TABLE handshakes (           -- OPERATIONAL, short-lived: two 4-digit codes (hashes only), the voter's device (hashes only), progress
  id TEXT PRIMARY KEY, event_id TEXT NOT NULL, flat_no TEXT NOT NULL, monitor_pid TEXT NOT NULL,
  monitor_hash TEXT NOT NULL, voter_hash TEXT NOT NULL, link_hash TEXT NOT NULL,
  device_hash TEXT, ua_hash TEXT, ip_hash TEXT,
  voter_confirmed_ms INTEGER, monitor_confirmed_ms INTEGER, tries_voter INTEGER NOT NULL DEFAULT 0, tries_monitor INTEGER NOT NULL DEFAULT 0,
  created_ms INTEGER NOT NULL, expires_ms INTEGER NOT NULL, voided_ms INTEGER, completed_ms INTEGER,
  kind TEXT NOT NULL DEFAULT 'official', attendee_name TEXT NOT NULL, mobile_masked TEXT, mobile_fp TEXT, sms_confirmed_ms INTEGER,
  voter_token TEXT                  -- the voter's session token, handed over ONCE to the bound device, then cleared
);
CREATE INDEX hs_flat ON handshakes(event_id, flat_no);
CREATE INDEX hs_link ON handshakes(link_hash);

-- Printed ballot papers. PRIVACY BY DESIGN: the serial is NOT stored with the flat that received the paper, and this table has no time and no insertion order
-- (WITHOUT ROWID, random key), so a counted paper cannot be traced to a voter. Only the weight and the kind (official/proxy) travel with the serial.
CREATE TABLE paper_serials (
  serial TEXT PRIMARY KEY, event_id TEXT NOT NULL, point_id TEXT NOT NULL, weight INTEGER NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('official','proxy'))
) WITHOUT ROWID;
CREATE TABLE paper_marks (          -- what happened to a serial: counted, invalid, or voided. A serial can have only ONE outcome.
  id INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT NOT NULL, point_id TEXT NOT NULL, serial TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK (kind IN ('counted','invalid','voided')), reason TEXT, image_sha256 TEXT, by_pid TEXT NOT NULL, at_ms INTEGER NOT NULL
);
CREATE TRIGGER paper_serials_no_update BEFORE UPDATE ON paper_serials BEGIN SELECT RAISE(ABORT, 'append-only: UPDATE refused on paper_serials'); END;
CREATE TRIGGER paper_serials_no_delete BEFORE DELETE ON paper_serials BEGIN SELECT RAISE(ABORT, 'append-only: DELETE refused on paper_serials'); END;
CREATE TRIGGER paper_marks_no_update BEFORE UPDATE ON paper_marks BEGIN SELECT RAISE(ABORT, 'append-only: UPDATE refused on paper_marks'); END;
CREATE TRIGGER paper_marks_no_delete BEFORE DELETE ON paper_marks BEGIN SELECT RAISE(ABORT, 'append-only: DELETE refused on paper_marks'); END;
CREATE TRIGGER paper_serials_after_report BEFORE INSERT ON paper_serials WHEN EXISTS (SELECT 1 FROM reports WHERE event_id = NEW.event_id) BEGIN SELECT RAISE(ABORT, 'published: this event can no longer change'); END;
CREATE TRIGGER paper_marks_after_report BEFORE INSERT ON paper_marks WHEN EXISTS (SELECT 1 FROM reports WHERE event_id = NEW.event_id) BEGIN SELECT RAISE(ABORT, 'published: this event can no longer change'); END;
-- a counted or invalid paper needs a real serial of the same point (the API checks the MAC; the database checks the pool)
CREATE TRIGGER paper_marks_known_serial BEFORE INSERT ON paper_marks WHEN NOT EXISTS (SELECT 1 FROM paper_serials WHERE serial = NEW.serial AND point_id = NEW.point_id AND event_id = NEW.event_id) BEGIN SELECT RAISE(ABORT, 'paper: unknown serial'); END;

-- AOA-RWA D1 schema 0001: record tables (APPEND-ONLY, enforced by triggers at the bottom).
-- PUBLIC = may be published (masked values only). PRIVATE = encrypted at rest, never published.
-- Integers only for money (minor units), weights and percentages (basis points). Timestamps are epoch milliseconds from the SERVER clock.

CREATE TABLE societies (            -- PUBLIC
  id TEXT PRIMARY KEY, name TEXT NOT NULL, address TEXT NOT NULL, registration_no TEXT NOT NULL, kind TEXT NOT NULL,
  created_ms INTEGER NOT NULL
);
CREATE TABLE events (               -- PUBLIC
  id TEXT PRIMARY KEY, society_id TEXT NOT NULL REFERENCES societies(id),
  kind TEXT NOT NULL CHECK (kind IN ('meeting','election')), event_type TEXT NOT NULL, title TEXT NOT NULL, venue TEXT NOT NULL,
  scheduled_ms INTEGER NOT NULL, pack_id TEXT NOT NULL, created_from_event_id TEXT, organizer_person_id TEXT NOT NULL, created_ms INTEGER NOT NULL
);
CREATE TABLE event_status (         -- PUBLIC; current status = latest row
  id INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT NOT NULL, status TEXT NOT NULL, log_seq INTEGER, at_ms INTEGER NOT NULL
);
CREATE INDEX event_status_ev ON event_status(event_id, id);
CREATE TABLE event_options (        -- PUBLIC; the checkbox set; current = highest rev per (event_id,key)
  id INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT NOT NULL, key TEXT NOT NULL, value INTEGER NOT NULL CHECK (value IN (0,1)),
  locked INTEGER NOT NULL DEFAULT 0, locked_reason TEXT, rev INTEGER NOT NULL, log_seq INTEGER, UNIQUE (event_id, key, rev)
);
CREATE TABLE event_rules (          -- PUBLIC; rule parameters + their full change history. scope = 'event' or a point id
  id INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT NOT NULL, scope TEXT NOT NULL, param TEXT NOT NULL, value_json TEXT NOT NULL,
  rev INTEGER NOT NULL, changed_by TEXT, reason TEXT, log_seq INTEGER, at_ms INTEGER NOT NULL, UNIQUE (event_id, scope, param, rev)
);
CREATE TABLE flats (                -- PUBLIC (flat numbers are public by owner decision A8); no names
  id INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT NOT NULL, flat_no TEXT NOT NULL, weight INTEGER NOT NULL CHECK (weight > 0),
  eligible INTEGER NOT NULL DEFAULT 1, rev INTEGER NOT NULL, UNIQUE (event_id, flat_no, rev)
);
CREATE TABLE agenda_points (        -- PUBLIC; versions of a point; current = highest rev
  id INTEGER PRIMARY KEY AUTOINCREMENT, point_id TEXT NOT NULL, event_id TEXT NOT NULL, number TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('discussion','resolution','election_post')), options_json TEXT NOT NULL, max_choices INTEGER NOT NULL,
  majority_class TEXT NOT NULL, secret INTEGER NOT NULL, rev INTEGER NOT NULL, log_seq INTEGER, UNIQUE (point_id, rev)
);
CREATE TABLE point_state (          -- PUBLIC; current = latest row (open / closed)
  id INTEGER PRIMARY KEY AUTOINCREMENT, point_id TEXT NOT NULL, event_id TEXT NOT NULL, state TEXT NOT NULL, ends_ms INTEGER, log_seq INTEGER, at_ms INTEGER NOT NULL
);
CREATE INDEX point_state_pt ON point_state(point_id, id);
CREATE TABLE people (               -- PUBLIC, MASKED ONLY. Full values live in private_contacts.
  id TEXT PRIMARY KEY, event_id TEXT NOT NULL, masked_name TEXT NOT NULL, masked_email TEXT NOT NULL, masked_phone TEXT NOT NULL, flat_no TEXT, created_ms INTEGER NOT NULL
);
CREATE TABLE person_labels (        -- PUBLIC; designation labels (Chairman, Treasurer ...). No rights attached.
  id INTEGER PRIMARY KEY AUTOINCREMENT, person_id TEXT NOT NULL, event_id TEXT NOT NULL, label TEXT NOT NULL, rev INTEGER NOT NULL, log_seq INTEGER, UNIQUE (person_id, rev)
);
CREATE TABLE person_verifications ( -- PUBLIC; e-mail verified at (a person is verified when a row exists)
  id INTEGER PRIMARY KEY AUTOINCREMENT, person_id TEXT NOT NULL, event_id TEXT NOT NULL, at_ms INTEGER NOT NULL, log_seq INTEGER, UNIQUE (person_id)
);
CREATE TABLE role_assignments (     -- PUBLIC; provenance. role in organizer|host|attendance_officer; action appoint|remove
  id INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT NOT NULL, person_id TEXT NOT NULL, role TEXT NOT NULL CHECK (role IN ('organizer','host','attendance_officer')),
  action TEXT NOT NULL CHECK (action IN ('appoint','remove')), appointed_by TEXT, log_seq INTEGER, at_ms INTEGER NOT NULL
);
CREATE INDEX role_ev ON role_assignments(event_id, person_id);
CREATE TABLE attendance (           -- PUBLIC (flat number, method; no images, no ID numbers beyond last 4)
  id INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT NOT NULL, flat_no TEXT NOT NULL, attendee_masked_name TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('physical','online')), method TEXT NOT NULL, doc_type TEXT, doc_last4 TEXT,
  marked_by TEXT NOT NULL, independent INTEGER NOT NULL, evidence_hash TEXT, supersedes_id INTEGER, log_seq INTEGER, at_ms INTEGER NOT NULL
);
CREATE INDEX att_ev ON attendance(event_id, flat_no, id);
CREATE TABLE voter_ledger (         -- PUBLIC for who-voted (by flat). open_choice_json only when the point is an OPEN vote.
  id INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT NOT NULL, point_id TEXT NOT NULL, flat_no TEXT NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('official','proxy')),
  open_choice_json TEXT, voted_ms INTEGER NOT NULL, log_seq INTEGER, UNIQUE (event_id, point_id, flat_no)
);
CREATE TABLE ballot_box (           -- PUBLIC only as receipts + totals. NO flat, NO time, random primary key, physical order unrelated to cast order.
  receipt_hash TEXT PRIMARY KEY, event_id TEXT NOT NULL, point_id TEXT NOT NULL, choice_json TEXT NOT NULL, weight INTEGER NOT NULL
) WITHOUT ROWID;
CREATE TABLE box_seals (            -- PUBLIC; one per closed secret point: counts + digest of the sorted box, committed in the log
  id INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT NOT NULL, point_id TEXT NOT NULL, n INTEGER NOT NULL, counts_json TEXT NOT NULL, digest TEXT NOT NULL, log_seq INTEGER, UNIQUE (point_id)
);
CREATE TABLE log_entries (          -- PUBLIC (masked payloads only)
  event_id TEXT NOT NULL, seq INTEGER NOT NULL, hash TEXT NOT NULL, prev_hash TEXT NOT NULL, entry_json TEXT NOT NULL, sig TEXT NOT NULL,
  PRIMARY KEY (event_id, seq)
);
CREATE TABLE reports (              -- PUBLIC
  id INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT NOT NULL, rev INTEGER NOT NULL, file_sha256 TEXT NOT NULL, sig TEXT NOT NULL,
  head_seq INTEGER NOT NULL, head_hash TEXT NOT NULL, html TEXT NOT NULL, published_ms INTEGER NOT NULL, UNIQUE (event_id, rev)
);
CREATE TABLE anchors (              -- PUBLIC; chain heads handed out / published externally
  id INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT NOT NULL, head_seq INTEGER NOT NULL, head_hash TEXT NOT NULL, kind TEXT NOT NULL, sig TEXT NOT NULL, at_ms INTEGER NOT NULL
);
CREATE TABLE payments (             -- PRIVATE-ish (no card data ever); state rows, latest wins
  id INTEGER PRIMARY KEY AUTOINCREMENT, payment_id TEXT NOT NULL, event_id TEXT NOT NULL, state TEXT NOT NULL, mode TEXT NOT NULL, order_id TEXT,
  amount_minor INTEGER NOT NULL, currency TEXT NOT NULL, ref TEXT, log_seq INTEGER, at_ms INTEGER NOT NULL
);
CREATE INDEX pay_ev ON payments(event_id, id);
CREATE TABLE super_admin_actions (  -- PRIVATE; each action also lands as a platform_action entry in the affected event's log
  id INTEGER PRIMARY KEY AUTOINCREMENT, at_ms INTEGER NOT NULL, actor_hash TEXT NOT NULL, action TEXT NOT NULL, event_id TEXT, reason TEXT NOT NULL, log_seq INTEGER
);
CREATE TABLE private_contacts (     -- PRIVATE: AES-GCM ciphertext of {name,email,phone} under the event key; email_idx = blind index
  person_id TEXT PRIMARY KEY, event_id TEXT NOT NULL, ct TEXT NOT NULL, email_idx TEXT NOT NULL, created_ms INTEGER NOT NULL
);
CREATE INDEX contacts_idx ON private_contacts(event_id, email_idx);
CREATE TABLE private_evidence (     -- PRIVATE: encrypted-on-device image blobs (opaque to the server)
  id INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT NOT NULL, flat_no TEXT NOT NULL, kind TEXT NOT NULL, ct TEXT NOT NULL, evidence_hash TEXT NOT NULL, created_ms INTEGER NOT NULL
);

-- Log chain guard in the database itself: seq must follow the previous seq and link to the previous hash.
CREATE TRIGGER log_entries_chain BEFORE INSERT ON log_entries
BEGIN
  SELECT RAISE(ABORT, 'log chain: seq gap') WHERE NEW.seq <> COALESCE((SELECT MAX(seq) FROM log_entries WHERE event_id = NEW.event_id), 0) + 1;
  SELECT RAISE(ABORT, 'log chain: prev_hash mismatch') WHERE NEW.seq > 1 AND NEW.prev_hash <> (SELECT hash FROM log_entries WHERE event_id = NEW.event_id AND seq = NEW.seq - 1);
END;

-- Append-only: record tables refuse UPDATE and DELETE.
CREATE TRIGGER societies_no_update BEFORE UPDATE ON societies BEGIN SELECT RAISE(ABORT, 'append-only: UPDATE refused on societies'); END;
CREATE TRIGGER societies_no_delete BEFORE DELETE ON societies BEGIN SELECT RAISE(ABORT, 'append-only: DELETE refused on societies'); END;
CREATE TRIGGER events_no_update BEFORE UPDATE ON events BEGIN SELECT RAISE(ABORT, 'append-only: UPDATE refused on events'); END;
CREATE TRIGGER events_no_delete BEFORE DELETE ON events BEGIN SELECT RAISE(ABORT, 'append-only: DELETE refused on events'); END;
CREATE TRIGGER event_status_no_update BEFORE UPDATE ON event_status BEGIN SELECT RAISE(ABORT, 'append-only: UPDATE refused on event_status'); END;
CREATE TRIGGER event_status_no_delete BEFORE DELETE ON event_status BEGIN SELECT RAISE(ABORT, 'append-only: DELETE refused on event_status'); END;
CREATE TRIGGER event_options_no_update BEFORE UPDATE ON event_options BEGIN SELECT RAISE(ABORT, 'append-only: UPDATE refused on event_options'); END;
CREATE TRIGGER event_options_no_delete BEFORE DELETE ON event_options BEGIN SELECT RAISE(ABORT, 'append-only: DELETE refused on event_options'); END;
CREATE TRIGGER event_rules_no_update BEFORE UPDATE ON event_rules BEGIN SELECT RAISE(ABORT, 'append-only: UPDATE refused on event_rules'); END;
CREATE TRIGGER event_rules_no_delete BEFORE DELETE ON event_rules BEGIN SELECT RAISE(ABORT, 'append-only: DELETE refused on event_rules'); END;
CREATE TRIGGER flats_no_update BEFORE UPDATE ON flats BEGIN SELECT RAISE(ABORT, 'append-only: UPDATE refused on flats'); END;
CREATE TRIGGER flats_no_delete BEFORE DELETE ON flats BEGIN SELECT RAISE(ABORT, 'append-only: DELETE refused on flats'); END;
CREATE TRIGGER agenda_points_no_update BEFORE UPDATE ON agenda_points BEGIN SELECT RAISE(ABORT, 'append-only: UPDATE refused on agenda_points'); END;
CREATE TRIGGER agenda_points_no_delete BEFORE DELETE ON agenda_points BEGIN SELECT RAISE(ABORT, 'append-only: DELETE refused on agenda_points'); END;
CREATE TRIGGER point_state_no_update BEFORE UPDATE ON point_state BEGIN SELECT RAISE(ABORT, 'append-only: UPDATE refused on point_state'); END;
CREATE TRIGGER point_state_no_delete BEFORE DELETE ON point_state BEGIN SELECT RAISE(ABORT, 'append-only: DELETE refused on point_state'); END;
CREATE TRIGGER people_no_update BEFORE UPDATE ON people BEGIN SELECT RAISE(ABORT, 'append-only: UPDATE refused on people'); END;
CREATE TRIGGER people_no_delete BEFORE DELETE ON people BEGIN SELECT RAISE(ABORT, 'append-only: DELETE refused on people'); END;
CREATE TRIGGER person_labels_no_update BEFORE UPDATE ON person_labels BEGIN SELECT RAISE(ABORT, 'append-only: UPDATE refused on person_labels'); END;
CREATE TRIGGER person_labels_no_delete BEFORE DELETE ON person_labels BEGIN SELECT RAISE(ABORT, 'append-only: DELETE refused on person_labels'); END;
CREATE TRIGGER person_verifications_no_update BEFORE UPDATE ON person_verifications BEGIN SELECT RAISE(ABORT, 'append-only: UPDATE refused on person_verifications'); END;
CREATE TRIGGER person_verifications_no_delete BEFORE DELETE ON person_verifications BEGIN SELECT RAISE(ABORT, 'append-only: DELETE refused on person_verifications'); END;
CREATE TRIGGER role_assignments_no_update BEFORE UPDATE ON role_assignments BEGIN SELECT RAISE(ABORT, 'append-only: UPDATE refused on role_assignments'); END;
CREATE TRIGGER role_assignments_no_delete BEFORE DELETE ON role_assignments BEGIN SELECT RAISE(ABORT, 'append-only: DELETE refused on role_assignments'); END;
CREATE TRIGGER attendance_no_update BEFORE UPDATE ON attendance BEGIN SELECT RAISE(ABORT, 'append-only: UPDATE refused on attendance'); END;
CREATE TRIGGER attendance_no_delete BEFORE DELETE ON attendance BEGIN SELECT RAISE(ABORT, 'append-only: DELETE refused on attendance'); END;
CREATE TRIGGER voter_ledger_no_update BEFORE UPDATE ON voter_ledger BEGIN SELECT RAISE(ABORT, 'append-only: UPDATE refused on voter_ledger'); END;
CREATE TRIGGER voter_ledger_no_delete BEFORE DELETE ON voter_ledger BEGIN SELECT RAISE(ABORT, 'append-only: DELETE refused on voter_ledger'); END;
CREATE TRIGGER ballot_box_no_update BEFORE UPDATE ON ballot_box BEGIN SELECT RAISE(ABORT, 'append-only: UPDATE refused on ballot_box'); END;
CREATE TRIGGER ballot_box_no_delete BEFORE DELETE ON ballot_box BEGIN SELECT RAISE(ABORT, 'append-only: DELETE refused on ballot_box'); END;
CREATE TRIGGER box_seals_no_update BEFORE UPDATE ON box_seals BEGIN SELECT RAISE(ABORT, 'append-only: UPDATE refused on box_seals'); END;
CREATE TRIGGER box_seals_no_delete BEFORE DELETE ON box_seals BEGIN SELECT RAISE(ABORT, 'append-only: DELETE refused on box_seals'); END;
CREATE TRIGGER log_entries_no_update BEFORE UPDATE ON log_entries BEGIN SELECT RAISE(ABORT, 'append-only: UPDATE refused on log_entries'); END;
CREATE TRIGGER log_entries_no_delete BEFORE DELETE ON log_entries BEGIN SELECT RAISE(ABORT, 'append-only: DELETE refused on log_entries'); END;
CREATE TRIGGER reports_no_update BEFORE UPDATE ON reports BEGIN SELECT RAISE(ABORT, 'append-only: UPDATE refused on reports'); END;
CREATE TRIGGER reports_no_delete BEFORE DELETE ON reports BEGIN SELECT RAISE(ABORT, 'append-only: DELETE refused on reports'); END;
CREATE TRIGGER anchors_no_update BEFORE UPDATE ON anchors BEGIN SELECT RAISE(ABORT, 'append-only: UPDATE refused on anchors'); END;
CREATE TRIGGER anchors_no_delete BEFORE DELETE ON anchors BEGIN SELECT RAISE(ABORT, 'append-only: DELETE refused on anchors'); END;
CREATE TRIGGER payments_no_update BEFORE UPDATE ON payments BEGIN SELECT RAISE(ABORT, 'append-only: UPDATE refused on payments'); END;
CREATE TRIGGER payments_no_delete BEFORE DELETE ON payments BEGIN SELECT RAISE(ABORT, 'append-only: DELETE refused on payments'); END;
CREATE TRIGGER super_admin_actions_no_update BEFORE UPDATE ON super_admin_actions BEGIN SELECT RAISE(ABORT, 'append-only: UPDATE refused on super_admin_actions'); END;
CREATE TRIGGER super_admin_actions_no_delete BEFORE DELETE ON super_admin_actions BEGIN SELECT RAISE(ABORT, 'append-only: DELETE refused on super_admin_actions'); END;
CREATE TRIGGER private_contacts_no_update BEFORE UPDATE ON private_contacts BEGIN SELECT RAISE(ABORT, 'append-only: UPDATE refused on private_contacts'); END;
CREATE TRIGGER private_contacts_no_delete BEFORE DELETE ON private_contacts BEGIN SELECT RAISE(ABORT, 'append-only: DELETE refused on private_contacts'); END;
CREATE TRIGGER private_evidence_no_update BEFORE UPDATE ON private_evidence BEGIN SELECT RAISE(ABORT, 'append-only: UPDATE refused on private_evidence'); END;
CREATE TRIGGER private_evidence_no_delete BEFORE DELETE ON private_evidence BEGIN SELECT RAISE(ABORT, 'append-only: DELETE refused on private_evidence'); END;

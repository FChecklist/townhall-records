-- AOA-RWA D1 schema 0009: erasure of ONE person without touching anyone else (DPDP Act 2023 / GDPR), and the record of privacy requests.
-- subject_keys: every person's private contact (ref 'p:<person>') and every flat's attendee photo / name (ref 'f:<flat>') is encrypted under its OWN random key, which is itself
-- wrapped under the event key. Erasing a person = throwing away that one wrapped key (cryptographic erasure): the append-only rows stay, but can never be read again.
-- This table is operational (it is the one place that is allowed to change).
CREATE TABLE subject_keys (
  event_id TEXT NOT NULL, ref TEXT NOT NULL, wrapped_key TEXT, created_ms INTEGER NOT NULL, destroyed_ms INTEGER,
  PRIMARY KEY (event_id, ref)
) WITHOUT ROWID;

-- Requests from people about their own data: access, correction, erasure, withdrawing consent, a grievance. Append-only, and NOT frozen by publication:
-- a person may ask long after the event is over.
CREATE TABLE privacy_requests (
  id TEXT PRIMARY KEY, event_id TEXT NOT NULL, type TEXT NOT NULL CHECK (type IN ('access','correct','erase','withdraw','grievance')),
  channel TEXT NOT NULL, subject_ref TEXT, ct TEXT NOT NULL, at_ms INTEGER NOT NULL, log_seq INTEGER
) WITHOUT ROWID;
CREATE TABLE privacy_resolutions (
  id INTEGER PRIMARY KEY AUTOINCREMENT, request_id TEXT NOT NULL, event_id TEXT NOT NULL, action TEXT NOT NULL CHECK (action IN ('done','refused')), note TEXT NOT NULL, by_pid TEXT NOT NULL, at_ms INTEGER NOT NULL, log_seq INTEGER
);
CREATE INDEX privacy_res_req ON privacy_resolutions(request_id);
CREATE TRIGGER privacy_requests_no_update BEFORE UPDATE ON privacy_requests BEGIN SELECT RAISE(ABORT, 'append-only: UPDATE refused on privacy_requests'); END;
CREATE TRIGGER privacy_requests_no_delete BEFORE DELETE ON privacy_requests BEGIN SELECT RAISE(ABORT, 'append-only: DELETE refused on privacy_requests'); END;
CREATE TRIGGER privacy_resolutions_no_update BEFORE UPDATE ON privacy_resolutions BEGIN SELECT RAISE(ABORT, 'append-only: UPDATE refused on privacy_resolutions'); END;
CREATE TRIGGER privacy_resolutions_no_delete BEFORE DELETE ON privacy_resolutions BEGIN SELECT RAISE(ABORT, 'append-only: DELETE refused on privacy_resolutions'); END;

-- After publication the log still accepts entries ABOUT the published record, now also a person's erasure and the handling of privacy requests.
DROP TRIGGER log_entries_after_report;
CREATE TRIGGER log_entries_after_report BEFORE INSERT ON log_entries
WHEN EXISTS (SELECT 1 FROM reports WHERE event_id = NEW.event_id)
  AND json_extract(NEW.entry_json, '$.type') NOT IN ('clone_linked','anchor','platform_action','contacts_read','key_destroyed','report_emailed','vote_rejected','person_erased','privacy_request','privacy_resolved','subject_access')
BEGIN SELECT RAISE(ABORT, 'published: this event can no longer change'); END;

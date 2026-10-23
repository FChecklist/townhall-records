-- AOA-RWA D1 schema 0008: the Attendance Monitor's photo of the attendee, with the time and place it was taken.
-- PRIVATE: the photo is encrypted under the event key; only its SHA-256, time and a flag list go into the public log. Append-only; frozen once the report is published.
-- lat/lon are what the monitor's phone said (it can be wrong or faked); net_lat/net_lon are where the network says the phone is. They are kept side by side so a human can compare.
CREATE TABLE attendance_evidence (
  id INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT NOT NULL, flat_no TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'photo', mime TEXT NOT NULL,
  sha256 TEXT NOT NULL, size INTEGER NOT NULL, ct TEXT NOT NULL,
  captured_ms INTEGER, server_ms INTEGER NOT NULL,
  lat REAL, lon REAL, accuracy_m REAL, geo_error TEXT, net_lat REAL, net_lon REAL, flags TEXT NOT NULL,
  consent INTEGER NOT NULL CHECK (consent = 1), checks_json TEXT, by_pid TEXT NOT NULL, log_seq INTEGER
);
CREATE INDEX att_evidence_flat ON attendance_evidence(event_id, flat_no);
CREATE TRIGGER att_evidence_no_update BEFORE UPDATE ON attendance_evidence BEGIN SELECT RAISE(ABORT, 'append-only: UPDATE refused on attendance_evidence'); END;
CREATE TRIGGER att_evidence_no_delete BEFORE DELETE ON attendance_evidence BEGIN SELECT RAISE(ABORT, 'append-only: DELETE refused on attendance_evidence'); END;
CREATE TRIGGER att_evidence_after_report BEFORE INSERT ON attendance_evidence WHEN EXISTS (SELECT 1 FROM reports WHERE event_id = NEW.event_id) BEGIN SELECT RAISE(ABORT, 'published: this event can no longer change'); END;

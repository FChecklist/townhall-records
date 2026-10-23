-- AOA-RWA D1 schema 0007: the signed-off PDF of the flat list, kept exactly as uploaded, with its hash written into the public log.
-- Append-only (nothing is edited or deleted); frozen once the report is published. The PDF holds names, so it is PRIVATE (never in the public report).
CREATE TABLE roll_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT NOT NULL, rev INTEGER NOT NULL, file_name TEXT NOT NULL, size INTEGER NOT NULL, sha256 TEXT NOT NULL,
  pdf BLOB NOT NULL, by_pid TEXT NOT NULL, at_ms INTEGER NOT NULL, log_seq INTEGER
);
CREATE INDEX roll_documents_event ON roll_documents(event_id, rev);
CREATE TRIGGER roll_documents_no_update BEFORE UPDATE ON roll_documents BEGIN SELECT RAISE(ABORT, 'append-only: UPDATE refused on roll_documents'); END;
CREATE TRIGGER roll_documents_no_delete BEFORE DELETE ON roll_documents BEGIN SELECT RAISE(ABORT, 'append-only: DELETE refused on roll_documents'); END;
CREATE TRIGGER roll_documents_after_report BEFORE INSERT ON roll_documents WHEN EXISTS (SELECT 1 FROM reports WHERE event_id = NEW.event_id) BEGIN SELECT RAISE(ABORT, 'published: this event can no longer change'); END;

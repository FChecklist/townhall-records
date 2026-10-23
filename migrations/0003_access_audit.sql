-- AOA-RWA D1 schema 0003: ACCESS AUDIT (owner directive 2026-10-23: every action is logged with IP address and device identifier; mandatory; accepted by everyone in the terms).
-- PRIVATE and APPEND-ONLY. ct = AES-GCM ciphertext of {ip, device, ua} under the event data key (or the platform key when the event has none);
-- ip_idx / dev_idx are keyed blind indexes so the same address or device can be traced across entries without decrypting.
-- Two rows per request: phase 'request' is written BEFORE the request is processed (a request that cannot be audited is refused), phase 'result' after, with the status and the log entry reached.
-- Ballot choices and receipts are NEVER part of an audit row.
CREATE TABLE access_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT, at_ms INTEGER NOT NULL, event_id TEXT NOT NULL, phase TEXT NOT NULL CHECK (phase IN ('request','result')),
  ref_id INTEGER, method TEXT NOT NULL, route TEXT NOT NULL, actor_kind TEXT NOT NULL, actor_ref TEXT, status INTEGER, log_seq INTEGER,
  ct TEXT NOT NULL, ip_idx TEXT NOT NULL, dev_idx TEXT NOT NULL, key_scope TEXT NOT NULL CHECK (key_scope IN ('event','platform'))
);
CREATE INDEX audit_ev ON access_audit(event_id, id);
CREATE INDEX audit_ip ON access_audit(ip_idx);
CREATE INDEX audit_dev ON access_audit(dev_idx);
CREATE TRIGGER access_audit_no_update BEFORE UPDATE ON access_audit BEGIN SELECT RAISE(ABORT, 'append-only: UPDATE refused on access_audit'); END;
CREATE TRIGGER access_audit_no_delete BEFORE DELETE ON access_audit BEGIN SELECT RAISE(ABORT, 'append-only: DELETE refused on access_audit'); END;

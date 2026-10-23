-- AOA-RWA D1 schema 0004: once an event's report is published, nothing about it can be added or changed, by anyone, the platform owner included.
-- (UPDATE and DELETE are already refused by the triggers in 0001.) The only entries still accepted after publication are the ones that record
-- something ABOUT the published record: a clone link, a daily anchor, a platform action (for example a lawful audit read), a contact read,
-- a key destruction (privacy erasure), an e-mailing of the report, a refused vote attempt.
CREATE TRIGGER log_entries_after_report BEFORE INSERT ON log_entries
WHEN EXISTS (SELECT 1 FROM reports WHERE event_id = NEW.event_id)
  AND json_extract(NEW.entry_json, '$.type') NOT IN ('clone_linked','anchor','platform_action','contacts_read','key_destroyed','report_emailed','vote_rejected')
BEGIN SELECT RAISE(ABORT, 'published: this event can no longer change'); END;

CREATE TRIGGER voter_ledger_after_report BEFORE INSERT ON voter_ledger WHEN EXISTS (SELECT 1 FROM reports WHERE event_id = NEW.event_id) BEGIN SELECT RAISE(ABORT, 'published: this event can no longer change'); END;
CREATE TRIGGER ballot_box_after_report BEFORE INSERT ON ballot_box WHEN EXISTS (SELECT 1 FROM reports WHERE event_id = NEW.event_id) BEGIN SELECT RAISE(ABORT, 'published: this event can no longer change'); END;
CREATE TRIGGER attendance_after_report BEFORE INSERT ON attendance WHEN EXISTS (SELECT 1 FROM reports WHERE event_id = NEW.event_id) BEGIN SELECT RAISE(ABORT, 'published: this event can no longer change'); END;
CREATE TRIGGER agenda_points_after_report BEFORE INSERT ON agenda_points WHEN EXISTS (SELECT 1 FROM reports WHERE event_id = NEW.event_id) BEGIN SELECT RAISE(ABORT, 'published: this event can no longer change'); END;
CREATE TRIGGER event_rules_after_report BEFORE INSERT ON event_rules WHEN EXISTS (SELECT 1 FROM reports WHERE event_id = NEW.event_id) BEGIN SELECT RAISE(ABORT, 'published: this event can no longer change'); END;
CREATE TRIGGER event_options_after_report BEFORE INSERT ON event_options WHEN EXISTS (SELECT 1 FROM reports WHERE event_id = NEW.event_id) BEGIN SELECT RAISE(ABORT, 'published: this event can no longer change'); END;
CREATE TRIGGER flats_after_report BEFORE INSERT ON flats WHEN EXISTS (SELECT 1 FROM reports WHERE event_id = NEW.event_id) BEGIN SELECT RAISE(ABORT, 'published: this event can no longer change'); END;
CREATE TRIGGER role_assignments_after_report BEFORE INSERT ON role_assignments WHEN EXISTS (SELECT 1 FROM reports WHERE event_id = NEW.event_id) BEGIN SELECT RAISE(ABORT, 'published: this event can no longer change'); END;
CREATE TRIGGER point_state_after_report BEFORE INSERT ON point_state WHEN EXISTS (SELECT 1 FROM reports WHERE event_id = NEW.event_id) BEGIN SELECT RAISE(ABORT, 'published: this event can no longer change'); END;
CREATE TRIGGER box_seals_after_report BEFORE INSERT ON box_seals WHEN EXISTS (SELECT 1 FROM reports WHERE event_id = NEW.event_id) BEGIN SELECT RAISE(ABORT, 'published: this event can no longer change'); END;
CREATE TRIGGER event_status_after_report BEFORE INSERT ON event_status WHEN EXISTS (SELECT 1 FROM reports WHERE event_id = NEW.event_id) BEGIN SELECT RAISE(ABORT, 'published: this event can no longer change'); END;
CREATE TRIGGER reports_one_per_rev_guard BEFORE INSERT ON reports WHEN NEW.rev > 1 BEGIN SELECT RAISE(ABORT, 'published: a report is final; corrections are new entries and an addendum, not a replacement'); END;

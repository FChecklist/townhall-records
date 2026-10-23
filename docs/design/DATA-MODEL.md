# DATA-MODEL (Phase 1 design)

Source of truth for SQL: `migrations/0001_records.sql` (record tables) and `migrations/0002_operational.sql` (operational tables). This file explains the intent, the privacy class of every table and what is append-only.

## 1. Conventions
* D1 (SQLite). Times are **server** epoch milliseconds. Money in minor units (paise). Weights are **integers** (flat = 1, area in sq ft x 100 if the society chooses, shares, custom); percentages are **basis points** (1 bp = 0.01 %). No floating point anywhere that decides a result.
* Ids: `event.id` = 32 hex chars (128 random bits); `person.id` = `p_` + 16 hex; `point_id` = `pt_` + 12 hex.
* **Versioned, not edited**: a changed value is a new row with a higher `rev` (current = highest rev). Nothing is ever updated or deleted.
* Every record row that changes the state of the event carries `log_seq`, the sequence number of the log entry that produced it, so a row can always be tied to the signed chain.

## 2. Classes
| Class | Meaning | Tables |
|---|---|---|
| **PUBLIC** | May appear on the public page and in the report. Contains only masked or intentionally-public values (flat numbers, titles, counts, rule texts). | societies, events, event_status, event_options, event_rules, flats, agenda_points, point_state, people (masked), person_labels, person_verifications, role_assignments, attendance, voter_ledger, ballot_box (receipts and totals only), box_seals, log_entries, reports, anchors |
| **PRIVATE** | Never public. Encrypted at rest or holds secrets. | private_contacts (AES-GCM under a per-event key), private_evidence (client-side-encrypted blobs, opaque), payments, super_admin_actions, passcodes (hash only), sessions (hash only), event_keys |
| **OPERATIONAL** | Mutable bookkeeping; not a record of what happened. | passcodes, sessions, rate_limits, mail_outbox, mail_counter, event_keys, kv_state |

`people` holds **only** `masked_name`, `masked_email`, `masked_phone` (Amendment A6). The full values exist only inside `private_contacts.ct`. `email_idx` is an HMAC blind index (keyed by a server secret) so a person can be found by e-mail without a plain e-mail column anywhere.

## 3. Append-only tables (UPDATE and DELETE rejected by trigger)
All 23 tables in `0001_records.sql`: societies, events, event_status, event_options, event_rules, flats, agenda_points, point_state, people, person_labels, person_verifications, role_assignments, attendance, voter_ledger, ballot_box, box_seals, log_entries, reports, anchors, payments, super_admin_actions, private_contacts, private_evidence. Each has `<table>_no_update` and `<table>_no_delete` (`RAISE(ABORT)`), 46 triggers in all.

Additionally `log_entries_chain` rejects an INSERT whose `seq` is not `max+1` or whose `prev_hash` is not the previous row's `hash`, so even a buggy writer cannot fork or gap the chain.

Limits, stated honestly: a database administrator can `DROP TRIGGER`. That is *detected* (chain + Ed25519 signatures + anchors), not prevented (THREAT-MODEL 3.5). **Crypto-shredding** (DPDP erasure) works by setting `event_keys.wrapped_key` to NULL (an operational table); the ciphertext rows stay, the images/contacts become unreadable, the public hash commitments in the log remain.

## 4. Table notes
* **societies / events**: a society is created with its first event. A clone creates a new society row copy (name, address, registration number) and `events.created_from_event_id`.
* **event_options**: the checkbox set (`proxy_voting`, `weightage`, `quorum_check`, `secret_ballot`, `open_vote_by_flat`, `attendance_photo`, `id_check`, `absentee_voting`, `extensions`, `minutes`, `designation_labels`, `notices`). `locked`+`locked_reason` mark options the rule pack makes required by law (ticked and locked with a one-line reason).
* **event_rules**: parameter values (`quorum.percent`, `notice.minDays`, ...) per scope (`event` or a point). A change is a new rev with `changed_by`, `reason`; the full history is printed in the report. After a point opens, writes with that point's scope are refused.
* **flats**: roll with weight; **no owner names**. Holder contact details, when given, are people records with `flat_no` and private contacts.
* **agenda_points**: `options_json` is the checkbox/choice set for that point (e.g. `["yes","no","abstain"]` or candidate ids); `majority_class` is `simple`, `two_thirds`, `three_quarters` or a custom fraction; `secret` 1 = secret ballot.
* **role_assignments**: provenance. Roles `organizer`, `host`, `attendance_officer`; `action` appoint/remove; `appointed_by` = person id. One person may have many rows. Current roles = appoints not followed by a remove. Co-host/Chairman/etc. are labels in `person_labels`, never roles.
* **attendance**: one row per presence mark; correction = new row with `supersedes_id`. `independent` = 1 only if marked by an Attendance Officer other than the organizer/host path; if an event has zero officers the report prints "Attendance was not independently verified". `doc_last4` max 4 chars; Aadhaar is never stored.
* **voter_ledger**: `UNIQUE(event_id, point_id, flat_no)` = one ballot per flat per point at the database level. `open_choice_json` is filled only for open-vote points.
* **ballot_box**: `WITHOUT ROWID`, primary key = the receipt hash (random), **no flat, no time**. Physical order is by random key, so insertion order does not leak. Rows are inserted in the same request that writes the ledger row, in one batch.
* **box_seals**: written at point close: `n`, per-option weighted counts and `digest` = SHA-256 of the sorted `receipt|choice|weight` lines. The same data goes into the log as `ballot_box_sealed` (receipts list public, receipt-to-choice pairs stay private).
* **reports**: immutable HTML snapshots, one per publication (`rev`). A correction is a new rev plus an addendum entry; the old rev stays downloadable.
* **payments**: state rows (`created`, `paid`, `failed`, `refunded`); amount 19900 / 49900 paise; `mode` `test` locally. No card data ever.
* **super_admin_actions**: what the owner did and why; mirrored into the affected event's log as `platform_action`.

## 5. What a public read may select
Only `PUBLIC`-class columns, always through the report/view builders. The test `public output contains no full e-mail/phone/name` runs the scanner over `/api/events/:id`, `/api/events/:id/log` and the report HTML for an event whose organizer, hosts and attendees all have real-looking contacts.

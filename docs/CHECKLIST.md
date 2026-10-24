# CHECKLIST (evidence per item)

Legend: [x] done and evidenced · [~] done in part (what is missing is stated) · [ ] not done.
Evidence files are in `docs/evidence/`. Reproduce: `bun test --isolate --timeout 60000 packages apps`; `bun scripts/mutate.ts all`; `bun scripts/sim-engine.ts`; `bun scripts/sim-stack.ts`; `bun scripts/perf.ts`.

## Phase 1 - design (docs/design/)
- [x] THREAT-MODEL.md (attackers: dishonest organizer/host, dishonest attendance officer, voter, outsider, database admin, super admin; each attack and control; addendum for terms, audit, freeze)
- [x] DATA-MODEL.md (tables, PUBLIC / PRIVATE / OPERATIONAL, append-only list) with `migrations/0001..0005`
- [x] LOG-FORMAT.md (canonical JSON, SHA-256 chain, Ed25519 per entry, anchors, verifier algorithm)
- [x] REPORT-SPEC.md (single self-contained file, embedded masked data + verifier, seal, download)
- [x] API.md (every route, auth, rate limits, as-built addenda)
- [x] Owner additions written up: WORLDWIDE-AND-LIVE-PAGE.md, OWNER-DIRECTIVES-2026-10-23.md, OFFLINE-AND-HANDSHAKE.md, LAW-FLEXIBILITY.md; docs/BRAND.md, UI-CONTRACT.md, SECURITY.md, PRIVACY.md, DECISIONS.md, PERF.md, DEPLOY-NOTES.md, CONFIDENCE.md

## Phase 2 - pure engine (packages/engine)
- [x] rule-pack loader + validator (reads docs/research/rule-packs.json; unset required values refuse to start; law-locked ticks) - `packs-tally.test.ts`, mutations E27 E28
- [x] worldwide custom pack + data-defined packs - `packs-tally.test.ts`
- [x] event state machine, roles, e-mail verification gate - `machine.test.ts`, E20-E27
- [x] quorum, adjourned quorum, majority classes (incl. unanimous / n/d), weightage, individual vote %, one vote per flat, proxy rules, secret vs open vote, election tally (no winner unless the pack says), formats single / ranked posts / first N, check-box counts - `packs-tally.test.ts`, `ballot.test.ts`; 17.2M-case oracle simulation (`docs/evidence/sim-engine.txt`)
- [x] 6-digit passcode module, every listed test - `passcode.test.ts`, E01-E06, 40,000 lifecycle sequences vs model
- [x] masking + scanner proving no full e-mail or 10-digit number in public output - `basics.test.ts`, E30, E50, A15, A23, 1M-case simulation
- [x] hash-chained signed log + verifier; never throws on damaged input - `log-report.test.ts`, E07-E11, E49
- [x] report generator (deterministic), seal, PDF, language drop-down - `log-report.test.ts`, `pdf.test.ts`, `newflows.test.ts`
- [x] clone-from-event (what is and is not copied), provenance tree - `log-report.test.ts` E29, A07
- [x] schedule (4 milestones), count-down timers - `schedule.test.ts`, E34-E38
- [x] 4-digit handshake, device binding; printed ballot paper (token, layout, SVG, tick reading) - `newflows.test.ts`
- [x] i18n catalogue (16 languages), role playbooks (what / how / where / when / why / with whom / which) - `newflows.test.ts`

## Phase 3 - API (apps/api, migrations/)
- [x] all routes in API.md, thin Pages Function wrapper - `apps/api/test/*.test.ts`
- [x] e-mail passcode verification for Organizer / Host / Officer behind a mailer interface (Resend adapter, local outbox stub, daily counter, quota state, second-provider slot) - `security.test.ts`, A11
- [x] Turnstile (fails closed), rate limits, no delete endpoint - A09, A10, A16
- [x] append-only triggers on 26 record tables + chain trigger + freeze after publication - `security.test.ts`, `features.test.ts`, A01-A04, A34, A35, A39
- [x] payment hook through the central path, TEST mode only - `security.test.ts`, A12
- [x] no personal data in public tables - `security.test.ts`, A15, A20
- [~] "Run locally with wrangler 3, local D1": **not done**: free RAM stayed under the 1.2 GB limit all session; tests run against the real migrations on SQLite instead (`apps/api/test/d1-sqlite.ts`). Wiring is in place (`apps/api/wrangler.toml`, `functions/api/[[path]].ts`, `scripts/gen-dev-vars.ts`).

## Tests the PM listed, each seen to fail when the code is broken
| Test | Test file | Mutation(s) that break it and are caught |
|---|---|---|
| replay a passcode | passcode.test.ts, security.test.ts | E01 |
| wrong subject / purpose | passcode.test.ts, security.test.ts | E02, A21 |
| 6 wrong tries locks | passcode.test.ts, security.test.ts | E03, E04 |
| vote twice | machine.test.ts, security.test.ts | E21, E14, A01 |
| vote before marked present | machine.test.ts, security.test.ts | E20, E15, A19 |
| vote after close | machine.test.ts, security.test.ts | E22, E23, E16 |
| change a rule after voting opened | machine.test.ts, security.test.ts | E24, E17, A06 |
| edit a log row directly in the DB (trigger blocks) | security.test.ts | A02 |
| delete a row (trigger blocks) | security.test.ts | A03 |
| forge or drop a log entry (verifier flags) | log-report.test.ts, security.test.ts | E07, E08, E09, E10 |
| tamper with a downloaded report | log-report.test.ts, security.test.ts | E12, E13 |
| public report has no full e-mail / phone / name | log-report.test.ts, security.test.ts | E30, E11, A15, A23 |
| clone never copies contacts, passcodes, images, votes | log-report.test.ts, security.test.ts | E29, A07 |
| Organizer cannot be the only unverified person acting | machine.test.ts, security.test.ts | E25 |
| one person Host + Attendance Officer works | machine.test.ts, security.test.ts | E26 |
| zero officers shows "not independently verified" | machine.test.ts, security.test.ts | E31 |

## Owner directives (2026-10-23)
- [x] stepwise console with progress, simple picture steps, Hindi + English - progress.ts, `log-report.test.ts`
- [x] one public page: live dashboard then sealed report; six-stage tracker - `features.test.ts`, E33, E48
- [x] schedule with day / date / time / place; count-down timers - E34-E38, A24, A25
- [x] everything logged with IP and device; terms ticked by everyone; fail-closed audit; masked views - `audit.test.ts`, A26-A32
- [x] prices India Rs 499 / 1499, world USD 5 / 15 - A33
- [x] PDF for signature; e-mail of the report; published within 120 s; frozen after publication - `features.test.ts`, A34-A39, E43
- [x] unique ids; ballot design; check boxes; min / max ticks; election formats - `ballot.test.ts`, `features.test.ts`, E39-E42, E47
- [x] 4-digit code exchange, device binding, optional SMS check - `offline.test.ts`
- [x] printed QR ballots: issue, void, photograph, read ticks, count, accounts - `offline.test.ts`, `newflows.test.ts`
- [x] languages (16) and per-role guides - `newflows.test.ts`, `offline.test.ts`
- [~] flexibility for the laws of "India and the world": engine can express the common structure and any society's own values; **only 7 regimes verified**; the rest is a research backlog (LAW-FLEXIBILITY.md); follow-up session proposed
- [ ] user interface, real-device paper pipeline, deployment, live payments, scheduler: not started (by design: later sessions)

## Measurements (docs/evidence/)
- tests: 243 pass, 0 fail (`full-run.txt`)
- mutation check: 89 of 89 caught (`MUTATIONS-all.md`)
- engine simulation: 17.2M cases, 0 disagreements (`sim-engine.txt`, `sim-engine-rerun.txt`)
- end-to-end simulation: 240 events, 35,184 API calls, 26,287 checks, 0 failures (`sim-stack.txt`)
- performance: vote p50 5 ms, p95 15 ms; replay of 736 entries 9 ms; verify 366 ms; report 588 KB (`perf.txt`, PERF.md)
- type check: 0 errors (`typecheck.txt`)

## Resume and per-person evidence (owner directive, 2026-10-23)
- [x] same completed link on the same phone or browser (device id OR server-issued cookie) returns a fresh bound session and the exact journey step; the earlier session ends; logged as `session_resumed`; other phones get 403 `not_recognised` - `apps/api/test/resume.test.ts`
- [x] every request stores IP, device id, browser-session id, cookie id, user agent, client hints, screen/time zone/language, network place, all encrypted; blind indexes `bsid_idx`/`bid_idx` (migration 0006)
- [x] `GET /api/vote/me`, `GET /api/events/:id/flats/:flat/evidence` (shortened values), `GET /api/super/events/:id/flats/:flat/dossier?reason=` (full values, reason logged)
- [~] no mutation entries yet for these routes; the browser client must send `x-browser-session` and `x-client-info` (UI not built)

## Flat list from PDF (owner directive, 2026-10-23)
- [x] Excel template download, fill, Save as PDF, upload PDF only; preview with problems by flat; confirm code; PDF + hash kept; manual add/change/remove with reason; all logged - `rollsheet.test.ts`, `rollimport.test.ts`
- [~] the PDF reader is tested on PDFs built like Excel's output (flipped transform, compressed streams, Identity-H + ToUnicode, multi-page, repeated heading). **Not yet tried on a real file saved by Excel / LibreOffice / Google Sheets**: that is the first thing to test when the UI exists. Scans and photos are refused by design.

## Team limits, attendance photo, tick-boxes (owner directive, 2026-10-23)
- [x] 1 Organizer / 5 Hosts incl. Organizer / 10 monitors (+ Organizer and Hosts may monitor = 15), enforced on appointment and on replay - `apps/api/test/team.test.ts`
- [x] photo of the attendee by the monitor with time, lat/long (phone) and network place, consent required, encrypted, hash + flags in the public log - `team.test.ts`
- [x] tick-box list required before marking present (option `attendance_checklist`) - `team.test.ts`; screen designed in `docs/UI-CONTRACT.md`
- [~] the phone's place can be faked; the network place is a rough cross-check (flags). Not proof. UI not built. No mutation entries yet for these routes.

## Outcomes, postponing, payment links, own rules (owner directive, 2026-10-24)
- [x] completed / stopped / postponed / cancelled / rescheduled, tick-box reasons, "are you sure", 4-digit typed number, shown on the public page - `apps/api/test/postpone.test.ts`
- [x] postponing: free before start (unlimited); after start first free, then 50% of the price; fee checked again on replay (a forged log is flagged) - `postpone.test.ts`
- [x] payment link anyone can pay (Organizer/Host creates and forwards it); reschedule fee takes effect when paid - `postpone.test.ts`
- [x] override of a locked option with a declaration; custom rules; both on the page - `apps/api/test/ownrules.test.ts`
- [~] real Razorpay is not connected (test mode); refunds: none by decision; "cancel after votes" refusal not covered by a test; research packs: see docs/research/extra/*.COVERAGE.md

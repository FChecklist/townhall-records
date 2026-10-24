# MASTER CHECKLIST: rules, roles, options (working name "Townhall")

A separate product for AOA / RWA / HOA / co-operative-society meetings and elections. It shares no code, database or website with any other product.
Main objective: a **transparent, honest, auditable** meeting or election. Everything below exists to serve that.

Legend: `[x]` built and covered by a named test · `[~]` built in part (what is missing is written) · `[ ]` not built yet · `[D]` decided by the owner, no code needed.
Evidence: tests live in `apps/api/test/*.test.ts` and `packages/engine/test/*.test.ts`. Re-run one file at a time with `powershell -File scripts/ram-guard.ps1 -Command "bun test --isolate <file>"` (see section P).

---

## 1. The three promises and how each is enforced
| Promise | How | Status |
|---|---|---|
| Transparent | one public page: live dashboard, then the sealed report; chronology of every action with date and time; rules, options, changes and refusals all public (in hidden form for people) | [x] `log-report`, `features`, `transparency` |
| Honest | rules are fixed before voting opens; every change/refusal is logged with a reason; results are recomputed from the log by anyone (verifier inside the report) | [x] `machine`, `security`, `verifier` |
| Auditable | hash-chained, Ed25519-signed log; database refuses edits and deletes; per-request access audit (IP, device, browser) written before the action; nothing is hidden from the audit, only from the public | [x] `security`, `audit` |

## 2. Roles (who, how many, what they may and may not do)
- [x] **Organizer**: exactly 1; creates the event; pays or forwards a payment link; sets rules, flat list, agenda; appoints Hosts and Monitors; may also act as Host and Monitor. Must confirm their e-mail by code. (`team`)
- [x] **Host**: up to 4 more (5 including the Organizer); everything the Organizer can do except pay-by-session and erase; may also act as Monitor. (`team`)
- [x] **Attendance Monitor**: up to 10 besides the Organizer/Hosts; up to 15 in all if they also monitor; checks proof, marks attendance, runs the 4-digit exchange, takes the optional photo, issues voter codes. Cannot change rules, agenda or list. (`team`, `offline`)
- [x] **Voter / flat holder**: one vote per flat per point (or the flat's weight); must be marked present; own phone bound to the flat; can reopen the same link and continue at the exact point. (`security`, `resume`)
- [x] **Proxy holder**: only if proxy voting is ticked; per-holder limit; shown separately; hidden when numbers are tiny. (`security`)
- [x] **Committee / Returning Officer / Government Officer / Observer / any other title**: optional free-text entries typed by the Organizer or Host (name, designation, authority, note); published before start; attendance marked; blank signature cells and signature lines. (`officials`)
- [x] **Platform owner**: read-only console; sees full audit values only with a typed reason that lands on the event's public chronology; cannot edit or delete. (`audit`, `security`)
- [x] **Public**: no sign-in; sees the page, downloads the sealed report and PDF, runs the verifier, may use the privacy form. (`features`)
- [x] Limits are enforced on appointment and re-checked when anyone verifies the log. (`team`)

## 3. Permission matrix
| Action | Organizer | Host | Monitor | Voter | Public |
|---|---|---|---|---|---|
| Create event / recreate from an old one | yes | recreate only | no | no | no |
| Edit rules, options, own rules, flat list, agenda, officials | yes | yes | no | no | no |
| Pay / create a payment link | link: yes | link: yes | no | no | anyone with the link can pay |
| Publish agenda, start, open/close/extend points | yes | yes | no | no | no |
| Postpone, stop, cancel, complete (tick-boxes + 4-digit confirm) | yes | yes | no | no | no |
| Mark attendance, issue voter codes, take photo | only if no Monitor exists | same | yes | no | no |
| See full name/phone of the person being checked (working view) | yes (contacts) | yes | only while checking that flat | own data | no |
| Cast a ballot | no | no | no | yes | no |
| Erase one person; answer privacy requests | yes | answer only | no | file requests | file via form |
| Erase all private details | yes | no | no | no | no |
- [x] all of the above enforced server-side and by the state machine. (`machine`, `team`, `transparency`)

## 4. Life of an event
- [x] states: setup, agenda published, live, postponed, closed (outcome: completed, stopped in between, cancelled); "rescheduled" shown when moved before the start. (`postpone`)
- [x] six-stage tracker on the page: Rules, Attendance, Quorum, Vote, Count, Publish. (`features`)
- [x] four dates, each with day/date/time/place; count-down timers; cannot go backwards. (`log-report`)
- [x] postponing: before the start time free and unlimited; after it the first is free, every later one costs 50% of the event price (India Rs 249.50/749.50; elsewhere USD 2.50/7.50), payable by anyone through a link; the new date takes effect when paid; fee re-checked by the verifier. (`postpone`)
- [x] ending: choose one outcome with tick-box reasons, press Yes, type the 4-digit number shown; five wrong tries kill the request. (`postpone`)
- [x] automatic close and publish within 120 s of the scheduled end (can be switched off). (`features`)
- [x] after publication nothing can be added (database triggers); only entries ABOUT the record (anchors, privacy erasure, report e-mails ...). (`security`)

## 5. Setup checklist for an Organizer
- [x] society name, address, registration number, kind (AOA/RWA/HOA/co-operative)
- [x] jurisdiction pack (158) or "Any country: enter your own bye-law values"; use recommended settings
- [x] meeting or election; event type (AGM, SGM, committee, monthly, custom)
- [x] flat list: download the Excel sheet, fill it, save as PDF, upload the PDF (PDF only); preview with every problem named; confirm code; manual add/change/remove, each with a reason (`rollimport`)
- [~] owners' names and contacts: added one by one (`holders`) or carried over by "recreate"; the PDF's names become private holders. **Missing:** correcting an existing holder's name (add a new holder instead).
- [x] agenda points: discussion, resolution (yes/no/abstain), election post (candidates, min/max ticks, format); ballot design; majority class per point (`ballot`, `features`)
- [x] optional: committee, returning officer, government officer, observers, other (`officials`)
- [x] optional: the society's own extra rules; override of a law-locked option with a written declaration (`ownrules`)
- [x] team: Hosts, Monitors (with limits), designation labels (`team`)
- [x] pay: by the Organizer or by anyone via a link (`postpone`); [~] live Razorpay not connected (owner keys needed); test mode only
- [x] publish the agenda: refuses until payment, rules, flats and agenda are set (`machine`)

## 6. Rule parameters (all configurable; full list with ranges is in the generated reference document)
- [x] notice (min/max days, delivery) · quorum (basis weight or flats, percent, "more than", cap, adjourned rules) · majorities (simple/special basis, tie-break, abstentions) · voting window (extensions) · proxies per holder · election (declare winner, small-cell hiding) · ballot mode (online/printed/either) · nomination, term, requisition, reserved seats, minutes deadline, record keeping, **privacy retention days (default 365)**
- [~] **Not expressible yet, found by the 8 law researchers (backlog, section R):** "against" vote caps (25%), polls weighted by unit entitlement, quorum varying with building size, notice varying by resolution type, two-test majorities, arrears removing the vote, secret ballot "on demand", staggered board terms, outside returning authority, waiting period after a reduced quorum.

## 7. Options (tick-boxes; a law pack may lock one, the Organizer may override with a declaration)
- [x] proxy voting · weighted votes · check quorum · secret ballot · open vote by flat · photo of the attendee · ID document check · **monitor must tick every box** · **voter locks the ballot with a 4-digit number** · absentee voting · extend voting window · minutes · designation labels · notice check · automatic close and publish
- [x] each option is a plain tick-box; the report lists the ticked/unticked/locked state and every change (`features`, `ownrules`)

## 8. Law packs
- [x] 158 packs: India (central + states/UTs), USA (50 + DC), Canada (9 of 13), Australia (8) + NZ, UK/Ireland/Singapore/Hong Kong/Malaysia/Cyprus/Malta, Japan, South Africa, Germany, Spain, Brazil, Colombia, Dubai, Philippines, France, Thailand; each leaf has value, note, source, confidence, "needs a lawyer". Unread = blank, never guessed.
- [~] **NOT READ** (official sites blocked or not reached): see `docs/research/extra/*.COVERAGE.md` for the exact list. Every value needs a lawyer before reliance.

## 9. Attendance (the heart of credibility)
- [x] the person shows proof; the Monitor sees the name in full on the WORKING screen, compares, ticks the boxes (proof seen, name matches, flat matches, person agreed, photo taken, person checked); it is hidden again the moment attendance is marked (`transparency`)
- [x] 4-digit exchange: the person checks name, flat and status on their own phone; each side types the other's 4-digit number; 5 tries; 10 minutes; the two devices must differ (`offline`)
- [x] an ID number, even its last digits, is never kept; the page says "ID (type) verified by <hidden name> (role), <date time>" and "Marked present by <hidden name> (role), <date time>" (`transparency`)
- [x] optional photo with date, time, phone location and network location side by side; consent required; encrypted per flat; flags for missing/impossible/far/time-off place (`team`)
- [x] optional text-message check of the mobile number (`offline`)
- [x] same-link resume on the same phone/browser; another phone refused and logged (`resume`)
- [~] **Missing:** correction of a name after attendance by Host approval (two-person rule); roll published and hash-locked before the meeting.

## 10. Voting, quorum, counting
- [x] one flat one vote per point; weights; eligibility; present-only; server clock decides the window (`machine`, `security`)
- [x] quorum before opening; adjourned meeting rules from the pack (`machine`)
- [x] secret ballot: ballot box has no flat and no time; random receipts; counts hidden while open; open vote by flat is a separate option (`security`)
- [x] 4-digit ballot lock: review the choice, number shown, type it to cast; recomputed from the ballot with a server secret so nothing links voter to choice (`transparency`)
- [x] printed ballots with unique QR codes; ticks read; counted/invalid/voided/uncounted accounts (`offline`) [~] tested on drawn images, not real photographs
- [x] majority classes (simple, two-thirds, three-quarters, unanimous, any n/d), tie rules, abstentions, election formats (single post, ranked posts, first N) (`ballot`)
- [x] 17.2 million random cases against an independent oracle, 0 disagreements (`docs/evidence/sim-engine.txt`); [~] the oracle was rerun only before the masking change (it does not test masking)

## 11. Payment
- [x] pay-per-event: India Rs 499 meeting / Rs 1499 election; elsewhere USD 5 / 15 (`postpone`)
- [x] anyone with the link can pay without signing in; payer name and e-mail kept encrypted and private (`postpone`)
- [x] no refunds [D]; no built-in payment host: a payment service must be configured for this product
- [ ] live Razorpay (India) and international (applied for by the owner)

## 12. Report, PDF, web page
- [x] one sealed HTML file with data and verifier inside; PDF for signature with signature lines for Returning Officer/Chair/Secretary and for every listed official (`features`, `officials`)
- [x] watermark "MEETING ID / ELECTION ID <id>" on every PDF page and on the web page (`officials`)
- [x] chronology of every action, event and process with day, date, time, who (hidden form + role), what, and the log fingerprint, on the page and in the PDF (`transparency`)
- [x] "Who did what, and when" register; outcome banner with reasons and the history of every move (`postpone`, `transparency`)
- [x] languages: 16 drop-down; role guides English + Hindi [~] other languages are drafts needing native review

## 13. Audit and logs
- [x] public log: canonical JSON, SHA-256 chain, Ed25519 per entry, daily anchors; verifier never throws (`security`, `log-report`)
- [x] access audit: every request (IP, device, browser session id, cookie id, user agent, client hints, network place) written encrypted BEFORE the action; fail closed (`audit`)
- [x] non-editable: UPDATE and DELETE refused by triggers on every record table; the platform owner has no override (`security`)
- [x] timestamps: replay flags a time that runs backwards by more than 5 s (`transparency`)
- [ ] external witness of the daily anchor (publish it somewhere not under our control) [R]

## 14. Privacy: DPDP Act 2023 and GDPR
- [x] ONE universal masking rule on the public page, PDF, log and every public answer: name `Raj****** Aga******` (first 3 letters of first, middle if any, last; 6 stars always), e-mail `********rwal@gmail.com` (last 4 letters before @, domain visible), mobile `******3210` (last 4 digits). Applies to everyone including Organizer, Hosts and Monitors. (`basics`, `transparency`)
- [x] full values appear only on the working screen of the person doing the verification, only while they do it, and each look is logged (`transparency`)
- [x] flat number visible; ID number never kept; only "verified by ID (type)" (`transparency`)
- [x] data minimisation: no addresses of people, no ID numbers, optional photo and location only on consent
- [x] encryption: each person's contact under its own key, each flat's photo and attendee name under its own key, all wrapped under the event key, wrapped under the master secret (`transparency`)
- [x] erasure of ONE person or flat by destroying their key, also after publication; the public record keeps verifying (`transparency`)
- [x] erasure of everything private by destroying the event key; [x] automatic after the retention period (default 365 days, never shorter than the pack's record-keeping period) [~] retention job written; its test is pending (see section R)
- [x] subject rights: access (self and by Organizer with a reason), correction, withdrawal, erasure, grievance via signed-in route or public form; every step logged; requests are accepted after publication (`transparency`)
- [x] consent: terms ticked once by everyone, as a signed log entry; photo needs consent; terms say what is public and what is hidden
- [~] **Not code, needs the owner/lawyer:** named grievance officer and contact; data-processing agreements with the mail and payment providers; breach-notification procedure; data location statement; DPDP/GDPR mapping reviewed by counsel (`docs/COMPLIANCE-MAP.md`)

## 15. Security
- [x] AES-256-GCM field encryption; HMAC-keyed blind indexes and fingerprints; Ed25519 signatures; SHA-256; no passwords anywhere
- [x] staff sign-in by e-mail code (6 digits, single use, tied to person and purpose, 6 wrong tries lock); in-room confirmations by 4-digit numbers (5 tries, short life) instead of SMS or WhatsApp
- [x] rate limits per IP, person, event; Turnstile on public forms; sessions bound to the device (or browser cookie)
- [x] security headers on every answer: HTTPS-only, no framing, no sniffing, no referrer, camera and place only for our own pages, closed content policy (`transparency`)
- [x] privacy by design in the ballot box (no flat, no time, random order) and in the ballot lock
- [ ] independent security review and penetration test [R]; key rotation procedure [R]

## 16. Architecture, and the RAM rule
- [x] laptop rule: every command runs under `scripts/ram-guard.ps1`: at most 20% of RAM (about 1.6 GB), refuses to start when free RAM is below 600 MB (Corporate Tambola has first right), heavy runs also need the shared lock; measured: single test files peak 80-180 MB, typecheck 365 MB
- [x] the server does little: it checks rules, writes the signed log, stores ciphertext, serves one cached sealed file; counting, rendering of the page and the verifier already run on the user's device (the report file); [~] the PDF is still rendered on the server on request, and the flat-list PDF is read on the server (cheap, but could move to the phone)
- [x] stack: Bun + TypeScript (strict), Cloudflare Pages Functions + D1 (SQLite) for the server, WebCrypto, no framework dependencies in the engine

## 17. Test and evidence
- [x] 294 tests passing across 13 API files and the engine, run one file at a time under the RAM guard (`docs/evidence/`)
- [x] 89 of 89 deliberate-breakage checks caught [~] none yet for the newest routes (section R)
- [~] full end-to-end run on real wrangler/D1: not done (RAM); the tests run the real migrations on SQLite

## R. Open items (honest list)
1. User interface and screens (designed in `docs/UI-CONTRACT.md`, not built).
2. Real Razorpay (owner keys), refunds none by decision.
3. Real-device paper-ballot photos; real Excel-saved PDF for the flat list.
4. Mutation checks for: team limits, photo, outcomes, postponement fees, own rules, officials, privacy, working view, ballot lock, retention.
5. Retention job test; erase-photo test; recreate test with officials and own rules already passes, retention not.
6. New options from the law researchers' gap lists (section 6).
7. Second research round for the NOT READ regimes; lawyer review of every pack.
8. Correction of a holder's name; two-person rule for name changes after attendance; roll published and hash-locked before the meeting.
9. External witness for the daily anchor; independent security review; key rotation.
10. Brand clearance for the name "Townhall"; native review of translations.
11. Named grievance officer, processor agreements, breach procedure (owner/lawyer).

# API (Phase 1 design; Pages Functions under `/api/*`)

One entry point: `apps/api/src/handler.ts` -> `handle(request, env, now)`; the Pages Function `apps/api/functions/api/[[path]].ts` only forwards. JSON in, JSON out (`cache-control: no-store`) except the report HTML. Max body 64 KB (evidence upload 256 KB). **There is no DELETE route and no route that edits history**; `DELETE` on any path returns 405.

## Auth classes
* **PUB** no login. Forms that create things or send mail also need a **Turnstile** token (`turnstile` field; verified through the `Turnstile` interface, a stub accepts `test-ok` locally).
* **STAFF(roles)** `Authorization: Bearer <token>` from `/api/auth/verify`. Token is bound to (event, person); allowed roles are recomputed from `role_assignments` on every call. The person must have a verified e-mail.
* **VOTER** `Bearer` from `/api/vote/login`; bound to (event, flat).
* **SUPER** `Bearer` from `/api/super/verify`; the identity is the single address in `SUPER_EMAIL` (never revealed).

## Rate limits (fixed windows in `rate_limits`, keys are salted hashes, never raw IP/e-mail)
| Class | Limit |
|---|---|
| AUTH | per IP 20 / 10 min; per e-mail-hash 5 / 10 min; per event 60 / 10 min |
| VOTE-LOGIN | per IP 20 / 10 min; per event 300 / 10 min; plus the per-passcode 5-try lock (15 min) |
| CREATE | per IP 5 events / hour |
| WRITE | per session 120 / min |
| READ | per IP 240 / min |
| MAIL | global daily send counter per provider; over quota -> `503 mail_quota_reached` and `mail_quota` flag in `/api/super/overview` |
Exceeded -> `429 {error:"rate_limited", retryAfterSec}`.

## Errors
`{ "error": "<code>", "message": "<plain words>" }` with 400 validation, 401 not signed in, 403 role/state refusal, 404 not found, 409 conflict (e.g. already voted), 423 locked, 429 rate limit, 503 quota.

## Routes
### Public
| Method path | Auth | Purpose |
|---|---|---|
| GET `/api/health` | PUB | `{ok}` |
| GET `/api/pubkey` | PUB | `{alg:"Ed25519",kid,publicKey}` |
| GET `/api/packs`, `/api/packs/:id` | PUB | pack summaries; one pack = parameters (value or `null` = must be set), locked options with reasons, notice rules |
| POST `/api/events` | PUB + Turnstile, CREATE | create event; creator becomes Organizer (unverified); body: kind, eventType, title, venue, scheduledMs, packId, society{name,address,registrationNo,kind}, organizer{name,email,phone}, cloneFrom?, useRecommended? -> `{eventId, personId}`; mails an e-mail passcode |
| POST `/api/auth/request` | PUB + Turnstile, AUTH | body {eventId,personId}; always 200 (no account oracle); sends a fresh login passcode (voids the old) |
| POST `/api/auth/verify` | PUB, AUTH | {eventId,personId,code} -> `{token,roles}`; first success logs `email_verified` |
| GET `/api/events/:id` | PUB, READ | masked public view (society, event, status, options, rules, roles tree, agenda, roll) |
| GET `/api/events/:id/log` | PUB, READ | all `{entry,hash,sig}` + head |
| GET `/api/events/:id/template` | PUB, READ | clone source: profile, pack, options, flats(no names), agenda structure, labels; never contacts |
| GET `/api/events/:id/receipts/:pointId` | PUB | sorted receipt list; `?check=<receipt>` -> `{found}` |
| GET `/api/r/:id` (`?download=1`) | PUB | latest published report HTML |
| GET `/api/r/:id/data` | PUB | report model + log JSON |

### Staff (Organizer and Host have the same rights; Attendance Officer where stated)
| Method path | Roles | Purpose |
|---|---|---|
| GET `/api/events/:id/private` | O,H | staff view incl. who may act, passcode status (no digits) |
| PUT `/api/events/:id/options` | O,H | `{options:{key:bool}}`; locked-by-law keys refused |
| PUT `/api/events/:id/rules` | O,H | `{scope?, changes:{param:value}, reason}`; refused once the point is open (logged `rule_change_rejected`) |
| PUT `/api/events/:id/roll` | O,H | `{flats:[{flatNo,weight,eligible}]}` new rev; before voting only |
| POST `/api/events/:id/people` | O,H | appoint: {name,email,phone?,role,label?,flatNo?} or {personId,role}; records `appointed_by`; mails the new person an e-mail passcode |
| POST `/api/events/:id/people/:pid/remove` | O,H | {role} |
| POST `/api/events/:id/people/:pid/label` | O,H | {label} (designation label, no rights) |
| POST `/api/events/:id/points` | O,H | add agenda point; PUT `.../points/:pid` amends (refused after it opened) |
| POST `/api/events/:id/pay` | O | create payment (Rs 199 meeting / Rs 499 election; TEST mode only here) -> `{paymentId, amountMinor, mode}` |
| POST `/api/pay/test-confirm` | O | TEST_MODE only; confirms the test payment |
| POST `/api/pay/webhook` | signature | payment provider callback (verifies HMAC; TEST stub) |
| POST `/api/events/:id/agenda/publish` | O,H | needs payment + setup valid (no required rule unset); evaluates notice period |
| POST `/api/events/:id/start`, `/close` | O,H | state machine transitions; close seals open points, computes results, writes report |
| POST `/api/events/:id/points/:pid/open`, `/close`, `/extend` | O,H | voting windows (server clock); open freezes the point's rules and logs quorum |
| POST `/api/events/:id/attendance` | A (or O,H when no officer exists) | mark present {flatNo,attendeeName,mode,method,docType?,docLast4?,evidenceHash?}; supersede with `supersedes` |
| POST `/api/events/:id/evidence` | A | optional encrypted image blob (client-side encrypted) |
| POST `/api/events/:id/passcodes/voter` | A (or O,H when none) | issue a voter passcode {flatNo}; digits returned once; re-issue voids old |
| GET `/api/events/:id/contacts` | O,H | decrypted contacts; always logged `contacts_read` |
| POST `/api/events/:id/crypto-shred` | O | destroy the event data key (DPDP erasure) |

### Voter
| Method path | Purpose |
|---|---|
| POST `/api/vote/login` | PUB + Turnstile, VOTE-LOGIN: {eventId,flatNo,code} -> `{token}`; consumes the passcode |
| GET `/api/vote/points` | open points for the flat, whether already voted |
| POST `/api/vote/cast` | {pointId, choices:[optionId]} -> `{receipt}` (secret) or `{recorded:true}` (open) |

### Super console (hidden path `/api/super/*`)
| Method path | Purpose |
|---|---|
| POST `/api/super/request`, `/api/super/verify` | e-mail passcode fallback login (WebAuthn passkey is added by the UI session); login alert mail |
| GET `/api/super/overview` | societies, events, payments, mail counters and quota state, chain/anchor status, health. Read-only |
| POST `/api/super/events/:id/suspend` | {reason}; only for an event that has not started; logged in the event's chain |
| POST `/api/super/payments/reconcile` | {paymentId, note}; appends a reconcile state row |

### Internal
POST `/api/internal/anchor` (header `x-internal-secret`) appends `anchor` entries for live events; used by the owner-only scheduler later.

## Addendum: as built (2026-10-23)
Routes added during the build, all in `apps/api/src/handler.ts`:
* PUB `GET /api/schema` (rule parameter and option definitions, event types, prices) · `GET /api/r/:id/head` (`{seq,hash,status}` for the live page refresh) · `GET /api/r/:id/data` (model + log).
* STAFF `POST /api/events/:id/holders` (add a flat holder's contact to the PRIVATE roll; log entry `holder_added`, masked) · `POST /api/events/:id/people/:pid/remove` · `POST /api/events/:id/crypto-shred` (Organizer only; allowed after close).
* `GET /api/events/:id` returns `{model, progress}`: the public view and the 8-step console state in one call.
* Rate limits as built: AUTH per address 20/10 min, per person 5/10 min, per event 60/10 min · VOTE-LOGIN per address 400/10 min (a hall shares one Wi-Fi address), per address+flat 20/10 min, per event 600/10 min, plus the 5-try lock on the passcode itself · CREATE 5 events per address per hour · WRITE 120/min per session · all writes 600/min per address, reads 240/min.
* Failed passcode attempts are counted (5 tries then a 15-minute lock) but not chained one by one, so nobody can flood the public log; the lock itself, every issue, every success and every refused vote (`vote_rejected`) are logged.
* A text field containing a complete e-mail address or phone number is refused with `contains_personal_data` instead of being published.
* `PUT /api/events/:id/schedule` {schedule:{start,votingStart,votingEnd,end:{atMs,place}}, reason}: Organizer/Host, before the event starts. `POST /api/events` also accepts `schedule` and `timezone`. `GET /api/r/:id/head` now includes `serverNow`.

## Addendum 2026-10-23 (owner directives)
* Every non-public-read request needs header `x-device-id`; bodies of `POST /api/events`, `POST /api/auth/verify` (first time) and `POST /api/vote/login` (first time per flat) need `acceptTerms: true` and `termsVersion` equal to `GET /api/terms`.
* `GET /api/terms` · `GET /api/r/:id/pdf` (public, after publication) · `POST /api/events/:id/report/email` {to:[1..10 e-mails]} (Organizer/Host) · `GET /api/events/:id/audit` (Organizer/Host, shortened) · `GET /api/super/events/:id/audit?reason=` (owner, full, logged) · `POST /api/internal/tick` (scheduler, secret header; run every minute).
* `POST /api/events` also takes `country` (two letters). `POST/PUT .../points`: resolutions take `abstain`; election posts take `candidates` (strings or {id,label}), `maxChoices`, `minChoices`, `format` (`single_post`|`ranked_posts`|`top_n`), `seats`, `topN`, `design`. `POST /api/vote/cast` takes `marks` {optionId: true|false} or `choices` [ids].
* `GET /api/schema` now lists prices (`priceText`), election formats and the default ballot design.

## Addendum 2026-10-23 (b): handshake, printed ballots, languages, guides
* Handshake (Attendance Officer = staff with `mark_attendance`): `POST /api/events/:id/handshakes` {flatNo, attendeeName, kind?, mobile?} -> {handshakeId, monitorCode, token, linkPath}; `GET /api/events/:id/handshakes/:hid`; `POST .../:hid/confirm` {code = the code on the VOTER's phone}; `POST .../:hid/sms-confirm` {senderNumber}.
* Handshake (voter's phone, no sign-in, needs `x-device-id`): `GET /api/h/:token` -> {voterCode, flatNo, termsRequired, smsLink}; `POST /api/h/:token/confirm` {code = the code on the OFFICER's screen, acceptTerms}; `GET /api/h/:token/status` -> {state, token once}. The returned session works only on that phone; a later handshake for the same flat ends it.
* Printed ballots (staff `issue_voter_code`): `POST /api/events/:id/points/:pid/paper` {flatNo, kind?} -> {serial, token, qrText, svg, layout}; `GET .../paper/preview` (designer); `POST .../paper/void` {token, flatNo}; `POST .../paper/scan` {token, marks|choices, imageSha256, imageCt?} -> {result: counted|invalid}; `POST .../count/finish` seals a paper point (also done automatically when the event closes).
* `ballot.mode` rule: online | printed | either. Paper needs a secret ballot (`paper_needs_secret` at publish).
* `GET /api/languages`, `GET /api/i18n/:lang`, `GET /api/guide/:role?lang=&event=` (roles organizer, host, attendance_officer, voter; organizer + event adds step status).
* Log types added: `handshake_started`, `device_bound`, `mobile_confirmed`, `paper_issued`, `paper_reissued`, `paper_voided`, `terms_accepted`, `schedule_set`, `report_emailed`; `ballot_box_sealed` may carry `paper` {serials, counted, invalid, voided, uncounted, imagesDigest}.

## Flat list from a PDF (owner directive 2026-10-23: PDF only)
* `GET /api/events/:id/roll/template?flats=N` (staff, edit_setup) -> `flat-list-template.xlsx` (title line `TOWNHALL-ROLL-V1`, grey headings, Yes/No dropdown, whole-number check, landscape one page wide). Fill it, **File > Save As > PDF**, upload the PDF.
* `POST /api/events/:id/roll/import` `{ pdfBase64, fileName?, confirm?, reason? }` - only `%PDF-` files (413 over 6 MB). Without `confirm`: **preview only, nothing saved** (problems named by flat, counts, total weight, added/removed/changed, table). With `confirm` = the 8-letter `confirmCode` of that same file: saved as a new roll revision; the PDF is kept (`roll_documents`, append-only, private) and its SHA-256 is in the public `roll_set` entry. Replacing an existing list needs `reason`. Names, e-mails, mobiles become private holders (never public).
* `POST /api/events/:id/roll/flat` `{ op: add|change|remove, flatNo, weight?, eligible?, name?, reason }` - manual entry/correction, `reason` (5+ letters) always required; each is a new `roll_set` revision whose before/after is public. Refused once voting has started (same rule as the list).
* The PDF reader (`pdftext.ts`) reads text PDFs only (what Excel/LibreOffice/Google Sheets produce); a scan or photo is refused with a plain message.

## Team limits, attendance photo, tick-boxes (owner directive 2026-10-23)
* Limits (engine `attendance.ts`, enforced on `POST /people` as 409 `role_limit` and re-checked on replay): 1 Organizer; at most 5 Hosts including the Organizer; at most 10 Attendance Monitors besides them; the Organizer and Hosts may also be monitors (15 in all). `GET /api/events/:id/team` gives counts, limits and `canAdd`.
* `POST /api/events/:id/attendance/photo` (monitor; option `attendance_photo` on): `{ flatNo, photoBase64 (JPEG/PNG, <=400 KB), consent: true, capturedAtMs, geo?{lat,lon,accuracyM}, geoError?, checks? }`. Stored encrypted in `attendance_evidence` (append-only) with the phone's place AND the network's place side by side; public log gets `evidence_filed` with the SHA-256, size, time, flags, monitor - no place, no image. Flags: ok, no_location, bad_location, far_from_network (>150 km), time_off (>10 min from server clock). Flags are for a human to look at, not proof.
* `GET /api/events/:id/attendance/photos/:id` - the image, Organizer/Hosts only (audited). The photo list with time/place is in `GET /api/events/:id/flats/:flat/evidence` (`photos`).
* `POST /attendance` accepts `checks` (booleans); with option `attendance_checklist` all required boxes must be true (400 `tick_all_boxes` names the missing ones; 400 `photo_first` if no photo yet).

## Ending, stopping, cancelling, postponing; payment links; the society's own rules (owner directive 2026-10-24)
* Outcomes shown on the page: **Completed**, **Stopped in between**, **Postponed**, **Cancelled** (and **Rescheduled** when moved before the start time). Votes already cast always stay in the log and the report.
* `GET /api/events/:id/end-options` -> the four choices (with `allowed`), the tick-box reasons (`REASON_CODES`, several may be ticked) and the price quote for postponing now.
* `POST /api/events/:id/intent` `{ action: complete|stop|cancel|postpone, reasonCodes[], reason?, newSchedule? }` -> `{ intentId, areYouSure, confirmCode }`. The screen shows the "Are you sure?" question (Yes / No); on Yes it shows the 4-digit `confirmCode`; the user types it by hand.
* `POST /api/events/:id/confirm` `{ intentId, code }` -> executes. 5 wrong numbers kill the request; it expires in 10 minutes; only the person who started it can confirm. Nothing is written to the log before this succeeds.
* Cancel is refused once any point has opened (choose Stopped in between). Stop needs a started event. Postpone needs no point open. New date: any future date, no minimum gap; the venue and time are chosen by the Organizer/Host.
* **Price of postponing** (`postponeQuote`, also re-checked on replay): before the scheduled start time: free, unlimited. After it: the first is free; every later one costs 50% of the event price (India meeting Rs 249.50, election Rs 749.50; elsewhere USD 2.50 / 7.50, rounded up). A quorum failure counts as after the start time. When a fee is due, `confirm` answers 202 `awaitingPayment` with a `payPath`; the new date takes effect the moment the fee is paid (by anyone).
* After a postponement that happens after the start, attendance is cleared and taken again; the same event continues (same list, rules, team, votes cast so far); `start` resumes it (sitting 2, 3 ...).
* `POST /api/events/:id/pay-link` (Organizer/Host) -> `{ payPath: "/pay/<token>" }` for the event price; the same unpaid link is returned if it already exists. `GET /api/pay/link/:token` (public) shows what is being paid; `POST .../payer` stores the payer's name and e-mail encrypted (never public); `POST .../test-pay` completes it in test mode. Live payments go through the central Razorpay path once the keys are set.
* `POST /api/events/:id/options/override` `{ key, value, declaration }` - where the society's own bye-laws differ from a LOCKED option; logged as `option_overridden`, the page shows what the law pack said and the declaration. `POST /api/events/:id/custom-rules` `{ title, kind: text|number|yes_no, value, note?, remove? }` - any extra rule; shown on the page. Both are refused once the event has started.
* Extra law packs written by the research agents are merged by `bun scripts/merge-extra-packs.ts` into `docs/research/rule-packs-extra.json`; a pack that fails the product's own checks is skipped and named.

## Committee, officers, observers; watermark (owner directive 2026-10-24)
* All optional free-text placeholders. `GET /api/officials/groups` lists the groups: Election/Meeting Conduct Committee, Returning Officer, Government Officer, Observer, Other (write the title yourself).
* `POST /api/events/:id/officials` `{ group, groupLabel?, name, designation?, authority?, note?, id? (edit), remove? }` (Organizer/Host; up to 60; refused once the event is live, so the list is published before the start; may be amended between sittings). Logged as `official_set` / `official_removed`; the page shows who was published before the start.
* `POST /api/events/:id/officials/:oid/attendance` `{ present, mode }` (Attendance Monitor): their attendance is marked and cleared when the meeting is postponed (taken again at the new sitting).
* The web report has a table with a blank Signature cell for each; the PDF has a section 7A and a signature line for each.
* Every PDF page and the web report carry a diagonal watermark `MEETING ID <event id>` / `ELECTION ID <event id>`; the event id is also in the PDF footer.

## Universal masking, working view, chronology, ballot lock, recreate, privacy rights, retention (owner directive 2026-10-24)
* **One masking rule for every public output** (page, PDF, log, `GET /api/events/:id`, templates): name `Raj****** Aga******`, e-mail `********rwal@gmail.com`, mobile `******3210`; the Organizer, Hosts and Attendance Monitors are hidden the same way. Full values only on authenticated working screens: `GET /api/events/:id/verify/:flat` (Monitor; full name and mobile of the holder while that flat is not yet marked present, hidden afterwards; each look is a `contacts_read` entry), `GET /api/events/:id/contacts` (Organizer/Host), `GET /api/me/data` (the person).
* An ID number is never accepted or kept (`docLast4` is ignored); `attendance_marked` carries `idChecked` and `idVerifiedBy`; the page shows "ID (type) verified by (hidden name, role), date and time" and "Marked present by (hidden name, role), date and time".
* **Chronology**: `model.chronology` lists every log entry in order (seq, time, who, what, fingerprint); `model.accountability` lists the actions of named people; both are on the page and in the PDF (section 7B). Replay flags time running backwards by more than 5 s.
* **Ballot lock** (option `vote_lock_code`): `POST /api/vote/prepare` -> review + 4-digit `lockCode`; `POST /api/vote/cast` must carry that `lockCode` (5 tries, 5 minutes). The number is recomputed from the ballot with a server secret; only a random nonce is stored, so nothing links voter to choice.
* **Recreate**: `POST /api/events/:id/recreate` (Organizer or Host of the old event) with the new date/place/title and the terms tick: copies society, rules, options, own rules, overrides, officials, agenda with candidates and ballot design, flat list and (default) the private names/contacts re-encrypted; not votes, attendance, codes, payments, photos or the team. The new Organizer confirms by the usual e-mailed code.
* **Privacy rights**: `GET /api/me/data`; `GET /api/events/:id/privacy/export/:pid?reason=`; `POST /api/privacy/request` (signed in); `POST /api/events/:id/privacy/contact` (public form, Turnstile); `GET /api/events/:id/privacy/requests`; `POST .../requests/:rid/resolve`; `POST /api/events/:id/privacy/erase` `{ personId?, flatNo?, reason }` (Organizer; destroys that person's or flat's own key; also after publication). Migration 0009 adds `subject_keys`, `privacy_requests`, `privacy_resolutions` and lets `person_erased`, `privacy_request`, `privacy_resolved`, `subject_access` through the freeze.
* **Retention**: rule `privacy.retentionDays` (default 365, 30-3650); the scheduler (`/api/internal/tick`) erases all private details after the longer of that and the pack's `retention.years`, logged as `key_destroyed` with `auto: true`.
* **Security headers** on every response (HSTS, nosniff, DENY framing, no referrer, permissions policy, closed CSP).
* No built-in payment host: `PAY_SERVICE_URL` and `PAY_SERVICE_KEY` must both be configured for real orders; otherwise the local test order is used.

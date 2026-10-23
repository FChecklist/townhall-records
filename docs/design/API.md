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

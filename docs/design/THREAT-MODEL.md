# THREAT-MODEL (Phase 1 design, 2026-10-23)

Scope: AOA-RWA meetings and elections. Binding inputs: `PRODUCT-SPEC.md` section 8, `AMENDMENT-1` (A1 to A9), `PM-STANDARDS.md` section 3.
Promise level: **tamper-evident and independently verifiable**, never "cheat-proof". Where a control only *exposes* an attack instead of *preventing* it, the table says so.

## 1. Assets
| Asset | Why it matters |
|---|---|
| The event log (hash chain + signatures) | It is the legal record. Everything public is derived from it. |
| The ballot box (what was chosen) and the who-voted ledger | Must stay unlinkable (secret ballot) yet complete (one flat, one ballot). |
| Passcodes (6 digits) | Only 1,000,000 values, so policy (not entropy) protects them. |
| Private contacts and evidence (full e-mail, phone, names, images) | DPDP personal data. Never public. |
| Signing key (Ed25519 private key, Pages secret) | Whoever holds it can forge log entries. |
| Pepper / encryption secrets (Pages secrets) | Passcode hashing, e-mail blind index, private-store encryption. |

## 2. Trust assumptions (stated honestly)
1. The Cloudflare runtime executes our Functions as deployed. A compromised runtime can lie while it runs; the controls below make *after-the-fact* rewriting detectable, not live lying undetectable.
2. The owner's signing key is not stolen. If it is, an attacker with DB write access could rewrite history *and* re-sign it; the external **anchors** (chain head published in the report, in the public GitHub anchor repo and handed to the Organizer) are what expose that, because a rewritten chain no longer matches an anchor someone already holds.
3. The e-mail provider delivers the passcode to the right inbox. A person whose inbox is taken over can act as that person (we log it; we cannot prevent it).
4. A secret ballot is secret **from the published data and from the stored tables**. During the few milliseconds a request is processed the server necessarily sees who is casting what. We never write that linkage anywhere (no IP, no timestamp, no row order in the box), but a malicious runtime could. Stated in `SECURITY.md` when written; not hidden.

## 3. Attackers and attacks
Legend: **P** = prevented, **E** = exposed (cannot be stopped, but cannot be hidden), **R** = residual risk accepted and documented.

### 3.1 Dishonest Organizer or Host (full event rights)
| # | Attack | Control | Type |
|---|---|---|---|
| O1 | Change a rule after voting opened on that point to favour an outcome | Per-point rules are frozen when the point opens; the engine rejects the change and the API logs the rejected attempt (`rule_change_rejected`) | P |
| O2 | Change a rule before voting but quietly | Every change is a log entry with who, when, old value, new value, reason; the report prints the full change history | E |
| O3 | Amend an agenda item after voting opened on it | Rejected by the state machine; amendments before opening are logged | P / E |
| O4 | Shorten notice below the legal minimum | The pack's notice rule is evaluated and the report prints "notice period met: yes/no" with dates | E |
| O5 | Mark friends present who are absent (inflate quorum) | Each presence mark records officer, method, time; the report lists attendance by flat; with zero officers the report states "Attendance was not independently verified"; evidence hash committed in the log when photo/ID is on | E |
| O6 | Vote for absent flats (stuff the ballot box) | A voter passcode is bound to ONE flat and one event, is shown once to the issuer, and a flat can vote only if marked present; the ledger allows one ballot per (flat, point) (UNIQUE) | P (for outsiders) / E (the Organizer who also issues and marks) |
| O7 | Issue a passcode to an impostor | Issue is a log entry (issuer, flat, time, no digits); the flat's real holder sees "already voted" or a second-issue entry; re-issue voids the old code and both appear in the log | E |
| O8 | Learn how a person voted | Secret ballot: host sees the *ledger* (who voted, by flat), never the choice; the ballot box has no flat, no time, no insertion order | P |
| O9 | Close early or extend the window to favour a result | Open/close/extend are logged with reason; extensions are bounded by a rule-pack parameter; server clock only | E |
| O10 | Appoint a stooge Attendance Officer | Provenance tree ("who appointed whom") is on the report | E |
| O11 | Act while the e-mail is unverified (throw-away identity) | Organizer, Host and Attendance Officer cannot act (not even to pay) until their e-mail passcode is verified; an unverified Organizer is the sole person and still cannot act | P |
| O12 | Delete or edit history after the event | No DELETE/UPDATE endpoint exists; DB triggers reject UPDATE and DELETE on record tables; log is hash-chained and signed | P (by API) / E (by DB admin, see 3.5) |
| O13 | Clone an old event to harvest contacts of another society | Clone copies profile, pack, options, flats (flat number and weight), agenda structure and labels only; never e-mail, phone, passcodes, images, votes, attendance; private roll only if the cloner is the verified Organizer of the source | P |
| O14 | Publish a doctored report | The report is generated by the server from the log and signed; any byte change is detected by the in-page verifier and by comparing the file hash with the anchored hash | E |

### 3.2 Dishonest Attendance Officer
| # | Attack | Control | Type |
|---|---|---|---|
| A1 | Mark present someone who is not | Mark is a signed-log entry (officer id, flat, method, doc type, last 4 characters only); contradictions are visible to the flat's real owner on the report | E |
| A2 | Issue passcode to themselves for another flat | Issuing a passcode needs the flat to be marked present; an officer cannot be issued a code for a flat unless a person on that flat roll is the officer's own flat (`conflict_of_interest` check by roll flat number if recorded) and the issue is logged | E |
| A3 | Silently edit a presence mark | Presence rows are append-only; correction is a new row "supersedes N"; both stay visible | E |
| A4 | Skip identity checks | The method used (visual / document type / roll check) is printed per flat on the report | E |

### 3.3 Voter
| # | Attack | Control | Type |
|---|---|---|---|
| V1 | Replay a used passcode | Single use: the code is marked used on first success; replay returns the same generic failure and is logged | P |
| V2 | Use a passcode for another flat/event/purpose | HMAC binds purpose + subject + event + code; wrong subject or purpose = not found, counted as a wrong try | P |
| V3 | Guess a passcode | 5 wrong tries lock that passcode 15 minutes; per-IP and per-event rate limits; Turnstile; constant-time compare | P (online) |
| V4 | Vote twice | UNIQUE(event, point, flat) in the ledger plus a check in the handler; the second try is rejected and logged | P |
| V5 | Vote before being marked present | Handler requires an attendance row for the flat | P |
| V6 | Vote after the point closed | Server clock vs `point_state`; closed = rejected | P |
| V7 | Prove to a buyer/coercer how they voted | Receipt is a hash with a secret nonce; the public list shows receipts and totals but not receipt-to-choice pairs | P (for the published data) / R (a voter can still photograph the screen while voting) |
| V8 | Vote for more options than allowed, or an unknown option | Engine ballot validation (max choices, no duplicates, valid ids, abstain only if enabled) | P |
| V9 | Two members of one flat vote | One passcode per flat per event; per-flat UNIQUE ledger | P |

### 3.4 Outsider (no role)
| # | Attack | Control | Type |
|---|---|---|---|
| X1 | Spam event creation / passcode mails | Turnstile on public forms, rate limits per IP hash and per e-mail hash, daily mail quota counter | P |
| X2 | Read private data | Public tables hold masked values only; private store is AES-GCM encrypted and served only to verified staff of that event, each read logged | P |
| X3 | Read the public report and de-anonymise | Public output passes a scanner: no complete e-mail, no 10-digit number, no full name (masking at write time) | P |
| X4 | Tamper with a downloaded report and re-share it | Whole-file seal: signature over the digest of the file; verifier flags any byte change; anchored digest allows comparison | E |
| X5 | Enumerate events/flats | Event ids are 128-bit random; flat existence reveals nothing beyond the public roll | P |
| X6 | Inject script via names/agenda text | All report text is escaped when rendered; the embedded JSON escapes `<`, `>`, `&`, U+2028/2029; CSP can be added by the UI session | P |
| X7 | Timing oracle on passcode check | Constant-time compare; failure path performs the same HMAC work; same generic error body | P |

### 3.5 Database administrator (can read/write D1 directly)
| # | Attack | Control | Type |
|---|---|---|---|
| D1 | UPDATE/DELETE a record row | Triggers `RAISE(ABORT)` (a DB admin can drop a trigger: see D2) | P (accidents, app bugs) |
| D2 | Drop the trigger, edit rows, re-chain | Cannot forge signatures without the Pages secret; any edit or removal breaks the chain or a signature; the head was anchored | E |
| D3 | Insert a forged log entry | No valid signature | E |
| D4 | Truncate the log tail | Anchors (report head, GitHub anchor repo, Organizer-held head) show a longer chain; the verifier shows `head seq` | E |
| D5 | Read private contacts | Ciphertext only; key is a Pages secret | P (without the key) |
| D6 | Link voter to choice via ballot table | Ballot rows have only receipt hash (random), choice, weight; no flat, no time; WITHOUT ROWID so physical order is by random key | P / R (unique weights, see 3.7) |
| D7 | Join ledger and ballots by timing | Ballot box has no timestamps; ledger has second precision; the box is committed as one sorted batch at close | P |

### 3.6 Super admin (the owner)
| # | Attack | Control | Type |
|---|---|---|---|
| S1 | Edit or delete an event record | The console has no such action; `super_admin_actions` is append-only; any action also becomes an `platform_action` log entry in the affected event's chain and on its report | P / E |
| S2 | Suspend an event mid-vote to change the result | Only a *future* (not live, not closed) event can be suspended; refused otherwise | P |
| S3 | Sign a forged chain | Holds the key, so this is possible in principle. Exposed by the anchors held by others; the owner's key is the single trust root and that is stated | R / E |
| S4 | Read private contacts | Reading goes through a logged decrypt path (`super_admin_actions` + log entry) | E |
| S5 | Hidden identity of super admin | Configured only by server secret; hidden route; rate limited; login alert mail | P |

### 3.7 Known residual limits (not hidden)
* **Weighted secret ballot.** A ballot row carries the flat's weight. Roll weights are public, so a flat with a unique weight can be identified. The engine reports the smallest anonymity set (`anonymitySets`) and the wizard must warn; recommended default for elections is one flat one vote.
* **Small groups.** Official/proxy split below 5 votes can reveal choices: suppressed in the report (PRODUCT notes 2.6).
* **Open-vote meetings** (checkbox) publish flat-by-flat votes by design.
* **Organizer controls the room.** Software cannot prove that an Attendance Officer checked a face. It records who claimed to, how, and when.
* **Mail interception**, **screenshots**, **coerced voters** are outside the software.
* **Legal validity of online voting in India** is an open lawyer question (OPEN-QUESTIONS #2); the product records and verifies, it does not give legal advice.

## 4. Control-to-test map
Each control marked P or E in sections 3.1 to 3.6 that the PM listed has a test that is run against correct code and then run against deliberately broken code (mutation), recorded in `docs/evidence/MUTATIONS.md`. See `docs/CHECKLIST.md`.

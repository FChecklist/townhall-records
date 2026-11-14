# Assumptions and defaults

Every point the owner has not decided is answered here with the **safest default**. Each is one place in the code or one setting, so changing it is easy. The owner's questions are numbered at the top of `docs/PROGRESS.md`.

## The design in one paragraph

A voter list is one row of `societies`. It has one common link (`/v/<16 hex>`), made when the list is made. Voters sign in with e-mail + 6-digit code and enrol one or more homes as records (`voters` table). The Organizer and Hosts check each record (Approved or Not approved with a reason, then resubmitted). A **draft** publication is public and replaceable; a **frozen** publication is immutable, fingerprinted and signed, at a date-and-time cut-off. Every state change is one database batch that also writes the signed audit entry.

## Roles and limits

- **1 Organizer** (a unique index) and **up to 10 Hosts** (triggers). The Organizer role can be handed to a Host in one step; there is still exactly one.
- **The standing host `host@townhall-records.com`** is added to every list automatically, cannot be removed, and **does not count against the 10** (D1 in `docs/GAPS-AND-PLAN.md`: it is the platform's seat, not the Organizer's choice). Changeable with `PERMANENT_HOST_EMAIL`. If the Organizer's own e-mail ID is that address, the seat is skipped.
- A Host checks, corrects, imports, undoes and sets weights. Only the Organizer changes settings, marks the link as shared, publishes, freezes, reopens, manages the team, erases, orders, and downloads **full** (unmasked) lists. Hosts see names, mobiles and e-mail IDs masked until they open one record; each opening is written to the signed log (up to 300 an hour).
- Nobody decides their own record.
- One person can organise up to 10 lists.

## Voters and records

- **Capacities:** Owner, Co-owner, Tenant, Proxy (and Member for "member only" lists). **Proxy appears only where the voting rule allows it** (rules 3 and 4). A proxy gives the owner's name and **must attach a Proxy Nomination Form** before sending. The list can require one supporting document from everybody.
- **Documents:** up to 3 per record, 100 MB per list in total, PDF/JPG/PNG, 400 KB each, checked by content (not just the name). Kept once a record is approved. Every staff opening is logged. The page tells voters to cover any ID number; **no Aadhaar number is ever asked for.**
- A voter can hold up to 5 homes. The same e-mail ID cannot enrol the same flat twice.
- **Consent:** a tick is required before sending; the time is stored. A voter can withdraw a record (approved or not) while the list is open.
- **Editing an approved record** sends it back for a fresh check; **the earlier approved details stay on the list** until the new ones are approved. The flat cannot be changed once approved.
- **Uploaded people are "invited", not approved.** They sign in, check their details and confirm; only then are they checked by the team.
- **Staff-added people are approved at once** (the staff member is the checker) and must tick that the person has agreed; the person sees the record and the notice when they sign in. A provisional (draft) list is shown without anyone who has since withdrawn or been removed; a signed final list is never changed.
- Sign-in codes: six digits, valid 10 minutes, stored only as an HMAC hash; staff sessions 7 days (12 hours for the standing host), voter sessions 8 hours. SMS is not used (cost).
- Text such as flat numbers and reasons may not contain phone numbers or e-mail IDs (they could otherwise reach the signed log).

## Publishing

- **Draft:** needs at least one person on the list; never blocked by check errors; replaces the earlier draft; marked provisional on the public page.
- **Final (frozen):** needs an event name and type, the word FREEZE typed, the cut-off moment passed (or "close now"), no check errors, acknowledgement of warnings, and acknowledgement of records still waiting. It then makes the list immutable (database triggers), records the cut-off moment, and signs the fingerprint into the audit log.
- Times: stored as UTC milliseconds; shown and typed in the list's own time (India +05:30 by default). The cut-off is a **moment**, not just a date.
- **Public masks (owner's rule, 13 Nov):** flat number; name = first 2 letters of each word + `****`; role; may vote; mobile = `******` + only the last 4 digits; e-mail ID = `********` + only its last 4 characters. Nothing else is public. Reasons for sending back, documents and anything else are never public.
- **Reopen** (type REOPEN, with a reason) returns the list to open; earlier final lists stay exactly as they were.
- The public page shows the latest final list if the list is frozen, otherwise the newest draft, plus earlier final lists, each with its own PDF and proof (`?pub=<id>`).
- **One vote per flat:** when a flat has two approved people the Organizer chooses who votes; weights are set per flat when votes are weighted.
- State-specific wording (Maharashtra bars proxy, and so on) is **not built in**: the voting rule is the organizer's choice, with a plain-words reminder to follow the bye-laws.

## Data protection (DPDP Act 2023)

- **Retention (owner's decision, 13 Nov):** voter records are kept always. There is no default erase; the Organizer's erase button appears only if the owner sets `RETENTION_DAYS` (minimum 30) after legal advice. A voter asks the Organizer to correct a detail; every correction is signed into the log. A voter who withdraws their own record leaves the list, and that record (documents, details, history payloads, and its line in the stored draft list) is cleared after 30 days; a signed final list that already held it stays as signed (a deliberate exception, told to the voter in the notice; the Withdraw dialog does not repeat it, a small follow-up from audit round 16). A record the list team removes is kept like every other record. Permanent keeping should be reviewed by a lawyer under the DPDP Act 2023 (purpose limitation, erasure on request).
- **The 30-day clearing is not signed into each list's log (accepted, round 12 L4):** the voter chose to withdraw and was told, the clearing is automatic and carries no person's details, and the list's own history already shows the withdrawal. If the owner wants a counts-only entry per list, it is a small addition.
- **No personal data in the signed log.** Actors are pseudonymous codes; the Organizer sees a table that names them. Free text is scanned for phone numbers and e-mail IDs.
- **Privacy:** hosts masked; the only full export is Organizer-only and logged; nothing personal in URLs; public pages send no cookies and no analytics.
- A plain note for Organizers is in the README. It is a reading, not legal advice. A lawyer should confirm it before launch.

## Other defaults

- **E-mail** goes only through the existing Resend free allowance, capped (default 80 a day), under five rules: (1) a brand-new Organizer must be on the owner's list (`ORGANIZERS`) unless `OPEN_SIGNUP=1`, and only listed Organizers can start lists (a list handed over to an unlisted person stays theirs to run, but they cannot start more); (2) one e-mail ID gets at most 4 codes an hour and 8 a day; (3) one list's newcomers get at most 25 codes a day (`MAIL_LIST_CAP`), and newcomers together at most two thirds of the voters' pool, so people the list team has vouched for (uploaded, added, approved or sent back by the team) can always sign in; a record someone makes for themselves counts as a newcomer until the team has acted on it; (4) two daily pools, voters (codes and send-back notes, notes at most a sixth; the cap minus the staff reserve) and staff (sign-in codes and invitations, `MAIL_STAFF_RESERVE`, default 20); (5) the optional free Cloudflare Turnstile check on both sign-in forms (on only when both `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET` are set). **Turnstile must be switched on before the link goes public** (it is a go-live row in the smoke test): without it one script can use up a day's allowance. Every code request gets the same words and takes about the same time (the mail is sent after the answer, and a mail that cannot go is not reported), so nobody can learn who is on a list. Known limits: a stranger who knows an address can use up its 4 codes an hour and 8 a day (Turnstile slows this); standing-host sign-ins are not written to each list's trail (it is on every list), but all its actions are; the flat field allows up to two words, and a staff approver sees it before it can become public. Owner question 7 is the size of the allowance.

- **Known small limits (round 10):** the 30-day clearing runs when the product is next used (about one code request in 20), so a record may stay a little longer on a very quiet product; a send-back note written by the team stays in the history after its record is cleared (notes may not hold contact details); a person the team removed is brought back with "Add a person", not by upload; the public CSV and PDF also carry non-personal columns (weight, may attend, note), which is the owner's call (PROGRESS question 3).
- **Mail slots are claimed in one statement** (count and insert together), so a burst of simultaneous requests cannot overshoot the day's allowance.
- **Voter language switch:** see the Languages line below.
- **Limits:** a list holds up to 6000 records; one bulk action covers up to 60 records; CSV up to 3 MB; imports 20 an hour per list; public list pages 50 rows.
- **Price:** the price slot is off until `PRICE_INR` is set. Payments go only through IT SERVICES BY RAJAT AGARWAL via Razorpay; **nothing live is wired** and the order table accepts test orders only.
- **Hosting:** Cloudflare Pages Functions and D1, free plan. Nothing deployed.
- **PDF font** is Latin-only; non-Latin names print as "?" in the PDF (screens and CSV are fine).
- **Languages:** the voter page has a language switch (English, Hindi); the Organizer and Host page is in English for now (adding it is one more string file, plus a native reader's review). Each person chooses for their own view, remembered in that browser. Dates keep their English form (day, short month, year) in Hindi for now.
- The old tables of migrations 0001 to 0004 stay in the database, unused, so migrations remain additive and a rollback is simple.

## Still open (honest list)

- **Free-plan CPU.** Timings on a laptop (Bun plus SQLite, so only a hint): with 6000 records the overview takes about 140 ms, the final freeze about 1.5 s, the public PDF about 180 ms. Cloudflare's free plan allows 10 ms of CPU per request. Lists of a few hundred are likely fine; a 6000-record list probably is not. The preview smoke test decides it, and the README names the fallbacks.
- **Time zones** are fixed offsets, so a list outside India that observes daylight saving would be an hour off in summer. India (+05:30) has none.
- **The public proof** is server-assisted: the signature and public key are published, so an outside party can verify them, but the fingerprint covers unmasked data and cannot be recomputed from the masked public list.
- **Documents** are stored inside the database (base64). Each voter is limited, and a whole list holds up to 100 MB of documents.
- **The standing host** can open any record on any list (each opening is logged and shown to the Organizer). A second sign-in step for that seat is an owner decision.

- **Not run on real Cloudflare D1 or Workers.** The same migrations and statements run on `bun:sqlite`. D1 specifics (`changes()` inside a batch, batch size limits, the 10 ms free-plan CPU limit) are unverified; the preview smoke test in `docs/SMOKE-TEST.md` exists for that.
- **Browser check:** the pages were driven by hand in a browser at phone and laptop width during the build; there is no automated browser suite.
- **No SMS sign-in** (paid). **No live Razorpay** (owner-gated). **Real Resend delivery** was only exercised against a mocked `fetch`.
- **Objection window:** the draft list plus voters' right to correct their records until the cut-off serves as the objection period. A separate, named objection step is not built.
- **Returning Officer** is not a fourth role: the Organizer, acting with Hosts, plays it.
- The research behind these defaults is in `docs/RESEARCH-NOTES.md`; several state-law points there are marked unverified.
- **Accepted small points (round 15):** a Host's corrections of a record without opening it are logged and can be undone, but are not rate-limited; "Start another list" is shown to Hosts although the server only allows listed Organizers; a Host's duplicate-name warnings run on masked names and may differ slightly from the Organizer's. A Host's check of an uploaded sheet is noted in the log (counts only).

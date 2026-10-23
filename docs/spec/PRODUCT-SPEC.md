# AOA-RWA: product specification (PM, 2026-10-23, v1)

> **READ FIRST: `AMENDMENT-1-SIMPLICITY-AND-PRIVACY.md` overrides conflicting text below** (roles reduced to Organizer/Host/Attendance Officer, everything optional with checkboxes, mandatory e-mail verification, masking of personal data, clone-from-old-event, who-appointed-whom).

Owner: Rajat Agarwal. Status: approved direction, to be refined by the law study in `docs/research/` before the rule engine is frozen.

## 1. What it is
A pay-per-event web product that lets an AOA, RWA, HOA or society run **general meetings and elections in a transparent, tamper-evident way**, entirely in the browser. No software to buy or install, no app to download. Same commercial model as Corporate Tambola: one event = one payment.

- Meeting: **Rs 199** per meeting. Election: **Rs 499** per election. Seller: IT Services by Rajat Agarwal (no GST charged), through the owner's existing central Razorpay path (TEST mode until the owner switches it).
- Meeting types: Annual General Meeting, Special General Meeting, Monthly Meeting, Managing Committee Meeting, and a free-form custom type. Election types: Managing Committee / Office-bearers (and a "single post" by-election).
- Hosting: Cloudflare Pages + Functions + D1 on a free `*.pages.dev` address first (target `aoa-rwa.pages.dev`; if taken, the builder picks the nearest free name). Custom domain later, owner's decision.
- Browser-first and RAM-light: all heavy work (CSV/Excel voter-list parsing, image compression, PDF/HTML report generation, hash-chain verification, charts) runs on the user's device. The server only stores, rate-limits, signs, verifies passcodes and takes payment.

## 2. Honest promises (what the product may and may not claim)
"100% impossible to cheat" is not a claim any honest system can make. The product therefore promises **tamper-evident and independently verifiable**:
- Every action (rule change, agenda change, attendance mark, ballot cast, result) is an entry in an **append-only, hash-chained, server-signed log**. Altering or removing any past entry breaks the chain, which anyone can detect with the verifier built into the public report page.
- The chain head is **anchored publicly** at the end of every event and daily (published into the report and to a public, append-only GitHub repo), so even the super admin cannot rewrite history unnoticed.
- No UPDATE or DELETE path exists for record tables (database triggers reject them; tests prove it).
All marketing and in-app text uses the words "tamper-evident", "verifiable", "transparent" and never "unhackable" or "100% cheat-proof".

## 3. Roles (all authenticate with a 6-digit passcode, never SMS or WhatsApp APIs)
| Role | Mandatory? | Can do |
|---|---|---|
| **Organizer** | Mandatory, one per event | Creates the event, pays, sets rules, publishes agenda, appoints every other role, starts/ends the event. Authenticates with e-mail passcode + a device-bound passkey when available. |
| **Host** and **Co-host** | Optional | Run the live session: open/close agenda points, open/close voting, rule changes if the Organizer lets them. |
| **Chairman, General Secretary, President, Vice President, Treasurer** | Optional | Named office-bearers shown on the report. They may be given sign-off/acknowledgement of the minutes and read rights; they do not alter votes. |
| **Attendance Monitor** | **Mandatory, 1 to 2 people** | Validates identity of each attendee, records how it was checked, takes the attendee photo and the ID-document image on their own device, marks present. |
| **Voter (member / flat)** | n/a | Receives a 6-digit passcode bound to one flat (or one flat + one named holder) and one event. Votes on agenda points / ballot. |
| **Super Admin (secret)** | Exactly the owner | One hidden console (see section 9). |

Public (no login): anyone can read and download the published report.

## 4. The 6-digit passcode (binding rules)
Exactly as in `C:\ct\legacy-mirror\PM-STANDARDS.md` section 3, plus:
- Voter passcode is generated per flat per event, issued to the Organizer/Attendance Monitor **at check-in** (shown once on screen, to be handed over in person, read out, or e-mailed free through Resend). Nothing is sent by SMS/WhatsApp API. The Organizer may copy a passcode into their own WhatsApp/phone chat manually; the product never pays or integrates for that.
- Only a keyed hash is stored. Single use per ballot session, expires with the event window, 5 wrong tries lock it for 15 minutes and alert the Organizer; per-IP and per-event rate limits; Turnstile on the entry form; every issue/attempt/success is logged (no digits).
- A voter can only cast a ballot after the Attendance Monitor has marked that flat **present** (physical or declared remote attendance with identity check), unless the Organizer's rules allow absentee/proxy voting (see section 7).

## 5. Event life cycle
1. **Setup** (Organizer): society profile (see section 6), event type, date/time/venue/online link, rule pack, voting rules, roles appointed, voter list uploaded (CSV/Excel parsed in the browser), agenda drafted.
2. **Pay**: Rs 199 or Rs 499, then the event is unlocked.
3. **Publish agenda** *before* the event (mandatory; each voting item gets a **point number**, e.g. 3.1). The agenda can still be amended during the event, but every amendment is a logged, visible, time-stamped entry; an amendment after voting opened on that point is rejected.
4. **Notice**: the publish step produces the notice (and shows the statutory notice period of the selected rule pack, warning if the notice is too short).
5. **Attendance** (Attendance Monitor, mandatory): for each person: how identity was confirmed (document type, face match by monitor), photo of the person, image of the document (client-side compressed, encrypted before storage), then **Mark Present**. Quorum is computed live from the present weightage.
6. **Meeting**: Host/Co-host open each point, discussion notes, resolution text, voting per point with the configured method; or **Election**: nominations, scrutiny, withdrawals, polling window, counting.
7. **Close**: results computed deterministically from the log; the report is generated and published; the chain head is anchored.
8. **After**: the report stays public forever; the log is complete proof.

## 6. Data kept per society (profile)
House/Flat number list (with weightage fields), society address, **registration number** (AOA / RWA / Society / HOA), registering act/authority, Organizer details, Host and Co-host details, office-bearer details, jurisdiction/rule pack. Each flat record: flat number, owner/holder display name (for the organizer only), voting weightage, status (eligible/ineligible/arrears flag if the rule pack requires it).

## 7. Voting rules (configurable per event, changed only through the log)
- One flat one vote, or **weightage** (per flat, per sq ft/sq m, per share, custom), with **individual vote %** shown and applied.
- Quorum (and adjourned quorum), majority class per point (simple, two-thirds, three-quarters, custom), tie-break/casting vote, abstain handling, eligibility (arrears/defaulters, tenants), joint owners (one vote), proxies / authorised representatives (allowed or not, limit per person, proof of authority recorded by the monitor), absentee/postal/electronic voting if the rule pack allows it.
- **Meetings**: open recorded vote by flat by default (like a poll), secret ballot optional if the rules/law require it.
- **Elections**: secret ballot by default. Tally is public; who-voted-for-what is not, and cannot be derived (design in section 8).
- **Rules set by Organizer and/or Host; every change is logged** with who, when, old value, new value, reason, and shown on the report. After voting on a point opens, the rules for that point are frozen.

## 8. Anti-cheating design (builders must implement and test every item)
1. **Hash-chained signed event log** per event: `entry = {seq, type, actor, payload, ts, prevHash}`; `hash = SHA-256(canonical JSON)`; server signs the head with an Ed25519 key (kept as a Pages secret); the public key is published in the report and the repo. Gaps, reorders and edits are detectable client-side.
2. **No mutation of history**: record tables are append-only (D1 triggers raise on UPDATE/DELETE); corrections are new entries ("supersedes seq N") that never hide the original.
3. **One voter, one ballot**: a ballot is accepted once per (flat, point), enforced by a unique constraint and re-checked in the Function; replays are rejected and logged.
4. **Secret ballot with verifiable tally**: separate the "who voted" record from the "what was voted" record; ballots are stored with a random per-ballot nonce, the voter receives a **receipt code** (hash of ballot+nonce), the public report lists all receipt hashes and counts per option, and a voter can check their receipt is in the published list. The server must not be able to link voter to choice from its own tables (store turnout and ballot rows in a way that breaks the link; document the residual trust assumptions honestly in `docs/SECURITY.md`).
5. **Result is a pure function of the log**: the report page recomputes the tally from the embedded log in the browser and shows "matches signed result: yes/no".
6. **Time**: every entry carries a server timestamp; voting windows are enforced server-side, never by the client clock.
7. **Super admin cannot alter events**: the console has read/support actions only; any support action is itself a logged entry visible in the report's "platform actions" section.
8. **Attendance integrity**: only an Attendance Monitor can mark present; a monitor cannot vote as a voter in the same event under the same flat unless they hold that flat's passcode; monitors are limited to 2; every presence mark stores method, time, monitor id and the (encrypted) evidence hash.
9. **Insider threats** (organizer abuse): rule changes after notice, agenda changes after voting, and attendance edits are rejected or flagged and always visible in the public log.
10. **Abuse tests**: the test suite contains explicit cheating attempts (replay a passcode, vote twice, vote before present, vote after close, change rule mid-vote, edit a log row in the DB, delete a row, forge a signature, tamper with the downloaded report) and each must be shown to FAIL to cheat.

## 9. Super console (secret super admin = the owner)
- Hidden route, not linked or indexed, behind **WebAuthn passkey** (primary) with a 6-digit e-mail passcode fallback, IP-rate-limited, with a login alert e-mail. The Super Admin identity is configured only by a server secret; nothing in the UI reveals who it is.
- Can see: all societies, events, payments (reconcile with Razorpay), health, error log, abuse signals, storage usage, chain-anchor status. Can: suspend a **future** event for abuse, resend a passcode, mark a payment manually reconciled.
- Cannot: edit, hide or delete any record, vote, mark attendance, or change a published report. Every console action is logged and appears in each affected event's public log.

## 10. The public report (single page, non-editable, downloadable)
- Public URL per event, e.g. `/r/<event-id>`; one self-contained HTML page (no external assets) with: society name, address, registration number, event type/date/venue, roles (Organizer, Host, Co-host, office-bearers, Attendance Monitors), agenda with point numbers, rule pack and every rule with its **change history**, attendance summary by flat number with the identity method used (not the images), quorum calculation, per-point results with weightage and vote %, election results, the **complete log** (every entry, expandable), chain head and signature, the public key, and an in-page **Verify** button that re-computes everything locally.
- **Download by anyone**: "Save this report" downloads the same single HTML file (all data and the verifier embedded) and a print-to-PDF stylesheet; no login. Published reports are public property and are never edited; corrections appear only as new, linked entries/addenda.
- Privacy of the public report: flats appear by **flat number**, not owner names or phone numbers; no photos, no ID images, no passcodes; Organizer and office-bearer names/roles are shown because they hold office.

## 11. Retention and privacy (reconciling "nothing is ever deleted" with the DPDP Act)
The owner's rule: all data is saved, nothing is deleted. PM design:
- Reports, logs, results, rule history, payments and the society/flat profile: **kept permanently, never deleted by anyone** (public record and legal archive).
- Attendee photos and ID-document images are sensitive: they are **encrypted on the device before upload** with an event key, never public, readable only by the Organizer and the Super Admin under logged access, never stored as ID numbers (mask any number; Aadhaar numbers are never stored). They are kept; if a lawful erasure request must be honoured the **key is destroyed (crypto-shredding)** while the public hash commitment in the log remains, so the record of the check survives and the image does not. The law study (`docs/research/DPDP-AND-RECORDS.md`) decides the final wording and whether a retention period applies.
- Consent text at attendance and at registration; a privacy notice; a grievance contact (Rajat Agarwal, as on the other products).
- Storage: Cloudflare D1 only (no R2, because R2 needs a payment method and the account has none). Photos compressed on the device to about 40-80 KB each; the storage meter in the super console warns long before the free limit; Supabase Storage (free tier) is the documented overflow path.

## 12. Look and feel, speed, PWA
- React 19 + TypeScript + Vite, installable PWA, offline-capable shell, mobile-first (most users are phones), large touch targets, plain language, Hindi + English from day one (i18n structure with both), accessible (axe clean), same budgets as `PM-STANDARDS.md` section 2.
- Style "on the lines of Corporate Tambola": organiser console + public join/vote pages, sealed server data, central payment path, help desk/guided errors pattern from the games, owner-only tick/cron through the existing scheduler repo pattern (no per-event cost).

## 13. Phases (all local first, then one deploy)
0. Law study (running now) and this spec.
1. Threat model + data model + log/crypto design, with tests for every item in section 8 (before UI).
2. Engine: rule packs, quorum/majority/weightage, event state machine, passcode module, signed log, verifier.
3. API (Pages Functions) + D1 migrations with append-only triggers.
4. Organizer console, Attendance Monitor flow (camera, compression, encryption), voter flow, public report page, super console.
5. Payment (Razorpay through the central path, TEST mode) and the notification mails (Resend stub locally).
6. Full simulation: a 120-flat AGM and a 5-post election with scripted cheaters; Lighthouse; a11y; security review.
7. **Deploy** to Cloudflare Pages free tier (`aoa-rwa.pages.dev`), live smoke test, scheduler hook; payments stay in TEST mode until the owner flips them.

## 14. Reference material
- Old server app (reference only, not a base to port): its modules Meeting / Election / VLC and flows are a useful feature checklist. Source is only available if the owner exports it from cPanel (`societyaffair.com`, excluding `uploads` and `my_society.zip`).
- Existing games for patterns: `C:\ct\tambola`, `C:\ct\bingo` (payments, sealed data, lifecycle tick), `C:\ct\startup-coach-site` (payment route).

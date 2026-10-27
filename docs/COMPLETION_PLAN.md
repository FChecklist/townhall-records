# COMPLETION PLAN: AOA RWA "Townhall" (written 2026-10-27, Step 1 only; nothing built yet)

## 0. In one paragraph
The engine and the API are finished and tested. **There is no screen yet** (the only page is an "API only" note and a developer prototype). Completing the product means: build the screens for every role (laptop design plus a separate phone/PWA design), wire them to the existing API, add the missing owner-standard items (release file, What's new, e-mail sign-in with one-tap link, plain error texts), prove it with generated tests, run it once on the real Cloudflare runtime locally, then deploy to Cloudflare Pages + D1. Estimate: about **190 working hours** (section 8).

## 1. What exists and works today (evidence from running it on 2026-10-27)
Run one file at a time through `scripts/ram-guard.ps1` (peak memory of any run: 100-172 MB; free RAM at start 826 MB).

| Part | Result today |
|---|---|
| Engine (`packages/engine`, 13 test files) | **153 pass, 0 fail** |
| API (`apps/api/test`, 14 files: audit 13, e2e 1, features 16, ledger 11, lifecycle 4, officials 4, offline 16, ownrules 2, postpone 8, resume 5, rollimport 5, security 50, team 6, transparency 12) | **153 pass, 0 fail** |
| Total | **306 of 306 pass** |
| Older recorded evidence (docs/evidence, not re-run today) | 89/89 deliberate-breakage checks caught; 17.2M-case engine simulation 0 disagreements; 240-event end-to-end simulation 0 failures |

What the product is (by the repo): a **pay-per-event meeting / election service** for AOA, RWA, HOA, co-operative societies. Roles in the code: Organizer (1), Host (up to 4), Attendance Monitor / Officer (up to 10), Voter (flat holder), Proxy holder, optional officials (committee, returning officer, observers: typed entries, no log-in), Platform owner (read-only console), Public. Working today in the API: 158 country/state rule packs, flat list from PDF/Excel sheet, agenda, rules with reasons, payment by anyone through a link (via IT Services ledger C), online and printed-paper ballots, 4-digit exchange check-in, 6-digit voter code, resume link, postpone/stop/cancel with 4-digit confirm, hash-chained signed log, sealed report + PDF + in-page verifier, universal masking, per-person erasure, privacy requests, retention job, 16 languages (English + Hindi reviewed), role guides, security headers, rate limits, 10 migrations.

**Not true today (be honest):** no UI; never run on real wrangler/D1; payments, mail, Turnstile are stubs/test mode; photo-of-paper reading not measured on real photos; no independent verifier; no security review; no lawyer review; name "Townhall" not cleared.

**Important mismatch with the brief:** the brief lists treasurer/secretary, vendor, guard "if any". The product has none of these; it is an *event* product, not a year-round society manager. See question Q1.

## 2. Screens needed per role (what to build)
Every screen: one decision, one big button, numbered steps with Back/Next, radio buttons and check boxes, a "why am I here / what do I do / what happens next" line, English + Hindi, laptop layout and a separate phone/PWA layout.

| Role | Screens (all missing today) |
|---|---|
| **Public / visitor** | Home (royal blue, serif + gold italic, the six steps Rules-Attendance-Quorum-Vote-Count-Publish), Price, How it works, Privacy and security page ("designed around DPDP/GDPR", no "100%" claims), Terms, Grievance Officer, What's new, Find an event by code, public event page (restyled live page + sealed report), Verify a report, Privacy request form |
| **Organizer / Committee admin** | Start (wizard), e-mail sign-in (6-digit code or one-tap link), 8-step Console: 1 Basics, 2 Rules (pack + reasons), 3 Flats (upload, preview with every problem named), 4 Agenda + ballot design, 5 Helpers (Hosts, Officers, officials), 6 Pay (or send link), 7 Publish notice, 8 Voting day; postpone/stop/cancel with tick-boxes + 4-digit confirm; Recreate from an old event; Erase / privacy requests; Payments statement |
| **Host** | Same console minus pay-by-session and erase |
| **Attendance Officer (the "guard" at the door)** | Phone-first: flat search, verify proof (full values only while checking, then masked), two-screen 4-digit exchange, photo, issue voter code (shown once, large), print ballot / scan paper (camera, later), attendance count |
| **Voter / resident (accountless)** | Phone-first: open link, flat + 6 digits, see agenda, one question per screen, cast, receipt + save, resume the same point, verify my receipt |
| **Treasurer / Secretary** | Not in product. Can be an Organizer or Host today. Dedicated screens only if Q1 = yes |
| **Vendor** | Not in product. Not planned |
| **Platform owner (Rajat)** | Super console: events, payments ledger, mail quota, audit with typed reason, release/version, health |

Cross-cutting: release file (`release.json`: version, date, notes) + What's new page, offline/PWA shell with install prompt, plain error component (every API error code -> "what happened / how to fix"), language switch, print styles, accessibility pass.

## 3. Gap list, ranked by importance
| # | Gap | Why it matters | Work |
|---|---|---|---|
| 1 | No UI for any role | Product cannot be used | main build |
| 2 | Never run on real wrangler/D1/Workers | SQLite is not D1; CPU limit unknown | local wrangler run (needs heavy lock; I will wait for free RAM) |
| 3 | Mail, Turnstile, payment through IT Services only stubbed | Sign-in and paying fail in real life | test-mode end to end; needs owner items in Q3, Q4 |
| 4 | Error messages exist as codes + English text; not every one says how to fix | Owner standard | message table + a test that every code has all three parts |
| 5 | Release file, What's new, version in footer | Owner standard | small |
| 6 | One-tap sign-in link (only 6-digit code exists) | Owner standard | small API addition + tests |
| 7 | Paper pipeline on real photos not built/measured | Printed ballots are a headline feature | ship v1 with online + officer-entered paper; camera reading as v1.1 (Q5) |
| 8 | Holder-name correction (two-person rule) missing | Real rolls have typos | small API + screen |
| 9 | Newest routes have no deliberate-breakage checks | Falsification rule | add to mutations.json |
| 10 | Independent verifier, security review, lawyer review, NOT-READ law regimes, name clearance | Needed before calling it anything but "pilot" | outside coding; keep wording "pilot", "tamper-evident", "designed around" |
| 11 | Backups/restore drill, scheduler (1-minute tick) in production | Auto close/publish depends on it | Cloudflare cron/worker, runbook |
| 12 | Handset/browser variety, accessibility, performance budget | Real residents | Playwright matrix + Lighthouse |

## 4. The generated scenario model (role x feature x state), aim: thousands, none hand-written
Idea: one **data table is the oracle**, a generator walks the whole cross product, and the same table drives both API tests and UI tests. Hand-written tests exist today; this layer sits on top.

Dimensions
* **Role (R)**: public, organizer, host, monitor, voter, proxy holder, super, plus wrong-event token, expired token, no token = 9.
* **Action (A)**: every route/command (about 60), each tagged with the permission-matrix row it belongs to.
* **State (S)**: setup, agenda published, live (no point open / point open / point closed), postponed (fee unpaid / paid), closed-completed, closed-stopped, closed-cancelled, sealed-reported, erased = about 12; times **mode** (online / paper / either) = 3; times **payment** (unpaid / paid / link pending / refunded) = 4.
* **Pack (P)**: 158 packs, sampled by a seeded pick (not all, to save RAM) plus every pack once in a cheap "create + rules valid" sweep.

Expected result = `oracle(R, A, S)` in {allowed, refused-403 role, refused-state, refused-401, not-found}, written once in `scenarios/oracle.json` derived from MASTER-CHECKLIST section 3 and `machine.ts` (written independently of the handler, from the document, not from the code).
Size: 9 x 60 x 12 x 3 x 4 = **about 77,000 cells**; after removing unreachable combinations roughly **20,000-30,000 generated checks** (each takes ms on the SQLite stand-in, one process, fits the 20% RAM cap). A seeded **state builder** drives an event to each state through the real API, so "reachable" is by construction.

Layers
1. **Permission grid** (above): API result vs oracle for every cell. Failures print role, action, state in plain words.
2. **Journey generator**: random but seeded full journeys (create to sealed report) with random voters, cheating attempts, postponements; extends today's `sim-stack` to 1,000+ events and adds the UI as a layer.
3. **Error-message lint**: for every error code x language: has "what happened", "how to fix", no jargon, under N words. Thousands of strings checked automatically.
4. **UI grid (Playwright, Chromium, sampled)**: for each role x screen x viewport (laptop, phone) x language: page loads, shows its "what to do" line, primary button present, no horizontal scroll, no console errors, masking holds (no unmasked name/phone anywhere in the DOM outside the working screen). About 2,000-4,000 generated cases, run in small batches, one browser at a time.
5. **Falsification (mandatory)**: for each rule class, disable the fix (mutation list), see the grid fail with the right cell, restore. The mutation list grows with every feature. A grid that cannot fail is rejected.
6. Existing 306 tests + typecheck + verifier-bundle freshness stay as the gate before every deploy.

## 5. Simple UX plan (owner standards)
* Look: corporatetambola.com style: deep royal blue, wine red, gold, ivory; serif headings with gold italic emphasis; not childish, not dull. One CSS token file, shared by laptop and phone.
* Two designs: laptop (left step list, centre task, right "why/what next" help) and phone PWA (one thing per screen, bottom Back/Next, big buttons, installable, works when the network blinks and says so plainly).
* Steps: numbered with Back/Next everywhere there is a form; radio buttons and check boxes instead of drop-downs wherever there are few choices; no typing where a tick will do.
* Every screen answers four questions in plain words at the top: **who** (your role), **what** (what to do now), **how** (the button), **why** (what it protects). Every error: what happened, how to fix, and a button that does the fix where possible.
* Residents never make accounts: voter link + flat + 6-digit code; the voter keeps a resume link. Admin roles: e-mail + 6-digit code or one-tap link.
* Privacy words: "designed around DPDP and GDPR", "private details are encrypted", "erased on request or after the retention period"; never "100% deleted" or "legally compliant".
* Logs: the signed chronology is already read-only; add a "Record" tab visible to Organizer, Host, Monitor and the public (masked), plus Super read-only.
* Versioning: `release.json` (version, date, notes) read by the footer and the What's new page; every deploy bumps it.
* Tech: plain HTML + small ES modules, no framework, no build step beyond what exists (engine imported as source), because RAM is tight and the verifier must stay auditable.

## 6. Deployment plan (nothing is deployed in this step)
1. Local: `wrangler pages dev` with local D1 and the 10 migrations (heavy: waits for free RAM > 1.2 GB and the heavy lock; I will not take it while another session holds it).
2. Gates before any deploy: typecheck, all engine and API tests one file at a time, scenario grid, UI grid (sampled), falsification list, verifier bundle fresh, `release.json` bumped.
3. Cloudflare **Pages + Functions + D1**, as the repo already uses. New Pages project `aoa-rwa`, new D1 database, secrets set as Pages secrets (never in the repo), `TEST_MODE` unset. Never Vercel.
4. Scheduler: a free Cloudflare cron Worker calling `POST /api/internal/tick` every minute and `/anchor` daily.
5. Method copied from the Tambola/Bingo releases: deploy to the `.pages.dev` address first, smoke test (health, pubkey, create, mail, tiny meeting, verify offline), then click-test live with the real-site script style, then optional domain. No deploy while another product's live event is running; no touching Tambola, games or DPDP.
6. Payments: only through IT Services by Rajat Agarwal (ledger B); registering the product centrally is already packaged in `docs/payments` and waits for Q3.

## 7. Risks I am carrying
Laptop RAM (browser tests serialised, Chromium only); 158 packs not lawyer-reviewed (kept labelled with confidence and "needs lawyer"); real-photo paper reading unproven; product name not cleared; the run on real D1 may show CPU-time or SQL differences, which is why it comes before the UI polish.

## 8. Estimate in working hours
| Block | Hours |
|---|---|
| Design system, shell, PWA, release file, What's new, error component | 18 |
| Public site (home, price, how, privacy, terms, grievance, verify, event page restyle) | 20 |
| Organizer/Host console (wizard + 8 steps + outcomes + recreate + erase) | 48 |
| Attendance Officer phone screens | 22 |
| Voter phone screens | 14 |
| Super console | 8 |
| API additions (one-tap link, name correction, message table) + tests | 14 |
| Generated scenario model (oracle, grid, journeys, lint, UI grid) | 26 |
| Falsification + fixes it finds | 8 |
| Real wrangler/D1 run, mail/Turnstile/payment test mode | 10 |
| Deploy, smoke, live click-test, docs, hand-over | 8 |
| **Total** | **about 196 (call it 190-200)**; first usable slice (Organizer + Voter + Public on the live pages.dev) at about 95 hours |

## 9. Questions for the owner (yes/no)
* **Q1.** Is v1 only the meeting-and-election product (as built), with Treasurer/Secretary just acting as Organizer/Host, and no vendor or guard accounts? (If no: add about 60-80 hours for notices, dues and a year-round society home.)
* **Q2.** Keep the working name "Townhall" for now (rename later is one line)?
* **Q3.** May I register the product in the IT Services central payment ledger when the product has a `.pages.dev` address (needs your go)?
* **Q4.** For sign-in mail, may I use the same free Resend sender already used for the other products (you set the secrets, I never see them)?
* **Q5.** Is it fine that v1 ships online voting plus officer-entered paper ballots, and the camera "photograph the paper" reading comes later?
* **Q6.** Is a free `aoa-rwa.pages.dev` address enough for launch (custom domain later)?

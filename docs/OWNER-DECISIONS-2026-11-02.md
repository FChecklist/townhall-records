# Townhall: what the owner must decide (2 Nov 2026)

Plain list. Nothing here has been done for you. Townhall is priority 3 (games first, DPDP second), so none of this blocks the games.

## A. Needed before the app can go live

| # | What | Who gives it | Notes |
|---|------|--------------|-------|
| 1 | Bot-check (Turnstile) keys | Owner, from the Cloudflare dashboard | Site key and secret key. The secret goes into Cloudflare as a secret, never into the repo or chat. |
| 2 | Mail sender (Resend) | Owner | The "from" address that members will see. The domain must be verified in Resend. |
| 3 | Where to keep the backup of the signing key | Owner | The signing key proves the event record was not changed. If it is lost, old records cannot be proven. Pick one safe place (not this laptop alone). |
| 4 | Domain spelling and go | Owner | Written two ways in your messages: `townhall.veridian-aios.com` (used so far) and `townhall.verdian-aios.com`. Tell us which one is right. No domain is attached until you say go. On 2 Nov neither `townhall.` nor `home.veridian-aios.com` answered. |
| 5 | Grievance Officer e-mail | Owner | The Grievance Officer is Rajat Agarwal. `rajatsiroffice@gmail.com` is the official address used elsewhere; it stays unpublished until you confirm. |
| 6 | Data-processing terms | Owner accepts online | Cloudflare, the mail provider (Resend) and Razorpay each have their own terms to accept. The draft processor list is in `docs/GRIEVANCE-PROCESSORS-BREACH.md`. |
| 7 | IT Services registration | Owner says "go" and gives the host name | Payment must run through IT SERVICES BY RAJAT AGARWAL and Razorpay. The package is ready in `docs/payments` but not applied. It used the placeholder host `townhall.pages.dev`; the real host name is needed (see 4). Then one real Rs 1 payment checks that A, B and C agree. |
| 8 | Anthropic API key (optional) | Owner sets it as a Windows environment variable | Only for cloud test runs under the $10 you approved. No key was set on 2 Nov. Do not paste it in chat. Not needed for items 1 to 7. |

## B. Small calls found while checking the four new items

These have a default. Say so only if you want it different.

1. **Edit title or place.** Allowed until the meeting starts, by the Organizer and Host. The record keeps the old and the new text. Default: members are NOT re-sent the notice automatically. Do you want a "tell members about the change" mail?
2. **Remove an agenda point.** Allowed until voting on that point opens, by the Organizer and Host. It is allowed even after the notice went out (editing a point already worked that way). Some laws want every item named in the notice. Default: allowed, and recorded with a reason.
3. **Owner console list.** It shows the title the event was created with. The event page, the report and the calendar file show the edited title and place. The reason: the events table cannot be edited by design. A small extra table can fix this later if you want the list to match.
4. **Name correction.** A Monitor can ask for a name correction for a flat, choosing only a reason (spelling, owner changed, wrong flat, other). No names are typed in the request.

## C. What was and was not checked (honest status)

- Written and read through on 2 Nov: edit title or place, remove agenda point, the flat list in the report, name-correction request, and `apps/api/test/items.test.ts`.
- Two real faults were found by reading and fixed in the code: (a) the save of an edited title would have been refused by the database, because the events table cannot be updated; (b) an edited place did not reach the place shown on the pages and in the calendar file.
- Nothing was run. The laptop had about 0.7 GB free. No tests, no build, no browser, no API call.
- The verifier bundle (`packages/engine/src/verifier.generated.ts`) must be rebuilt, because the engine changed. Until then the bundle-freshness test fails.
- Not covered yet: the three new routes are not in the hand-written permission grid (`apps/api/test/grid.test.ts`), and there are no simple screens for the new items.

## D. Run order on the partner laptop (when GAMES says "partner free")

1. `bun test --isolate --timeout 120000 apps/api/test/items.test.ts`
2. `bun scripts/build-verifier.ts`, then the bundle-freshness test
3. Full suite, one file at a time, `--timeout 120000`
4. Fix what fails, commit on branch `townhall-items-2026-11-02`. No deploy.
5. Also run `apps/api/test/desk-rights.test.ts` (new) and `apps/api/test/ui.test.ts` (changed: the desk tabs are now 7 for every role).

## E. One common Team Desk page (built the evening of 2 Nov, written and read through, NOT run)

The Team Desk (`/desk/`) is now one page for the Organizer, the Host (Co-host) and the Attendance Monitor. Everyone lands on **Home**: one tile for each part of the desk. The parts a person may work on are bright; the rest are grey, say whose they are, and open a look-only panel that shows the names of the steps and no data. The tab bar shows all seven tabs to everyone, with the grey ones marked by a small lock. The rule lives in one place (`apps/api/public/assets/desk-rights.js`) and the server still decides every action.

| Part | Organizer | Host / Co-host | Attendance Monitor |
|------|-----------|----------------|--------------------|
| Home, Record | works | works | works |
| Setup, Voting day, Team, End or move | works | works | grey |
| Check-in | works only if no Monitor is appointed | works only if no Monitor is appointed | works |

Small calls with defaults (say so only if you want it different):
1. **Co-host.** It is the same right as Host, so the page says "Host / Co-host". There is no separate Co-host role.
2. **Check-in for the Organizer and Host.** It is grey once an Attendance Monitor is appointed (the engine's own rule). With no Monitor appointed they check people in themselves, and the report says attendance was not independently checked. Before this change the Organizer and Host had no Check-in tab at all.
3. **Grey parts.** They open a look-only panel with a plain reason and buttons to the parts the person can use. They never load private details.
4. **Languages.** The new lines are English for now. Other languages fall back to English until the translations are added.
5. **Inside a bright part.** Paying and erasing private details stay with the Organizer only. The End screen already says "for the Organizer" to a Host on erasing, and the server refuses a Host on paying. This change does not touch those screens; greying the pay button by role there is the next small step if you want it.

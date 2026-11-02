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

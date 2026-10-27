# UI status (2026-10-27): what is built, how it was tested, what is still open

## Pages (12 addresses, laptop and phone designs, English + Hindi)
| Address | Page | Built | Walked through in a real browser |
|---|---|---|---|
| `/` | Home, price, "join an event" | yes | yes |
| `/start/` | Start wizard (5 numbered steps, packs, schedule, terms, clone) | yes | yes (event created) |
| `/desk/` | Team Desk: sign-in (6-digit code, one-tap link, lost link), tabs by role | yes | yes (Organizer on laptop, Monitor on phone) |
| desk tabs | Setup (8 steps), Voting day, Team, End or move, Record, Check-in | yes | Setup, Team, Voting day, Check-in, Record loaded; End or move not clicked through |
| `/e/<code>` | Notice, live and result page + Record tab | yes | yes (notice and completed) |
| `/hall/<code>` | Projector screen | yes | yes (completed) |
| `/v/<code>`, `/h/<token>` | Voter page, check-in link | yes | yes (two-phone number exchange, vote, receipt) |
| `/pay/<token>` | Pay page (test mode) | yes | no (fake browser only for the closed pages) |
| `/verify/` | Verify a report | yes | yes |
| `/privacy/`, `/help/`, `/new/`, `/terms/` | Support pages | yes | loaded in the fake browser and by eye (privacy form not submitted by hand) |
| `/owner/` | Owner console | yes | loaded only |
| `/offline/`, `404` | PWA fallback | yes | loaded |

## Tests (all local; every one has deliberate-breakage entries in `scripts/mutations.json`, see `docs/evidence/MUTATIONS-ui-*.md`)
* `grid.test.ts`: generated role x action x state x Monitor grid: 1,296 cells, 0 failures; 4 permission rules broken on purpose, each caught.
* `ui.test.ts`: generated UI grid in a fake browser wired to the real handler: 69 tests, 117 cases (pages x states x roles x tabs x languages x viewports); found and fixed 3 real bugs (a Record-tab crash, a language leak, a verify-page message for live events); 5 breakages caught.
* `messages.test.ts`: every error code the source can send (134) has a plain how-to-fix line; no developer words; 298 checks.
* `signin.test.ts`, `uiapi.test.ts`: the one-tap link, lost-link lookup, label route, event id in voter answers, reasons for disabled choices.
* Older: 153 engine + 153 API tests, 89 breakage checks, simulations (see `docs/CONFIDENCE.md`).

## Still open (honest list)
1. **Never run on the real Cloudflare runtime** (wrangler + local D1): needs about 1.2 GB free RAM and the heavy lock; not done yet. SQLite is a close stand-in, not the same.
2. **Not deployed.** `scripts/deploy-pages.ps1` and `apps/cron` are written but never run. Needs the owner's go, the secrets (signing-key backup place, Resend sender and key, Turnstile keys) and the IT Services ledger registration.
3. **Real phones untested**: camera/photo capture and geolocation, scanning the QR with a phone camera, real network drops.
4. **Real payment**: only test mode; the pay page shows whatever the service returns (`docs/ui-api-requests.md`: `payUrl`, `paidMs`).
5. **API requests still open** (`docs/ui-api-requests.md`): edit event title/venue before start; remove an agenda point; list of current flats in the model; a "name is wrong" change request; accept hand-entered paper ballots without a photo hash.
6. **Paper**: officer enters ticks by hand; reading a photographed paper (camera) is not built.
7. **Hindi** is a machine draft (1,857 strings) and needs a native reader; the other 14 languages fall back to English for the screens (the role guides keep their own text).
8. **Not lawyer-reviewed**; the 158 rule packs carry their own confidence labels; "Townhall" is not trademark-cleared; Grievance Officer contact to be confirmed by the owner.
9. **Not measured**: Lighthouse/accessibility audit, load test, CPU time per request on the real runtime.

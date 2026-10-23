# UI contract (for the session that builds the screens)

The back end is finished; these are the screens it expects. Keep every screen to one decision and one big button; use a picture per step; English and Hindi together.

| Screen | Who | Calls |
|---|---|---|
| Start | anyone | `GET /api/packs`, `GET /api/schema`; `POST /api/events` (kind, eventType, title, venue, scheduledMs, packId, society, organizer, `useRecommended`, optional `cloneFrom`, Turnstile token) |
| Enter your e-mail code | Organizer, Host, Officer | `POST /api/auth/verify`; "send again": `POST /api/auth/request` |
| Console (8 steps) | Organizer, Host | `GET /api/events/:id/private` -> `progress.steps[]` (icon, title.en/hi, hint.en/hi, status, detail), `percent`, `phase`, `voting` |
| 2 Rules | | `GET /api/packs/:id`, `PUT /api/events/:id/options`, `PUT /api/events/:id/rules` (needs `reason`) |
| 3 Flats | | `PUT /api/events/:id/roll` (parse CSV/Excel in the browser; response has `anonymityWarning`), `POST .../holders` |
| 4 Agenda | | `POST/PUT .../points` |
| 5 Helpers | | `POST .../people` (name, e-mail, role host or attendance_officer, optional label) |
| 6 Pay | Organizer | `POST .../pay`, TEST: `POST /api/pay/test-confirm` |
| 7 Publish | | `POST .../agenda/publish` (shows notice check) |
| 8 Voting day | | `POST .../start`, `.../attendance`, `.../passcodes/voter` (show the code once, large), `.../points/:pid/open`, `/extend`, `/close`, `POST .../close` |
| Voter | member | `POST /api/vote/login` (flat + 6 digits), `GET /api/vote/points`, `POST /api/vote/cast` -> receipt + nonce (show once, offer to save) |
| Public page | anyone | `GET /api/r/:id` (live, then sealed). Verify button is in the page. "Use as template": `POST /api/events` with `cloneFrom` |
| Super console | owner | `/api/super/*` (WebAuthn passkey goes here; e-mail code is the fallback already built) |

Rules the UI must respect: show the server's `message` text for errors; never keep a passcode after display; do the camera/ID image compression and encryption on the device before `POST .../evidence`; show the "locked by the rules" reason beside locked ticks; never claim "100% cheat-proof".

## Schedule and timers
Step 1 screen collects the four milestones (start, voting start, voting end, end), each with a date-time picker and a place, plus the time zone (default: the browser's). Use `PUT /api/events/:id/schedule` to change before the event starts. The public page already draws the schedule table and the count-down; a UI that shows its own timers should use `countdowns()` from `packages/engine/src/schedule.ts` and the `serverNow` from `/api/r/:id/head`.

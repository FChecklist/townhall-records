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

## Added 2026-10-23 (see docs/design/OWNER-DIRECTIVES-2026-10-23.md)
* Create a random **device id** once per browser (`crypto.randomUUID()` with dashes removed, kept in local storage) and send it as `x-device-id` on every call.
* Show the **terms** (`GET /api/terms`) with one check box on: event creation, a Host/Officer's first sign-in, a voter's first login. Send `acceptTerms: true` and `termsVersion`.
* **Ballot designer** for the Organizer (layout, columns, order, accent colour, title, instruction, numbers, box size) with a live phone-size preview; **election format** chooser (one post per election / one election for all posts / first N), post names, how many a voter may tick (min and max), candidates (ids come back from the server).
* **Ballot** for voters: one big check box per option; ticked = yes, not ticked = no; send `marks`. Always one column on a phone. Show whether the point is an open vote or a secret ballot before voting.
* **Prices** by country (`/api/schema` `priceText`): India Rs 499 / Rs 1499, elsewhere USD 5 / USD 15.
* **Final report**: buttons "Download PDF" (`/api/r/:id/pdf`), "Save page", "E-mail report" (`/api/events/:id/report/email`).
* Organizer view of the **audit trail** (`/api/events/:id/audit`).

## Added 2026-10-23 (c): stages, desk flows, languages, guides
* **Stage tracker** (`model.stage`): Rules, Attendance, Quorum, Vote, Count, Publish, one picture each (the public page already draws them). The Organizer console keeps its 8 setup steps (`progress.steps`) leading up to the first stage.
* **Language drop-down in the upper right of every screen**: `GET /api/languages`, dictionary `GET /api/i18n/:lang`; right-to-left for Arabic and Urdu; remember the choice in local storage. The public page already has it.
* **Every screen shows its guide**: `GET /api/guide/:role?lang=` gives, per step, WHAT / HOW / WHERE / WHEN / WHY / WITH WHOM / WHICH; show the current step big, the others small, with the picture key.
* **Check-in desk (Attendance Officer)**: flat number + name -> Start; show the 4-digit code large and the link as a QR (the app draws the QR from `linkPath`); field for the code on the voter's phone; optional "SMS check" field; status line (waiting for the voter / for you / done). Never show both codes on one screen.
* **Voter phone**: open the link, tick the terms, read the code aloud, type the officer's code, then the ballot. Keep the returned token only in memory / session storage; it works on this phone only.
* **Paper desk**: Print ballot (render `svg`, draw the QR matrix of `qrText` into `<g id="qr">`, print); Capture: use the camera, find the four corner marks, straighten, decode the QR, run `detectTicks` (engine), show each box as ticked / empty / UNCERTAIN, let the officer fix uncertain ones, send `marks` + the photo's SHA-256 (+ optional encrypted photo); Void; Finish counting.
* **Ballot designer**: live preview of the paper (`paper/preview`) and of the phone ballot.

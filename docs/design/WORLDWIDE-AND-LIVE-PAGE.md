# Worldwide use, step-by-step console, one public page for the whole event (owner additions of 2026-10-23)

These three instructions arrived while the build was running. They are implemented in the engine and API and are binding for the UI session.

## 1. Any AOA, HOA, RWA or housing society in the world
The premise is the same everywhere: a roll of homes, a notice, a quorum, a vote, a record. What differs is the numbers. So **nothing legal is hard-coded**:
* A *rule pack* is data (`packages/engine/src/packs.ts`). Seven research packs ship (UP AOA, generic India RWA, Maharashtra co-operative society, US generic HOA, California, Florida, Texas), derived from `docs/research/rule-packs.json`; values the research could not verify stay `null` = unset.
* **`custom-world`** ("Any country: enter your own bye-law values") has no legal defaults at all. The Organizer types the notice days, quorum and majority from their own bye-laws; the engine refuses to publish until the required values are set (`rules_unset`).
* A deployer or a society can add more packs as JSON (`parseCustomPack`): a country, a state, one society's own bye-laws. A pack may lock options by law with a one-line reason (e.g. Maharashtra: no proxy).
* Weights are integers (flat = 1, area, share, custom); percentages are basis points; majorities are exact fractions; times are UTC milliseconds with an IANA time-zone name for display; no currency or language is baked into the engine (prices are a config table, texts are bilingual keys).
* Not yet done and listed as open: right-to-left and further languages in the UI, per-country price tables, locale-aware date formats (UI session).

## 2. Step-by-step, with progress (like the Corporate Tambola console)
`progressOf(state)` (`packages/engine/src/progress.ts`, API: `GET /api/events/:id` and `/private`) returns exactly 8 steps:
1 Confirm your e-mail · 2 Choose your rules · 3 Add the flats · 4 Write the agenda or ballot · 5 Add helpers (optional) · 6 Pay · 7 Publish the notice · 8 Voting day, then the report.
Each step has: `icon` (picture key), `title` and `hint` in English and Hindi (one plain sentence), `status` (`done`, `current`, `todo`, `blocked`, `optional`), optional `detail`, and the overall `percent` and `phase`. On voting day `voting` adds flats present, quorum met, points closed, the open point and how many have voted.

## 3. One public page from start to end
`GET /api/r/:eventId` is **one page for the whole life of the event**:
* before the event it shows the notice, rules, roll count and agenda;
* during the event it is the **live dashboard**: phase tracker (Notice, Check-in, Voting, Report), who is present, quorum, which flats have voted, open votes by flat if that option is on, and for secret ballots turnout only (totals appear when the point closes). It refreshes itself every 10 seconds (`GET /api/r/:id/head`);
* when the event closes the **same address** serves the **sealed final report** (signed, downloadable, verifiable). Before sealing, the live page is still chain-and-signature verifiable.

## 4. Simple, picture-led interface (contract for the UI session)
* One decision per screen, one big button; the 8 steps are shown as a row of pictures (use the `icon` keys: mail, rules, building, agenda, people, pay, notice, vote), with the current step highlighted and a percentage bar.
* Plain words, English and Hindi side by side (all strings are already bilingual in the progress model). "Use recommended settings" is a single button (`useRecommended` on create; `applyRecommended` in the engine).
* Advanced settings (rule numbers, majority classes, proxy limits) are collapsed by default. Every feature is a checkbox with a default; law-locked ticks show the one-line reason.
* Voters see only: enter flat + 6-digit code, read the question, tap an option, get a receipt. Nothing else.
* The public page already draws its tracker with inline pictograms and works without JavaScript for reading.

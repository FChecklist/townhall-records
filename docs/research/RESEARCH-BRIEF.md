# Law research brief (shared by every research agent)

Goal: for the housing-society / HOA / strata / condominium / co-operative regimes of your region, record what the law and the typical governing documents say about **meetings and elections**, in a form the product can load. The Organizer of a real society will rely on these values, so **a wrong value is far worse than a blank one**.

## Hard rules
1. **Never guess.** Only write a value you actually READ in a primary text (statute, rules, model bye-laws) or a reliable secondary source (government site, law-firm or university analysis, Indian Kanoon, CanLII, AustLII, state legislature site, etc.). If you could not read it, the value is `null` and the `note` says "not read / not verified" and why.
2. Every leaf is `{ "value": ..., "note": "...", "source": "<section + URL>", "confidence": "high|medium|low", "needsLawyer": true|false }`. `high` only if you read the operative sentence in the primary text. Quote section numbers. Do not paste long passages (copyright): paraphrase in your own words, at most one short quote.
3. Do not invent section numbers or URLs. A URL you did not open is not a source.
4. Do NOT edit any file under `packages/`, `apps/`, `migrations/`, `scripts/`, `docs/design/`. Write ONLY the files listed under "Output". Do NOT run git commands (the coordinator commits).
5. Access notes learned earlier: `indiankanoon.org` pages can be fetched by WebFetch; many official sites return 403 or need JavaScript. Try WebSearch + WebFetch first (several different sources per regime). If a page needs JavaScript, you may use the built-in browser tools (`mcp__Claude_Browser__*`): FIRST open your OWN tab with `tabs_create` (other agents share the browser pane, never reuse or close a tab you did not create), extract text with `javascript_tool`, close your tab when done. Do not sign in to anything, do not accept cookies or terms, do not download files.
6. Work regime by regime. If you run low on budget, finish fewer regimes properly rather than many thinly. **List every regime you did not manage to read as `NOT READ` in the coverage file.**
7. This is research, not legal advice; say so in `_disclaimer`.

## What to capture per regime (the same shape as `docs/research/rule-packs.json`; read two or three entries there first for the exact shape)
instruments (the Acts/rules/model bye-laws, with how they apply), meetingTypes (annual / special / board; who may call; notice days min/max and delivery; quorum), quorum, adjournedQuorum, majorities (ordinary/special), weightageModels (one member one vote / by share / by area), proxy (allowed? limits? form), votingMethods (show of hands / poll / secret ballot / postal / electronic), electronicVoting, minutesDeadlineDays, recordRetentionYears, memberInspectionRight, electionRoles (returning officer / inspector / election committee), termYears, eligibility, defaulterDisqualification, requisition (what share of members can demand a special meeting), nomination/withdrawal periods, reserved seats, notes.

## The engine block (this is what the product actually loads)
For each regime also produce an `engine` object that maps your findings onto the product's own settings. Read `packages/engine/src/rules.ts` (the `PARAMS` and `OPTIONS` lists) and the `parseCustomPack` / `CustomPackDef` part of `packages/engine/src/packs.ts`. Use ONLY those parameter ids and option keys.
```
"engine": {
  "id": "in-ka-apartment-act",            // lower-case letters, digits, hyphens; prefix by country/state: in-, us-, ca-, au-, nz-, uk-, ...
  "name": "Karnataka Apartment Ownership Act 1972 + model bye-laws",
  "jurisdiction": "IN-KA",
  "confidence": "high|medium|low",        // the weakest important value decides
  "needsLawyer": true,
  "params": { "quorum.basis": "weight", "quorum.percentBp": 3000, "notice.minDays": 14 },   // ONLY values you verified; omit the rest
  "options": { "proxy_voting": true, "secret_ballot": null },                                  // true/false only if the law decides; null = law silent, Organizer must choose
  "locked": { "secret_ballot": { "value": true, "reason": "Statute s.X: ballot is secret" } },   // ONLY where the law itself forces it
  "notice": { "agm": {"min": 14, "max": null}, "sgm": {"min": 7, "max": null}, "committee": {"min": 3, "max": null}, "monthly": {"min": 3, "max": null} },
  "recommended": ["plain-words tips shown to the Organizer, each naming its section"],
  "gaps": ["rules this regime has that the product's settings cannot express yet, in plain words"]
}
```
Basis points: 3000 = 30%, 6666 = two-thirds. `quorum.basis` is `weight` or `flats`. Leave out anything you did not verify.
One regime = one `{ "research": {...}, "engine": {...} }` pair. Where one state has several distinct regimes (condominium act, co-operative society act, HOA act, strata act, township/planned-community act) make one pair for each that real housing societies use, and say which is the most common.

## Output (replace `<region>` with your assigned region key)
- `docs/research/extra/<region>.json` : `{ "_disclaimer": "...", "_region": "<region>", "_compiled": "<today>", "packs": [ {research, engine}, ... ] }`  (valid JSON; check by loading it)
- `docs/research/extra/<region>.COVERAGE.md` : a table with one row per regime in your assignment: READ-HIGH / READ-MEDIUM / READ-LOW / NOT READ, the instruments found, what blocked you, and a final list of "engine gaps" (law features the product cannot express). Be blunt about anything weak.
Your final message to the coordinator: counts per status, the list of NOT READ, the engine gaps, in under 25 lines.

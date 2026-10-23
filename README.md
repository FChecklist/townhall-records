# Townhall (working name)

Rules, Attendance, Quorum, Vote, Count, Publish: run general meetings and elections for any AOA, RWA, HOA or housing society, online, on paper or both, transparently. Pay per event (India Rs 499 per meeting and Rs 1499 per election; elsewhere USD 5 and USD 15; TEST mode only until the owner switches payments on). Tamper-evident and independently verifiable: every action is an entry in a hash-chained, Ed25519-signed log; the public page is a deterministic function of that log and turns into a sealed, downloadable report when the event closes.

**Status: back end and engine done and tested; no UI yet; nothing deployed.** Local only. Read `docs/CHECKLIST.md` for evidence per item and `docs/CONFIDENCE.md` for how sure we are (and what is still missing).

## Layout
```
packages/engine/   pure TypeScript (no I/O): packs, passcode, signed log + verifier, tally, replay, state machine,
                   progress steps, clone, live/sealed page renderer, embedded in-page verifier
apps/api/          Cloudflare Pages Function + D1: src/handler.ts (all routes), src/core.ts (plumbing), functions/api/[[path]].ts
migrations/        0001..0005: 26 append-only record tables + triggers, operational tables, access audit, freeze after publication, handshake + paper
docs/design/       THREAT-MODEL, DATA-MODEL, LOG-FORMAT, REPORT-SPEC, API, WORLDWIDE-AND-LIVE-PAGE, OWNER-DIRECTIVES, OFFLINE-AND-HANDSHAKE, LAW-FLEXIBILITY
docs/research/     law study and rule-packs.json (input, not edited)
docs/evidence/     recorded test, mutation and perf output
scripts/           mutate.ts (break the code, watch tests fail), build-verifier.ts, perf.ts, gen-dev-vars.ts
```

## Commands
```
bun install                          # only dev types; the product has no runtime dependency
bun test --isolate --timeout 60000 packages apps   # automated tests (output: docs/evidence/full-run.txt)
bun scripts/build-verifier.ts        # regenerate the in-page verifier bundle after changing engine verify/replay/model code (a test fails if it is stale)
bun scripts/mutate.ts engine|api     # mutation check: breaks the code on purpose and requires the tests to fail
bun scripts/perf.ts                  # 120-flat AGM timing
bun scripts/sim-engine.ts            # 17M-case randomized check of the engine against independent oracles
EVENTS=240 SEED=11 bun scripts/sim-stack.ts   # random events end to end through the API with scripted cheaters
bun scripts/gen-dev-vars.ts          # fresh local secrets into apps/api/.dev.vars (gitignored)
```
Local server (heavy: needs free RAM above 1.2 GB and `C:/ct/heavy.lock`, see PM standards):
```
cd apps/api
C:\ct\tools\wrangler3\node_modules\.bin\wrangler d1 migrations apply DB --local
C:\ct\tools\wrangler3\node_modules\.bin\wrangler pages dev public --d1 DB --local --port 8788
```

## For the UI session
Read `docs/design/API.md`, `docs/design/WORLDWIDE-AND-LIVE-PAGE.md`, `docs/UI-CONTRACT.md`. The engine is imported as source (`packages/engine/src`), so the browser can reuse masking, passcode format checks, tally preview and the verifier. The public page is already complete HTML (`GET /api/r/:id`); the UI can embed it or restyle it from `GET /api/r/:id/data`.

Public wording: "tamper-evident", "verifiable", "transparent". Never "100% cheat-proof".

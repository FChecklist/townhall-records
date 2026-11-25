# Townhall (working name)

Rules, Attendance, Quorum, Vote, Count, Publish: run general meetings and elections for any AOA, RWA, HOA or housing society, online, on paper or both, transparently. Pay per event (India Rs 499 per meeting and Rs 1499 per election; elsewhere USD 5 and USD 15; TEST mode only until the owner switches payments on). Tamper-evident and independently verifiable: every action is an entry in a hash-chained, Ed25519-signed log; the public page is a deterministic function of that log and turns into a sealed, downloadable report when the event closes.

**Status (2026-10-27): engine, API and the screens (12 addresses, laptop + phone, English + Hindi) are built and tested locally; nothing is deployed.** Read `docs/UI-STATUS.md` (what is built, tested, open), `docs/COMPLETION_PLAN.md`, `docs/CHECKLIST.md` and `docs/CONFIDENCE.md`.

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
bun run dev:api                      # local site on http://localhost:8788 (real handler + SQLite, in-memory data)
bun test --isolate --timeout 300000 apps/api/test/grid.test.ts   # generated permission grid
bun test --isolate --timeout 300000 apps/api/test/ui.test.ts     # generated UI grid in a fake browser
```
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


See [KNOWLEDGE-MAP.md](KNOWLEDGE-MAP.md) for what this repository is for and what the other repositories are for (updated 14 Nov 2026).

Version history: see [CHANGELOG.md](CHANGELOG.md) (current version 0.2.1, file `apps/api/public/version.json`).

# 3. WHERE: files, tables, Cloudflare names

## In plain words

Everything for the product lives in this `voter-list/` folder of the Townhall Records repository. The running copy (the "preview") lives in Cloudflare under the project name `voter-list`. Nothing in the rest of the repository depends on it. It was built from some code copied from the Townhall engine (see `src/vendor`) but does not import from it.

## Folder map

| Path | What is there |
|---|---|
| `src/` | All the server logic (TypeScript). The same code runs in Cloudflare and on a local SQLite stand-in. |
| `src/handler.ts` | The HTTP API: one function `handle(request, env, now)`; about 50 routes (`/api/...`). |
| `src/auth.ts` | E-mail code sign-in, sessions, rate limits, the mail outbox and `mailPools` (the five e-mail rules), `purgeStale` (the 30-day clearing). |
| `src/records.ts` | The voter's side: enrol, confirm, update, documents, status, withdraw. Every record change goes through one helper. |
| `src/review.ts` | The team's side: review queue, approve / not approved, bulk and undo, add a person, upload (`importRecords`), weights, choosing a voter for a flat. |
| `src/publish.ts` | Final checks view, draft and final publications, the public page data, search, proof. |
| `src/audit.ts` | The signed, hash-chained audit log; `looksPrivate` and `pubUnit` (masking odd flat IDs). |
| `src/lists.ts` | A list (one row of `societies`): create, settings, the team (1 Organizer, up to 10 Hosts, the permanent host). |
| `src/checks.ts` | The rule book for "Final checks" in one pure function. |
| `src/register.ts` | The PDF register and the CSV export (masked unless the caller is the Organizer). |
| `src/importer.ts`, `src/csv.ts`, `src/xlsx.ts`, `src/text.ts` | Reading an uploaded or pasted list, cleaning values, a dependency-free Excel reader and template writer. |
| `src/erase.ts` | Retention and erasure (only if `RETENTION_DAYS` is set). |
| `src/orders.ts` | The price slot (off by default; test orders only). |
| `src/overview.ts`, `src/store.ts`, `src/model.ts`, `src/errors.ts`, `src/db.ts` | The Organizer page's one-call overview; loading and access rules; shared types; errors; the slice of the D1 interface used. |
| `src/db-sqlite.ts` | `bun:sqlite` stand-in for D1 (local run, seed script, tests). Never imported by the Worker. |
| `src/vendor/` | Small helpers copied (vendored) from the Townhall engine, `packages/engine` in this repository: canonical JSON, WebCrypto helpers, the hash-chained signed log, masking, PDF writing and zip; see `src/vendor/VENDORED.md`. They are copies, so the product does not depend on the rest of the repository at build time. |
| `src/synthetic.ts` | Made-up names, mobiles and `@sample.example` e-mail IDs. |
| `functions/api/[[path]].ts` | The Cloudflare Pages Function entry: passes the environment (plus `waitUntil`) to `handle`. |
| `public/` | The two pages and their assets: `index.html` (Organizer and Host), `v/index.html` (voter), `assets/` (`app.css`, `ui.js`, `steps.js`, `organizer.js`, `organizer-work.js`, `voter.js`, `i18n.js`, `lang/hi.js`, logos), `_headers` (strict content-security policy), `_redirects`, `_routes.json`. |
| `migrations/` | `0001_core` to `0006_indexes` (see tables below). |
| `scripts/` | `build-pages.ts` (build `dist/`), `gen-dev-vars.ts` (local secrets), `gen-prod-keys.ts` (production secrets file, refuses a path inside the repo), `migrate.ts`, `seed.ts` (a made-up society). |
| `test/` | 160 tests: `pure`, `flow`, `team`, `hardening`, `pages`, `round1` to `round7`; the harness `harness.ts`. They call the real handler on a real SQLite database with a fake clock. |
| `dev.ts` | Local server on port 8787 in TEST_MODE. |
| `wrangler.toml` | Cloudflare configuration (below). |
| `docs/` | Plan, research, progress, smoke test, audit rounds 0 to 16, and this knowledge pack. |
| `ASSUMPTIONS.md` | Every default, with the file that implements it. |
| `README.md` | What it does, run locally, tests and the full deploy plan. |

## Database tables (Cloudflare D1, SQLite)

| Table | Holds |
|---|---|
| `societies` | A voter list (its name, kind, state, rule, closing time, link, settings). |
| `users`, `memberships` | People who sign in as staff, and who is Organizer, Host or the permanent host on which list (rebuilt in migration 0005 with the 10-host and permanent-host triggers). |
| `sessions`, `otp_codes`, `rate_hits` | Sign-in sessions, one-time codes, rate-limit counters. |
| `mail_outbox` | Every mail the product sent or tried to send (sign-in codes are not stored in readable form outside TEST_MODE). |
| `voters`, `voter_docs`, `voter_events` | Voter records, their documents (at most 3), and each record's append-only history. |
| `publications`, `publication_rows` | Draft and final lists and their rows; finals are immutable (triggers). |
| `audit_entries` | The signed, hash-chained audit log (no updates, no deletes). |
| `list_versions`, `list_rows`, `imports`, `list_changes`, `claims`, `claim_docs`, `freezes`, `freeze_rows`, `orders` | Tables from the earlier shape of the product (versions, claims, freezes) that the rebuild's migrations created and still carry. The current journey uses `voters` and `publications`; `orders` backs the price slot. |

Migrations: `0001_core` (societies, users, memberships, sessions, codes, rate hits, outbox), `0002_lists`, `0003_workflow` (audit entries and the earlier workflow), `0004_hardening`, `0005_enrolment` (the single-link enrolment model), `0006_indexes` (clean-up indexes).

## `wrangler.toml` (committed; it holds no secrets)

```toml
name = "voter-list"
compatibility_date = "2026-10-01"
pages_build_output_dir = "dist"

[[d1_databases]]            # live
binding = "DB"
database_name = "voter-list"
database_id = "61171e0a-0cf7-4ef8-99ee-d239dad583a7"
migrations_dir = "migrations"

[[env.preview.d1_databases]]   # smoke test
binding = "DB"
database_name = "voter-list-preview"
database_id = "7fc651ef-0c25-4207-a2b7-554f2deca000"
migrations_dir = "migrations"
```

Database ids are identifiers, not secrets; access needs the owner's Cloudflare login.

## Cloudflare names (owner's account, free plan)

| Thing | Name | State on 14 Nov 2026 |
|---|---|---|
| Pages project | `voter-list` | Created. No Git integration (deploys are by hand with `wrangler`). Production address `voter-list.pages.dev` has **no deployment** (404) on purpose. |
| Preview address | https://preview.voter-list.pages.dev (build https://2652c573.voter-list.pages.dev) | Deployed; pages, assets and `/api/config` work; **sign-in does not** (no `RESEND_API_KEY`). |
| D1 database (live) | `voter-list` | Created, empty, **no migrations applied**. |
| D1 database (preview) | `voter-list-preview` | Migrations 0001 to 0006 applied; no real data. |
| Preview secrets | `SIGNING_KEY`, `PEPPER`, `ORGANIZERS`, `MAIL_FROM`, `MAIL_DAILY_CAP` | Set (values not recorded anywhere in the repo). `RESEND_API_KEY` **not** set. `TEST_MODE` **not** set. |
| Production secrets | none | Not created. |
| Marketing site | Pages project `townhall-site` (`townhall-records.com`, `www`) | **Untouched.** |
| Planned address | `voterlist.townhall-records.com` | Not in DNS; needs its own go. |

No Cloudflare Pages project in the account has Git integration, and the Townhall Records repository has no GitHub Actions workflows or webhooks, so **merging to GitHub deploys nothing**.

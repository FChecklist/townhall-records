# 4. HOW: run, test, deploy, roll back

## In plain words

You can run the whole product on a laptop in a minute, with sign-in codes shown on the page (nothing is e-mailed). To put it on the internet there are **three separate go-aheads from the owner**, in this order: Preview, Live, Address. Nothing moves to the next without the owner saying so. A rollback plan exists before the first step.

## Run it locally (TEST_MODE)

You need [Bun](https://bun.sh).

```bash
cd voter-list
bun install
bun run gen:keys          # writes .dev.vars with fresh LOCAL secrets (git-ignored)
bun run scripts/seed.ts   # optional: one made-up society with synthetic voters
bun run dev               # http://localhost:8787
```

- **TEST_MODE** (set by `.dev.vars` and by `dev.ts` only) makes the page **show** the 6-digit code instead of e-mailing it, opens Organizer sign-up to anyone, and allows test orders. **Never set `TEST_MODE` on any address anyone else can reach.**
- Another database file or port: `VL_DB=path/to/file.sqlite PORT=8799 bun run dev.ts`.
- Local data lives in `.local/` (git-ignored). Everything is made up; `.example` addresses cannot receive mail.

## Tests

```bash
bun test --isolate        # 160 tests
bun run typecheck
bun run build:pages       # builds dist/
```

The tests call the real request handler on a real SQLite database with a fake clock; no network. A test reads the README's literal deploy values; another checks that every page script only calls routes that exist and that the Hindi file covers every plain sentence of the voter page.

## Deploy: the three go-aheads

The full commands are in `../../README.md` ("Deploy plan"). In outline:

### 1. Preview go (done on 14 Nov 2026, except e-mail)
Create the two D1 databases, the secrets and the Pages project, and publish to a **preview** `*.pages.dev` address using the preview database only. No DNS change; the marketing site is not touched.
```bash
wrangler d1 create voter-list ; wrangler d1 create voter-list-preview      # ids go into wrangler.toml
wrangler d1 migrations apply voter-list-preview --remote --env preview
bun run scripts/gen-prod-keys.ts ../voter-list-secrets.json                # outside the repo; prints no secret
wrangler pages project create voter-list --production-branch main
wrangler pages secret put ... --project-name voter-list --env preview     # SIGNING_KEY, PEPPER, ORGANIZERS, MAIL_FROM, MAIL_DAILY_CAP=20, RESEND_API_KEY
bun run build:pages && wrangler pages deploy dist --project-name voter-list --branch preview
```
Then walk through `../SMOKE-TEST.md` rows 1 to 17 on a phone and a laptop, watching the Function logs for `Exceeded CPU` or `Error 1102` (this is where the free plan's 10 ms CPU limit and the D1 write budget are found out). Fallbacks if a step is over the limit, in order of cost: do the heavy step in smaller pieces, move upload parsing into the browser, or ask the owner about the paid Workers plan (an owner decision).

### 2. Live go
Tag the exact commit first (`git tag voter-list-v1-predeploy`), note the `wrangler d1 time-travel info voter-list` bookmark, then:
```bash
wrangler d1 migrations apply voter-list --remote
wrangler pages deploy dist --project-name voter-list --branch main
```
This is still only on `voter-list.pages.dev`. Before it: **new** production secrets (not the dev or preview ones; keep the signing key backed up offline, because it signs the audit trail and the final lists), `MAIL_FROM`, `RESEND_API_KEY`, the real `ORGANIZERS` list, and Turnstile created with both keys set.

### 3. Address go (the only DNS step)
Add the custom domain `voterlist.townhall-records.com` **to the `voter-list` project** (not `townhall-site`). Cloudflare adds one CNAME, `voterlist` to `voter-list.pages.dev`. Before: save a "before" copy of the DNS records and check there is no `voterlist` or wildcard record. After: the only difference is that one record; the marketing site, MX, SPF, DKIM and DMARC are unchanged. Then rows 18 to 22 of the smoke test. Never use "move the whole domain" or "change nameservers". Details: README Step 5b.

## Rollback

**Rollback id: `RB-VL-1`** = the git tag `voter-list-v1-predeploy`, set on the exact commit that is deployed. (Locally it is on commit `352cba2` of the original history; **it was not pushed**, and this repository's snapshot commit has a different hash. Re-create the tag on the commit that actually goes live.) This is the first deployment, so there is nothing earlier to return to; rollback means:

1. Remove the custom domain from the `voter-list` project and delete the single `voterlist` CNAME it created (everything else stays).
2. In the Pages dashboard roll back or delete the deployment (to undo the preview: delete the `preview` deployment).
3. Restore the live D1 to any minute of the last 7 days: `wrangler d1 time-travel restore voter-list --timestamp=<time>` (note the bookmark from `wrangler d1 time-travel info voter-list` before each step).

## Secrets: where they live

In Cloudflare Pages secrets (set with `wrangler pages secret`) and in the owner's password store, never in this repository. `.dev.vars`, `*.sqlite` and `.local` are git-ignored. The environment variables the product reads are listed in `../../README.md` (after Step 6): `SIGNING_KEY`, `PEPPER` (required); `ORGANIZERS`, `OPEN_SIGNUP`, `RESEND_API_KEY`, `MAIL_FROM`, `MAIL_DAILY_CAP`, `MAIL_STAFF_RESERVE`, `MAIL_LIST_CAP`, `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET`, `PERMANENT_HOST_EMAIL`, `RETENTION_DAYS`, `PRICE_INR`.

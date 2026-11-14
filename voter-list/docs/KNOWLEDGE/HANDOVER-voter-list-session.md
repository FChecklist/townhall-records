# Handover from the Voter List build session (updated 14 Nov 2026, evening)

For the next person or Claude session. Read `README.md` in this folder first.

## What this session did

Audited the old product against the owner's nine requirements, rebuilt it, closed 16 independent audit rounds (two PASS in a row), did the owner-approved **preview go**, then on 14 Nov built three more owner changes (the Cloudflare Email Service sender, the "Owner / 1st Name in Registration" label with several people per flat, and the reasons for "not allowed to vote"), closed **12 more audit rounds** (17 to 28; **27 and 28 both PASS**), applied migration 0007 to the preview database, set the mail secrets on the preview and **redeployed the preview** with the audited code. It did **not** do the Live go or the Address go and never touched DNS (the six mail records were added by the owner's side), the marketing site or any paid plan.

## State in one paragraph

Code at local commit `9c9b728` is the audited code; later commits are documents and tests only. Preview is at https://preview.voter-list.pages.dev with that code. The smoke test (`../SMOKE-TEST.md`, rows 1 to 17, 23, 24) has **not** run: sign-in needs a 6-digit code from a mailbox the session may not read. Details: `5-CURRENT-STATE.md`.

## Do next, in this order

1. Get a sign-in code path from the owner: the owner reads `host@townhall-records.com` and pastes the code, or a routed test address a person may read. **Do not open any personal mailbox.** (Adding an address to the preview `ORGANIZERS` secret is a preview-only change.)
2. Run `../SMOKE-TEST.md` rows 1 to 17, 23 and 24 on the preview, on a phone and a laptop, watching the Function logs for `Exceeded CPU` and reading the day's D1 **rows written**; check that the sign-in mail lands in the **inbox, not spam**, with the From line "Townhall Records <no-reply@townhall-records.com>"; check the daily `sent` count never passes `MAIL_DAILY_CAP` (20). Fix whatever it finds; any **code** change needs a fresh independent audit round, and two passes in a row for anything that changes behaviour (rule 7c).
3. Report to the owner in plain words what passed and failed.
4. Only on the owner's explicit words: Live go, then Address go. Re-create the rollback tag on the commit you deploy.

## Things to know

- **Never** put a key, the pepper, a signing key, an API token or a code in the repository, a message or a log. Production keys are made with `scripts/gen-prod-keys.ts` into a file outside the repo. Set a secret by piping it from a file into `wrangler pages secret put`, never in a command line.
- **TEST_MODE** shows sign-in codes on the page. It is for local use only; never set it on a reachable address.
- Do not raise `MAIL_DAILY_CAP` above 20 without the owner's say.
- The owner is non-technical and the laptop is low on memory: no heavy parallel work, no more than one small browser. Wording must be friendly and short; never "We do not...".
- Use made-up people only (`@sample.example`, `.example`).
- **Git history:** this repository holds a **snapshot** of the code without its history. The original local history (branch `feat/voter-list-v1`, in the owner's working folder `C:\ct\voter-list`) contained a real address in an old code comment, so it was not pushed. The audit write-ups (`../AUDIT-ROUND-*.md`) preserve what each round found. The tag `voter-list-v1-predeploy` exists only in that local folder (on commit `352cba2`, before the 14 Nov changes).
- **Shell quirks on the build machine (Windows):** backslashes get collapsed in some shell calls, so patch files with the edit tools rather than regex one-liners in a heredoc; do not run `python3` (it hangs); local `curl` to a brand-new `pages.dev` address can fail on TLS for a minute.
- **Screens:** a headless-Chrome driver was used to take the screenshots (not kept). To redo them: run `PORT=8791 VL_DB=.local/ui.sqlite bun run dev.ts` (the page shows the sign-in codes in TEST_MODE; API calls need the header `x-vl: 1`), sign in as an Organizer and click through the seven steps.
- **Audit idiom:** each audit round is a fresh read-only reviewer given the requirements and the standing rules, who must reply `AUDIT: PASS` or `AUDIT: FAIL` with findings by severity. The builder never certifies its own work. Later rounds were most useful when the reviewer used a method the builder had not: random sequences of Organizer, Host and voter actions, and planting marker strings in every private field to see whether any public output carried them.

## Small things noticed (not fixed)

- On a phone, the public list table scrolls sideways (the page says so).
- The follow-ups listed in `../AUDIT-ROUND-28.md` (nine low notes).

# Handover from the Voter List build session (14 Nov 2026)

For the next person or Claude session. Read `README.md` in this folder first.

## What this session did

Audited the old product against the owner's nine requirements, rebuilt it, closed 16 independent audit rounds (two PASS in a row), did the owner-approved **preview go** (databases, Pages project, preview secrets, preview deployment), recorded the rollback id `RB-VL-1`, made a screen-by-screen UI/UX file for the owner, and put the code and this knowledge pack into this repository. It did **not** do the Live go or the Address go and never touched DNS, the marketing site or any paid plan.

## State in one paragraph

Code at local commit `5e02280` is the audited code; later commits were documents only. Preview is at https://preview.voter-list.pages.dev but sign-in is blocked (no `RESEND_API_KEY`; `townhall-records.com` is not a verified Resend sending domain). The smoke test has not run, so the free plan's CPU and D1 write limits are unverified. Details: `5-CURRENT-STATE.md`.

## Do next, in this order

1. Get the two inputs from the owner: the Resend key on the **preview**, and the sender decision (verify `townhall-records.com`, which is a mail-only DNS change needing the owner's go, or temporarily use an already verified domain for the preview, which needs the owner's OK).
2. Run `../SMOKE-TEST.md` rows 1 to 17 on the preview, on a phone and a laptop, watching the Function logs for `Exceeded CPU` and reading the day's D1 **rows written**. Fix whatever it finds; any **code** change needs a fresh independent audit round (rule 7c).
3. Report to the owner in plain words what passed and failed.
4. Only on the owner's explicit words: Live go, then Address go. Re-create the rollback tag on the commit you deploy.

## Things to know

- **Never** put a key, the pepper, a signing key or a code in the repository, a message or a log. Production keys are made with `scripts/gen-prod-keys.ts` into a file outside the repo.
- **TEST_MODE** shows sign-in codes on the page. It is for local use only; never set it on a reachable address.
- The owner is non-technical and the laptop is low on memory: no heavy parallel work, no more than one small browser. Wording must be friendly and short; never "We do not...".
- Use made-up people only (`@sample.example`, `.example`).
- **README staleness:** the top of `../../README.md` still says "Nothing has been deployed". The preview now exists (see `../PROGRESS.md`, "Preview deployment"). Update the sentence when you next edit the README.
- **Git history:** this repository holds a **snapshot** of the code without its history. The original local history (branch `feat/voter-list-v1`, 29 commits, in the owner's working folder `C:\ct\voter-list`) contained a real personal e-mail address in an old code comment, so it was not pushed. The comment is already gone from the current code. The audit write-ups (`../AUDIT-ROUND-*.md`) preserve what each round found. The tag `voter-list-v1-predeploy` exists only in that local folder.
- **Shell quirks on the build machine (Windows):** backslashes get collapsed in some shell calls, so patch files with the edit tools rather than regex one-liners in a heredoc; local `curl` to a brand-new `pages.dev` address can fail on TLS for a minute (use a `bun fetch` probe or wait).
- **Screens:** a headless-Chrome driver was used to take the screenshots (not kept; one small browser, closed afterwards). To redo them: run `dev.ts` on a fresh database, sign in as an Organizer, and click through the seven steps; the test mode shows the codes.
- **Audit idiom:** each audit round is a fresh read-only reviewer given the nine requirements and the standing rules, who must reply `AUDIT: PASS` or `AUDIT: FAIL` with findings by severity. The builder never certifies its own work.

## Small things noticed in the screens (not fixed)

- The trail shows the raw label `staff.signed_out` instead of plain words.
- In Hindi, the "Approved" badge stays in English.
- On a phone, the public list table scrolls sideways.

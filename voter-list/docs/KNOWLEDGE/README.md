# Voter List: the knowledge pack

Written 14 Nov 2026. Read this page first; the others go deeper.

## In plain words

**Voter List** is part of Townhall Records. It helps a housing society (AOA, HOA, RWA, co-operative society) make the list of people who may vote at a meeting or an election, and then publish it in a way nobody can quietly change.

- The **Organizer** (one person per list) sets up the list and gets **one common link** for the whole society.
- **Voters** open that link, ask for a 6-digit code by e-mail (no passwords), say whether they are an Owner, Co-owner, Tenant or Proxy, check their details, add a document if needed, and see where things stand.
- **Hosts** (up to 10 helpers, plus one permanent Townhall Records host who does not use up a seat) check each record: **Approved**, or **Not approved** with a reason in plain words. The voter fixes it and sends it again.
- The Organizer publishes a **draft** list (everyone can see it, marked provisional, masked) and later a **final list** that is **frozen at a date and time**: it can no longer change, it carries a fingerprint and a signature, and anyone can check the proof.
- The public sees only the flat number, a masked name (`Ra**** Sh****`), the role, whether the person may vote, the last 4 digits of the mobile, and the last 4 characters of the e-mail ID.
- Every action is written to a **signed, linked log** that nobody can edit.
- It runs on the **free** Cloudflare plan, is built phone-first, and has a Hindi switch on the voter page.

**Where it stands (14 Nov 2026):** built, tested (160 tests) and passed two independent audits in a row (rounds 15 and 16, after 16 rounds in all). A **preview** copy exists on a `pages.dev` address, but sign-in there does not work yet because the e-mail key is not set. **Nothing is live** and no DNS was changed. See [5-CURRENT-STATE.md](5-CURRENT-STATE.md).

## The pages

| Page | Answers |
|---|---|
| [1-WHAT.md](1-WHAT.md) | What the product is: roles, steps, enrolment, publishing, masking, audit trail, e-mail rules |
| [2-WHY.md](2-WHY.md) | Why it is the way it is: the owner's decisions with dates, the 16 audit rounds, the five e-mail rules |
| [3-WHERE.md](3-WHERE.md) | Where things are: files, database tables, `wrangler.toml`, Cloudflare names, the preview address |
| [4-HOW.md](4-HOW.md) | How to run, test, deploy (three go-aheads) and roll back |
| [5-CURRENT-STATE.md](5-CURRENT-STATE.md) | Current state and open questions |
| [HANDOVER-voter-list-session.md](HANDOVER-voter-list-session.md) | Handover note from the session that built it |

## Older documents in `../`

`GAPS-AND-PLAN.md` (design and mock-ups), `RESEARCH-NOTES.md` (Indian society practice, data-protection law, comparable products), `PROGRESS.md` (the owner's running notes and answers), `SMOKE-TEST.md` (22 rows to run on preview and at the address go), `AUDIT-ROUND-0.md` to `AUDIT-ROUND-16.md` (every audit, with what was fixed), and `../../ASSUMPTIONS.md` (every default and why). The top-level `../../README.md` has the full deploy plan.

## What is deliberately not in this repository

No keys, secrets, pepper, signing keys, Resend key, or sign-in codes (the dev file `.dev.vars` is git-ignored and was never committed). No real people's e-mail addresses: tests and docs use made-up addresses on `example.com`, `sample.example` and `s.example`, which cannot receive mail. Only two company role addresses appear, because they are product settings: `host@townhall-records.com` (the permanent host) and `no-reply@townhall-records.com` (the sender).

# 5. Current state and open questions (14 Nov 2026, evening)

## In plain words

The product has the owner's nine requirements **and** the three changes of 14 Nov 2026 (the Cloudflare e-mail sender, the "Owner / 1st Name in Registration" label with several people per flat, and the reasons for "not allowed to vote"). Audit rounds 27 and 28 both passed, in a row, on that combined code. The code is on the private preview copy, and **the smoke test has now run on it** (see below): sign-in codes arrive in an inbox (not spam) within about a minute, and the main journey works. A few smoke rows are still open. **Nothing is live. No DNS was changed by the build session. Nothing was paid for.**

## What is done

- Rebuild to the nine requirements; then the three changes of 14 Nov; **215 tests pass**; type check clean.
- 28 independent audit rounds in all (rounds 15, 16 on the first code; **27 and 28 on the combined code**, both PASS with no blocker, high or medium findings; their 9 low notes are listed in `../AUDIT-ROUND-28.md`).
- **Preview (14 Nov 2026):** the audited code (commit `9c9b728`; later commits are documents and tests only) is deployed at https://preview.voter-list.pages.dev. Migration 0007 is applied to the preview database. The mail secrets (`CF_EMAIL_TOKEN`, `CF_ACCOUNT_ID`, `MAIL_FROM`, `MAIL_DAILY_CAP` = 20) are set on the preview only.
- The six mail DNS records for the Cloudflare Email Service were added by the owner's side; they and the rollback are in `../EMAIL-SENDING-DNS-PLAN.md`.
- A screen-by-screen walk-through (made-up data, local test copy) is made for the owner as `Voter-list-UI-UX-flow.html` (not in this repository because of its size).

## What is not done

- **Smoke test, 14 Nov 2026 (`../SMOKE-TEST.md`; details in `../PROGRESS.md`):** rows 1 to 12, 14, 16 and 23 passed on the preview, using four test addresses (`host@`, `smoke1@`, `smoke2@`, `smoke3@townhall-records.com`) that Cloudflare Email Routing forwards to one mailbox the owner's side reads (undo: delete those rules). Every code and the host invitation reached the inbox, not spam. **CPU per request** (Cloudflare's live log): normal requests 2 to 20 ms, a 2000-row import 135 ms, draft 44 ms, freeze 36 ms, no "Exceeded CPU" and no 5xx, so the free plan's 10 ms was not enforced as a hard stop at these sizes. **Database writes: about 10 rows per person imported** (not 3): a 6,000-person import is about 60,000 of the day's 100,000.
- **Still open from the smoke test:** row 15 only as a bulk of 2; row 24 (reasons) and two people in one flat not clicked through on the preview; row 13 (Turnstile, owner-gated); CPU of a draft or freeze with thousands of approved people; the Organizer pages in a phone browser on the preview.
- Live go and Address go (migrations on the live database, production deploy, DNS for `voterlist.townhall-records.com`).
- The follow-ups from the audit notes (rounds 16 and 28), for example: tightening the public-reason setting leaves an already published draft as it was until the next publish; a Host can set "no" on a person the Organizer authorized (logged, reversible); a lone person the Organizer refused can re-enrol under another e-mail.
- The Organizer page is English only; the Hindi has not been read by a native speaker.

## Blockers and open questions for the owner

| # | Question | Why it matters | Safest default now |
|---|---|---|---|
| 1 | **Keep or remove the test mail routes.** `host@`, `smoke1@`, `smoke2@`, `smoke3@townhall-records.com` forward to a test mailbox. Remove the three `smoke` rules (and decide on `host@`) when testing ends. | They forward the domain's mail to someone else's mailbox. | Kept until the owner says. |
| 2 | **Real Organizer e-mail IDs** for the live list. The preview has only `host@townhall-records.com`. | Without the list nobody can become an Organizer in production (closed sign-up, by design). | Preview: the permanent host only. |
| 3 | **What the public list says about a reason.** The builder chose the default "only reasons that follow from the role" (Tenant, Co-owner, Not a member, the voting-rule reason); unpaid dues, proxy papers and anyone's own words stay private. Is that what the owner wants? The Organizer can change it in Step 1. | A privacy decision about named people. | The default above. |
| 4 | **Turnstile.** Create the free Cloudflare Turnstile site and set both `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET`; allow `voterlist.townhall-records.com` and the preview address. | It must be on before the link goes public; it protects the small e-mail allowance. | Off. |
| 5 | **E-mail allowance size.** `MAIL_DAILY_CAP` stays at 20 on the preview (never raised without the owner). The Cloudflare allowance is shared with the whole account. Raise it for the live copy? | One society of 200 flats needs more than a day's cap to enrol over a week. | Keep it small; ask big societies to enrol over several days. |
| 6 | **Price.** Is Voter List charged? If so, the rupee price and when it applies (payments only via IT SERVICES BY RAJAT AGARWAL on Razorpay, not wired). | | Free; slot off. |
| 7 | **State-by-state rules.** Should state-specific wording (for example Maharashtra and proxy votes) be built, perhaps by a lawyer? | Today the Organizer picks the rule and is reminded to follow the bye-laws. | Not built. |
| 8 | **Hindi review.** A native Hindi reader should read the Hindi once; and should the Organizer page be translated before launch? | | English Organizer page. |
| 9 | **Permanent keeping of records** and the DPDP Act 2023: a lawyer should review. | | Kept always; withdrawals cleared after 30 days. |
| 10 | **What the public CSV and PDF carry:** flat weight, "may attend", a short note and (new) the reason column the Organizer allows. Trim? | | As built. |

## What the owner must say next

- **Live go:** after the preview smoke test passes, with the real Organizer list, new production secrets and Turnstile in place.
- **Address go:** for the DNS step (one `voterlist` CNAME).

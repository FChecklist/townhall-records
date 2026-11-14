# 5. Current state and open questions (14 Nov 2026, evening)

## In plain words

The product has the owner's nine requirements **and** the three changes of 14 Nov 2026 (the Cloudflare e-mail sender, the "Owner / 1st Name in Registration" label with several people per flat, and the reasons for "not allowed to vote"). Audit rounds 27 and 28 both passed, in a row, on that combined code. The code is on the private preview copy. **Nobody has signed in there yet**, because the sign-in code goes to a mailbox the build session may not read. **Nothing is live. No DNS was changed by the build session. Nothing was paid for.**

## What is done

- Rebuild to the nine requirements; then the three changes of 14 Nov; **215 tests pass**; type check clean.
- 28 independent audit rounds in all (rounds 15, 16 on the first code; **27 and 28 on the combined code**, both PASS with no blocker, high or medium findings; their 9 low notes are listed in `../AUDIT-ROUND-28.md`).
- **Preview (14 Nov 2026):** the audited code (commit `9c9b728`; later commits are documents and tests only) is deployed at https://preview.voter-list.pages.dev. Migration 0007 is applied to the preview database. The mail secrets (`CF_EMAIL_TOKEN`, `CF_ACCOUNT_ID`, `MAIL_FROM`, `MAIL_DAILY_CAP` = 20) are set on the preview only.
- The six mail DNS records for the Cloudflare Email Service were added by the owner's side; they and the rollback are in `../EMAIL-SENDING-DNS-PLAN.md`.
- A screen-by-screen walk-through (made-up data, local test copy) is made for the owner as `Voter-list-UI-UX-flow.html` (not in this repository because of its size).

## What is not done

- **The smoke test has not run** (`../SMOKE-TEST.md`, rows 1 to 17, 23 and 24 on the preview). Sign-in needs a 6-digit code, and the preview's `ORGANIZERS` list is only `host@townhall-records.com`. The owner reads that mailbox and pastes the code, or a test address is routed to a mailbox someone may read. No personal mailbox is to be used. So **the free plan's 10 ms CPU limit, the D1 write budget, the real inbox (not spam) check of the sign-in mail, and a very large import's undo** are still unverified. This is the one thing the audits could not settle.
- Live go and Address go (migrations on the live database, production deploy, DNS for `voterlist.townhall-records.com`).
- The follow-ups from the audit notes (rounds 16 and 28), for example: tightening the public-reason setting leaves an already published draft as it was until the next publish; a Host can set "no" on a person the Organizer authorized (logged, reversible); a lone person the Organizer refused can re-enrol under another e-mail.
- The Organizer page is English only; the Hindi has not been read by a native speaker.

## Blockers and open questions for the owner

| # | Question | Why it matters | Safest default now |
|---|---|---|---|
| 1 | **A sign-in code for the preview.** Who reads `host@townhall-records.com` (or a routed test address) and pastes the 6-digit code? | Without it the smoke test cannot start. | Waiting. |
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

- **A sign-in code** (or a routed test address) so the preview smoke test can run.
- **Live go:** after the preview smoke test passes, with the real Organizer list, new production secrets and Turnstile in place.
- **Address go:** for the DNS step (one `voterlist` CNAME).

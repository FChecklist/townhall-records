# 5. Current state and open questions (14 Nov 2026)

## In plain words

The product is finished as far as the owner's nine requirements go, and has passed independent audit twice in a row. A private preview copy exists on the internet, but nobody can sign in to it yet, because the e-mail sending key has not been put there. **Nothing is live. No DNS was changed. Nothing was paid for.**

## What is done

- Rebuild to the nine requirements; 160 tests pass; type check clean.
- 16 independent audit rounds; rounds 15 and 16 both PASS (no blocker, high or medium findings).
- Preview go (approved 14 Nov): two databases, a Pages project, preview-only secrets, and a preview deployment. The preview database has migrations 0001 to 0006. Pages, assets and `/api/config` answer; an unknown voter link answers "This link is not valid", which shows the function reaches the database.
- A full screen-by-screen walk-through (46 screenshots, made-up data, on a local test copy) was made for the owner.

## What is not done

- **The smoke test has not run** (`../SMOKE-TEST.md`): it needs working sign-in. So the **free plan's 10 ms CPU limit and the D1 daily write budget are still unverified**; this is the one thing the audits could not settle.
- Live go and Address go (migrations on the live database, production deploy, DNS for `voterlist.townhall-records.com`).
- The 8 LOW follow-ups of audit round 16 (see `2-WHY.md`).
- The Organizer page is English only; the Hindi has not been read by a native speaker.

## Blockers and open questions for the owner

| # | Question | Why it matters | Safest default now |
|---|---|---|---|
| 1 | **Sender.** `townhall-records.com` is **not** a verified sending domain in Resend (public DNS has no Resend records: no `resend._domainkey`, no `send` subdomain). Verify it (adds a few mail-only DNS records on the owner's domain, which needs the owner's go; Resend's free plan may limit the number of domains), or use an already verified domain for the preview only (which is not the approved sender)? | Without it no code can be sent from the approved address. | Stopped; nothing changed. |
| 2 | **Resend key.** The existing free key is the owner's and was not available to the build session. Set it on the preview: `wrangler pages secret put RESEND_API_KEY --project-name voter-list --env preview` (and production later). | Sign-in, and therefore the smoke test, cannot start without it. | Not set. |
| 3 | **Real Organizer e-mail IDs.** The owner did not name any. The preview has only `host@townhall-records.com` in `ORGANIZERS`. Which e-mail IDs may start lists in production? | Without the list nobody can become an Organizer (closed sign-up, by design). | Preview: the permanent host only. |
| 4 | **Turnstile.** Create the free Cloudflare Turnstile site and set both `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET`; allow `voterlist.townhall-records.com` and the preview address. | It must be on before the link goes public; it protects the free e-mail allowance. | Off. |
| 5 | **Price.** Is Voter List charged? If so, the rupee price and when it applies (payments only via IT SERVICES BY RAJAT AGARWAL on Razorpay, not wired). | | Free; slot off. |
| 6 | **State-by-state rules.** Should state-specific wording (for example Maharashtra and proxy votes) be built, perhaps by a lawyer? | Today the Organizer picks the rule and is reminded to follow the bye-laws. | Not built. |
| 7 | **E-mail allowance size.** The free Resend allowance (about 80 a day for the whole product) carries one society of 200 flats over a week but not many busy societies at once. Raise it (may cost money) or ask big societies to enrol over several days? | | Keep the free allowance. |
| 8 | **Hindi review.** A native Hindi reader should read the Hindi once; and should the Organizer page be translated before launch? | | English Organizer page. |
| 9 | **Permanent keeping of records** and the DPDP Act 2023: a lawyer should review. | | Kept always; withdrawals cleared after 30 days. |
| 10 | **What the public CSV and PDF carry:** flat weight, "may attend" and a short note beyond the page's columns. Trim? And show the last 4 letters before the `@` instead of the last 4 characters (which are mostly `.com`)? | | As built. |

## What the owner must say next

- **Live go:** after the preview smoke test passes, with the real Organizer list, new production secrets and Turnstile in place.
- **Address go:** for the DNS step (one `voterlist` CNAME) and the sender verification.

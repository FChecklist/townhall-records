# Progress notes (plain words)

Last updated 13 Nov 2026. Nothing is deployed. Nothing was paid for.

## Your decisions of 13 Nov (done)

1. **The standing host.** `host@townhall-records.com` is a permanent Host on every list, uses none of the 10 seats, and the Organizer cannot remove or pause it. (Built that way from the start; now confirmed.)
2. **Details are kept always.** No erase by default: the 180-day Organizer-erase is off. Records stay with the list. The legal notice and the way to ask for a correction stay: a voter asks the Organizer, who corrects the record, and every correction is written to the signed trail. The one exception is a voter who withdraws their own record (their choice): it leaves the list and is cleared after 30 days. The Organizer's erase button comes back only if `RETENTION_DAYS` is set. **A lawyer should review permanent keeping under the Data Protection law (DPDP Act 2023):** the Act expects data to be used only for the purpose it was given for, and to be erased when a person asks or the purpose ends. Your default is applied; the page tells voters plainly that details are kept while the society keeps its voter records and that they can ask for corrections.
3. **What the public list shows.** Flat number, name masked (`Ra**** Sh****`), role, may-vote, mobile as `******1234` (only the last 4 digits), e-mail ID as `********` plus only its last 4 characters. Nothing else is public. (The CSV and PDF also carry non-personal columns: the flat's vote weight, "may attend" and a short note such as "also on the record". Say if you want them trimmed.) (Note: the last 4 characters of most e-mail IDs are the ending, such as `.com`, so this shows very little. Showing the last 4 letters before the `@` would help people recognise their own entry. Your call.)
6. **Languages.** Every voter can change the language on the voter page itself, for their own view only; it is remembered in their browser and nothing else on the page changes. English and Hindi are in. The Organizer and Host page is English for now (its ~300 lines are one more string file and a native reader's review; say if you want it before launch). More languages are just one more file each (`public/assets/lang/`). A native Hindi reader should read the Hindi once.

## Questions still open (the safest default is already in use, so nothing waits on these)

0. **Who may start a list.** In production only the e-mail IDs you list in `ORGANIZERS` can become Organizers (strangers cannot make accounts, which keeps the free e-mail allowance safe). Which e-mail IDs should be on the list at the start? Open sign-up (`OPEN_SIGNUP=1`) is possible once the free Cloudflare Turnstile check is added.

4. **The price.** The price slot is off. If you want to charge, tell me the rupee price and when it applies. Payment would go only through IT SERVICES BY RAJAT AGARWAL via Razorpay, and is **not wired** yet.
5. **State-by-state rules.** I did not build state rules (for example Maharashtra does not allow proxy votes). The Organizer picks the voting rule and is reminded to follow the bye-laws. A lawyer could write state wording later. OK?
7. **E-mail allowance.** The e-mail rules are now five simple ones (see below). The free Resend allowance is 80 mails a day for the whole product: 60 for voters (codes and send-back notes), 20 for the Organizer and Hosts (sign-in codes and invitations). One e-mail ID gets at most 4 codes an hour and 8 a day; one list's newcomers get 25 codes a day (people the list team has vouched for are never held back by that). That is a lot for one society of 200 flats over a week, but busy days across many societies will hit the 60. Raise the cap (may cost money), or keep it and ask big societies to enrol over several days? I would also switch on the free Cloudflare Turnstile check once you create the site key (needs your Cloudflare login).
8. **The address (name approved 13 Nov; the DNS step still needs its own go).** `voterlist.townhall-records.com` is approved as the name. Which e-mail address should voters' codes come from? The plan uses `Townhall Records <no-reply@townhall-records.com>`; please confirm `townhall-records.com` is a verified sending domain in Resend. The README (Step 5b) explains how the address is added without touching the marketing site.

## Done

- Audit of the old product against your nine requirements (`docs/AUDIT-ROUND-0.md`).
- Research into how Indian societies and comparable products work, and the Data Protection law (`docs/RESEARCH-NOTES.md`), and the plan with page mock-ups (`docs/GAPS-AND-PLAN.md`).
- Rebuilt around one common link per list, e-mail + 6-digit code, enrolment as Owner / Co-owner / Tenant / Proxy, Approve or Not approved with a reason and resubmit, Draft and Frozen publishing with a date-and-time cut-off, a public masked list with a proof, 1 Organizer + 10 Hosts + the standing host, signed audit of every action, erase after the retention period.
- One page for voters and one page for Organizers and Hosts, seven steps each, checked by hand at phone and laptop width.
- Tests: 160 passing; type check clean.
- Round 7 changes (your answers of 13 Nov, and a simpler e-mail design): see "The e-mail rules, simplified" below.

## The e-mail rules, simplified (13 Nov)

Six audit rounds kept finding new ways to spend the free e-mail allowance, and each time I added another pool, which made it harder to explain and to trust. I stepped back. The whole design is now five rules, written at the top of `mailPools` in `src/auth.ts`:

1. **Closed Organizer sign-up.** A new Organizer must be on your list (`ORGANIZERS`), so strangers cannot make accounts. (`OPEN_SIGNUP=1` opens it, best together with rule 5.)
2. **Per e-mail ID:** at most 4 codes an hour and 8 a day.
3. **Per list:** a list's newcomers (addresses not yet on it) get at most 25 codes a day (`MAIL_LIST_CAP`). People already on the list are never held back by that.
4. **Two daily pools:** voters (codes and send-back notes) and staff (sign-in codes and invitations). Neither can use the other's.
5. **Cloudflare Turnstile (free, optional):** when set up (`TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET`), no code is sent, and nothing is counted, until the small safety box was passed. A robot cannot burn the allowance.

Whatever the limits say, "send me a code" always gets the same answer, so nobody can learn who is on a list.

**What went away:** the separate pools for known and new voters, for brand-new Organizers, for invitations and for notes (six pools became two), and the account-based invitation counting. Two small limits stay inside rule 3 and 4 (newcomers at most two thirds of the voters' pool; send-back notes at most a sixth), because audit round 7 showed that without them a script could lock real voters out. **Why it is safe:** the real danger was strangers creating accounts and lists (rule 1) and robots asking for codes (rules 2, 3 and 5). **One honest condition:** switch the free Turnstile check on before the link goes public (it is a smoke-test row); without it, a determined script can still use up a day's allowance, though real people the list team has vouched for (uploaded, added, approved or sent back by them) keep their share.

## Next

- Independent audits (a fresh reviewer who did not build it), at least three rounds, fixes between them; results in `docs/AUDIT-ROUND-1.md` onward.
- Waiting for your go before any deploy. The deploy plan, the rollback id (`RB-VL-1`) and the smoke test are in `README.md` and `docs/SMOKE-TEST.md`.

## What I need from you

Only the answers above, when convenient, and the go for a preview deployment when you are ready.

## Audit status (13 Nov 2026)

Rounds 7 to 14 each failed with one or two findings of falling severity, all fixed. **Round 15 (commit `ebd3403`) and round 16 (commit `5e02280`) both returned AUDIT: PASS**, with no BLOCKER, HIGH or MEDIUM findings. The code at `5e02280` is the audited code; later commits are documents only. Round 16's eight LOW points are not fixed (so the audited code stays as audited) and are listed in `docs/AUDIT-ROUND-16.md` as a short follow-up list for after the preview.

## Preview deployment (14 Nov 2026) — preview go only

- **Preview address:** https://preview.voter-list.pages.dev (this build: https://2652c573.voter-list.pages.dev). Pages project `voter-list` created; the production address `voter-list.pages.dev` has no deployment (404) on purpose.
- **Databases:** `voter-list` (id in `wrangler.toml`; empty, no migrations applied) and `voter-list-preview` (migrations 0001 to 0006 applied). Only the preview database is used.
- **Preview secrets set:** `SIGNING_KEY`, `PEPPER` (new keys made outside the repo, the file deleted afterwards), `ORGANIZERS` = `host@townhall-records.com` only, `MAIL_FROM` = `Townhall Records <no-reply@townhall-records.com>`, `MAIL_DAILY_CAP` = 20. No production secrets yet. `TEST_MODE` is not set.
- **Checked on the preview address:** pages and styles load, `/api/config` answers, an unknown voter link answers "This link is not valid", the database is reachable from the running Function.
- **Blocked: e-mail.** No `RESEND_API_KEY` is set (the key is the owner's; it was not available to this session), so sign-in answers "E-mail is not set up on this server yet" and the smoke test cannot start. Separately, `townhall-records.com` does not have Resend's sending records in DNS (no `resend._domainkey` record, no `send` subdomain), so it is **not a verified sending domain**. `corporatetambola.com` and `veridian-aios.com` do have them. Adding sending records for `townhall-records.com` is a DNS change on the owner's domain (mail records only), and Resend's free plan may limit the number of domains; this is for the owner to decide.
- **Rollback id `RB-VL-1`** = git tag `voter-list-v1-predeploy`, set locally on the commit that holds this record (not pushed). To undo the preview: delete the `preview` deployment in the Pages dashboard; nothing else was changed.

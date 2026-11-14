# Sending e-mail from townhall-records.com (Cloudflare Email Service): DNS plan and rollback

Written 14 Nov 2026 before the change; **updated the same day after the owner added the six mail-only records** (the section "What was actually added" below is the record of that). The sending token is kept in the owner's private env file on the build machine and goes only into the **preview** project's secrets. It is never printed and never committed.

## In plain words

Voter List sends sign-in codes from `no-reply@townhall-records.com`. For mail to land in inboxes and not in spam, Cloudflare must be told (in DNS) that it is allowed to send for that domain. Cloudflare adds a few **mail-only** records for this. They live on a separate sub-name (`cf-bounce`) and on `_dmarc`, so the website, the existing mail-forwarding (Email Routing) records and the existing SPF record stay exactly as they are.

## What exists today (read-only check, 14 Nov 2026, zone `townhall-records.com` on Cloudflare, plan Free)

| Type | Name | Content | Proxied |
|---|---|---|---|
| CNAME | `townhall-records.com` | `townhall-site.pages.dev` | yes |
| CNAME | `www.townhall-records.com` | `townhall-site.pages.dev` | yes |
| MX | `townhall-records.com` | `route1.mx.cloudflare.net` (10), `route2.mx.cloudflare.net` (89), `route3.mx.cloudflare.net` (5) | no |
| TXT | `townhall-records.com` | `v=spf1 include:_spf.mx.cloudflare.net ~all` | no |
| TXT | `cf2024-1._domainkey.townhall-records.com` | `v=DKIM1; h=sha256; k=rsa; p=...` (Email Routing key) | no |

There is **no** `_dmarc` record, **no** `cf-bounce` record, **no** `voterlist` record and **no** wildcard record. That is 7 records in all. The "before" copy is read by script (a read-only API call), never typed by hand.

## What was actually added (read back from the zone by script, 14 Nov 2026: 7 records before, 13 now)

| # | Type | Name | Content |
|---|---|---|---|
| 1 | MX | `cf-bounce.townhall-records.com` | `route1.mx.cloudflare.net` (10) |
| 2 | MX | `cf-bounce.townhall-records.com` | `route2.mx.cloudflare.net` (89) |
| 3 | MX | `cf-bounce.townhall-records.com` | `route3.mx.cloudflare.net` (5) |
| 4 | TXT (SPF) | `cf-bounce.townhall-records.com` | `v=spf1 include:_spf.mx.cloudflare.net ~all` |
| 5 | TXT (DKIM) | `cf-bounce._domainkey.townhall-records.com` | `v=DKIM1; h=sha256; k=rsa; p=...` (the sending key; the existing `cf2024-1._domainkey` is untouched) |
| 6 | TXT (DMARC) | `_dmarc.townhall-records.com` | `v=DMARC1; p=reject;` |

The seven earlier records are unchanged. Nothing at the apex or `www` was touched, so the website and Email Routing are as before.

**Two things to know.**

- **DMARC is `p=reject`** (Cloudflare's wording; the plan said anything stricter than `p=none` is reviewed). It applies to every mail that claims to be from `townhall-records.com`: a mail that fails both SPF and DKIM alignment is refused by the receiver. Mail sent through the Email Service passes (DKIM is signed for the domain), and the existing forwarding (Email Routing) does not send *from* the domain. If a later sender (a newsletter tool, a second mail product) is ever added for this domain, it must be set up for DKIM first or its mail will be refused. If the owner prefers a softer start, change the value to `v=DMARC1; p=none;` (one record edit, see Rollback).
- **One shared quota.** The account's Email Service allowance is shared by everything that sends from the account. The Voter List's own cap stays at `MAIL_DAILY_CAP` 20 or below and is never raised without telling the owner.

## What Cloudflare said it would add when a domain is onboarded for sending

From Cloudflare's "Send emails" guide (checked 14 Nov 2026), all on **mail-only names**:

1. **MX** records on `cf-bounce.townhall-records.com` (bounce handling).
2. **TXT (SPF)** on `cf-bounce.townhall-records.com`.
3. **TXT (DKIM)** at `cf-bounce._domainkey.townhall-records.com`.
4. **TXT (DMARC)** on `_dmarc.townhall-records.com`.

Exact names and values are shown by the dashboard at onboarding; they are copied here after the step (see "After").

## Does anything clash with what exists?

| Risk | Check | Result |
|---|---|---|
| The website (the two `CNAME` records) | None of the four additions is an apex or `www` record. | No clash. |
| The apex MX (Email Routing, which forwards `host@` mail) | The new MX records are on `cf-bounce`, not the apex. | No clash. If the dashboard proposes to change an apex MX, **stop**. |
| The apex SPF | The new SPF is on `cf-bounce`. The apex SPF stays one record, `v=spf1 include:_spf.mx.cloudflare.net ~all`, which already covers Cloudflare's own mail. A domain may only have **one** SPF record at a name, so nothing is added at the apex and nothing is duplicated. If the dashboard proposes a **second** apex SPF record, **stop**; the fix is to merge into the existing one. | No clash expected. |
| The existing DKIM `cf2024-1._domainkey` | A new DKIM name is used for sending; the existing one is not edited. | No clash expected. |
| DMARC | There is none today, so nothing is replaced. The policy value Cloudflare writes is recorded after the step; if it is stricter than `p=none` it is reviewed before use. | New record only. |

## Steps (steps 1 to 4 were done by the owner on 14 Nov 2026; 5 and 6 follow the audits)

1. Save the "before" list again by script (read-only API call) and compare with the table above.
2. In the Cloudflare dashboard (owner's login): Compute, Email Service, Email Sending, **Onboard Domain**, choose `townhall-records.com`. Review the records it proposes against the table above **before confirming**.
3. Confirm only if the proposal is the four mail-only additions. Wait 5 to 15 minutes (up to 24 hours).
4. Save the "after" list by script and **diff** with "before". The only differences allowed: the new `cf-bounce` MX and TXT records, the sending DKIM TXT, and the `_dmarc` TXT. Anything else is a stop.
5. Create an API token allowed to send (Email Sending: Edit, limited to this account) and set `CF_EMAIL_TOKEN`, `CF_ACCOUNT_ID` and `MAIL_FROM` as **secrets of the preview project only**. Never print them.
6. Check the website, `www`, and Email Routing still work; send one test code to a mailbox the owner controls.

## Rollback (exact)

If anything looks wrong at any step:

1. In Cloudflare, DNS, Records: **delete exactly the six records in the table "What was actually added"** (three `cf-bounce` MX, the `cf-bounce` SPF TXT, the `cf-bounce._domainkey` TXT, the `_dmarc` TXT), and nothing else. To only soften DMARC instead, edit the `_dmarc` value to `v=DMARC1; p=none;`.
2. In Email Service, remove the sending domain onboarding if the dashboard offers it.
3. Delete the preview secrets `CF_EMAIL_TOKEN`, `CF_ACCOUNT_ID`, `MAIL_FROM` and revoke the API token.
4. Compare DNS with the "before" list: it must be identical to the 7 records in the first table (the cf-bounce records and `_dmarc` gone).

The website and Email Routing are never touched, so there is nothing to restore there.

## Things to settle first

- **Plan.** Settled by the owner: the account's plan allows sending to any recipient.
- **Token.** Settled: the owner made a token with the Email Sending permission. It is read from the owner's private env file, set as a preview-project secret only, never printed or committed.
- **From format.** Cloudflare's "Specify recipients" examples give a named sender in the REST API as `{ "address": "no-reply@townhall-records.com", "name": "Townhall Records" }`, and a bare address as a plain string. The code sends exactly that (the older Resend route still gets the quoted string). The smoke test (row 23) reads the sent row in the outbox and the received mail's From line to confirm it; if Cloudflare refuses it, the fallback is the bare address, a small code change that goes through its own audit.

# 2. WHY: the decisions, the audits and the e-mail rules

## In plain words

The owner gave nine requirements and a few standing rules. The product was first audited against them (round 0, by the builder), then rebuilt around them, then audited by **twenty-eight** fresh reviewers, in two sequences, until two passed one after the other each time. Each failed round found real problems; each was fixed and tested. Most of the late findings were about one thing: protecting the small free e-mail allowance from abuse without making the rules hard to explain.

## The owner's nine requirements (the brief)

1. A single page per role, steps top to bottom.
2. One common link per list; e-mail plus 6-digit code, no passwords.
3. Voter journey: enrol as Owner, Co-owner, Tenant or Proxy; confirm; see and update; documents; status.
4. Organizer and Host: Approve or Not approved (with a reason), resubmit, recheck, bulk actions.
5. Draft (provisional) publish, then a **frozen** publish with a date-and-time cut-off: immutable, fingerprinted, signed; the public page is masked.
6. Exactly 1 Organizer and at most 10 Hosts; `host@townhall-records.com` is a permanent standing Host outside the 10; everything audit-logged.
7. Friendly: plain words, one main action, progress, undo.
8. Fits India's AOA, HOA and RWA practice.
9. World class but simple: mobile first, accessible, fast, free Cloudflare plan.

## Standing owner rules

- No paid step without asking.
- No live deploy, DNS change or migration without the owner's explicit go **and** a rollback plan.
- Keep the user's computer light (the laptop is low on memory): no heavy parallel work.
- Payments only through IT SERVICES BY RAJAT AGARWAL via Razorpay (not wired).
- Wording friendly and favouring the user, with no blunt "We do not..." lines; customer-facing copy short.
- Synthetic voters only (made-up names, numbers and `.example` e-mail IDs).
- Process rule 7c: the builder cannot certify their own work; independent fresh audits are required (at least 3 rounds and 2 passes in a row).

## The owner's decisions, with dates

| Date | Decision |
|---|---|
| 11 to 13 Nov 2026 | The nine requirements above. Round 0 measured the old product against them on 13 Nov: the foundation (signed chain, atomic guards, masking, import, checks, immutable versions) was kept; the middle and the screens were rebuilt. |
| 13 Nov | **The standing host** `host@townhall-records.com` is permanent on every list, uses none of the 10 seats, and cannot be removed or paused by the Organizer. |
| 13 Nov | **Details are kept always.** No default erase. A voter who withdraws is cleared after 30 days. The Organizer's erase button returns only if `RETENTION_DAYS` is set. (A lawyer should review this under the DPDP Act 2023.) |
| 13 Nov | **What the public list shows:** flat, masked name, role, may-vote, mobile as `******` plus the last 4 digits, e-mail ID as `********` plus the last 4 characters. |
| 13 Nov | **Languages:** each voter can switch language on the voter page for their own view; English and Hindi now; more by adding a file. |
| 13 Nov | **The address name** `voterlist.townhall-records.com` approved (the name only; adding it to DNS needs its own go). |
| 14 Nov | **Sender moved to the Cloudflare Email Service** (the owner added six mail DNS records on `townhall-records.com`: three MX `cf-bounce` routes, SPF, DKIM `cf-bounce._domainkey`, DMARC `_dmarc` with p=reject; recorded with a rollback in `../EMAIL-SENDING-DNS-PLAN.md`). Resend stays as an older route. `MAIL_DAILY_CAP` stays at 20 until the owner says otherwise. |
| 14 Nov | **Role label and several people per flat:** the first role reads "Owner / 1st Name in Registration" everywhere (stored "Owner"); a flat may have several registrations; the Organizer decides who is authorized; the product does not enforce one vote per flat. |
| 14 Nov | **Reasons for "not allowed to vote"** ("its very important"): always chosen from a short list or in the Organizer's or Host's own words; visible to the Organizer, Hosts and the person; the public list shows only what the Organizer allows. **Default chosen by the builder (the owner can change it in Step 1): the public list shows only reasons that follow from the role (Tenant, Co-owner, Not a member, the voting-rule reason); unpaid dues, proxy papers and anyone's own words stay private.** A Host cannot change the Organizer's reasons. |
| 14 Nov | **"Ok approved all":** (1) the **preview go** (create the two databases, the secrets and the Pages project, publish to a `pages.dev` preview only; no DNS change; the marketing site untouched; free plan only); (2) the **sender** `Townhall Records <no-reply@townhall-records.com>` (if `townhall-records.com` is not a verified Resend sending domain, stop and ask instead of changing DNS or adding a paid plan); (3) **Organizers:** the owner named no e-mail IDs, so the preview has only `host@townhall-records.com`, no personal address is used, and the real list is still needed before the live go. `TEST_MODE` is never set on a publicly reachable address. This was **not** the live go and **not** the address go. |

## The audit rounds (0 to 16 first, 17 to 28 for the changes of 14 Nov)

Round 0 was the builder's own gap check. Rounds 1 to 16 were independent: a fresh reviewer who had no part in the build, read-only, who read the code, ran the tests, drove the pages in a browser at phone and laptop width (from round 2), and ran attack scripts against the real handler. Full write-ups: `../AUDIT-ROUND-<n>.md`.

| Round | Commit | Verdict | What it found (and what was done) |
|---|---|---|---|
| 0 | (builder) | gap check | The engine was strong; the product shape conflicted with the owner's design in five places and missed two. Rebuild of the middle and the screen. |
| 1 | `b18614b` | FAIL (3 high, 9 medium) | Bursts of writes failed on the signed log's one chain per list (retries and honest 503 added); the free e-mail allowance could not carry a big society (invitation limits). |
| 2 | `0ac8464` | FAIL (2 high, 7 medium) | An approved voter had no Withdraw button; strangers could drain the shared mail allowance (the mail split into two pools). |
| 3 | `abf2fd0` | FAIL (1 high, 5 medium) | The consent tick box was squeezed to 1.6 px and invisible; document types did not show. |
| 4 | `5a03942` | FAIL (2 high, 5 medium) | Withdrawn people could stay on the public draft (filter matched typed text, not the flat key); anyone with the link could use a list's daily code quota. |
| 5 | `5d2d0b2` | FAIL (2 high, 4 medium) | Anyone could ask for staff codes and drain the staff pool; people already on a list shared the pool with strangers. |
| 6 | `d8ace39` | FAIL (2 high, 4 medium) | Same root cause: anyone could create an account. Fixed at the cause with **closed Organizer sign-up** instead of more pool arithmetic. |
| 7 | `03bba8e` | FAIL (0 high, 6 medium) | "Same answer for everyone" was not true in timing and status (mail now sent after the answer); newcomer and note limits so real voters cannot be locked out. |
| 8 | `2d0ff17` | FAIL (2 medium) | Clearing a withdrawn voter left their line in the stored draft; Hindi gaps at the final step. |
| 9 | `10f6422` | FAIL (2 medium) | A removed record could be cleared wrongly; a stranger could become "known" for free ("known" now means vouched for by the team). |
| 10 | `045b58f` | FAIL (1 medium) | The clean-up query could not use its index (about 2 s; fixed to about 2 ms). |
| 11 | `c33e8a5` | FAIL (1 medium) | The preview's small daily cap plus the staff reserve left voters no mail (the reserve never takes more than half). |
| 12 | `7b123c9` | **PASS** (6 low) | First pass; long member IDs, weights input, mistyped mail settings. |
| 13 | `52a233a` | FAIL (1 medium) | A phone number in the Flat column of an uploaded sheet could reach the public list (skipped on upload and masked on publish). |
| 14 | `06edd3f` | FAIL (1 medium) | Hosts could see full names in the "who votes for this flat" choices (now masked for Hosts). |
| 15 | `ebd3403` | **PASS** (7 low) | Host dry-run checks now logged; sandbox policy on documents. First pass of the final pair. |
| 16 | `5e02280` | **PASS** (8 low) | **Second pass in a row.** All eight low points are deliberately left as a follow-up list (below). |

The git log has one commit per round named `close audit round N findings`: it holds the fixes made after round N failed. The commit in the table is the one the reviewer examined.

### Rounds 17 to 28: the three changes of 14 Nov 2026 (sender, role label and several people per flat, reasons)

These changes needed a **second sequence** of audits, because the first two passes (rounds 15 and 16) were on the earlier code. Full write-ups: `../AUDIT-ROUND-17.md` to `../AUDIT-ROUND-28.md`.

| Round | Verdict | In short |
|---|---|---|
| 17 | FAIL (1 medium) | The sender: account-id check, From-name clean-up, 10-second timeout, "delivered" check. |
| 18 to 22 | FAIL (each 1 to 3 medium) | Several people per flat: only the Organizer authorizes; Hosts cannot touch or undo it; the mark clears when a person changes flat; Step 5 lists every flat that needs a decision. |
| 23 | FAIL (1 medium, 4 low) | Head-count rules for the default authorization. |
| 24 | FAIL (1 high, 3 medium, 8 low) | Reasons: public wording must never carry a person's own words; uploads always mean "not allowed"; contact-detail check; the trail keeps the code only. |
| 25 | FAIL (2 medium, 5 low) | A Host could undo an Organizer's upload; the Cloudflare sender as `{address, name}`; reason-only edit. |
| 26 | FAIL | A reasonless "No" in an upload was not the Organizer's mark; filler in the Reason column; counts in the signed trail; sender-name clean-up. |
| **27** | **PASS** | Code of commit `9c9b728`; 215 tests; about 35 deliberate breakages caught. |
| **28** | **PASS** | Same code (only documents and tests changed). **Second pass in a row**; a randomized test of 40+ sequences found no way for a Host to change the Organizer's marks. 9 low notes, listed in the write-up. |

**Round 16's eight LOW follow-ups (not fixed, so the audited code stays as audited):** the 5-homes limit is checked then inserted, so parallel requests can slip past it (still bounded by 12 enrolments a day per e-mail ID); undoing an import of more than 5,000 rows leaves the rest and names a smaller count; rate-limit counting happens before validation; a removed record vanishes silently from the voter's view; a two-person flat after the chosen voter withdraws; an English "Reason:" label in the Hindi page; a Withdraw dialog line about final lists; angle brackets in uploaded names. Other accepted and documented items: the free plan's CPU limit is unverified until the preview smoke test; cut-off times use fixed India offsets; documents are stored in the database; the Organizer page is English only; the automatic 30-day clearing writes no signed entry (a counts-only entry would be a small addition).

## The five e-mail rules, and why (the sender changed on 14 Nov; the rules did not)

Six audit rounds kept finding new ways to spend the free allowance, and each time another pool was added, which made the design harder to explain and to trust. On 13 Nov the builder stepped back and reduced it to **five rules**:

1. Closed Organizer sign-up (strangers cannot create accounts and lists).
2. Per e-mail ID: 4 codes an hour, 8 a day.
3. Per list: 25 codes a day for newcomers; people vouched for by the team are exempt.
4. Two daily pools (voters and staff), neither able to use the other's; the staff reserve at most half; inside the voters' pool, newcomers at most two thirds and send-back notes at most a sixth (round 7 showed a script could lock real voters out without these).
5. Optional free Cloudflare Turnstile check; nothing is counted or mailed before it is passed.

**Why it is safe:** the real dangers were strangers creating accounts (rule 1) and robots asking for codes (rules 2, 3, 5). **One honest condition:** switch Turnstile on before the link goes public; without it a determined script can still use up a day's allowance, though people the team has vouched for keep their share. Whatever the limits say, every "send me a code" gets the same answer.

## Other design choices and their reasons

- **One database transaction per change** (data plus its audit entry), so a change can never exist without its log line.
- **Triggers in the database** for the 1-Organizer, 10-Host, permanent-host, 3-documents, immutability and append-only rules, so no code path can break them.
- **No SMS and no passwords:** SMS is paid; passwords are a burden and a risk.
- **Records stay on the list (not erased by default)** at the owner's choice, with a withdrawal route and a lawyer's review flagged.
- **Hosts see people masked until they open a record** so that checking is possible without everyone seeing everything, and every opening is on the record.
- **Frozen lists signed with Ed25519** so a final list can be proven later without trusting the server's word.
- **Plain JavaScript front end, strict content-security policy** (no inline scripts), small enough for the free plan's limits.

# 1. WHAT: the product

## In plain words

One page for voters, one page for the Organizer and Hosts. Each page is a list of numbered steps from top to bottom; the step to do now is highlighted and finished steps fold up. Nobody needs an account or a password: a person gives an e-mail ID, gets a 6-digit code, types it, and is in.

## The two pages

| Page | Address | Who | Steps |
|---|---|---|---|
| Voter page | `/v/<link>` (one common link per list) | Voters | 1 Sign in, 2 Enrol, 3 Check and send, 4 Your information, 5 Documents, 6 Where things stand, 7 The public list |
| Organizer and Host page | `/` | The Organizer, Hosts, the permanent host | 1 Set up your list, 2 Share the link, 3 Your team, 4 Check the records, 5 Final checks, 6 Publish the draft list, 7 Publish the final list; plus "The signed trail" and "How your details are kept" |

Screens of every step were captured on 14 Nov 2026 (made-up data, local test copy) and sent to the owner as a single HTML file, `Voter-list-UI-UX-flow.html`. It is not in this repository because of its size (about 6.6 MB).

## Roles

- **Organizer:** exactly one per list (enforced by the database). Sets up the list, shares the link, adds Hosts, publishes the draft and the final list, reopens a frozen list, hands over the role, sees full details and full exports. In production a new Organizer must be on the owner's `ORGANIZERS` list (closed sign-up).
- **Host:** up to 10 per list (enforced by a database trigger). Checks records, approves or sends back, corrects details on the Organizer's behalf. Sees people **masked** until they open one record; each opening is written to the signed log under the Host's own identity.
- **Permanent Townhall Records host:** `host@townhall-records.com` (setting `PERMANENT_HOST_EMAIL`). A standing Host on every list. It does **not** use one of the 10 seats, and the Organizer cannot remove or pause it (database triggers). It signs in with a code sent to its own mailbox.
- **Voter:** anyone with the link. Sees only their own records. Up to 5 homes per e-mail ID (a rule checked on save); 3 documents per record.

## The voter's journey

1. **Sign in:** e-mail ID, then 6-digit code (valid 10 minutes; session about 8 hours; spaces in the code are fine).
2. **Enrol:** **Owner / 1st Name in Registration** (stored as "Owner"), Co-owner, Tenant or Proxy, as far as the list's voting rule allows; flat or house, name (as in the sale deed or society record), mobile. A person the Organizer already uploaded or added skips this: their details are filled in and they land on step 3.
3. **Check and send:** read the details, tick the consent line, send to the list team. A record sent back shows the reason here and says where to fix it ("Send again").
4. **Your information:** change details while the list is open.
5. **Documents:** up to 3 per record (PDF, JPG or PNG, 400 KB each): Sale Deed or Share Certificate, Allotment or Possession Letter, Rent Agreement, Proxy Nomination Form, Society ID, Registration Paper, Others. A Proxy cannot send without the Proxy Nomination Form. Government ID types are refused; the page asks people to cover ID numbers.
6. **Where things stand:** a plain status (With the list team / Sent back to you / Approved, on the list) and a history of what happened, with times.
7. **The public list:** the draft or final list, masked, with downloads and the proof. A voter can **withdraw** their record while the list is open.

Language: a switch on the voter page (English, Hindi) changes the page for that person only and is remembered in their browser. More languages are one more file in `public/assets/lang/`. The Organizer page is English for now.

## The list team's work

Each record is **Waiting**, **Sent back**, **Approved** or **Invited** (uploaded but not yet confirmed by the person). A Host or the Organizer opens a record, then:

- **Approve**, or
- **Not approved…** with a reason in plain words (no phone numbers or e-mail IDs in the reason). The voter sees it, fixes and sends again, and the record comes back for a fresh check.
- Ticking several records allows **bulk Approve / Not approved / Remove**, and the last action has an **Undo**.
- **Add a person** and **upload** (paste or CSV/Excel; the page previews "6 people will be invited" before anything happens). Uploaded people are invited, not approved; each still signs in and confirms. Rows with a phone number or e-mail ID in the flat column, or odd characters, are skipped and counted.

## Settings chosen at set-up (Step 1)

Society name, kind (RWA, AOA, HOA, co-operative society, others), state, optional registration number and registering office; **who may vote** (five rules: Owner only; Owner or tenant; Owner or authorised proxy; Owner, tenant or authorised proxy; Member only); **how votes count** (every flat one vote, or weighted); **when enrolment closes** (a date and time in India time); whether to ask every voter for one supporting document. A dues cut-off and the authorization of people in a flat (Step 5 "Final checks") are part of the checks. An Organizer can hold up to 10 lists.

## Several people in one flat, and who may vote (owner's decision of 14 Nov 2026)

A flat may have **several registrations** (for example a husband, a wife and a son). The first role is shown everywhere as **"Owner / 1st Name in Registration"**; the stored value stays "Owner". The product does **not** enforce one vote per flat. **Only the Organizer decides who is authorized to vote**: in Step 5 the Organizer goes through each flat that needs a decision, says Yes or No for each person, and a lone person is authorized by default. Hosts can see but cannot change authorization, cannot move a person who carries the Organizer's mark, and cannot undo an action that set it. The mark is cleared when a person moves to another flat (a person can no longer retype their flat to get out of a "no").

## Reasons for "not allowed to vote" (owner's requirement of 14 Nov 2026, "very important")

Whenever the Organizer or a Host says a person is **not allowed to vote**, they must choose a **reason**: Dues unpaid, Tenant, Co-owner (not the 1st name), Not a member, Proxy papers awaited, or Another reason (their own words, 120 characters; phone numbers, e-mail IDs and links are refused). There is no silent "no".

- **Who sees it:** the Organizer, the Hosts, and the person (in their own status, in plain words).
- **The public list** shows a reason only as the Organizer allows (Step 1, "What the public list says about a reason"): **None**, **Only reasons that follow from the role (the default)**, or **All**. By default the public sees Tenant, Co-owner, Not a member and the voting-rule reason, **never** unpaid dues, proxy papers or anyone's own words. The public wording is fixed text; it never carries a person's own words except under "All".
- **The audit trail** records the reason code, who chose it and when. The person's own words stay in the record, never in the signed payload. Uploads and undos record per-reason counts.
- **A Host cannot change, override or undo the Organizer's reasons.** Corrections by the Organizer are logged with a required note.
- **Upload:** a Reason column (and a template column) carries the reason; filler such as "na" or "-" counts as no reason. A "no" without a reason is flagged and **blocks the final freeze** until the Organizer fixes it (a draft can still be published).
- The Hindi voter page and public list carry the reasons too.

## Publishing

- **Final checks (Step 5):** plain-words errors (must be fixed) and warnings (need one tick).
- **Draft (Step 6):** public at once, marked "provisional, may change", with a short fingerprint. Publishing again replaces it. Drafts are limited per hour.
- **Final list (Step 7):** the Organizer names the event (General meeting or Election), types `FREEZE`, and the list is frozen **at the cut-off** (the list's closing time, or now if "Close enrolment now" is ticked). Frozen lists are **immutable**: database triggers refuse any update or delete of a final list or its rows. It has a fingerprint (SHA-256) and an Ed25519 signature tied to an entry of the audit log. The **proof** dialog says "The list matches its fingerprint, and the signature is valid", and shows the fingerprint, signature, entry number and public key.
- **After freezing:** enrolment is closed and records cannot change. The Organizer can **reopen with a reason** for a new round; earlier final lists stay visible.

## What the public sees (masking)

Everywhere public (page, CSV, PDF, proof, the `?pub=` view, error messages): flat, role, may-vote, **name masked** to the first two letters of each word (words of up to 3 letters show one letter), **mobile** `******` plus the last 4 digits, **e-mail ID** `********` plus the last 4 characters. A flat that looks like a phone number or an e-mail ID is masked (digits become `#`) and is not searchable by digits. The public CSV and PDF also carry the flat's weight, "may attend" and a short note.

## The signed audit trail

Every state-changing action writes an entry in the same database transaction as the change. Entries are hash-chained (each includes the previous hash) and signed with Ed25519; database triggers refuse any update or delete. The Organizer can press **Check the whole trail** ("All N entries check out") and download it. Entries name the person by e-mail ID for staff and say only "A voter" for voters; **no personal data of voters** is written to the log. A Host's opening of a record, a Host's dry-run check of a sheet, bulk actions and undos are all logged.

## The e-mail rules (a small shared daily allowance, set by `MAIL_DAILY_CAP`)

Codes are sent through the **Cloudflare Email Service** from `Townhall Records <no-reply@townhall-records.com>` (the older Resend route still works if only its key is set). The account's sending allowance is shared with everything else on the account, so `MAIL_DAILY_CAP` is kept small (20 on the preview; 80 if unset). Because the allowance is small, there are **five rules** (written at the top of `mailPools` in `src/auth.ts`):

1. **Closed Organizer sign-up:** a new Organizer must be on the owner's `ORGANIZERS` list (`OPEN_SIGNUP=1` opens it).
2. **Per e-mail ID:** at most 4 codes an hour and 8 a day.
3. **Per list:** a list's newcomers (addresses not yet vouched for by the team) get at most 25 codes a day (`MAIL_LIST_CAP`). People the team uploaded, added, approved or sent back are never held back by this.
4. **Two daily pools:** voters (codes, send-back notes) and staff (sign-in codes, invitations). The staff reserve never takes more than half of the day's allowance. Neither pool can use the other's. Inside the voters' pool, newcomers may use at most two thirds and send-back notes at most a sixth.
5. **Cloudflare Turnstile (free, optional):** on only when both `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET` are set; then nothing is counted or mailed until the safety box is passed.

Whatever the limits say, "send me a code" **always gives the same answer, in the same time**, so nobody can learn who is on a list. The mail is sent after the answer (`waitUntil`), and a mail slot is claimed atomically.

## Records, retention and the DPDP Act

Records are **kept always** (the owner's decision of 13 Nov 2026). The one exception: a record the **voter withdrew** is cleared 30 days later (including its lines on the replaceable draft list; a signed final list is never touched). The Organizer's "erase after N days" exists only if `RETENTION_DAYS` is set (minimum 30). The page tells voters plainly what is kept. **A lawyer should review permanent keeping under the Data Protection law (DPDP Act 2023).**

## Not built, on purpose

Payments (a price slot exists but is off; test orders only; payments would go only through IT SERVICES BY RAJAT AGARWAL via Razorpay, which is not wired); state-by-state legal wording; SMS (paid); a Hindi Organizer page; vote counting (this product ends at the frozen list).

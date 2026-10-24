# Grievance Officer, processors, and breach procedure

Prepared for the owner's signature. Not legal advice: have a lawyer read it once. Owner decision of 2026-10-24: the Grievance Officer, the processor agreements and the breach procedure are all **Rajat Agarwal's**.

## 1. Grievance Officer (DPDP s.13, GDPR art. 77 contact)
- **Name:** Rajat Agarwal (owner of the service, "IT SERVICES BY RAJAT AGARWAL").
- **How a person reaches him:** the privacy form of any event (`POST /api/events/:id/privacy/contact`, no sign-in, Turnstile-protected); the page `GET /api/privacy/officer` returns his name and the contact e-mail set in the deployment (`GRIEVANCE_EMAIL`). **Owner: fill in the e-mail address to publish** (the official one: rajatsiroffice@gmail.com is used for owner mail elsewhere; confirm which address to show).
- **Promise:** acknowledge within 3 days, answer within 30 days. Every request, answer and refusal is a dated entry in the event's log (`privacy_request`, `privacy_resolved`), so the promise is checkable.
- The Organizer of each event is the first point (they answer requests about their own society's data); the Grievance Officer is the escalation and the contact for the platform itself.
- [x] named in the terms and served by the code; [ ] owner confirms the published e-mail address.

## 2. Processors and what each can see
| Processor | Does what | Sees | Agreement to accept (owner) |
|---|---|---|---|
| Cloudflare (Pages, D1, Turnstile) | runs the service, stores encrypted data, bot check | ciphertext, fingerprints, IP addresses of requests, masked values | Cloudflare Data Processing Addendum (online, accept in the dashboard) |
| Resend (or the chosen mail provider) | sends sign-in codes and the report | the recipient's e-mail address and the message | provider's DPA (online) |
| Razorpay through IT Services by Rajat Agarwal | takes payment | payer's name, e-mail, mobile, card/UPI details (Razorpay), order data (IT Services) | Razorpay's DPA/terms; IT Services is the owner's own service, so the owner is controller of ledger B |
| IT Services by Rajat Agarwal (ledger B) | central payment ledger | payer e-mail and mobile (full), amounts, ids | internal: same owner; listed so the notice is complete |
- The platform never sends personal data to any other service. The public page, PDF and log carry only the hidden form.
- [ ] owner accepts each online DPA once and keeps the dated copies in `docs/legal/` (not created here, they are the owner's documents).

## 3. Breach procedure (DPDP s.8(6), GDPR art. 33-34)
**What counts:** any loss, theft, or unauthorised reading of personal data (names, e-mail, mobile, photos, location), or of the keys that protect it; also any sign that the public record was altered (the verifier would show it).
**Who:** Rajat Agarwal is the incident lead. The Organizer of each affected event is told because they are the controller for their society.

| Step | When | What | Evidence in the system |
|---|---|---|---|
| 1 Detect | at once | alerts from the access audit (unusual reads, failed signatures), a user report, a provider notice, a failed verification of a report | access audit rows; chronology; `contacts_read` / `subject_access` entries |
| 2 Contain | within the hour | rotate `MASTER_SECRET`-derived keys only if the master secret is suspected; revoke sessions (they expire in 12 h anyway); disable the route; stop the scheduler | `key_destroyed`, `person_erased` entries |
| 3 Assess | within 24 h | which events, which people, which fields; are values only in hidden form (then low risk) or encrypted contacts/photos (high risk) | access audit by event and by device fingerprint |
| 4 Notify | **without delay; at most 72 hours after becoming aware** | the Data Protection Board of India and affected people (DPDP), the supervisory authority and affected people (GDPR, if high risk), the Organizers of affected events, the payment partners if payment data is involved | a dated entry in each affected event's log (`platform_action`, reason typed) |
| 5 Fix and learn | within 7 days | root cause, change, test added (a test that fails without the fix) | git history; `docs/MASTER-CHECKLIST.md` section R |
| 6 Record | always | a written incident note: time found, time contained, what, who, what was told to whom | kept by the owner for at least 5 years |

**Notice to people must say** (plain words): what happened, which of their data, what the risk is, what we did, what they can do, and whom to write to (the Grievance Officer).
**Honest limit:** the system makes a breach detectable and its size measurable (per-person keys, audit trail), but the notification itself is a human act by the owner.
- [x] procedure written; [ ] owner signs it, saves the authority contact details (Data Protection Board portal; EU/UK authority if any EU/UK society uses the service) and practises it once.

# PRIVACY (DPDP-aligned design; not legal advice)

* **Public, intentionally:** flat numbers, society name/address/registration number, event details, point numbers, agenda text (including election candidates), vote counts and percentages, quorum figures, rule texts and their change history, roles, designation labels, who voted (by flat number), open votes by flat when that option is on, receipt codes.
* **Public only partly hidden with `*`:** e-mail, mobile number, personal names (`ra****@g****.com`, `98******10`, `R**** A*****`). Masking happens on the server before anything is written to a public table or the log; the log writer refuses payloads that still contain a complete e-mail or phone number; a scanner test checks every public output.
* **Private (encrypted at rest):** full contact details of staff and flat holders, attendee names, optional evidence images (encrypted on the device first).
* **Never stored:** passcode digits, full ID numbers (only document type and last 4 characters), card data, ballot choices next to any identity. IP addresses and device identifiers ARE stored, privately and encrypted, as the owner directed (see the addendum below).
* **Erasure:** private data can be made unreadable by destroying the event data key (`POST /api/events/:id/crypto-shred`); the public record and its hash commitments remain, so the proof survives and the personal data does not. The destruction is logged.
* **Retention:** the public record is permanent by design (owner decision). The retention period for private data is an open owner/lawyer decision (OPEN-QUESTIONS #4, #18).
* **Consent and notice texts, grievance contact:** UI session.

## Addendum 2026-10-23
IP addresses, device identifiers and browser type are now recorded for every action, as the owner directed and as the terms (ticked by every person) state. They are private and encrypted, shortened for office-bearers, shown in full only to the platform owner with a written reason (which is itself published), and become unreadable if the event's private data is erased. The public page shows only a coded fingerprint per entry. This supersedes the earlier rule "raw IP is never stored" for audit purposes; the terms and the DPDP notice must be reviewed by a lawyer before launch.


## UPDATE 2026-10-24: one universal rule (supersedes the examples above)
Everything public (page, PDF, log, public answers) shows EVERY person, staff included, only in the hidden form: `Raj****** Aga******`, `********rwal@gmail.com`, `******3210`. Full values are visible only on the working screen of the person doing the verification, only while they do it. See docs/COMPLIANCE-MAP.md for the DPDP/GDPR mapping and docs/MASTER-CHECKLIST.md section 14.

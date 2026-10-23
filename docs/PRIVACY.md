# PRIVACY (DPDP-aligned design; not legal advice)

* **Public, intentionally:** flat numbers, society name/address/registration number, event details, point numbers, agenda text (including election candidates), vote counts and percentages, quorum figures, rule texts and their change history, roles, designation labels, who voted (by flat number), open votes by flat when that option is on, receipt codes.
* **Public only partly hidden with `*`:** e-mail, mobile number, personal names (`ra****@g****.com`, `98******10`, `R**** A*****`). Masking happens on the server before anything is written to a public table or the log; the log writer refuses payloads that still contain a complete e-mail or phone number; a scanner test checks every public output.
* **Private (encrypted at rest):** full contact details of staff and flat holders, attendee names, optional evidence images (encrypted on the device first).
* **Never stored:** passcode digits, full ID numbers (only document type and last 4 characters), raw IP addresses (salted hashes for rate limits only), card data.
* **Erasure:** private data can be made unreadable by destroying the event data key (`POST /api/events/:id/crypto-shred`); the public record and its hash commitments remain, so the proof survives and the personal data does not. The destruction is logged.
* **Retention:** the public record is permanent by design (owner decision). The retention period for private data is an open owner/lawyer decision (OPEN-QUESTIONS #4, #18).
* **Consent and notice texts, grievance contact:** UI session.

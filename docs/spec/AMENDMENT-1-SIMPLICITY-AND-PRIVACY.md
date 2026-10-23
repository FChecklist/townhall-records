# Amendment 1 to PRODUCT-SPEC (owner instructions of 2026-10-23, PM decisions)

This amendment OVERRIDES any conflicting text in `PRODUCT-SPEC.md` (sections 3, 4, 5, 6, 10). Where the spec says "mandatory" for anything other than the Organizer and verified e-mail, read "optional, with a checkbox".

## A1. Three roles only, everything else is optional
| Role | Rights |
|---|---|
| **Organizer** | The person who creates the event. Full rights. Must verify e-mail first. |
| **Host** | **Same rights as the Organizer.** The Organizer decides how many Hosts (0, 1, 2 ... N). |
| **Attendance Officer** | Designated by the Organizer/Hosts for attendance, identity and voter confirmation. The Organizer decides how many (0, 1, 2 ... N). |
- **One person can hold several roles**, for example Host and Attendance Officer together, or Organizer and Attendance Officer.
- Co-host, Chairman, General Secretary, President, Vice President, Treasurer are no longer permission roles. They are optional free **designation labels** that can be attached to any person and are shown on the report. They grant no extra rights.
- If no Attendance Officer is designated, the Organizer/Host may mark attendance themselves; the report then states in plain words: "Attendance was not independently verified". Transparency replaces compulsion.
- Voters are not "roles": they are flats on the roll.

## A2. Everything optional, with checkboxes, super simple
- The organiser/host experience is a short guided wizard (about 8 screens, one decision per screen, big buttons, plain words, Hindi + English). A single button **"Use recommended settings"** fills everything from the chosen rule pack and finishes setup.
- Every feature is a checkbox with a sensible default: proxy voting, weightage, quorum check, secret ballot, attendance photo, ID check, absentee voting, extensions, minutes, designation labels, notices, and so on. Nothing is forced except what the law pack marks "required" (those boxes are ticked and locked with a one-line reason).
- The set of options chosen is recorded in the log and printed on the report as a ticked/unticked list, so readers see exactly which features were used.
- Advanced settings are collapsed by default.

## A3. E-mail verification (mandatory) for Organizer, Host and Attendance Officer
- Every person in these three roles must verify their e-mail with a 6-digit passcode sent by e-mail (no SMS, no WhatsApp). Until verified they cannot act.
- **Whoever creates an event becomes its Organizer and must verify their e-mail before anything else, including payment.**
- The mail sender is behind an interface (Resend first). The free tier is limited (about 100 mails a day, 3,000 a month), so the builder must add: a per-day send counter shown in the super console, a clear "mail quota reached" state, and an adapter slot for a second free provider. Voters do not need an e-mail address.

## A4. Provenance: who made whom
- Every person record stores **who added them and in what role** (Organizer created the event; Organizer appointed Host H; Host H appointed Attendance Officer A; and so on). The report shows a **"Who appointed whom"** tree and every appointment/removal is a log entry.
- Same for events: **"Created from: event X"** when an event is cloned.

## A5. New event from an old event (clone)
- **Anyone** can start a new meeting/election from any existing event's public report ("Use this as a template"). Whoever does it becomes the **new Organizer**, verifies their e-mail first, then edits freely.
- What is cloned: society name, address, registration number, rule pack and chosen options, flat list with weightage, agenda structure, role labels. What is **never** cloned: e-mail addresses, phone numbers, passcodes, images, votes, attendance. (A creator who is the verified Organizer of the source event may also clone its private contact roll, with a clear on-screen notice.)
- The clone link is recorded in both events' logs.

## A6. Privacy by masking (applies to every public page, download and log)
- **Never published in full:** e-mail addresses, mobile numbers, personal names. They appear **partially hidden with `*`** only, for example:
  - e-mail `rajat@gmail.com` -> `ra****@g****.com`
  - mobile `9876543210` -> `98******10`
  - name `Rajat Agarwal` -> `R**** A*****`
- **Never masked (intentionally public):** house/flat number, society name, society address, registration number, event title/type/date/venue, point numbers, agenda text, vote counts, vote %, quorum figures, rule texts and rule-change history, roles and designation labels.
- Masking happens **on the server at write time**: public tables and the published report contain only the masked values; full values live in a separate private store (encrypted at rest, accessible only to the verified Organizer/Hosts of that event and logged). A downloaded report therefore can never reveal what the page does not show. A test scans the full public HTML/JSON for any complete e-mail or 10-digit number and must find none.
- The report has a section **"What is not published and why"** listing passcodes, images, ID details, full contact details and raw IP addresses.
- All personal data is hidden partially with `*` "to ensure privacy"; the report states this on its first screen.

## A7. Attendance evidence is optional too
Per the law study (DPDP and Aadhaar limits): default is a **visual check by the Attendance Officer** with the method recorded (document type, last 4 characters only, officer, time, result). **Photo of the person** and **photo of the ID document** are checkboxes, **off by default**; when on they are compressed and encrypted on the device before upload, never public. Full Aadhaar numbers are never stored. A "no-ID alternative" path (roll check by the Host) exists.

## A8. Secret ballot and open vote (resolves law-study open question 1)
- **Elections:** secret ballot ON by default (locked ON where the rule pack requires it). The Host/Organizer see **who has voted** (flat number), never the choice; choices appear only as totals.
- **Meeting resolutions:** a checkbox "Record votes openly by flat" (default per rule pack). When ON, the report lists each flat's vote; when OFF it is a secret poll with totals only.
- Per-flat "who voted" and per-flat open votes are shown by flat number only (owner's choice: flat numbers are public).

## A9. Builder notes
- The existing quick prototype in `C:\ct\aoa-rwa\prototype\index.html` is a reference for screens only; it has no server and no cryptography and must not be the base of the product.
- All `PRODUCT-SPEC.md` section 8 anti-cheating requirements remain in force.
- Public wording: "tamper-evident", "verifiable", "transparent". Never "100% cheat-proof".

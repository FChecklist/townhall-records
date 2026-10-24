# DPDP Act 2023 and GDPR: what the product does, article by article

**Not legal advice.** This maps features to duties so a lawyer can review it quickly. "Built" means code and a test exist. "Owner" means a person must decide or sign something.
The society (Organizer) is the data fiduciary / controller of its members' data; the platform is a processor acting on the society's instructions. This split must be confirmed in the terms and a processing agreement (Owner).

| Duty | DPDP section | GDPR article | What the product does | Status |
|---|---|---|---|---|
| Lawful purpose, consent or legitimate use | s.4, s.6, s.7 | 5(1)(a), 6, 7 | Terms ticked once by every Organizer, Host, Monitor and voter, recorded as a signed log entry; photo needs a separate consent tick; purpose is only to run the meeting/election | Built |
| Notice in plain words | s.5 | 12-14 | Terms text lists what is recorded, what is public (hidden form only), what is private, who sees it, retention, rights | Built; Owner: translate and have a lawyer review |
| Data minimisation | s.6 | 5(1)(c) | No ID numbers kept (only "verified by ID type"), no addresses of people, photo/location optional, contact is name + e-mail + mobile only | Built |
| Purpose limitation | s.6 | 5(1)(b) | Contacts are used to sign in, to e-mail the report and to run the meeting; the platform owner can read audit values only with a typed reason that is logged publicly | Built |
| Accuracy and correction | s.12 | 5(1)(d), 16 | Correction request route; the Organizer corrects through the flat list or a new holder | Partly: correcting an existing holder's name in place is not built |
| Storage limitation | s.8(7) | 5(1)(e), 17 | Private details are erased automatically after the retention period (default 365 days after the report, never shorter than the pack's record-keeping period); erasure on request any time | Built (retention job tested end to end) |
| Security safeguards | s.8(5) | 5(1)(f), 32 | AES-256-GCM per person/flat keys wrapped under an event key wrapped under a master secret; HMAC fingerprints; Ed25519-signed hash-chained log; rate limits; security headers; no passwords | Built; Owner: independent security review |
| Access to one's data | s.11 | 15 | `GET /api/me/data` (signed-in), Organizer export with a reason (logged), voter `GET /api/vote/me` | Built |
| Correction / erasure | s.12 | 16, 17 | Privacy requests (signed-in or public form), resolution by the Organizer, erasure of one person or one flat by destroying their key, also after publication; the public record keeps verifying because it only holds the hidden form | Built |
| Withdraw consent | s.6(4) | 7(3) | Request type "withdraw" | Built (request logged; effect through erasure) |
| Grievance redressal | s.13 | 77 | Request type "grievance" via public form on every event; handled and logged | Built; Owner: name a grievance officer and publish contact |
| Breach notification | s.8(6) | 33, 34 | Not code. The access audit and the chain make a breach detectable | Owner: written procedure and contact |
| Processors | s.8(2) | 28 | The mail and payment providers see e-mail addresses / payer details | Owner: agreements |
| Children's data | s.9 | 8 | No children's data is collected by design | Owner: confirm |
| Cross-border / location | s.16 | 44-49 | Cloudflare edge; data location is the deployer's choice | Owner: state it in the notice |
| Records of processing | - | 30 | Chronology and access audit are the record | Built |
| Privacy by design and default | - | 25 | Universal hidden form everywhere public; working view only while acting, logged; secret ballot has no flat and no time | Built |

## What is public, what is hidden, who sees what
| Data | Public page / PDF / log | Organizer / Host | Attendance Monitor | The person |
|---|---|---|---|---|
| Name | `Raj****** Aga******` | full (contacts) | full only while checking that flat in | own |
| E-mail | `********rwal@gmail.com` | full | not shown | own |
| Mobile | `******3210` | full | full only while checking that flat in | own |
| ID number | never kept | never kept | never kept | n/a |
| Flat number, weight | shown | shown | shown | shown |
| ID verified by / attendance marked by | role, hidden name, date and time | same | same | same |
| Photo, location | not public (only a fingerprint and flags) | view (logged) | takes it | n/a |
| Vote (secret ballot) | never recorded with the person | never | never | receipt code only |
| IP, device, browser | fingerprint only | not shown | not shown | n/a |
| Platform owner | needs a typed reason, logged on the public chronology | | | |

## Open for the owner and a lawyer
1. Fiduciary/processor wording and processing agreements. 2. Grievance officer. 3. Breach procedure. 4. Data location statement. 5. Review of the retention default for each pack's record-keeping duty. 6. Whether the universal hiding is enough for a given country's disclosure duties (some laws require members' names on a register).

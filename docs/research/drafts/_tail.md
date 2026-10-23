
---

## 4. The owner's online-voting design against the law

Requirements as stated: online voting by members; 100% secret ballot; voter may change a vote before submitting; voter sees only their own voting data; organizer/host sees attendance ID, voter name, flat/house number and "voted YES/NO"; host sets the window, may extend in 30-minute steps, may stop manually or by timer; everything logged and published; two voter kinds (official voter, proxy voter), selectable by the organizer before the election starts; a PDF receipt for the voter (date, time, link ID, IP address, mobile number, attendance number).

| Requirement | Legal reading from this study | Status |
|---|---|---|
| Online secret-ballot voting | Explicitly lawful in CA (5105, 5110, 5115), FL (720.317), TX (209.00592) with conditions. Not found in UP or Maharashtra primary text; Maharashtra's 2026 Rule 106C-13(3)(b) covers video-conference meeting attendance, not ballots. Maharashtra Election Rules r.33: secret ballot or EVM. | Allowed US; unclear India (lawyer) |
| "100% secret" AND host sees voter name, flat and "voted YES/NO" | **These two cannot both be true for the same vote.** If the host sees who voted yes or no, it is an open ballot, not a secret ballot. CA 5110/5120 and Maharashtra Rule 33 require ballot secrecy; FL 720.317 requires separation of identity from secret ballots. | **Needs an owner decision.** Recommendation: the host sees *who voted* (turnout) but not *how*; yes/no only in aggregate. Offer a separate, clearly labelled "open vote" mode for ordinary resolutions where the society's bye-laws permit a show of hands. |
| Voter can change vote before submitting | Normal (ballot not final until cast). FL/CA require a receipt; CA says an electronic vote is irrevocable once transmitted. | Compatible if "submit" is final |
| Voter sees only own data; receipt PDF | Receipt is required in FL/TX; a receipt must not let the voter prove *how* they voted to a third party (vote-selling/coercion). | Compatible if the receipt omits the choice |
| Receipt contains IP address and mobile number | Personal data. Permissible if notified, but IP and mobile on a downloadable PDF raises leak risk. | Data-minimisation decision |
| Host-set window, 30-minute extensions, manual stop or timer | Not regulated by anything found; US statutes require the voting deadline in the notice (CA 5115 30-day ballot notice; TX 209.0056 20 days). An extension after notice may breach the noticed deadline. | Lawyer: extensions need notice or society authority |
| Everything logged and published | Tamper-evident log is fine; publishing identity-linked votes conflicts with secrecy and DPDP (see `DPDP-AND-RECORDS.md`). | Publish aggregate and pseudonymous proofs only |
| **Proxy voter** | Maharashtra: **no proxy** in bye-law 105 and Election Rules r.33, so a proxy option must be disabled in the Maharashtra pack. UP: ambiguous. CA: only if bylaws allow and cannot replace a ballot. FL: allowed, dated, expiring 90 days after the meeting. TX: must be offered. | Make "proxy allowed" a per-pack parameter; default off in `in-mh-coop-society` |
| Independent oversight | CA mandates an independent inspector of elections; MH uses a Returning Officer. The product's "host/organizer" is not independent by default. | Model an election-officer role distinct from the host |

---

## 5. Gaps shared by all regimes

- Primary text could not be reached for: UCIOA 2021, RONR, the official US legislature sites, India Code's UP Apartment Act 2010 beyond s.14, UP Apartment Rules 2011, the consolidated Maharashtra Co-operative Societies Act and the 2026 Rules gazette.
- Retention periods in India are mostly not found; the engine should take them from the society's own bye-laws.
- Nothing found says online voting is *prohibited* in India; nothing found says it is *permitted* for UP/MH elections. Treat as lawyer-required.

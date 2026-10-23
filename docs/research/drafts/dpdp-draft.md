# AOA-RWA: DPDP Act 2023 / DPDP Rules 2025 and Identity-Document Handling (research draft)

Date retrieved: 2026-10-23. **This is research, not legal advice.** Have an Indian privacy lawyer review before launch.

Evidence labels: **[PRIMARY]** = text read from an official source in this session. **[SECONDARY]** = only seen in law-firm or press summaries. Section and rule numbers below come from primary text unless labelled otherwise.

---

## 0. Headline status (verified from primary text)

- DPDP Act 2023 (Act 22 of 2023): the India Code consolidated text "as on 19 November 2025" records the commencement notification G.S.R. 843(E) dated 13 Nov 2025 **[PRIMARY]**.
  - 13 Nov 2025: ss. 2, 18-26, 35-43, s. 44(1) and (3).
  - 13 Nov 2026 (one year): s. 6(9) (Consent Manager registration) and s. 27(1)(d).
  - 13 May 2027 (18 months): ss. 3-5, 6(1)-(8) and (10), ss. 7-17, s. 27 (rest), ss. 28-34, 36, 37, s. 44(2).
  - So **the operative duties (notice, consent, security, breach, erasure, rights, penalties) are not yet in force as of today (2026-10-23)**. They start 13 May 2027, which is the compliance deadline to design for.
- DPDP Rules 2025: gazette G.S.R. 846(E), 13 Nov 2025 **[PRIMARY]**.
  - Rules 1, 2 and 17-21 took effect on publication.
  - Rule 4 (Consent Managers) takes effect one year after publication.
  - Rules 3, 5-16, 22 and 23 take effect 18 months after publication (Rule 1(2)-(4)).
- Date nuance: an earlier search snippet implied 14 Nov. The gazette itself says 13 Nov 2025.

---

## 1. Fiduciary or processor?

Definitions **[PRIMARY]**:
- s. 2(i): a Data Fiduciary is any person who "alone or in conjunction with other persons determines the purpose and means of processing".
- s. 2(k): a Data Processor processes personal data "on behalf of a Data Fiduciary".
- s. 2(s): "person" includes an association of persons or body of individuals, incorporated or not. A housing society or RWA therefore qualifies.

Analysis (my reading, not authority):
- The society decides why meetings and elections are run and who is on the roll. It is the natural **Data Fiduciary**.
- The product runs the platform to the society's instructions, so it is a **Processor** for the society's rolls, attendance, votes and photos.
- It may be a **fiduciary in its own right** for things it decides itself:
  - account and billing data of society office-bearers;
  - security logs;
  - product analytics;
  - any default setting it chooses, such as "public report on".
  The more the product fixes purposes and means (public report format, "never delete" promise, ID capture workflow), the more it looks like a joint fiduciary ("in conjunction with other persons" in s. 2(i)).
- s. 8(1) **[PRIMARY]**: the fiduciary stays responsible for processor processing "irrespective of any agreement to the contrary".
- s. 8(2) **[PRIMARY]**: a processor may be engaged only under a valid contract.
- s. 8(7)(b) **[PRIMARY]**: the fiduciary must cause its processor to erase data.
- Rule 6(1)(f) **[PRIMARY]**: the fiduciary-processor contract must contain appropriate security-safeguard provisions.
- Note: the society (an unincorporated body or cooperative) may be a tiny fiduciary with no DPO, but the Act has no small-entity carve-out. s. 17(3) only lets the Government notify exemptions for some fiduciaries (e.g. startups) from s. 5, 8(3), 8(7), 10 and 11, and no such notification was found. **Could not verify whether any s. 17(3) notification exists.**
- **Product positioning recommendation:** contract as Processor, with the society as Fiduciary. Reserve a short list of "own purposes" (billing, security, abuse prevention) and treat those as fiduciary processing with its own notice. Expect regulators to look at who actually fixed the defaults.

---

## 2. Is a flat number personal data? (public report)

- s. 2(t) **[PRIMARY]**: personal data is "any data about an individual who is identifiable by or in relation to such data".
- A flat number plus a vote, attendance or name list identifies a household, and in a small society usually a specific person (the owner or tenant of flat B-402 is known to neighbours). Treat it as personal data. A tally by flat reveals **how each flat voted**, which is the most sensitive item in the product.
- No Indian primary source was found that classes flat numbers specifically. This is inference from the s. 2(t) test.
- The DPDP Act has no "sensitive personal data" category (unlike the older IT Rules 2011 SPDI). I did not re-verify the SPDI rules in this session. A secret ballot is nonetheless a strong confidentiality expectation under cooperative-society law, which I did not verify (see Could not verify).

### 2.1 Which s.-grounds could justify a public report?

| Ground | Fit | Verdict |
|---|---|---|
| s. 3(c)(ii) publicly-available-data exclusion **[PRIMARY text]** | Applies only to data made public by (A) the Data Principal herself, or (B) a person under a legal obligation to make it public. A product-published report is neither unless a specific law obliges the society to publish. | Do **not** rely on it. Do not create the circular situation of publishing first and then claiming the data is public. |
| s. 7(a) voluntary provision for a specified purpose **[PRIMARY]** | Covers use "for the specified purpose for which the Data Principal has voluntarily provided" data. A member who registers for a meeting provides data for attendance and voting, not for publication. | Does not cover a public report unless the specified purpose, stated at collection, includes publication. |
| s. 7(d) disclosure obligation to the State | Only for obligations to disclose to the State. | No, unless a specific registrar filing is required. |
| s. 7(e) court or decree; s. 17(1)(a) legal claim | Only for litigation or enforcement. | Possible for a sealed evidence copy, not for a public page. |
| s. 6 consent plus s. 5 notice **[PRIMARY]** | Free, specific, informed, unconditional, affirmative, limited to necessary data. | The workable ground, but only for publishing identity-linked data. Consent that bundles publication into the condition of voting is hard to call "free" and "unconditional". |
| Pseudonymise or aggregate | Reduces what is "personal data about an identifiable individual". It is not an automatic escape: if the key or a small roll lets people re-identify, it is still personal data. | **Recommended default.** |

- Votes are not a statutory disclosure to the State, so s. 7(d) does not help. Many state cooperative laws or bye-laws may require declaring election results or posting them on a notice board. **Not verified** (see section 9). If such a duty exists, publishing the result (not per-flat votes) could rest on s. 3(c)(ii)(B) and s. 7(d). It would not cover per-flat vote tallies.

---

## 3. Photos of attendees and ID-document images

- Photos and ID images are personal data (s. 2(t)). Face images are ordinarily treated as biometric. The Act does not define biometric data separately. Aadhaar-related biometric rules are separate (section 8).
- Grounds:
  - Consent (s. 6) with a specific notice (s. 5, Rule 3): itemised description of the personal data, the specified purpose, and how to withdraw, exercise rights and complain to the Board.
  - s. 7(a) may cover an attendee who voluntarily presents their face or ID to the monitor for the stated purpose of verifying attendance. The attendee must be told the purpose, and the data may be used only for that purpose.
- **Data minimisation (s. 6(1)):** consent is "limited to such personal data as is necessary for such specified purpose". Storing an ID **image** when a **visual check** meets the purpose is hard to justify as "necessary". The Act does not say "store as little as possible", but s. 6(1) and the s. 8(7) erasure duty push the same way.
- Children: s. 2(f) child = under 18. s. 9(1) **[PRIMARY]** requires verifiable parental consent before processing a child's personal data. s. 9(3) bars tracking or behavioural monitoring of children. Rule 10 **[PRIMARY]** sets how parental consent is verified, by reference to identity and age details of the parent, possibly via Digital Locker tokens. Fourth Schedule Part A/B exemptions cover clinics, education, crèches and similar. I read Part A and found **no exemption for housing societies**. Part B was not fully read. **Recommended design:** do not photograph minors, and do not accept minors as voters or attendees. Capture only an adult proxy where relevant.
- Persons with disability under lawful guardian: s. 9(1) and Rule 11 apply the same verifiable-consent regime through the guardian.
- Penalty exposure on children's data: up to INR 200 crore (Schedule item 3, **[PRIMARY]**).

---

## 4. "Never delete anything" versus the erasure provisions

- s. 6(4): withdrawal of consent at any time, as easy as giving it **[PRIMARY]**.
- s. 6(6): on withdrawal the fiduciary shall "cease and cause its Data Processors to cease processing" unless processing without consent is required or authorised by law **[PRIMARY]**.
- s. 8(7): the fiduciary shall erase personal data on withdrawal of consent or when it is reasonable to assume the purpose is no longer served, whichever is earlier, "unless retention is necessary for compliance with any law", and cause its processors to erase **[PRIMARY]**.
- s. 12(1) and (3): the Data Principal has a right to correction and erasure of data given on consent (or under s. 7(a)). On request the fiduciary "shall erase" unless retention is "necessary for the specified purpose or for compliance with any law" **[PRIMARY]**.
- s. 12(2): the fiduciary must correct, complete and update on request.
- s. 8(3): accuracy and completeness duty where data is used for decisions affecting the person or disclosed to another fiduciary.
- Exemptions that might preserve some records:
  - s. 8(7) carve-out "retention necessary for compliance with any law".
  - s. 12(3) same carve-out, plus "necessary for the specified purpose".
  - s. 17(1)(a): "processing... necessary for enforcing any legal right or claim" disapplies Chapter II (except s. 8(1) and (5)), Chapter III and s. 16. This could cover a **sealed legal-claims hold** (e.g. an election is in dispute), but it cannot be a blanket reason for keeping everything for ever.
  - s. 7(e): compliance with judgment, decree or order.
  - s. 17(2)(b) and Rule 16: research, archiving or statistical purposes, if the data is not used to take decisions specific to a Data Principal and the Second Schedule standards are met. A pure archive of de-identified, aggregated results could fit.
- **Conclusion:** an unconditional "never delete anything" promise, applied to identifiable personal data, **is incompatible with the DPDP Act** once it commences (13 May 2027) as to any data without a legal retention duty. Replace it with a **retention schedule promise**: "Results and tamper-evident proofs are kept permanently; personal data is kept only as long as needed and then erased or de-identified." Say exactly what stays and what goes.
- Rule 8(3) **[PRIMARY]**:
  - A fiduciary must retain personal data, associated traffic data and logs of the processing for a minimum of **one year** from the date of processing, for the purposes listed in the Seventh Schedule.
  - Those Seventh Schedule purposes are State uses (security, performance of a legal function, disclosure obligations, SDF assessment).
  - After one year the data and logs must be erased unless another law requires longer.
  - Rule 6(1)(e) separately requires retaining logs and personal data for one year "for enabling the detection of unauthorised access... unless compliance with any law... requires otherwise".
  - Secondary summaries disagreed on whether the one-year rule sits in Rule 6 or Rule 8. The gazette shows **both**.
  - This reads as a **floor of one year** and does not support indefinite retention. It sits in tension with erasure-on-request in the first year, and the interplay is **untested**. Design so security logs (not content) are kept one year and personal content is erased on its own schedule.
- Rule 8(1) / Third Schedule (inactivity-based deemed-purpose-served periods, 3 years) covers only e-commerce (2 crore users), online gaming intermediaries (50 lakh users) and social media intermediaries (2 crore users) **[PRIMARY]**. The product is not in those classes, so the Schedule's 3-year figure is not a safe harbour for it. s. 8(7) still applies on its own terms.

---

## 5. Security, breach, grievance, cross-border, penalties

- **Security safeguards:** s. 8(5) and Rule 6 **[PRIMARY]**. Minimum: encryption, obfuscation, masking or virtual tokens (6(1)(a)); access control (b); logs, monitoring and review (c); backups and continuity (d); one-year log retention (e); processor contract clauses (f); organisational measures (g). Penalty up to INR 250 crore (Schedule item 1).
- **Breach:** s. 8(6) and Rule 7 **[PRIMARY]**.
  - Notify each affected person "without delay", with nature, extent, timing, consequences, mitigation, safety steps and contact.
  - Notify the Board "without delay", then a detailed report **within 72 hours** (or a longer period the Board allows).
  - s. 2(u) breach includes accidental disclosure and loss of availability, not only external theft. A public report that accidentally exposed per-flat votes would itself be a "personal data breach".
  - Penalty up to INR 200 crore (item 2).
  - A processor should have a contractual duty to alert the society fast enough that the fiduciary can meet "without delay".
- **Grievance:** s. 8(10), s. 13 and Rule 14(3) **[PRIMARY]**. The fiduciary must publish its grievance system and respond within a period "not exceeding ninety days". Rule 9 requires publishing contact details of the DPO or a responsible person, prominently on the website or app. s. 13(3): the person must exhaust the fiduciary's grievance system before going to the Board.
- **Rights publication:** Rule 14(1)-(2) requires publishing how to exercise rights and what identifier is needed.
- **Rule 14(4) nomination:** s. 14 right to nominate someone to exercise rights on death or incapacity.
- **Cross-border:** s. 16 and Rule 15 **[PRIMARY]**. Transfers are allowed unless the Government restricts a country by notification (s. 16(1)), and Rule 15 adds conditions the Government may specify by order. No restricted country list was found (**not verified**). Rule 13(4) data-localisation applies only to Significant Data Fiduciaries. Practical advice: host in India (Mumbai or Hyderabad region) to avoid a later surprise, and check the vendor's sub-processors.
- **Penalties** (Schedule to s. 33, **[PRIMARY]**): security failure up to INR 250 crore; breach-notice failure up to INR 200 crore; children up to INR 200 crore; SDF duties up to INR 150 crore; Data Principal duties up to INR 10,000; any other provision up to INR 50 crore. These are maxima set by the Board after inquiry, not fixed amounts.
- **Consent Manager:** Rule 4 and First Schedule **[PRIMARY]**, effective 13 Nov 2026 for registration. Requirements: Indian company, net worth at least INR 2 crore, records kept at least 7 years (Part B item 4(c)). The product does not need a Consent Manager. It only needs to be able to accept consent given through one, from 2027 onward.
- **Significant Data Fiduciary:** s. 10 and Rule 13 apply only if the Government notifies the entity. Unlikely at this scale.
- **Data Principal duties:** s. 15 includes not impersonating another person and not furnishing false information. Useful for the ID check clause in the terms.
- **Pending constitutional challenges:** one secondary source mentions challenges before the Supreme Court of India. **[SECONDARY]**, not verified. Check status before launch.

---

## 6. Indian record-keeping duties of societies (what I could and could not confirm)

- Not verified at primary level (see section 9). From secondary search results only:
  - A Bombay High Court case summary says members have a statutory right under s. 147 of the Maharashtra Co-operative Societies Act to inspect and copy society records. Disqualification of committee members for not supplying minutes was upheld **[SECONDARY]**.
  - Rule structure exists for minutes of general meetings and committee elections under the Maharashtra Co-operative Societies Rules 1961 **[SECONDARY]**. I did not find preservation periods.
- Housing societies sit under **state** cooperative acts (Maharashtra, Karnataka, Delhi, Gujarat and others), under company law if incorporated, or are unincorporated RWAs under the Societies Registration Act or state equivalents. The retention duties, whether a secret ballot is required, and any publication duty vary by state and by the society's bye-laws.
- **Design consequence:** make retention periods **configurable per society** (default to the longest the society's bye-laws or state law demand) and keep the election **result and attendance count** (not identity documents) as the permanent record. This is what s. 8(7) and s. 12(3) call "retention necessary for compliance with any law".

---

## 7. Aadhaar and other ID documents (question B)

### 7.1 Aadhaar: what the primary text says

- **Aadhaar Act 2016**, text read from uidai.gov.in (the 2016 original, not the 2019 amended consolidation) **[PRIMARY, with amendment caveat]**:
  - s. 29(3): identity information with a requesting entity may not be used beyond the purpose told to the individual, and may not be disclosed further without prior consent.
  - s. 29(4): "No Aadhaar number or core biometric information... shall be published, displayed or posted publicly, except for the purposes as may be specified by regulations."
  - s. 37: intentionally disclosing, transmitting, copying or disseminating identity information collected in enrolment or authentication to an unauthorised person is punishable by imprisonment up to three years, or fine up to INR 10,000 (INR 1 lakh for a company), or both.
  - s. 57: the original text allowed use of the Aadhaar number for identity by body corporate or person "pursuant to any law... or any contract".
  - The 2019 amendment (Aadhaar and Other Laws (Amendment) Act) altered some provisions (it added s. 4(4) and s. 8A, among others). I did not read the amended consolidation, so cite sections only after checking the current India Code version.
- **Puttaswamy (Aadhaar) judgment, 26 Sept 2018**: held the Aadhaar Act valid with conditions and struck down the contract-based private-entity use in s. 57 **[SECONDARY]**. Commentators differ on how broad the strike-down is. The operative text was not read. Practical effect: **a private entity (a society or product) has no legal basis to demand Aadhaar as ID**.
- **UIDAI Circular No. 14 of 2025 (4 Nov 2025)** **[PRIMARY]**:
  - It applies to **Requesting Entities** in the authentication ecosystem.
  - Para 2: store Aadhaar numbers only in an Aadhaar Data Vault.
  - Para 3: encrypted storage of UID tokens, demographic data and photo is allowed provided the Aadhaar number is not stored.
  - Para 4: storing the Aadhaar number from authentication inputs is "strictly prohibited" outside the vault.
  - It does **not** directly govern a society checking a card by eye. It shows the regulator's direction: do not hold Aadhaar numbers in ordinary databases.
- **Offline verification (OVSE)** **[PRIMARY: UIDAI FAQ page text; legal basis from secondary]**:
  - UIDAI has an Offline Verification Seeking Entity regime with an online registration portal.
  - A registered OVSE may collect and store verifiable credentials only with explicit consent. Credentials may include last 4 digits, demographic data and photo.
  - Onward sharing needs written disclosure of recipients and granular consent. On revocation the entity must delete verifiably.
  - The FAQ page did not state a general rule that every verifier must register, and did not address photocopies, full Aadhaar numbers or masked Aadhaar. A 2025 amendment to the 2021 Authentication and Offline Verification Regulations is described in secondary sources as revising this regime. Press reports describe a proposed registration requirement for hotels, event organisers and similar. Whether that is in force was **not verified**.
  - The 2021 Regulations PDF on uidai.gov.in was a scanned image with no extractable text, so regulation-level text was **not read**.
- **Masked Aadhaar** (first 8 digits hidden): the UIDAI FAQ I read did not address it. I found no primary text on masked Aadhaar in this session. Common knowledge says UIDAI recommends masked Aadhaar to avoid disclosure of the full number. **Not verified here.**
- **Virtual ID (VID):** the UIDAI circular text I read refers to UID tokens and reference keys. I did not read a primary VID document. **Not verified.**

### 7.2 Other documents (no separate legal gate found)

- Driving licence, voter ID (EPIC), passport, PAN: no primary source was read in this session on private-entity storage limits for these. They are all personal data under s. 2(t) and are covered by the DPDP minimisation and erasure duties like any other ID. Per-document statutory restrictions (e.g. Passport Act or Representation of the People Act use limits) were **not verified**.
- EPIC carries the constituency and part number, which can reveal the voter's address. PAN is the tax identifier. Both add to breach harm if stored.
- Do not accept a document the person has no legal duty to show. The monitor's check should be framed as voluntary, with alternatives (any one of several documents, or the society's own membership register).

### 7.3 Recommended minimum approach

1. **Visual check only.** The monitor looks at the original document and does not photograph, scan or upload it.
2. Record only: document type (menu), **last 4 characters** of the document number (a truncated string, never a masked-full pattern that can be reconstructed with other fields), the checker's user id, timestamp, and result (matched or not matched to the roll).
3. For Aadhaar specifically: never ask for or record the full number. If the attendee offers a masked Aadhaar printout or the Aadhaar app, accept it for a visual check. Do not store a photo of the card.
4. Provide an **alternative path** with no ID (a society officer vouches, or an OTP to the number on the member roll) so no document is compulsory.
5. If a society insists on keeping copies for a legal reason, treat that as a society-owned record outside the product, with the society's own legal basis.

---

## 8. Recommended safe design

### 8.1 Roles and contracts
- Society = Data Fiduciary. Product = Processor for roll, attendance, votes and media. Product = fiduciary only for its own account, billing, security and analytics data.
- A **Data Processing Agreement** (s. 8(2)) with clauses:
  - processing only on documented instructions;
  - purpose and category list;
  - Rule 6 safeguards (encryption, access control, logging, backups) and one-year security-log retention;
  - breach alert to the society promptly (suggest within 24 hours of awareness) so the society can notify "without delay" and meet Rule 7's 72-hour report;
  - assistance with access, correction and erasure requests;
  - erasure or return at end of service (s. 8(7)(b));
  - sub-processor list and India hosting commitment;
  - audit and information rights;
  - clear statement of who is responsible for the legal retention schedule.
- A short "controller notice" template the society can adopt.

### 8.2 Public report
- Default to **pseudonymous and aggregate**:
  - show result totals, turnout, quorum, resolutions carried or not;
  - for attendance, show counts, and identify flats only through a **per-event keyed hash or random token** that the society can resolve privately, not the raw flat number;
  - do not publish how each flat voted. For secret-ballot elections never publish ballot-to-flat links.
- Per-flat listing is an **opt-in society setting** that requires: an explicit notice, a consent step for each named person (or a documented legal duty in the bye-laws or state law), and a warning in the admin UI.
- Small-cell protection: suppress or merge tallies where a group is very small (e.g. 1-2 voters) to stop re-identification by elimination.
- The report is immutable as a **document**, but must be **re-issuable** with a person's identifier redacted when an erasure or correction request is upheld (publish a new version, keep the hash chain, leave a "redacted on request" marker).
- Add `noindex` and an expiry or review date on public report pages. Offer a take-down contact (Rule 9, Rule 14).

### 8.3 Images and ID data
- Prefer **no image capture**. If a society must capture a photo, encrypt it at rest with a **per-event data key** wrapped by a master key held in a KMS.
- **Crypto-shredding:** at the end of the retention period or on an upheld erasure request, destroy the key (or the person's key where per-person keys are used) so the ciphertext is unrecoverable, and delete the objects. This satisfies "erase" in practice and works across backups.
- Do not store ID document images. If you must (society's decision), apply the same encryption and a short retention (see table), and block downloads.
- Access only through a logged, role-gated viewer. No bulk export of images.
- Keep object storage and keys in India.

### 8.4 Tamper-evident log versus erasure
- Hash-chain where each entry stores `H(prev_hash || H(payload) || metadata)`, with the **payload held separately** (encrypted) from the chain.
- Chain records only non-personal fields plus **salted-hash commitments** to personal fields (e.g. `H(salt || flat_id)`). Keep the per-record salt with the payload.
- To erase a person: delete the payload and salt (or destroy the key). The chain still verifies, because it covers the commitment hash, but the commitment can no longer be linked back to a person. A "redaction" entry is appended recording who ordered it and when, without personal data.
- Do not put raw names, flat numbers, photos, IDs or IPs in the chain itself.
- A periodic public anchor (publish the chain head hash in the report) gives tamper evidence without personal data.
- Caveat: a hash that is easily guessable (a flat number with no salt) is still personal data. Use a random salt per event, not a global one.

### 8.5 Notices and consent texts needed (to be written in plain language, English plus Eighth-Schedule languages per s. 5(3) and s. 6(3))
1. **Attendee / voter notice** (before collection; Rule 3): itemised data (name, flat, contact number, OTP result, attendance time, vote, optional photo, ID check record), the specified purposes (run the meeting or election, prove attendance and result), how to withdraw, exercise rights and complain to the Board, link to the website, contact of the responsible person (s. 6(3), Rule 9).
2. **Separate consent** for optional items: photo capture; per-flat naming in the public report. These must be unbundled from the right to vote or attend.
3. **Retention statement** in the notice: what is kept for how long (table below) and that results and proofs are permanent.
4. **Monitor notice and acknowledgment**: the monitor is told not to photograph or write down full ID numbers, and that misuse is a breach.
5. **Grievance page** (Rule 14(3)): 90-day maximum, with a stated shorter target, and the Board complaint route.
6. **Child and guardian rule**: the product's terms say it does not process minors' data; a guardian must act for them (s. 9, Rules 10-11).
7. **Breach plan**: internal template to meet Rule 7 (affected people "without delay"; Board "without delay", then detail within 72 hours).

### 8.6 Retention table per data class (recommendations; periods marked "society law" need legal confirmation per state)

| Data class | Purpose / basis | Recommended retention | Erasure / handling |
|---|---|---|---|
| Meeting / election **result** (resolution text, totals, turnout, quorum) | Society record; likely legally required retention | Permanent (or society-law period) | Non-personal; keep |
| Public report (pseudonymous version) | Transparency | Permanent while society account active, re-issuable | Re-issue with redaction on upheld request |
| Hash-chain / tamper-evident log (commitments only) | Integrity proof | Permanent | Salt or key deleted on erasure; chain stays valid |
| Attendee roll (name, flat, role) | Quorum, attendance record | Society-law period; default 1 year after event for the personal fields, then de-identify to counts | Pseudonymise at expiry |
| Individual vote record (identity-linked) | Verify eligibility only | Do not link vote to identity after tally; if a link exists for a dispute window, hold for the challenge period (e.g. 90 days, society law) | Delete or crypto-shred at end of window; legal-claim hold under s. 17(1)(a) if a dispute is filed |
| OTP and passcode state | Authentication | Minutes to days | Delete after use or expiry |
| Attendee photo (optional, consented) | Visual attendance proof | 30 days default, max one dispute window | Encrypted; key destroyed at expiry or on withdrawal (s. 6(4), 8(7)) |
| ID document **image** | Not recommended | Do not store | n/a |
| ID check record (type, last 4 chars, checker id, timestamp, result) | Audit of the check | Same period as the attendee roll | Delete with the roll |
| Security and access logs (no content) | Rule 6(1)(c),(e); Rule 8(3) | **At least 1 year** from processing | Delete after 1 year unless a law requires longer |
| Consent and notice records | s. 6(10): fiduciary must prove notice and consent | Life of the processing plus a claims period (suggest 3 years; Indian limitation periods not verified) | Keep minimal proof; no extra personal data |
| Erasure / correction request log | Accountability | 3 years (suggest) | Minimal data |
| Breach register | Rule 7 | 3 years (suggest) | |
| Billing and invoices | Tax and accounting law | Statutory period (not verified here) | Outside DPDP erasure where law requires |
| Backups | Rule 6(1)(d) | Rolling (suggest 35 days) | Crypto-shredding covers erased data in backups |

Periods labelled "suggest" are my design recommendations, not statutory figures. Only the one-year log minimum (Rules 6(1)(e), 8(3)) and the Consent Manager 7-year record (First Schedule Part B 4(c), which applies to Consent Managers, not to this product) come from the Rules.

### 8.7 Marketing and website promises to change
- Replace "never delete anything" with: "We keep the official result and its tamper-evident proof permanently. Personal details are kept only as long as the society needs them and then erased."
- Do not promise "non-editable" for personal fields. Say the **result** is non-editable, while personal details can be corrected or removed on request (s. 12).

---

## 9. Could not verify

- Whether any Government notification under s. 17(3) (small fiduciary exemptions) or s. 16 (restricted countries) or Rule 15 (conditions on foreign transfer) exists.
- Whether any Significant Data Fiduciary notification exists, or any Board guidance or FAQ on housing societies.
- State cooperative society laws and model bye-laws: retention periods for minutes, voter lists and election records; secret-ballot requirements; any duty to publish results. Only secondary snippets (Bombay HC summaries about s. 147 of the Maharashtra Act; a table of contents listing rules on minutes and elections) were seen. Not read at primary level.
- Companies Act, Societies Registration Act and Income Tax record-retention periods.
- The text of the Aadhaar Act as amended in 2019 (the read text is the 2016 original), including s. 8A and s. 4(4); the 2021 Authentication and Offline Verification Regulations (scanned PDF, no text); the 2025 amendment to those Regulations; any UIDAI notice that private verifiers must register; the legal status of the 2022 UIDAI "masked Aadhaar only" advisory (not found at all).
- The Puttaswamy (Aadhaar) 2018 operative text (seen only in press and law-firm commentary).
- Masked Aadhaar and Virtual ID official guidance; statutory limits on private storage of driving licence, voter ID (EPIC), passport and PAN.
- Whether the DPDP Act or Rules face a pending Supreme Court challenge that could delay or change commencement (one secondary source only).
- The IT Act 2000 s. 43A and SPDI Rules 2011 position after DPDP commencement (not researched).
- Fourth Schedule Part B (child-related exemption purposes) was not fully read.
- Fine and precise breach thresholds the Board applies in practice; no Board decisions exist yet as the substantive duties are not in force.

---

## 10. Sources read (URL, one line)

Primary text (actually fetched and read in this session):
1. https://www.meity.gov.in/static/uploads/2025/11/53450e6e5dc0bfa85ebd78686cadad39.pdf (retrieved 2026-10-23): Gazette G.S.R. 846(E), DPDP Rules 2025, read in English text including Rules 1-23 and Schedules 1-4 and 7.
2. https://www.indiacode.nic.in/bitstream/123456789/22037/1/a2023-22.pdf (retrieved 2026-10-23): DPDP Act 2023 consolidated "as on 19 November 2025", including the commencement footnote and Schedule of penalties.
3. https://uidai.gov.in/images/targeted_delivery_of_financial_and_other_subsidies_benefits_and_services_13072016.pdf (retrieved 2026-10-23): Aadhaar Act 2016 original text (ss. 29, 37, 57 read).
4. https://www.uidai.gov.in/images/Circular-No.14_of-2025.pdf (retrieved 2026-10-23): UIDAI Circular 14 of 2025 dated 04.11.2025 on Aadhaar Data Vault and storage.
5. https://www.uidai.gov.in/ovse-faq (retrieved 2026-10-23): UIDAI OVSE FAQ, summarised by the fetch tool (not read in full text).

Secondary only:
6. https://www.jsalaw.com/?p=55573 , https://www.mondaq.com/india/data-protection/1708164/digital-personal-data-protection-rules-2025-notified , https://amlegals.com/dpdp-rules-notified-immediate-actions/ , https://www.scconline.com/blog/post/2025/11/14/meity-notified-digital-personal-data-protection-rules-2025/ : search-result summaries of the Rules (used only as a cross-check on dates; superseded by item 1).
7. https://www.khaitanco.com/sites/default/files/2025-12/ERGO%20-%20Aadhaar%20Data%20Vault%20-%2010%20December%202025.pdf : search-result summary only; ADV applies to Requesting Entities, not OVSEs.
8. https://www.deccanherald.com/india/uidai-plans-to-ban-private-entities-form-storing-aadhaar-photocopies-here-is-the-alternative-3826236 : headline and snippet only; reported proposal, status unverified.
9. https://vinodkothari.com/2018/10/the-supreme-court-aadhaar-verdict-major-blow-to-fintech-companies/ , https://thewire.in/law/in-striking-down-section-57-sc-has-curtailed-the-function-creep-and-financial-future-of-aadhaar , https://www.livelaw.in/aadhaar-judgment-certain-concerns : search-result summaries of the 2018 judgment.
10. https://vinodkothari.com/2025/12/a-new-way-to-verify-aadhaar-offline-introduction-of-face-matching/ and https://www.indialaw.in/blog/aadhar-offline-verification-amendments/ : search-result summaries of the 2025 offline-verification amendment.
11. Search results about Bombay High Court cases on member access to minutes (thetaxcorp.in and similar): snippet only.

URLs that failed (HTTP 403 or fetch error) and were not used: the meity.gov.in documents landing page, jsalaw PDF, mondaq page and iapp page (via the fetch tool); the 2021 Aadhaar Regulations PDF on uidai.gov.in (404); the thc.nic.in copy of those Regulations (downloaded but scanned, no text).

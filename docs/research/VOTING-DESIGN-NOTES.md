# VOTING-DESIGN-NOTES: recommended way to build the owner's voting rules

Research and design recommendation only, NOT legal advice. Written 2026-10-23 after the owner's latest requirements. It ties each requirement to the legal findings in `LAW-STUDY.md` and `DPDP-AND-RECORDS.md`. No code.

## 1. Requirements as understood
- Voter kinds: Official voter (example: Rajat Agarwal) and Proxy voter (example: Neha Gupta). The organizer turns proxy on or off, per the society's own rules, before the election starts.
- Only one person per flat may vote. The organizer sets how many people per flat may attend.
- Each voter attends physically or online (organizer decides) and must enter a 6-digit code before voting. Voters may have no e-mail address, and the product does not use SMS.
- Final data shows complete tallies with no winner declared: total, official-voter, and proxy-voter views.

## 2. Recommended design

### 2.1 Roll and flats
- The organizer loads a roll: flat id, official voter (name), optional approved proxy for that flat, weight (default 1; configurable for area/percentage-share societies, because the UP model bye-laws weight by unit percentage, bye-law 8).
- Rule: **one vote per flat**, enforced by a per-flat "vote used" flag. The flag records *that* the flat voted, never *how*.
- Attendance cap per flat is an organizer setting (1 to N). Attendance and voting are separate: any admitted attendee counts toward attendance, but only one person per flat may be issued a voting code.
- If the official voter and the proxy both arrive, the first verified person to take the flat's voting slot votes; the other is recorded as attendee only. The organizer may set "official voter has priority until X minutes before polling closes".

### 2.2 The 6-digit code without e-mail or SMS
A 6-digit code has only a million possibilities, so it must be single-use, short-lived, rate-limited and issued only after a person has been checked. Ways to deliver it without e-mail/SMS:
1. **Physical attendees:** the attendance monitor checks the person against the roll (visual ID check, see `DPDP-AND-RECORDS.md` section 7.3) and the monitor's console shows a fresh code that the monitor hands over on a slip or screen.
2. **Online attendees:** the monitor or host checks identity over the live video call (face against the roll, optional document shown on camera, not recorded), then reads the code out or sends it in the meeting chat. Alternative: pre-issued per-flat code slips delivered by hand before the meeting, activated only when the monitor marks the person present.
3. Rules for all codes: bound to flat id + attendance id + session; expire in about 10 minutes; used once; stored only as a salted hash; 5 wrong attempts then lockout until the monitor re-issues; every issue, attempt and use is logged (flat, time, monitor id, never the choice).

### 2.3 Keeping the ballot secret while preventing double votes
- After the code is accepted, the system issues a one-time **ballot token** that is not linked to the voter's name in the ballot store.
- The **eligibility ledger** (flat id, "voted" flag, time, kind official/proxy) and the **ballot box** (token, choice) live in separate stores. Do not store the vote time with second precision in the ballot box; batch or round it so the two stores cannot be joined by timestamp.
- The voter can change the choice freely until pressing Submit; Submit is final (California treats an electronic vote as irrevocable once transmitted).
- The voter receipt shows: attendance number, time, link id, "your vote was recorded as official/proxy voter". It does **not** show the choice, so it cannot be used to prove how someone voted (vote-selling, coercion).
- The host sees who has voted (the ledger), never the choice. This resolves the owner's conflict between "100% secret" and "host sees YES/NO"; see `OPEN-QUESTIONS.md` item 1.

### 2.4 Proxy rules
- Proxy availability is an organizer switch and must default **off** for Maharashtra co-operative societies (bye-law 105 and Election Rules r.33 bar proxies) and for any society whose bye-laws are silent or forbid it.
- Where proxy is on, require a written proxy: giver flat and name, holder name, meeting or election named, date, signature or an e-signature; California requires bylaws to allow it and that it cannot replace a ballot; Florida proxies must be dated and expire 90 days after the meeting; Texas requires the association to offer proxy voting. Store the proxy form as part of the record.
- Each ledger entry says "official" or "proxy (holder, on behalf of flat X)". A person holding proxies for several flats is a society rule (limit per holder is a parameter).

### 2.5 Window, extension, stop
- Organizer sets start and end; extensions in 30-minute steps; manual stop or timer. Only the host console can extend, every extension logged with reason and time, and all voters notified. Because notices state deadlines, an extension needs the notice to have reserved it or the society's authority (`OPEN-QUESTIONS.md` item 6).
- After the end, new codes cannot be issued and the ballot box closes; a closed box is sealed with a hash anchored in the tamper-evident log.

### 2.6 Final report: no winner declared
- The report shows turnout, quorum check, and tallies in three views: **total**, **official voters**, **proxy voters**, plus attendance (physical vs online) and per-flat "voted" status as pseudonymous tokens (not names).
- Not declaring a winner matches the law: in Maharashtra the Returning Officer declares the result and a tie is settled by lots (Election Rules r.63); in California the independent inspector certifies results. The product should therefore present the count and leave "declared elected / resolution carried" to the officer or chair, who records it as a separate signed entry.
- **Small-cell rule:** if only one or two proxies voted, the proxy-view tally reveals their choices. Suppress or merge the official/proxy split when a group is below a threshold (suggest 5), or show it only to the election officer.

### 2.7 Quorum and attendance
- Quorum counts flats (or weight) present, by regime parameter: 30% of owners in person for the UP AOA model bye-laws; two-thirds or 20 for Maharashtra; 30% for Florida. Online attendees count only where the pack says remote presence counts (Maharashtra 2026 Rule 106C-13(3)(b) counts video attendees; UP not found).

### 2.8 Voter list, notice PDF, reuse and edits (added later)
- **Upload:** the organizer uploads the eligible-voter list (spreadsheet/CSV) and the notice of meeting or election as a PDF. Validate the list on import (duplicate flats, missing weight, missing official voter) and show errors before saving.
- **Notice PDF:** store it as an immutable file with its hash in the tamper-evident log; the notice date proves the notice period (UP 2 to 7 days, Maharashtra AGM 14 and SGM 5 clear days, FL 14, TX 10-60, CA 10-90 or 30 for ballots). Engine check: notice date + required days <= meeting date, using the pack's number; warn if the PDF lacks agenda/date/place/link (the packs list required notice content).
- **Reuse:** the roll is saved as a society-level master list; each new meeting copies it as a dated snapshot. Reuse carries a DPDP duty: only keep fields needed, delete or de-identify old snapshots per the retention table, and never reuse code, attendance or vote data from an earlier event.
- **Edit:** allowed freely before the event opens; after the notice is sent or voting starts, every change creates a new version (who, when, old value, new value, reason) and is blocked during the voting window unless the election officer approves. Changing who is eligible after notice can invalidate an election, so flag it for the officer. Members must be able to correct their own details (DPDP s.12).
- **Logging:** upload, validation, edit, notice, attendance, code issue, vote-slot use, extension and stop are all logged in the hash chain. The chain holds salted commitments, not names, flat numbers or IPs, so erasure of personal data does not break the chain (`DPDP-AND-RECORDS.md` 8.4). "Published" means the aggregate, pseudonymous report, not the raw log.

### 2.9 Member-wise attendance, code chain of custody, PDF receipt, host verification (added later)

**Mixed online and offline.** Every attendee is recorded the same way whether present in the hall or on the link: `attendance record = {attendance no., flat, person, role (official/proxy/other attendee), mode (physical/online), checked-in time, checked-in by (monitor id), check method}`. The software captures offline events too: the monitor enters them on a console (or scans a printed slip) at the moment they happen, so there is one timeline. Late entries are flagged "entered after the fact" with the real entry time, never silently back-dated.

**Member-wise attendance sheet.** One row per person, per event, showing: attendance no., name, flat, role, mode, check-in time, checker, code issued (time, by whom), code used (time), vote slot used yes/no, check-out time if recorded. This sheet is for the organizer/officer. The public report shows counts and pseudonymous tokens only (`DPDP-AND-RECORDS.md` 8.2).

**Code chain of custody (anti-manipulation).** For every 6-digit code the log records, in order: generated (time, system) -> assigned to which attendee/flat -> handed over by whom (monitor id) and how (slip/screen/chat) -> displayed/read (time) -> entered by the voter (time, device/IP, success or failure) -> consumed (time) -> vote slot closed. Rules that keep it non-manipulable:
- The code is generated by the system, never typed in by a human; only the monitor assigned to that attendee can reveal it, and revealing is itself a logged event.
- A monitor cannot issue a code to a flat they belong to, or vote-slot-use on behalf of anyone; the same person cannot be both issuer and voter.
- A re-issued code voids the old one; the log shows both and the reason.
- Codes are stored as salted hashes; log lines store the code event, never the code.
- Wrong attempts, lockouts, and manual overrides (who, why) are logged; an override by a host needs a second person (election officer) to confirm.
- The ledger, ballot box and attendance sheet each carry hash-chain entries so any later edit is detectable; the chain head is published in the report (`DPDP-AND-RECORDS.md` 8.4). Software can prove nothing was altered after the fact; it cannot prove that a monitor handed the code to the right person, so keep the hand-over event signed by the monitor's account and visible to the officer.

**Voter PDF receipt.** For the voter only, generated on Submit: society and event name, attendance no., voter name and flat, role (official / proxy for flat X), mode (physical/online), code generated-by and handed-over time, code-entered time, vote-submitted time, link id, and a receipt hash that matches the log. Optional fields the owner wants (IP address, mobile number) are personal data: show only with a notice, and the PDF must never state the choice (prevents proving a vote to a third party). The voter can re-download it while the event's retention window lasts. An attendance-only receipt (no vote) can be issued to attendees who did not vote.

**Organizer and host e-mail verification.** Organizers, hosts and monitors sign in with a verified e-mail address (one-time link or code to the address, verified before any role is granted), because voters may have no e-mail but the people running the event must be accountable. Recommendation: verify at account creation and again before the event goes live; record the verified address, verification time and role grant in the log; require a second verified person (election officer or co-host) to approve sensitive actions: window extension, early stop, roll edit after notice, code override. Pricing and payment are separate (Rs 199/499 India, $5/$15 global, via IT Services by Rajat Agarwal) and do not change these rules.

**Legal notes.** California requires an independent inspector for elections and Maharashtra a Returning Officer, so the "second verified person" should be that officer where the society has one. Whether the combined online/offline process is accepted for elections in UP and Maharashtra remains a lawyer question (`OPEN-QUESTIONS.md` item 2). Logging every person's check-in and IP adds personal-data duties from 13 May 2027 (notice, minimisation, retention), so keep logs for the stated period only.

## 3. Legal checks before building
- Remote voting in India: lawyer opinion first (`OPEN-QUESTIONS.md` item 2).
- Independent election officer role separate from the host (item 7).
- Notice must tell members about online voting, the code process and the data collected (DPDP notice, `DPDP-AND-RECORDS.md` 8.5).
- Identity checks: visual only; never record a full Aadhaar number.
- Weighted voting: if a society votes by area or share, "one vote per flat" must become "one voter per flat with a weight".

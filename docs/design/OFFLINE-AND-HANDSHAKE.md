# Printed ballots, the 4-digit code exchange and the SMS question (owner directives of 2026-10-23)

Principle given by the owner: **automate the manual process, keep transparency, data and the secret ballot intact, mimic the manual process, stay within the law.** Every design choice below is the electronic twin of something done on paper.

| Manual meeting | In AOA-RWA |
|---|---|
| Members sign the attendance register at the door; a scrutineer checks ID | The Attendance Officer (signed in with e-mail) marks the flat present; optional ID check; the report says whether attendance was independently verified |
| Voter and scrutineer are physically together | **Both type a 4-digit code that appears only on the other person's screen**: proof that two screens, two people, are in the same place |
| Blank ballot papers are handed out; the register shows who took one, the paper shows nothing about who | Printed paper with a **unique QR**; the ledger shows the flat took a paper; **the serial is never stored with the flat**, the serial pool has no time and no order |
| Voter ticks boxes in a booth, drops the paper in a sealed box | Voter ticks check boxes with a pen; the paper goes into the box; ticked = yes, empty = no |
| Counting: papers taken out in random order, counted under watch, invalid papers set aside, spoiled papers cancelled, unreturned papers noted | **Every paper is photographed by the officer**; the system reads the QR and the ticked boxes; invalid / voided / not-returned papers are counted separately and printed on the report |
| Result sheet signed by the Returning Officer | PDF with signature blocks; the photographs' fingerprint is in the sealed record |

## 1. The organizer chooses how ballots are issued (`ballot.mode`)
`online` (ballot on the voter's phone) · `printed` (paper with QR, photographed and counted) · `either` (the officer picks per voter; both channels count into the same sealed box; a flat uses one channel per point). Frozen for each point when voting opens. Paper needs a secret ballot (a paper cannot show who voted); publishing is refused if a paper point is an open vote.

## 2. Attendance handshake (replaces the SMS)
1. Officer (signed in, e-mail verified) types the flat and the person's name: **Start**. The officer's screen shows a 4-digit code and a link/QR.
2. The person opens the link on their own phone (any phone, no app). Their screen shows a different 4-digit code. The phone and browser are noted (device hash).
3. Officer reads their code aloud, the person reads theirs aloud; each types the other's code. Wrong codes count (5 per side kills the handshake); 10-minute expiry; one live handshake per flat; the officer's device must differ from the voter's device.
4. When both are confirmed: the flat is marked present (`method: mutual_code_exchange`), that phone + browser are bound to the flat for this event and the voter gets a session that only works on that phone. Starting a new handshake for the same flat (another phone) ends the old session automatically; the log records `device_bound` with `replaced: true`.
Why this is safe: the codes are derived from a server secret and only their hashes are compared; they never appear in the log or the audit rows; a remote person never sees either screen.
Limit (stated): an officer who owns two devices could play both roles. The audit trail records both devices (shown to the Organizer as shortened codes), the report prints "not independently verified" for non-officer marks, and every handshake is a public log entry; it is detectable, not impossible.

## 3. The SMS idea, and better options
Owner's idea: the officer enters the person's mobile number; the person sends an SMS from their own phone "somewhere"; the system reads it and confirms the sender number; then the codes are exchanged.
* **A platform inbound SMS number would cost money** (number rental, gateway, Indian DLT rules) and the "From" of an SMS from a gateway can be spoofed - so it is not free and not proof.
* **What is built (free, optional): the SMS goes to the OFFICER's own phone.** The voter's page gives an `sms:` link pre-filled with a short text; the voter sends it from their own SIM (at their own normal SMS tariff, nothing paid by us). The officer reads the sender number in their own SMS app (shown by the mobile network) and types it into `sms-confirm`; the system compares it with the number entered at the start (kept only as a keyed fingerprint, shown masked) and records `mobile_confirmed`. Nothing is sent by the platform, no SMS cost, and the number is network-verified for person-to-person SMS. It supplements the code exchange; it does not replace it.
* **Better / additional options** (not built, for the owner): (a) passkey / WebAuthn on the voter's phone after the first handshake, so the device is cryptographically remembered; (b) pre-printed attendance slips with scratch-off codes handed out at the gate for voters without smartphones; (c) an officer-held "voting booth tablet" for people with no phone (the passcode route already exists); (d) WhatsApp click-to-chat links are free but cannot be read by the system, so they are not used.

## 4. Photographing and reading the paper
* The printable paper (SVG, A4) has four corner marks, a QR zone, the title, the instruction ("Tick 1. A ticked box means yes... "), and one check box per option at fixed positions (`paperLayout`), in the Organizer's chosen design.
* The officer's phone: finds the four corner marks and straightens the page, decodes the QR (token), measures each box (`detectTicks`: share of dark pixels inside the box): clear tick = ticked, clean = empty, anything between = **uncertain**, shown to the officer to confirm (never guessed). Then it sends `marks` (true/false per box) and the SHA-256 of the photo (the photo itself may be stored encrypted).
* The server checks the QR (keyed MAC, same event and point, issued serial, not yet handled), applies the SAME ballot rules as online (min/max ticks); too many or too few ticks = recorded as **invalid**, not counted, not guessed.
* A clean pre-straightened page is read correctly in tests and in 3,000+ randomized pages; the straightening and QR decoding use a camera library in the UI session (OpenCV.js / a QR decoder) and are NOT yet built or measured on real photos.

## 5. What the QR means
It holds `bp_<12 hex>.<16 hex MAC>`: meaningless without the server's secret and the serial pool. "Only our system can read it" is true in the sense that any QR reader shows the text but only this system can say whether it is a real paper of this vote (a forged one fails the MAC; an unknown serial fails the pool; a second scan is refused).

## 6. Counting finishes before the report
A point that had paper stays "closed, counting" until the Host (or the closing of the event) finishes counting; then the box is sealed with the paper accounts (issued, counted, invalid, voided, not returned) and the result is computed. Events close their points automatically at the scheduled end, finish counting and publish within 120 seconds.

# REPORT-SPEC (Phase 1 design)

One public, non-editable, single self-contained HTML file per event publication. Built by `engine/report.ts` as a **deterministic function of the log** (same log in, same bytes out: no clock, no randomness, no environment).

## 1. File layout
```
<!doctype html><html lang="en"> ...inline CSS (screen + print-to-PDF)...
<body>
  <header>  society name, address, registration number, event title/type/date/venue
            "Personal details are partially hidden with * to ensure privacy."   (first screen, Amendment A6)
  sections (rendered at build time as static HTML so the page reads without JavaScript):
     1 Summary and verification banner (head seq, head hash, key id, "Verify" button, status line)
     2 Roles and "Who appointed whom" tree; designation labels; created-from link
     3 Options used: ticked / unticked list; locked-by-law ticks with reasons
     4 Rules and every rule's change history
     5 Notice check (required days, given days, met yes/no)
     6 Attendance by flat number (method used, mode); attendance verification line:
         "Attendance was independently verified by N Attendance Officer(s)" OR "Attendance was not independently verified"
     7 Quorum calculation
     8 Agenda and per-point results: weights, individual vote % (basis points shown as %), majority class, passed/not passed as computed; elections: counts only, no winner declared unless the pack says so
     9 Who voted (flat numbers) / open votes by flat where that option is on; receipt list per secret point
    10 Complete log (expandable)
    11 What is not published and why
  <script type="application/json" id="aoa-data">   { "model": {...}, "log": [ {entry,hash,sig}, ... ], "publicKey": "...", "kid": "..." }
  <script id="aoa-verifier">  inline verifier (WebCrypto: SHA-256 + Ed25519), no external requests
  <!--SEAL--><script type="application/json" id="aoa-seal">{ "fileSha256":"...", "sig":"...", "kid":"...", "headSeq":N, "headHash":"..." }</script><!--/SEAL-->
</body></html>
```
No external assets, fonts, scripts or images. All user text is HTML-escaped at build; the embedded JSON escapes `<`, `>`, `&`, U+2028, U+2029 so it cannot close the script tag.

## 2. Seal (tamper evidence for the file itself)
`fileSha256 = hex(SHA-256(utf8(html with the text between <!--SEAL--> and <!--/SEAL--> replaced by the empty string)))`.
`sig = Ed25519(priv, "aoa-rwa/report/v1\n" + eid + "\n" + fileSha256)`; the server signs at publication and stores the row in `reports` (immutable) and the digest in an `anchors` row.
`verifyReport(html, {publicKey?, expectedFileSha256?})`:
1. Extract seal; recompute `fileSha256` from the rest of the file; compare; verify the seal signature. **Any changed byte anywhere in the file fails here.**
2. Extract the embedded log; run LOG-FORMAT section 3 (chain, signatures, replay).
3. Re-derive the model from the log and compare with the embedded `model` and with the static HTML of the sections (rebuild with the same function and compare bytes except the seal).
4. If the caller supplies `publicKey` (from `/api/pubkey` or the anchor repo) it must equal the embedded key; if `expectedFileSha256` is supplied (from the anchor), it must equal the recomputed digest.

Honest limit shown on the page: a person who edits the file can also edit the embedded verifier to say "ok". The independent checks are (a) the file SHA-256 shown on the page versus the published anchor, (b) running the verifier from the published repo/`/api/pubkey` rather than the file's own copy. The page says so in one sentence.

## 3. Privacy of the report
Built from the **masked** log only. The scanner (`engine/masking.ts: scanPublic`) runs on the final HTML and on the JSON and fails the build on any complete e-mail address or any 10-digit run (digits may be separated by spaces/hyphens). Intentionally public and never masked: flat numbers, society name/address/registration number, event title/type/date/venue, point numbers, agenda text, counts, vote %, quorum figures, rule texts and history, roles and designation labels.
Section 11 lists what is not published and why: passcodes, images, ID details beyond doc type and last 4 characters, full contact details, raw IP addresses.

## 4. Download
`GET /api/r/:eventId` returns the same bytes as the stored report with `content-disposition: inline`; `?download=1` sets `attachment; filename="aoa-rwa-<eventId8>-report.html"`. Identical file either way. A print stylesheet (`@media print`) gives PDF via the browser. No login.

## 5. Corrections
Published reports are never edited. A correction is a new log entry (and a new `reports.rev` whose banner links to the earlier rev); the old rev stays downloadable.

## Addendum 2026-10-23
* There is exactly one report revision per event (a second is refused by the database). A correction is a new log entry; the report is never replaced. (This replaces section 5 above.)
* The page also prints: schedule with day/date/time/place and count-down timers, "Checked against the rules", "Access trail and terms", ballot design and instruction per point, ticked/not-ticked counts, ranking and by-rank assignment, ids of every person, point and candidate.
* PDF: `GET /api/r/:id/pdf`, see OWNER-DIRECTIVES section 4.

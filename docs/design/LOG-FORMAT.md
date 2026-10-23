# LOG-FORMAT (Phase 1 design)

One hash-chained, signed log **per event**. Implemented in `packages/engine/src/canonical.ts`, `crypto.ts`, `log.ts`, `verify.ts`.

## 1. Canonical JSON
Deterministic text so every machine hashes the same bytes (RFC 8785 style):
* Objects: keys sorted by UTF-16 code unit order, no whitespace, no duplicate keys.
* Strings: JSON escapes only for `"`, `\`, control characters (`\b \f \n \r \t`, others `\u00xx`); everything else literal UTF-8. NFC normalisation is the caller's job for user text (the API normalises on input).
* Numbers: **safe integers only** (no floats, no NaN, no exponent). Money, weights, basis points and times are integers.
* `null`, `true`, `false`, arrays, objects. `undefined` is an error (never silently dropped).

## 2. Entry
```
entry = {
  "v": 1,
  "eid": "<event id>",
  "seq": 1,                      // starts at 1, +1 each entry, no gaps
  "ts": 1790000000000,           // server epoch ms
  "type": "event_created",       // see section 5
  "actor": {"pid":"p_...","role":"organizer"} | {"flat":"A-101"} | {"system":true},
  "payload": { ... },            // masked / public values only
  "prev": "<64 hex>"             // hash of entry seq-1; for seq 1 the genesis hash
}
GENESIS(eid) = hex(SHA-256("aoa-rwa/genesis/v1\n" + eid))
hash         = hex(SHA-256("aoa-rwa/entry/v1\n" + canonical(entry)))
sig          = base64url(Ed25519_sign(priv, utf8("aoa-rwa/sig/v1\n" + eid + "\n" + seq + "\n" + hash)))
```
The stored/published row is `{entry, hash, sig}`; `entry_json` in D1 is `canonical(entry)` so the hash can always be re-derived byte for byte.

**Every** entry is signed (not just periodic heads). A database administrator without the private key can therefore neither append, edit nor re-chain; a log truncated at the tail is detected by anchors (section 4).

## 3. Verifier algorithm (runs in the browser inside the report; same code in `engine/verify.ts`)
Input: `entries[]` (each `{entry, hash, sig}`), `publicKey` (Ed25519 raw, base64url), optional `expectedHead {seq, hash}`.
1. `entries` non-empty; `entries[0].entry.seq == 1`; `prev == GENESIS(eid)`.
2. For each i: same `eid` throughout; `seq == i+1`; `canonical`-recompute `hash` and compare (constant ignorable here); `prev == entries[i-1].hash`; verify `sig` with the public key over the signed message. Any failure -> report `{ok:false, failedAt: seq, reason}`.
3. If `expectedHead` is given: `entries[expectedHead.seq-1].hash == expectedHead.hash` (detects a rewritten chain) and `length >= expectedHead.seq` (detects truncation).
4. Replay: recompute every derived figure (quorum, tallies, vote %, appointment tree, rule history) from the entries with the pure engine and compare with the figures the report displays and with the `result_computed` entries. Output `matches signed result: yes/no`.
5. Return `{ok, head:{seq,hash}, checkedEntries, resultsMatch, problems[]}`.

## 4. Anchoring
* `anchor` entry: appended at close, and by the daily tick for live events: `{headSeq, headHash}` of the entry before it.
* The report embeds the head and the public key; `anchors` rows store the signed head.
* Publication targets (done by the deployment session, not this one): the public append-only GitHub anchor repo and the e-mail to the Organizer. Anyone holding an old anchor can detect a rewritten or truncated chain with step 3.
* The server public key is published at `/api/pubkey`, in every report and in the anchor repo; rotating the key never rewrites old entries (the report names the key it was signed with, `kid`).

## 5. Entry types (payloads are masked/public)
`event_created {kind,eventType,title,venue,scheduledMs,packId,society{name,address,registrationNo,kind},createdFrom?}` ·
`email_verified {pid}` · `role_appointed {pid,role,appointedBy,maskedName,maskedEmail}` · `role_removed {pid,role,removedBy}` · `label_set {pid,label}` ·
`options_set {options:{key:0|1},locked:{key:reason}}` · `rule_changed {scope,param,old,new,reason}` · `rule_change_rejected {scope,param,reason}` ·
`roll_set {rev,flats:[{flatNo,weight,eligible}]}` · `point_added/point_amended {pointId,number,title,body,kind,options,maxChoices,majorityClass,secret,rev}` ·
`agenda_published {noticeDays,noticeMet,points:n}` · `payment_state {paymentId,state,amountMinor,mode}` ·
`passcode_issued {purpose,subjectKind,subject,by}` (never digits) · `passcode_voided {…,reason}` · `passcode_locked {…}` ·
`attendance_marked {flatNo,mode,method,docType,docLast4,maskedName,by,independent,evidenceHash?}` · `attendance_superseded {supersedes,…}` ·
`event_started` · `quorum_checked {pointId?,presentWeight,totalWeight,requiredWeight,met}` · `point_opened {pointId,endsMs,frozenRulesDigest,quorum}` · `point_extended {pointId,endsMs,reason}` · `point_closed {pointId,by}` ·
`vote_recorded {pointId,flatNo,kind}` (secret: no choice) · `vote_cast_open {pointId,flatNo,kind,choices}` · `ballot_box_sealed {pointId,n,receipts[],counts{},digest}` ·
`result_computed {pointId,tally,percentBp,passed|null,…}` · `event_closed {headSeq}` · `platform_action {action,reason}` · `event_suspended {reason}` · `contacts_read {by,scope}` · `clone_linked {direction:"from"|"to",eventId}` · `anchor {headSeq,headHash}` · `notice_checked`.

Rules for payloads: integers only; no e-mail, phone, full name, passcode digits, IP, image; flat numbers allowed.

## 6. What breaks what (each is a test)
Edit any payload byte -> hash mismatch. Reorder/drop an entry -> seq gap / prev mismatch. Replace an entry with a re-hashed one -> signature fails. Re-sign with another key -> signature fails against the published key. Append after a truncated head -> `expectedHead` check fails. Edit the downloaded report -> section 3 and the file seal (REPORT-SPEC) fail.

## Addendum: entry types added during the build
`rules_initialized {packId, params, options, locked}` (the complete starting rules, so the report can show every later change) · `holder_added {pid, flatNo, maskedName}` · `vote_rejected {pointId, flatNo, reason}` (informational) · `key_destroyed {by}` (crypto-shredding) · `passcode_issued` also carries `kind` (official/proxy) and `voided` count.
Entries are always written in one atomic D1 batch together with their record-table rows. `ballot_box_sealed` carries `n`, `castWeight`, sorted `receipts`, per-option `counts` {weight,count}, optional `split` (official/proxy, only when each side meets the small-group threshold) and `digest`; it never carries per-ballot weights.
The replay (engine `replayLog`) re-checks: one vote per flat per point, voting only while the point is open and the flat is present, rules frozen once a point opens, roll frozen once voting starts, ballot-box size and weight equal to the flats that voted, and every `result_computed` equals the recomputed tally.
`event_created` also carries `schedule` {start,votingStart,votingEnd,end:{atMs,place}} and `timezone`; `schedule_set {schedule, old, reason}` replaces it before the event starts (replay flags a later change).

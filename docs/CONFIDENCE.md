# CONFIDENCE: how sure are we that it will work as expected? (honest version, 2026-10-23)

The owner asked for confidence scores out of 100 for the organizer, host, attendance officer, attendee, voter and end to end, and for 99.99999% (six-sigma quality) at every stage; and for gaps to be found, filled, tested, published and taken live.

## 1. Short answer
* **99.99999% is not a number anyone can honestly state for this build, and I will not state it.** Software confidence is earned from evidence about *this* software in *real use*. The strongest evidence we can produce before launch is the back-end evidence below; there is **no user interface yet, nothing has run on the real Cloudflare runtime, nothing has had a real user, a real phone camera or a real payment.** Those are the places where the failures of a first version actually live.
* **Publishing and going live are not mine to do in this session** (the brief is local only; deploy, DNS, live payments wait for the PM and the owner).
* What I did instead: find the gaps, close the ones that can be closed offline, and measure. Two real defects, one privacy-scanner gap and one verifier crash on damaged files were found and fixed by the simulations alone (section 3).

## 2. Scores (my calibrated judgement, NOT measurements)
"Back end" = engine + API as tested here. "Real use today" = what a society would experience if launched now (no UI, unmeasured runtime). The first column is supported by the evidence in section 3; the second is a judgement about unknowns.

| # | Area | Back end, in the tested scope | Real use today | What limits the second number |
|---|---|---|---|---|
| 1 | Organizer creates a meeting / election and sets the rules | 99.5 | 60 (no UI to do it) | screens, form validation, wizard, language, mobile layout |
| 2 | Host sets / changes rules | 99.5 | 60 | same |
| 3 | Attendance Officer: sign-in, check-in by code exchange, issue printed / online ballot, photograph and count papers | 99 (codes, binding, accounts) | 40 | no officer screens; camera, QR decode and straightening of real photos not built or measured |
| 4 | Attendee / voter side of check-in (open link on own phone, exchange codes) | 99 | 55 | real phones, browsers, networks, shared Wi-Fi, low literacy; no screens yet |
| 5 | Voter casts a vote (online) | 99.5 | 55 | screens; device and browser variety |
| 5b | Voter votes on a printed paper that is photographed | 97 for the logic after the photo is read | 30 | the photo-to-ticks pipeline on real paper, light, pens, creases |
| 6 | End to end (create to sealed report, PDF, e-mail) | 98.7 or better per event is all the sample can prove (see 3.2) | 50 | runtime, mail, payments, scheduler not exercised for real; no pilot |
| 7 | 99.99999% at every stage | not demonstrable | not demonstrable | would need about 30 million failure-free real events (see 4) |

How to read it: a "99.5" on the back end means *I would be surprised, not astonished, to find a back-end defect in the first thousands of events*; it is not a measured failure rate. A "40" means *the part is not finished or never met reality*.

## 3. Evidence (all reproducible; outputs in docs/evidence/)
### 3.1 What exists
* 243 automated tests, all passing (`bun test --isolate --timeout 60000 packages apps`); strict TypeScript check: 0 errors (`docs/evidence/typecheck.txt`).
* **Mutation check**: 89 deliberate breakages of the code (replay a passcode, vote twice, edit a log row, forge a signature, tamper with a report, change a rule after voting opened, ...), 89 caught by a failing test (`docs/evidence/MUTATIONS-all.md`). Each uncaught one found earlier led to a stronger test.
### 3.2 Simulations (the nearest thing to field testing before launch)
* **Engine oracles (`scripts/sim-engine.ts`)**: about **17.2 million randomized cases** over 8 properties - tallies, majorities, vote %, rankings, ticked / not-ticked counts, quorum, ballot validation, the 6-digit passcode lifecycle, hash-chain tamper detection, masking, the 4-digit handshake, reading ticks from synthetic paper photos - each compared with an independent oracle (BigInt, different structure). Final result: **0 disagreements**. Before that, the simulation found one real gap (a phone number written with a leading 0 passed the privacy scanner), fixed and tested; two disagreements were bugs in my own simulator.
  Zero failures in n independent cases bounds the failure probability at about 3/n with 95% confidence: **3/17.2M, about 1.7e-7 per case** for these functions under *my* generated inputs. That is the only place near the six-sigma target, and only for pure calculations.
* **End-to-end (`scripts/sim-stack.ts`)**: **240 random events, 35,184 API calls, 26,287 checks, 0 failures** through the real handler and the real migrations (SQLite stand-in for D1): 8 rule packs, meetings and elections in every format, online / printed / either, weights, handshake and direct check-in, 3,092 online votes (each followed by a double-vote attempt), 2,616 paper ballots (95 invalid, voided and unreturned ones, forged and repeated scans), quorum refusals, late and rule-change attempts, then the published record checked (chain, signatures, replay, seal, PDF, privacy scan, 720 random byte-flip tamper probes, append-only probes). It found: a verifier that threw on a damaged file (fixed, now a test), a scanner false alarm on id fragments (fixed), and a gap in my own quorum oracle. Bound: 95% confident the per-check failure rate is below 1.1e-4 and the per-event failure rate below 1.3% (that is *all* 240 events can say).
### 3.3 Limits of this evidence (important)
* The oracles and the simulator were written by the same author as the code: **shared misunderstandings are invisible** to them. A second author, or a second implementation (see gaps), is the cure.
* The verifier and the server share one codebase: a bug in shared maths could be "verified". An independent verifier implementation is on the gap list.
* SQLite is not D1. Cloudflare Workers are not Bun. Both are close, neither is identical.
* Inputs are what my simulator can imagine; real members and real officers will do things it does not.

## 4. What 99.99999% would require
For a failure probability p, n independent failure-free trials give about 95% confidence that p < 3/n. For p < 1e-7: **n > 3 x 10^7 failure-free real trials** (events, or at least full voter journeys). Even 99.9999% (1e-6) needs 3 million. No pre-launch activity produces that. So the honest route to "six sigma" is:
1. make failures *visible* (every published record re-verifies itself; any defect is detected, not silently wrong);
2. make failures *recoverable* (the paper / manual process remains the fallback; the record is append-only; corrections are new entries);
3. launch in stages and count: pilot with a few societies, then more; publish the defect rate; improve until the bound is where the owner wants it.

## 5. Gaps, in order of risk, with what closes each
| # | Gap | Closed by | Status |
|---|---|---|---|
| G1 | No user interface (every "real use" score above) | UI session, then Playwright end-to-end per role on phone and laptop | not started |
| G2 | Not run on the real runtime (wrangler local D1 and Workers; RAM was under the 1.2 GB limit all session) | run `wrangler pages dev` with local D1 under the heavy lock; then a staging deploy on the owner's order; re-measure CPU time per request (free plan limit) | **not done** |
| G3 | Payments, mail, Turnstile only stubbed | test-mode keys end to end in staging | not done |
| G4 | Paper pipeline on real photos (straightening by corner marks, QR decode, tick reading) | build in the UI; measure on >= 1,000 real photos (pens, light, creases); target: >= 99.9% correct-or-flagged, 0 silently wrong | not built |
| G5 | Common-mode risk: server and verifier share code | write an independent verifier (for example in Python) for the public anchor repo and run it against thousands of simulated logs | not done |
| G6 | Load / concurrency (two officers acting at once, 500 voters in one minute, D1 limits, replay cost per request) | load test on staging; add signed state checkpoints if needed | not done |
| G7 | Security review / penetration test; key custody and rotation; anchor publication | external review before launch; owner decisions | not done |
| G8 | Legal: terms and DPDP notice, remote voting in India, rule-pack values, candidate names public, IP/device audit | lawyer review (open question list) | not done |
| G9 | Translations other than English and Hindi are drafts | native readers | not done |
| G10 | Human factors: officer mistakes, voters without phones, shared phones | pilot with real societies; officer-held-device flow | not done |
| G11 | Backups, restore drill, scheduler (the 1-minute tick) in production | deployment runbook rehearsal | not done |
| G12 | Accessibility, performance budgets (Lighthouse), mobile layout | UI phase | not done |
| G13 | Trademark / domain for the name | clearance | not done |

## 6. Gates before "go live" (proposal)
Go live only when: G1, G2, G3 are done and green; G4 is measured; G5 and G7 are done; G8 and G13 are signed off; and a pilot of at least 20 real events has produced zero silent-wrong results. Each of these is verifiable. Until then the product should be described as "pilot".

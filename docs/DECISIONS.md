# DECISIONS (judgement calls made during the build)

1. **Every log entry is signed**, not only periodic heads, so a DB administrator cannot append or re-chain without the key.
2. **Report = deterministic function of the log**; the file seal signs the SHA-256 of the whole file with the seal block emptied.
3. **Aggregates only for secret ballots** (counts per option, receipts list). Per-ballot weights are not published because unique weights would identify flats. Residual risk documented.
4. **Failed passcode attempts are counted, not chained**, to prevent log flooding; the lock, issue, success and refused votes are chained.
5. **Rule packs derived by an explicit table** (`packs.ts` DERIVED) from the prose research; nulls stay null. Maharashtra quorum uses 6666 bp so that 2/3 of 9 flats is 6, not 7. A `custom-world` pack was added for any country (owner instruction).
6. **Proxy voting:** undecided in packs where the research says "unclear" - the Organizer must decide; recommended settings choose "no proxy". Locked off for the Maharashtra pack with the law reason.
7. **Mixed roles:** one person may hold Host and Attendance Officer; as soon as any Attendance Officer exists the Organizer/Host may not mark attendance themselves.
8. **Attendance marked by someone other than an officer** is `independent:false`; the page then says "not independently verified" (or "only partly").
9. **Voter login rate limit is per address+flat**, not per address, because a hall shares one Wi-Fi address (found while simulating 120 voters).
10. **Payment is TEST-only and uses the central-path call shape of Corporate Bingo** when `PAY_SERVICE_KEY` is set; otherwise a local test order. Live payments are not wired.
11. **Super console login by e-mail code only** in this build; WebAuthn is a browser feature and goes to the UI session.
12. **The in-page verifier bundle is committed** (`verifier.generated.ts`) so reports are reproducible; a test fails if it is stale.
13. **Deferred / rejected from the wishlist:** photo capture and on-device encryption (UI), GitHub anchor repo publishing (deployment), SMS/WhatsApp (never), Aadhaar numbers (never).
14. **Owner additions of 2026-10-23 built in:** worldwide custom packs, 8-step console with progress, one public page that is the live dashboard and then the sealed report (`docs/design/WORLDWIDE-AND-LIVE-PAGE.md`).

## Owner decisions needed
a) Are candidate names in election reports public (current) or masked/consent-gated? b) Retention period for private data (OPEN-QUESTIONS 4, 18). c) Signing-key custody and rotation plan, and where anchors are published. d) Whether weighted secret ballots are allowed at all. e) Lawyer review of remote voting in India (OPEN-QUESTIONS 2) before selling there. f) Price tables outside India. g) Whether to lift the daily mail limit (90) with a paid plan or a second free provider.

15. **IP + device audit instead of "never store IP"** (owner directive; supersedes PM-STANDARDS section 2 on this point), encrypted and shortened as described.
16. **Fail-closed audit**: no audit row, no action.
17. **Two rows per request** (before/after) because the table is append-only.
18. **Anonymous reads of public pages are not audited individually** (public data, read-heavy, cost); a flag turns it on.
19. **Prices by country**: India Rs 499/1499, elsewhere USD 5/15; the country is recorded in the log.
20. **One report revision per event** (database-enforced) - supersedes the earlier idea of corrected re-issues.
21. **"Who chose what" is public only for open votes**; secret ballots stay secret (owner to confirm the reading of the directive).
22. **PDF is Latin-only** with standard fonts (no font embedding); the HTML report carries all scripts. A client-side PDF with embedded fonts is a UI option.
23. **Automatic close at the scheduled end** is on by default (`auto_publish`) so the report is out within 120 seconds even if nobody presses the button; it can be switched off.
24. **Candidate names are agenda text, public**; candidate consent is the Organizer's duty (owner/lawyer decision).

### Owner decisions needed (added)
h) Confirm the reading of "complete log visible, who chose what" (open votes only). i) Whether the private-data erasure exception to "nothing can be deleted" stays. j) Whether anonymous reads of public pages must be audited too (cost). k) Terms wording and DPDP notice: lawyer review. l) Whether auto-close at the scheduled end is the right default for meetings that overrun.

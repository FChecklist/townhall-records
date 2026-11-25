# Changelog

Townhall Records (Meetings and Elections for AOA, RWA and HOA societies). Newest first. Dates are in IST (India time).

The live version file is `apps/api/public/version.json`. The older in-app release file `apps/api/public/release.json` (read by the "What's new" page) carries the same two versions.

Rule: every deployed change gets a new version (MAJOR.MINOR.PATCH), a new entry here, an updated `version.json` and an updated `KNOWLEDGE-MAP.md`, all in the same pull request.

## 0.2.2 - 25 Nov 2026

- The home page content was rewritten from the association's point of view.
- The small mark was added to the three marketing pages (home, privacy, terms) with its approved style; the guard test now covers `site/` too. The privacy and terms menus use the same words as the home page.

## 0.2.1 - 25 Nov 2026

- The small mark १३९ (6px, bold, dark blue, thin dark red line under it) at the very top centre of every page, above the header. It does not move content, cannot be clicked, and is hidden from screen readers. A test (`apps/api/test/mark139.test.ts`) checks every page. The work listed below under "Not yet versioned" is still not versioned.

## Not yet versioned (work done after 0.2.0, nothing of it deployed)

This work is in the code but has no version number yet. Give it one (suggested 0.3.0) in the pull request that deploys it.

- 14 Nov 2026: added the knowledge map (what this repository is for and what the other repositories are for).
- 2 Nov 2026: Team Desk, one common page for Organizer, Host/Co-host and Attendance Monitor; parts a role may not use are greyed out, with the reason written out; works on a phone.
- 2 Nov 2026: a meeting's title or place can be edited; after the notice, the change is mailed to flat holders who have an e-mail on the list, with the old and the new words.
- 2 Nov 2026: an agenda point taken off after the notice went out is marked withdrawn, never deleted; the reason and time stay in the log and the report.
- 2 Nov 2026: if the Attendance Monitor is absent, an Organizer or Host can take over the check-in, hand it back, or replace the Monitor; every change is a signed log entry with the reason.
- 2 Nov 2026: flat list kept in the model; request to correct a name.
- 2 Nov 2026: new marketing site (home, terms, privacy, sitemap, headers) and plain "how to fix" sentences for four new error codes.
- 2 Nov 2026: verifier bundle rebuilt, and a test pins the two copies of it as identical.
- 29 Oct 2026: Townhall website and logo; more roles (Chair, Secretary, Treasurer, Auditor and others) and association kinds (NGO, Association, Club, Other); wording that says payment is collected by IT Services by Rajat Agarwal through Razorpay.

## 0.2.0 - 27 Oct 2026

Screens arrive.

- First screens for the public page, the team desk and the voter page (12 addresses, laptop and phone, English and Hindi).
- Plain-words error messages that say how to fix each problem.
- Phone and laptop designs.
- A test grid that opens the screens in a fake browser (69 tests, 117 cases).
- Release file (`release.json`), What's new page and installable app shell added.
- Deploy script and scheduler worker written, not run.

## 0.1.0 - 24 Oct 2026

Engine and rules. First recorded state of the product (work started 23 Oct 2026).

- Signed, tamper-evident record of every action; public page built from that record; sealed report when the event closes.
- 158 rule packs for different regions, plus a society's own rules.
- Online and printed ballots, 4-digit check-in, privacy requests, per-person erasure.
- Flat list upload from a PDF, team limits, attendance photo with time and place.
- Payments through IT Services by Rajat Agarwal (test mode only until the owner switches payments on).

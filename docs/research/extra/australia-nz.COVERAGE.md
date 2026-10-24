# Coverage: australia-nz (compiled 2026-10-24)

Research, not legal advice. Companion data: `australia-nz.json` (11 packs; every engine block loads cleanly through `parseCustomPack`).

| Regime | Status | Instruments found and read | What blocked / weak |
|---|---|---|---|
| New Zealand: body corporate (Unit Titles Act 2010 + Regulations 2011) | READ-HIGH | Act Part 3 (ss 88-114B) and Regulations regs 5-16A, 24-27A, read in full on legislation.govt.nz (Act as at 10 Jul 2026) | Default body corporate operational rules, reg 36A records and committee-meeting notice not read |
| New Zealand: incorporated society (Act 2022) | READ-MEDIUM | Ss 45-47, 84-93 read. The Act fixes almost nothing (notice, quorum, majorities left to the constitution) | Model constitution and 1908 Act (still applies to non-re-registered societies) not read; engine block deliberately empty |
| Queensland (BCCM Act 1997 + Standard Module 2020) | READ-HIGH | Act ss 104-111; Standard Module regs 9-39, 81-117, 123-131 read in full on legislation.qld.gov.au | Accommodation, Commercial, Small Schemes and Two-lot Schemes Modules NOT read; committee/ballot scrutiny regs 31-39 only skimmed |
| Victoria (Owners Corporations Act 2006) | READ-HIGH for the Act (v024, in force 9 Sep 2026); engine held at medium | Part 4 (ss 69-97) and Part 5 (ss 100-118) read from the authorised PDF | Owners Corporations Regulations 2018 (proxy form, teleconference, Schedule 2 model rules) NOT read |
| ACT (Unit Titles (Management) Act 2011) | READ-HIGH | s 17, s 39 and Schedule 3 (all general-meeting rules) read on legislation.act.gov.au (current, 26 Jun 2026) | Default rules by regulation and committee-meeting rules (s 37) not read |
| Western Australia (Strata Titles Act 1985, 2018 reforms) | READ-MEDIUM | Ss 120-136 and Schedule 1 by-law 4 read, but from version 07-h0-01 "as at 1 May 2020" | A later consolidation was not retrieved (reforms since then not checked); Regulations 2019 and the Landgate fact sheet (host unreachable) not read |
| Northern Territory (Unit Title Schemes Act 2009 + Management Module 1) | READ-MEDIUM | Act ss 74-80 (as at 27 Nov 2023) and Module 1 Parts 2-3 (as at 12 May 2023) read from the NT PDF downloads | Versions are 2023; other modules not read; older Unit Titles Act schemes not read; notice is in working days |
| Tasmania (Strata Titles Act 1998) | READ-HIGH for what the Act says (it is short) ; engine at medium | Ss 3, 75-80, Schedule 1 by-law 10 read on legislation.tas.gov.au | No special-resolution definition in the text read; no term, e-voting or proxy rules; scheme by-laws decide |
| South Australia: Community Titles Act 1996 | READ-LOW | Only Law Handbook (Legal Services Commission) summaries of ss 3, 81-88 | legislation.sa.gov.au refused (403/404). Handbook pages say "last revised 2018" but cite 2026 regulations |
| South Australia: Strata Titles Act 1988 | READ-LOW | Same Law Handbook summaries of ss 3, 33-34, 41AA, 45 | Same blockage |
| New South Wales (SSMA 2015 Sch 1 + Regulation 2016) | READ-MEDIUM (secondary) | Two NSW Government (Fair Trading) guidance pages | legislation.nsw.gov.au sits behind a bot-check and AustLII answers "Access denied for AI crawlers"; I did not try to get around either. No clause numbers. |
| New South Wales: Community Land Management Act 2021 (community / precinct / neighbourhood schemes) | NOT READ | none | Same blockage; a Fair Trading page for scheme associations was seen in search results but not opened |

Not read at all (listed so nobody assumes coverage): NSW Community Land Management Act 2021; QLD Accommodation / Commercial / Small Schemes / Specified Two-lot modules; VIC Regulations 2018; SA primary legislation (both Acts and their Regulations); WA Regulations 2019 and any post-May-2020 amendments; NT modules 2-5 and the older Unit Titles Act regime; NZ body corporate operational rules.

## Source quality notes
- AustLII (all states) is closed to automated access and was not used. legislation.nsw.gov.au needed a human browser challenge, so NSW is guidance-only.
- Victoria, WA and NT texts came as PDFs the fetch tool saved locally, then converted to text. Quoted section numbers were taken from that text.
- Values marked `confidence: high` are ones where I read the operative sentence in the primary text.

## Engine gaps (law features the product cannot express)
1. **Polls that re-count by unit entitlement and can reverse a show-of-votes result** (NZ ss 99-100, QLD s 110, VIC s 89(3),(5), ACT 3.28-3.29, WA s 122, NSW, TAS s 76(2)).
2. **Special resolution tests that are not a simple percentage**: QLD (two-thirds of votes cast AND at most 25% of lots AND at most 25% of contribution entitlement against), VIC (75% of ALL votes/entitlement, plus "interim special resolution" and a 29-day petition), ACT (against-votes at most 1/4 of votes that could be cast by those present), WA (50% of lots and entitlements in favour, under 25% of each against), NSW and SA (at most 25% against), NT (two-thirds plus 25% cap), NZ (75% of those who vote). The engine has only a base choice (`cast`/`present`/`total`) and no percentage or "against" cap.
3. **Quorum shortfall rules**: interim / reduced-quorum decisions that take effect only after a waiting period unless petitioned (VIC s 78, ACT 3.9-3.11, NT cls 3/34); WA's 30-minute "whoever is present is the quorum"; QLD's adjourned meeting needing the chairperson in person; QLD's floor of 2 voters present personally; NZ's minimum of 2 persons.
4. **Two alternative quorum bases** (NSW: 25% of people OR 25% of entitlements; VIC: 50% of lots, else 50% of lot entitlement).
5. **Extra resolution types**: unanimous, resolution without dissent, unopposed, majority-of-all-lots (QLD, WA, NT, ACT, TAS, SA).
6. **Voting windows that stay open after the meeting** (WA 28 days; TAS 28 days for unanimous resolutions).
7. **Proxy caps that depend on scheme size** (QLD, VIC, ACT, NSW: roughly 1 proxy if under 20 lots, 5% of lots otherwise) and chairperson exemptions.
8. **Notice in working days** (NT) and **two-step notices** (NZ AGM intention + meeting, parent developments longer).
9. **Requisition mechanics that nominate a convener** (VIC) or fix a deadline for the committee to hold the meeting (NSW 14 days, ACT 28 days, QLD 14 days to call and 6 weeks to hold, NZ 5 working days / 3 weeks).
10. **Arrears rules that depend on resolution type** (cannot vote except on unanimous / without-dissent / special) rather than a flat ban.
11. **Remote or pre-meeting electronic voting that needs a prior resolution** and cannot be used for committee elections (NSW), or a body corporate resolution before use (QLD).

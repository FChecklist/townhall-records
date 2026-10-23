# LAW-STUDY: how residential-association meetings and elections are governed

**Research only. NOT legal advice.** Compiled 2026-10-23 for the AOA-RWA rule engine. Nothing here has been reviewed by a lawyer. Every number must be re-checked against primary text before the engine relies on it. Confidence and `needsLawyer` flags for each value are in `rule-packs.json`. Source lists are in `SOURCES.md`; privacy and retention are in `DPDP-AND-RECORDS.md`; open decisions are in `OPEN-QUESTIONS.md`.

**How to read the evidence.** "Primary" = statute, rule, bye-law or gazette text read in this study. "Secondary" = law-firm, press, forum or case-summary pages. The US statute pages were read through a fetch tool that returns summaries (and through public.law mirrors), because the official legislature sites refused connections, so US figures need a spot-check. The Maharashtra 2026 Rules were read through a TaxGuru reproduction, not the gazette.

**Product context noted (not legal findings).** Pricing: Rs 199 per meeting / Rs 499 per election (India); $5 per meeting / $15 per election (US and global); payment via IT Services by Rajat Agarwal. Members cast their own votes online, 100% secret ballot, with a host-set voting window (extendable in 30-minute steps, manual stop or auto timer) and two voter kinds (official voter, proxy voter). That makes *remote electronic secret voting* the most legally sensitive feature (section 4 and `OPEN-QUESTIONS.md`).

---

## 0. Findings that matter most

1. **Electronic voting is explicitly lawful in the three US states studied, with conditions** (CA Civ. 5105/5110/5115; FL 720.317; TX 209.00592): consent or opt-in, identity authentication, receipt, secret-ballot separation, advance notice, and in CA an independent inspector of elections. In India **no primary text permitting remote e-voting was found** for UP or Maharashtra committee elections; Maharashtra's 2026 Rule 106C-13(3)(b) proviso permits *video-conference participation* in general bodies only.
2. **Maharashtra changed in June 2026.** The Maharashtra Co-operative Societies (Amendment) Rules 2026 (notified 18 Jun 2026, per a secondary reproduction) insert housing-society rules (Rule 106C-13): quorum two-thirds or 20, 5 clear days for an SGM, adjourned meetings with no quorum, video-conference attendance. New model bye-laws are expected, so old bye-law numbers may be superseded. Elections run under the Election Rules 2014: secret ballot or EVM, **no proxy**.
3. **UP and the Societies Act give almost no default meeting rules.** The UP Model Bye-laws (2011) set quorum 30% in person, 2 to 7 days notice, adjourned quorum of two after 48 hours, but no returning officer, no minutes deadline, no retention period. A UP RWA under the 1860 Act is governed by its own filed bye-laws, so the engine must let each society enter its own bye-law values.
4. **Quorum, notice, proxy and majorities differ widely**, so they must be parameters, never constants.
5. **Two of the owner's requirements collide with law or with each other** (see section 4): "100% secret ballot" vs the host seeing "voter name, flat, voted YES/NO"; a proxy voter in Maharashtra elections (proxy barred); "publish everything" vs DPDP.

---

## 1. Comparison table

Values are as verified in this study; "not found" = not verified. Citations are in the regime sections below.

| Parameter | UP AOA (2011 Model Bye-laws) | UP RWA (Societies Act 1860) | Maharashtra co-op housing society | US generic (Minnesota UCIOA text; RONR) | California | Florida | Texas |
|---|---|---|---|---|---|---|---|
| Instrument | UP Act 16 of 2010 s.14; Model Bye-laws 16 Nov 2011 | Societies Registration Act 1860 as amended in UP; society's own bye-laws | MCS Act 1960; Rules 1961 incl. 2026 Amendment Rules; 2014 model bye-laws; Election Rules 2014 | Minn. Stat. 515B (1993 UCIOA text); RONR 12th | Davis-Stirling (Civ. 4000+), Corp. Code 7510-7512 | Fla. Stat. ch. 720 | Tex. Prop. Code ch. 209 |
| Annual meeting | Yes; first quarter of financial year (bye-law 13) | By society's rules | Yes; by 14 Aug or extended period (95) | At least yearly | Per documents/election cycle | Per documents | Per documents |
| Special meeting called by | President on Board resolution, majority-of-owners petition, or competent authority (14) | Society rules | Chairman/majority of committee; or on requisition of 1/5 of members within one month (97-99) | President/board; or owners with 20% of votes | Board, president, or 5% of members (Corp. 7510) | Board or 10% of voting interests | Not found |
| Notice | 2 to 7 days (15) | Not set by Act | AGM 14 clear days (100); SGM 5 clear days (100; 2026 Rule); redevelopment SGM 14 clear days | Annual 21-30 days; special 7-30 days | 10-90 days (Corp. 7511); election notices 30 days (5115) | 14 days (720.306) | 10-60 days (209.0056) |
| Quorum | 30% of owners in person (9) | Not set by Act | 2/3 of members or 20, whichever less (101; Rule 106C-13(3)) | >20% of votes; RONR: majority of members if silent | Only if documents require; reconvened election meeting 20% (5115) | 30% of voting interests unless lower (720.306) | Not found |
| Adjourned quorum | 2 owners in person after at least 48 hours (16) | n/a | None; adjourned 7-30 days, agenda transacted (102-103) | Not found | 20% at reconvened election meeting | Not found | Not found |
| Voting weight | By unit percentage (8); first-named joint owner votes (5) | By society rules | One member one vote (s.27, secondary); joint holders: first-named | One vote per unit; co-owners must agree | By documents | By voting interest | By documents |
| Defaulters | Cannot vote or stand if arrears over 60 days (7) | n/a | Committee disqualification: dues default 3 months after notice (118) | Voting bar for unpaid assessments void (Minn.) | Nominee may be disqualified for delinquent assessments only (5105) | Delinquent members cannot run | Bar on voting void (209.0059) |
| Proxy | Ambiguous (bye-law 10 mentions "in person or proxy") | n/a | No proxy (105); none in elections (Rule 33) | Only if bylaws allow | Only if bylaws allow; cannot replace ballot (5130) | Allowed unless documents forbid; dated; expires 90 days after meeting | Must be offered (209.00592) |
| Majority | Majority of owners casting votes (10); 2/3 of units plus approval to amend bye-laws (58) | Society rules; 3/5 for purpose change/dissolution (secondary) | Simple majority present and voting (107); 2026 Rule "51% of total members present" (ambiguous) | Per documents; RONR: votes cast; 2/3 = double the negative | Majority of voting power represented and voting (Corp. 7512) | Majority of voting interests present; amendments 2/3 | Not found |
| Voting method | Ballot for Board election (13) | Society rules | Secret ballot or EVM for elections (Rule 33); secret ballot if share capital over Rs 10,000 (116) | Per documents | Mandatory secret ballot for elections (5100) | Per documents; plurality for directors | Written signed ballot; absentee/e-ballot (209.0058, .00592) |
| E-voting / e-meeting | Not found (unclear) | Not found (unclear) | Meetings: VC allowed (2026 Rule 106C-13(3)(b)); remote e-voting: not found | Minnesota allows electronic ballot in lieu of meeting | Yes (5105) | Yes (720.317) | Yes (209.00592) |
| Election officer | None in model bye-laws; Registrar may run (Societies Act s.25) | Registrar fallback (s.25) | Returning Officer; SCEA; societies under 200 members elect at SGM with SCEA-appointed presider (Rules 2014 r.76) | Tellers (RONR) | Independent inspector(s) of elections (5110, 5120) | Per documents | Candidates/relatives cannot tabulate (209.00594) |
| Term | 1 year; 1/3 retire annually (26) | Society rules | 5 years (116, 122) | Per documents | Max 4 years (5100) | Per documents | Per documents |
| Tie-break | None | None | Lots before Returning Officer (Rule 63) | RONR: tie loses | Not addressed | Not found | Not found |
| Minutes | Two minute books; no deadline (21) | Filing duties (ss.4, 4A, 4B) | Draft finalised within 3 months (109) | Not found | Available within 30 days (4950) | Not found | Minutes kept 7 years |
| Retention | None found | None found | None found | None stated ("adequate records") | Election materials 1 year (5200) | Official records 7 years; ballots 1 year (720.303) | Minutes 7 yrs; financials 7 yrs (209.005) |
| Member inspection | Financials open to members (49(4)) | Registry documents public (s.19, secondary) | Bye-law 23; s.32 | Yes, copies at cost | Yes (5200, 5210) | Within 10 business days | Within 10 business days (209.005) |

## 2. What is common (generic engine parameters)

- **Meeting kinds:** annual/ordinary general, special/extraordinary general (callable by board or by a member-requisition threshold), committee/board.
- **Notice:** minimum days per kind; content (date, place or link, purpose/agenda); delivery channels; special-meeting business limited to noticed items.
- **Quorum:** a fraction of members or votes; what counts toward it (in person, remote, proxy, absentee ballot); separate adjourned or reconvened quorum.
- **Voting weight model:** one member one vote; one vote per unit; by area/percentage share; joint-owner rule; defaulter bar.
- **Proxy:** forbidden / allowed / only if bylaws allow; form, expiry, limit per holder.
- **Resolution classes:** ordinary, special (two-thirds, three-quarters, "51% of total"), bye-law amendment, removal of officers; each with a base (votes cast / present / total).
- **Voting method:** show of hands, poll, ballot, secret ballot, electronic; secret ballot for elections in most regimes.
- **Election roles:** returning officer or inspector, nominations, scrutiny, withdrawal, tie-break, term, eligibility, reservations.
- **Record duties:** minutes deadline, signing, member access, retention years, inspection response time.
- **Remote participation:** off / video attendance / remote voting, with identity verification and receipt.

**Design implication:** make every parameter nullable, and let a society record its own bye-law values. The packs are defaults and checklists, not authority.

## 3. Regime studies

The following sections are the detailed per-regime findings with citations (retrieved 2026-10-23).

EOF
echo ok
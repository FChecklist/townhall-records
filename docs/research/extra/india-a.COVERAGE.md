# Coverage: india-a (compiled 2026-10-24). Research only, not legal advice.

Status key: READ-HIGH = operative sentences read in primary text; READ-MEDIUM = read in a reproduction/summary of the statute; READ-LOW = only identified or partly summarised; NOT READ = nothing usable obtained. "Pack" = entry in `india-a.json` (18 packs, all load through `parseCustomPack`).

Reading method: Indian Kanoon Act pages (read through a summarising fetch tool, so section figures are second-hand; each page says the original gazette "could not be verified"), PRS-hosted PDFs (Goa, Bihar; text extracted locally, so read directly), and a Himachal government rules PDF. India Code and most state sites returned HTTP 403/504.

## Central layer
| Regime | Status | Pack | Instruments found | Blocker / note |
|---|---|---|---|---|
| RERA 2016 (association of allottees) | READ-MEDIUM (s.11(4)(e) default = HIGH) | in-central-rera | RERA s.11(4)(d),(e),(f), s.17, s.19(5) | **s.4(2)(l)(d) is the 70% bank-account rule, not association-related** - recorded in the pack. RERA has no meeting/election rules. State RERA rules (which may fix association timelines/model bye-laws) not read for any state here. |

## States and UTs
| Regime | Status | Pack | Instruments found | What blocked me |
|---|---|---|---|---|
| Karnataka - Apartment Ownership Act 1972 | READ-MEDIUM | in-ka-apartment-act | Act ss.3, 11, 16, 24 | No model bye-laws / Rules found. Act gives no notice or quorum numbers (default quorum = majority). |
| Karnataka - Co-operative Societies Act 1959 | READ-LOW | in-ka-coop-act | ss.20-21, 26-29F, Ch. VA | Copy may predate later amendments; Rules 1960 and housing model bye-laws not found (notice and quorum missing). |
| Karnataka - Societies Registration Act 1960 | READ-MEDIUM | in-ka-societies-reg-act | ss.3, 11, 13 | No notice/quorum in Act; bye-laws not read. |
| Haryana - Apartment Ownership Act 1983 + Rules 1987 model bye-laws | READ-MEDIUM | in-hr-apartment-act | Act ss.3, 16, 24; 56 model bye-laws | OCR text; template blanks (Board size, first AGM). |
| Haryana - Registration and Regulation of Societies Act 2012 | READ-MEDIUM | in-hr-societies-act-2012 | ss.20, 29-31, 33, 36-40 | Last ~13k chars unread; RWA applicability only from a search snippet. |
| Haryana - Co-operative Societies Act 1984 | READ-LOW | in-hr-coop-act | ss.20-21, 25-26, 28 | Rules 1989 and model bye-laws not read; second half of Act unread. |
| Gujarat - Ownership Flats Act 1973 | READ-LOW | in-gj-flats-act | ss.10, 11, 31, 39 | Gujarat Rules 1972 not found; "majority" definition not read. |
| Gujarat - Co-operative Societies Act 1961 | READ-LOW | in-gj-coop-act | ss.28, 33, 73-78 | Rules 1965 and housing model bye-laws not read (notice, quorum); a blog's "two-fifths or 25" quorum is unverified and NOT used. |
| Andhra Pradesh - Apartments Act 1987 | READ-LOW | in-ap-apartments-act | ss.3, 14, 18, 31 | AP Rules 1987 not read. |
| Andhra Pradesh - Co-operative Societies Act 1964 / Rules / Mutually Aided Act 1995 | NOT READ | - | Rule 23 (quorum) and s.32 identified only | No text obtained; search returned only judgments. |
| Goa - Co-operative Societies Act 2001 + Rules 2003 | READ-HIGH (primary text) | in-ga-coop-act | ss.28, 58-60, 66, 72-73; rules 45-47 | Housing model bye-laws (notice days, quorum) not found; post-copy amendments not checked. |
| Goa - flat/apartment ownership law | NOT READ | - | 1993 "Goa Flats Ownership Regulation Bill" exists | Scanned image PDF, unreadable; unknown whether enacted. |
| Chandigarh (UT) | NOT READ | - | Punjab Co-operative Societies Act 1961 applies per India Code listing; Chandigarh Apartment Rules 2001 repealed 1 Oct 2007; CHB RWAs formed under Chandigarh Housing Board regulations (1979) per a cause list | Punjab Act PDF downloaded but text layer was garbled/empty; CHB RWA notice was a scanned image. No Chandigarh figures recorded. |
| Assam - Co-operative Societies Act 2007 | READ-LOW | in-as-coop-act | ss.31, 32, 39, 41 | Quorum, notice, requisition not shown; Rules not read. |
| Assam - Apartments (Construction and Transfer of Ownership) Act 2006 | NOT READ | - | Name only (from a Gauhati HC case) | Text not found. |
| Bihar - Apartment Ownership Act 2006 | READ-HIGH (primary, PRS copy) | in-br-apartment-act | s.23 etc. | No model bye-laws or Rules found; no numbers in the Act. Bihar co-operative law not read. |
| Chhattisgarh - Prakoshtha Swamitva Adhiniyam 1976 | READ-LOW | in-cg-apartment-act | s.3, 16 (summary) | Summary-level only. |
| Chhattisgarh - Co-operative Societies Act 1960 | READ-LOW | in-cg-coop-act | ss.22-23, 28, 48-50B | Member notice days and general quorum missing; Rules not read. |
| Himachal Pradesh - Apartment Ownership Act 1978 | READ-LOW | in-hp-apartment-act | s.16 only | India Code/state PDF 404; only s.16 summary read. |
| Himachal Pradesh - Co-operative Societies Rules 1971 (+ Act 1968) | READ-MEDIUM (Rules); Act NOT READ | in-hp-coop-act | Rules 25-39, 44-48 (to Feb 2009) | Act ss.31-37 (requisition share) 403; Appendix A (election rules) unread. |
| Jharkhand - Apartment (Flat) Ownership Act 2011 / Apartment (Property Regulation and Ownership) Act 2005 | NOT READ | - | Both Acts identified by name (India Code lists 2011; Jharkhand HC cites s.10(4) of the 2011 Act) | Act text not retrievable (Hindi scan; India Code 403). Jharkhand co-operative law (Bihar 1935 Act as adapted) not looked up. |
| Arunachal Pradesh - Co-operative Societies Act 1978 | READ-LOW | in-ar-coop-act | ss.27, 36, 73, 76-77 | Committee term/size/election/quorum not in portion read. No Arunachal apartment ownership law found. |
| Andaman and Nicobar Islands | NOT READ | - | None | No current source found at all (only a 1965 Rajya Sabha note). |
| Dadra and Nagar Haveli and Daman and Diu | NOT READ | - | DNH&DD Co-operative Societies Regulation 2024 (replaced Maharashtra/Gujarat Acts there, per a news report); Model Bye-Laws for cooperative housing issued 25 May 2026 (TeamLease summary); 2026 societies registration regulation (news) | Primary documents on ddd.gov.in not opened; summary page gave no figures. |

Counts (regimes in the assignment, 25 rows above): READ-HIGH 2 (Goa co-op, Bihar apartment) + RERA's s.11(4)(e); READ-MEDIUM 6; READ-LOW 10; NOT READ 7.

## Which regime is the common one
Not established by any source read for any state. Evidence only says: Karnataka advocates mention all three of AOA Act, Societies Act and co-operative society; a search snippet says Haryana RWAs register under the 2012 societies Act. Do not present any of these as "the" regime without the Organizer confirming from their registration certificate.

## Engine gaps (features the law has that the product cannot express)
- Requisition of the form "X members or one-fifth, whichever is less" (Karnataka s.28), or "one-fifth or lower number in bye-laws" (Gujarat s.78, Arunachal s.77).
- Quorum with a member-count switch ("one-third or 50 if up to 500 members; or 100 if above", Himachal r.30) and "one-fifth or 30, whichever less" for the adjourned meeting.
- Adjournment to "later the same day OR at least 7 days later" (Goa r.46(6)); requisitioned meetings dissolved rather than adjourned (Himachal r.30(3)(b)).
- Staggered board retirement (one-third retire yearly) and AGM-deadline rules (nine months / six months / 18 months), plus automatic dissolution of the board for a missed AGM (Assam s.39).
- Special majorities as percentages (three-fifths of those present with 40% quorum, Haryana 2012 Act; 75% of value to amend bye-laws and four-fifths for out-of-notice business, Haryana model bye-laws).
- Arrears-based voting bars (60 days in arrears, 30-day notice defaulters), external election authorities (Registrar, State Co-operative Election Commission), election by secret ballot only for board elections, show-of-hands as the default method, permanent record retention.
- Co-opted members and Collegium (delegate) systems; communication-of-minutes deadlines (45 days to invitees).

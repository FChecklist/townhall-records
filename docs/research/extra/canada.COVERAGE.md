# Canada coverage (compiled 2026-10-24)

Region key: `canada`. Output: `canada.json` (9 research+engine pairs, all 9 engine blocks load through `parseCustomPack`). Research only, not legal advice.

| Regime | Status | Instruments found | What blocked / weak |
|---|---|---|---|
| Ontario | READ-HIGH | Condominium Act 1998 (ss.27-34, 45-55 read live on ontario.ca), O. Reg. 48/01 (ss.12.2, 13, 13.1 read) | Reg. s.16.1 proxy form table, record-inspection regulation, by-law defaults not read. The page also carries amendments to be proclaimed (page says 31 Dec 2026): rerun after that day. |
| British Columbia | READ-HIGH (Act) / READ-MEDIUM (engine) | Strata Property Act Part 4 (ss.25-65), Schedule of Standard Bylaws, Regulation Part 4 (retention) | Meaning of "majority vote" (s.1) and which items need 3/4/80%/unanimous not collected. Term, secret ballot, casting vote are standard-bylaw values that a strata may replace. |
| Alberta | READ-HIGH (Act) / READ-MEDIUM (engine) | Condominium Property Act (current 14 May 2026), Regulation AR 168/2000 (Part 2.2 proxies, Schedule 4 default bylaws) | Quorum, term, notice extras are DEFAULT bylaws (Act s.33) and many corporations have their own. Owner-inspection section and board-meeting bylaws not pinned down. Bare-land condominiums use the same Act; no separate rules found. |
| Quebec | READ-LOW | CCQ arts. 1038 ff. via ONE secondary law-firm summary (Fiset Legal) | LegisQuebec and CanLII return 403 / bot challenge; Protegez-vous is behind a Cloudflare challenge (not bypassed). Adjourned-meeting quorum: sources conflict (3/4 vs 1/4), left blank. Majorities worded differently by different sources, not coded. Condominium Regulations not read. |
| Manitoba | READ-HIGH | The Condominium Act C.C.S.M. c. C170 (Part 6, ss.110-131) from the official bilingual PDF | Ordinary-meeting notice days are NOT in the Act (probably regulation/by-laws): not found. Regulations (records, retention, electronic meetings detail) not read. Default director term not stated. |
| Saskatchewan | READ-HIGH (Act) / READ-MEDIUM (engine) | Condominium Property Act 1993 (incl. 2024 c.4), Regulations 2001 Appendix Part II default bylaws | Notice, quorum, requisition, term are DEFAULT bylaws; corporations may have their own. |
| Nova Scotia | NOT READ | none | nslegislature.ca connection failed from this machine; no mirror found. |
| New Brunswick | NOT READ | none | laws.gnb.ca behind a Cloudflare challenge (not bypassed); no mirror found. |
| Newfoundland and Labrador | READ-MEDIUM | Condominium Act 2009 (House of Assembly consolidation) | The Act text has no meeting-notice or owner-requisition rule; regulations not read, so those are blank. |
| Prince Edward Island | READ-MEDIUM | Condominium Act c.C-16 (consolidation to 1 Mar 2024) | Short Act: no quorum, proxy or voting-method rule; left to declaration/by-laws. Regulations not read. |
| Yukon | NOT READ | none | laws.yukon.ca and yukon.ca behind a Cloudflare challenge. A search-result excerpt (not opened) of a Yukon government fact sheet said: notice 14 days, quorum 1/3 of unit votes, 20% can require a special meeting. Unverified; recorded only in `_notReadRegimes`, not in any engine block. |
| Northwest Territories | READ-LOW | Condominium Act RSNWT 1988 c.C-15 via a third-party mirror (laws.opennwt.ca) | Official Justice PDF URL returned 404. Act leaves notice, quorum, requisition and term to the declaration/by-laws. Regulations R-002-2016 not read. Engine block is almost empty on purpose. |
| Nunavut | NOT READ | none | nunavutlegislation.ca returned 403. |

Counts: READ-HIGH 5 (ON, BC, AB, MB, SK, where the Act itself was read; BC/AB/SK engine confidence set to medium because of by-law defaults), READ-MEDIUM 2 (NL, PE), READ-LOW 2 (QC, NT), NOT READ 4 (NS, NB, YT, NU).

## Engine gaps (law features the product cannot express)
- Special-majority thresholds (2/3, 3/4, 75% of persons AND 75% of unit factors, 80% written consent): there is no threshold setting, only majority basis (AB, BC, SK, NL, PE, NT, MB, QC).
- Preliminary notice before the notice of meeting (ON: 20 days; AB default bylaw: 60 days) with a candidate and agenda-item deadline.
- Quorum that falls on a later "attempt" (ON AGM third attempt 15%) and adjournment-based quorums (BC, AB, SK, MB: next week, then whoever is present).
- Owner vote versus unit-factor vote demanded on request (AB, SK); schedule of voting rights (BC); voting weight set in the declaration (MB, NT).
- Arrears bar on voting (ON, AB, SK, NT automatic; BC, MB by by-law) with warning notice (SK 10 days).
- Secret ballot on request of one voter (BC standard bylaw, QC art. 351) is not a plain yes/no.
- Proxy rules beyond a count: 6-month expiry, no proxy to managers/employees (AB, SK, MB), latest proxy wins (AB).
- Reserved board seats for owner-occupiers (ON) and developer-controlled boards (NL, NT, MB, PE).
- Director removal thresholds (ON more than 50% of all units; NL majority of votes cast).
- Different retention periods per record type (ON permanent / 7 years / 90 days).
- Quorum counted on common-element share while voting is one vote per unit (NL).
- Vote reduction rules for dominant owners / developers (QC arts. 1091-1092).
- Electronic voting must be anonymous (NL) and verified (MB): no setting for these conditions.

## Honest weak spots
- Quebec: no primary text at all; every figure is a lead to verify. Engine block is marked low.
- All provincial defaults that come from default bylaws (BC, AB, SK) apply only if the corporation has not registered its own; the Organizer must check.
- Ontario will change on a proclamation day (page states 31 Dec 2026); the current-law values here may need re-reading then.
- Ontario/BC/Manitoba pages were read through the browser tool (JavaScript pages); Alberta, Saskatchewan, Manitoba, PEI, NL texts were downloaded and text-extracted from official sites.

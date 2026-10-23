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
### Uttar Pradesh: AOA and RWA meeting/election law (research draft)

Retrieved 2026-10-23. Research only, not legal advice. The Model Bye-laws (primary) were read in full. The Act text itself and the 2011 Rules could NOT be fetched (India Code returned HTTP 403, greaternoidaauthority.in unreachable); statements about them are from secondary summaries and are labelled.

#### 1. UP Apartment (Promotion of Construction, Ownership and Maintenance) Act 2010 (UP Act 16 of 2010)

**Instruments**
- Act 16 of 2010; s.14 = Association of Apartment Owners (AOA). Secondary summary of s.14 (https://indiankanoon.org/doc/91371337/): (1) AOA administers apartments/common areas; (2) promoter and owners jointly form it, promoter registers it once enough apartments are handed over (original text 33%, text substituted by UP Act 30 of 2016 says 60% - one search result says the 2016 amendment was not notified in force; not verified); (3)-(4) owners must join; (5) management passes from promoter to AOA; (6) Government may frame model bye-laws, AOA adopts bye-laws at its first meeting based on them, departure only with prior approval of the competent authority; (7) model bye-laws must cover board election/composition, meetings, officers etc., including "one-third of members of the Board shall retire annually"; (8) optional extra bye-laws (audit, general meetings, annual reports).
- Model Bye-laws, notification no. 3977/8-1-11-115D.A./02T.C.-1, Lucknow, 16 Nov 2011, made under s.14(6): https://up-rera.in/pdf/Model-By-Laws.pdf (PRIMARY, 58 bye-laws, read in full). Bye-law 55: the Act prevails over any conflicting bye-law.
- AOA registration: Allahabad HC, *Management Board, Windsor Park v. State of UP* (11 Mar 2019, https://indiankanoon.org/doc/92753425/, secondary summary): Act silent on registering authority; AOA registers with the Registrar under the Societies Registration Act (not a society in the strict sense); the Societies Act s.25(2) Registrar election-meeting power was held usable; Board is a continuing body with annual one-third retirement.
- UP Apartment Rules 2011: reported (secondary) as notified 16 Nov 2011 under s.30; text not read. Rule-level provisions on meetings/elections: not verified.
- UP Ownership of Flats Act 1975 and UP RERA: relevance not verified (not checked whether the 2010 Act repealed/overlaps the 1975 Act; no RERA association-meeting provision read).

**Meetings (Model Bye-laws)**
| Item | Rule | Bye-law |
|---|---|---|
| Annual meeting | Date decided by the Association; AGM held in first quarter of each financial year; elects the Board by ballot | 13, 26(i) |
| Special meeting | President must call on Board resolution, or petition signed by a majority of owners presented to Secretary, or request of the Competent Authority | 14 |
| Business at special meeting | Only as stated in notice, else consent of two-thirds of owners present in person | 14 |
| Notice | Secretary mails/sends to each owner at least 2 days but not more than 7 days before; also to competent authority/registrar; states purpose, time, place | 15 |
| Place | Suitable place convenient to owners | 12 |
| Quorum | Presence in person of 30% of owners | 9 |
| Adjourned | If no quorum, adjourn to not less than 48 hours later; then owners present in person, not less than two, are quorum | 16 |
| Chair | President (VP in absence; else Board appoints) | 19, 20 |
| Order of business | roll call, proof of notice, minutes, reports, Board election, etc. | 17 |
| Board meetings | Regular: at least 2/year, 3 days notice; special: 3 days notice, President or on written request of 3 office bearers; quorum one-third, adjourned minimum 3; first meeting within 10 days of election | 29-33 |

**Voting**
- Weightage: "percentage basis", percentage assigned to the unit(s) in the Declaration (bye-law 8); not one-flat-one-vote by default.
- Joint owners: only the first-named person votes (5). Each owner holds at least one share (6).
- Votes "cast in person"; resolutions need "majority of owners casting votes in person or proxy" (10). "Majority" of owners = holders of 51% of the votes (2(e)). There is an internal tension (cast votes vs 51% of all votes) and no proxy form or limit is given: lawyer flag.
- Special majorities: two-thirds of owners present for unnoticed business (14); two-thirds of total units plus prior competent-authority approval to amend bye-laws (58); removal of office bearers by majority of owners after hearing (28); Board of 4-10 elected "by simple majority in the General Body Meeting" (18).
- Defaulters: not entitled to vote or stand for Board/office-bearer posts if in arrears of common-expense contributions for more than 60 days on the last day of the year preceding the election year (7).
- Method: Board elected "by ballot" (13); secrecy not stated.

**Elections and term**
- Board 4-10 members; President, VP, Secretary, Treasurer elected by and from the Board (18), though 26(i) speaks of the AGM electing 4-10 members "including" those four (an ambiguity Windsor Park read together).
- Term of office bearers one year from assuming office, re-eligible, but not the same post continuously more than 2 years; one-third of the Board retires annually; hold office until successors elected and held first meeting (26). Ineligible if found guilty of misusing the post in previous term.
- Casual vacancies filled by remaining office bearers until next annual meeting (27).
- No returning officer, nomination, scrutiny, withdrawal or tie-break provisions exist in the model bye-laws. Fallback: Registrar may call and conduct an election meeting (Societies Act as applied in UP, s.25(2), see section 2).

**Minutes, records, inspection**
- Secretary keeps two minute books (Association and Board), pages consecutively numbered and authenticated by the President (21). No deadline for minutes, no retention period.
- Audited financial statement published by 31 July, to competent authority by 15 Aug, summary to each owner within 15 days (49(3)-(6)); open to inspection of any member in office hours (49(4)); auditor appointed at general meeting (51). Bye-law 49(2): per-owner passbook.

**Online/hybrid**: no provision for e-meetings, e-voting or video conferencing in the model bye-laws or in any UP source found. Electronic allowed: unclear (default assume not).

#### 2. RWAs under the Societies Registration Act 1860 (UP)

**Instruments**
- Central Act 21 of 1860: read only via secondary reproductions (India Code PDF not retrievable). It contains no general quorum/notice/voting rules; those live in each society's own rules (s.2-3). Secondary text: s.4 annual list of managing body filed within 14 days after the AGM (or January if no AGM); s.12 purpose alteration (special meeting, notice ten days, three-fifths, second meeting a month later); s.13 dissolution three-fifths; s.19 public inspection of documents filed with Registrar (fee). Section 12/13 details are secondary only.
- UP amendments (primary, read): https://indiankanoon.org/doc/343062/ and https://prsindia.org/files/bills_acts/acts_states/uttar-pradesh/1975/1975UP52.pdf (contains the 1975, 2013 and 2022 Acts):
  - s.4: annual list; UP proviso (Act 11/1984): old members' countersignature, else Registrar may issue notice inviting objections. s.4(2) (Act 52/1975): memorandum and rules corrected up to date to accompany the list.
  - s.4A (Act 52/1975): changes in rules and address certified by not less than three governing-body members sent to Registrar within 30 days.
  - s.4B (Act 23/2013, amended UP Act 8/2022): list of General Body members (name, father's name, address, occupation) filed at registration/renewal; Registrar checks against register of members, minutes book, cash book, receipt book, bank passbook; modified list within one month of any change, signed by two office bearers and two executive members; a change is valid only if approved by the Managing Body.
  - s.12A (Act 52/1975): name change by resolution at a general meeting with consent of not less than two-thirds of total members.
  - s.16-A (substituted by UP Act 8/2022): disqualification for governing body/office from judgment date: undischarged insolvent; conviction for offences in management of society/body corporate or moral turpitude; any criminal offence with punishment of 2 years or more.
  - s.25 (Act 52/1975): prescribed authority decides election disputes on Registrar's reference or at least one-fourth of members; if an election was set aside, or not held within the time in the society's rules, Registrar may call a general body meeting to elect, presided over by Registrar/authorised officer, applying the society's own meeting and election rules with necessary modifications; no other authority may call another election meeting. UP Act 8/2022 added appeal to the Divisional Commissioner within one month.
  - s.5A (UP Act 8/2022): transfer of society immovable property needs prior court approval.
- No official UP RWA model bye-laws found; Delhi/other RWA model bye-laws not read. So meeting types, notice, quorum, adjourned quorum, proxies, majorities, voting method, minutes deadline, retention, member inspection and defaulter rules for a UP RWA all come from the society's own filed bye-laws: the pack leaves them null.
- Online/hybrid: no UP Registrar order or UP/central provision found. Unclear.

#### Sources read
- https://up-rera.in/pdf/Model-By-Laws.pdf : full text of 2011 UP Model Bye-laws (primary).
- https://indiankanoon.org/doc/91371337/ : summary of s.14 of UP Act 2010 (secondary text of statute; paraphrased only).
- https://indiankanoon.org/doc/92753425/ : Windsor Park judgment summary (registration, Board continuity, s.25(2)).
- https://indiankanoon.org/doc/343062/ : s.4 of Societies Act with UP amendments (4, 4A, 4B).
- https://prsindia.org/files/bills_acts/acts_states/uttar-pradesh/1975/1975UP52.pdf : gazette text of UP amendment Acts 1975, 2013, 2022 (OCR text; ss.4, 4A, 4B, 12A, 16-A, 25, 5A).
- Search-result summaries only (not opened): India Code Act PDF, up-rera.in/pdf/45459draft.pdf (scanned draft, not readable), industries.delhi.gov.in registration-act, aaptaxlaw.com s.19, prashantkanha.com, nobrokerhood.com.

#### Could not verify
- Verbatim text of the UP Apartment Act 2010 beyond a secondary summary of s.14; other sections on records/inspection/penalties; whether UP Act 30 of 2016 is in force.
- UP Apartment Rules 2011 contents (election/meeting rules, if any).
- UP Ownership of Flats Act 1975 and UP RERA relevance.
- Central Societies Registration Act text (ss.1-3, 12, 13, 19) from a primary source; UP rules/orders on RWA election procedure; any UP official RWA model bye-laws.
- Any UP rule or order on e-meetings/e-voting/video conferencing for AOAs or societies (none found).
- Whether the model bye-law 14 notice window (2 to 7 days) is applied as written by competent authorities; whether practice requires longer notice.

### Maharashtra: housing society general meetings and elections (research draft)

Retrieved 2026-10-23. RESEARCH ONLY, NOT LEGAL ADVICE. Nothing below is a quote of a consolidated Act; section numbers were taken from the texts listed under "Sources read". Where I saw only secondary summaries I say so.

#### 1. Headline finding: new June 2026 housing rules

The Maharashtra Co-operative Societies (Amendment) Rules, 2026 (notified 18 June 2026 under s.165) insert Chapter XI-B, Rules 106C-1 to 106C-14, for housing societies. Rule 106C-13(3) now sets general body rules directly (TaxGuru reproduction of the notification, https://taxguru.in/corporate-law/maharashtra-co-operative-societies-amendment-rules-2026.html; gazette PDF itself not seen):

- Participation "either in person or through video conferencing or other audio visual means, to be provided by the society", capable of recording and recognising participation and storing proceedings with date and time (106C-13(3)(b) proviso).
- AGM every year per s.75; notice and agenda per Act and bye-laws (106C-13(3)(c),(d)).
- Quorum for AGM or SGM: two-thirds of total members or twenty, whichever is less. No quorum within half an hour: a requisitioned meeting is dissolved; otherwise adjourned to a later hour same day/place (if stated in notice) or to a date not earlier than 7 and not later than 30 days, and the original agenda is transacted whether quorum is present or not.
- Decisions: "majority vote of fifty-one per cent of the total members of the society present, including those attending through video conferencing" (wording ambiguous).
- SGM under s.76: 5 clear days notice.
- Redevelopment SGM: 14 clear days, quorum two-thirds of total members, Registrar's representative present, video recording kept by the Chairman with a copy at the Asst/Dy Registrar's office; developer/contractor selected by 51% of total members including video attendees; registrar's representative files a factual report. A practitioner (Free Press Journal, 21 Jul 2026) notes the 2/3 quorum conflicts with the "adjourned meeting needs no quorum" rule.
- Rule 106C-13(1)(b),(c): the Registrar will issue NEW model bye-laws; societies may adopt within three months of publication. I did not find them. Bye-law numbers below are the 2014 model.
- Casual vacancy: committee may co-opt after 7 days' notice-board call for nominations (106C-13(4)).

#### 2. 2014 model bye-laws (copy of the official text)

Source: https://adda.io/blog/wp-content/uploads/2022/02/maharashtra-co-operative-housing-society-bye-laws.pdf (49 pages, read in full text). The official sahakarayukta.maharashtra.gov.in PDF URLs returned a server error. Numbering differs between published copies (some secondary sources cite quorum as bye-law 100; here it is 101).

| Topic | Bye-law | Content |
|---|---|---|
| AGM timing | 95 | on or before 14 Aug or the extended period under s.75(1) |
| AGM business | 96 | minutes, report/accounts (Form N), audit memorandum, election result, auditor appointment |
| SGM | 97-99 | Chairman or majority of Committee; within one month of written requisition by 1/5th of members, Registering Authority or Federation; only noticed business |
| Notice | 100 | AGM 14 clear days; SGM 5 days; emergency shorter notice only if Committee unanimous, reasons in writing, decision circulated in 2 days |
| Quorum | 101 | 2/3 of members or 20, whichever less |
| Adjournment | 102-103 | half-hour wait; requisitioned meeting dissolved; else adjourned 7 to 30 days with no quorum; unfinished agenda postponed up to 30 days |
| Chair | 104 | Chairman presides; if absent/unwilling, members elect one |
| Proxy | 105 | none; no POA or authority-letter holder may attend |
| Votes | 106-108 | one vote per member, associate in member's absence, Chairman's casting vote; simple majority of those present and voting unless Act/Rules/bye-laws say otherwise; s.27 governs |
| Minutes | 109 | committee finalises draft within 3 months; circulate within 15 days; members comment within 15 days; final recorded |
| Rescission | 110 | no resolution cancelling an earlier one within 6 clear months |
| Inspection | 23 | free inspection per s.32(1); copies per s.32(2) on fee (bye-law 172) |
| Committee size | 115 | 5/7/9/11 including women seats (s.73BBB) |
| Elections | 116 | every 5 years; secret ballot if paid-up share capital over Rs 10,000 |
| Disqualification | 118 | moral turpitude (6 yrs), dues default 3 months after written notice, ss.79/88/85 liability, unauthorised subletting/sale of shares, associate without NOC |
| Term | 122, 126 | 5 years; officers 5 years max term of committee |
| Committee meetings | 127-136 | quorum 3/4/5/6; monthly; 3 clear days notice; 1/3 requisition within 7 days; casting vote |

#### 3. Elections: Election to Committee Rules 2014

Source: Gazette notification dated 11 Sep 2014, copy at https://consumerresourcesin.files.wordpress.com/2014/10/election_rules_final.pdf (read). Key points: SCEA authority (r.3), type classification (r.4: housing societies with 200+ members are Type C; fewer than 200 as on 31 March are Type D), secret ballot or EVM with no proxy voting (r.33), EVM procedure left to SCEA (r.39), tie decided by lots before the Returning Officer (r.63(1) proviso), Type C programme and appeal timelines (r.75), Type D election at an SGM presided by a person appointed by SCEA with 15 days notice and a non-voting presiding officer (r.76), office-bearers within 15 days (r.77), disputes only by election petition to the Co-operative Court under s.91 (r.78). The 2018 amendment (Bill 70/2018 text read; proviso to s.73CB(11)) lets housing societies of "less than or up to 200 Members" run elections themselves "in the manner as may be prescribed"; I did not find the prescription and the 2014 Rule 76 says SCEA appoints the presiding person.

Reservations: Rule 2(15) defines reserved seats (SC/ST, women, de-notified/nomadic tribes, special backward classes, OBC). Model bye-law 115 gives 1 women seat (2 for 301+ members, per a secondary table). The 2018 Bill's proposed s.154B-20/21 would give 3 category seats plus 2 women seats; I could not confirm which became law.

#### 4. Constitutional position

Union of India v Rajendra N. Shah (SC, 20 Jul 2021): Part IXB (Arts 243ZI-243ZT) declared operative only for multi-State co-operative societies (para 77, read in the judgment PDF https://api.sci.gov.in/supremecourt/2013/21321/21321_2013_32_1501_28728_Judgement_20-Jul-2021.pdf). Maharashtra's SCEA and 5-year-term rules sit on the State statute (2013 amendments: s.73CB; s.73AAA committee cap of 21 reported in secondary sources), not on Part IXB. I did not read the Bombay HC/SC challenge to the 21-director cap.

#### 5. Act-level items (secondary only)

- s.75(1): accounts audited within 4 months and AGM within 6 months of year end; s.75(5) disqualification up to 5 years for default (Bombay HC summaries, lawtext.in). 2020 ordinances temporarily extended the time.
- s.76: SGM on requisition (a forum post quotes 1/5th).
- s.27: one member one vote; joint holders (first-named votes); nominal members no vote (s.27(8)); housing societies excluded from s.27(3) per a forum post.
- s.32: inspection and copies (via bye-law 23). Bill 70/2018's s.154B-8 proposes free inspection and copies within one month; 154B-11 proposes personal exercise of votes and joint-holder order.
- 2018 amending Act text (read in the PRS bundle): s.73AAA(3) members deemed to vacate on term expiry; s.73CB(15) six-month window for overdue elections.

#### 6. Online and hybrid

- Meetings: expressly permitted by Rule 106C-13(3)(b) proviso (2026), subject to recording/recognition/storage capability.
- Elections: Election Rules only mention secret ballot or EVM at polling stations; I found no primary text permitting remote online voting for committee elections. Vendor sites claim legality (promotional).
- COVID: a circular of 25 Feb 2021 reportedly validated VC/OAVM AGMs (societies over 50 members) with 15 days notice and newspaper advertisement (ADDA blog, https://blog.ind.adda.io/?p=12102). Not read at source; temporary.

#### 7. MOFA 1963 and Maharashtra Apartment Ownership Act 1970

Only secondary points: MOFA s.10 obliges promoters to form a society/company once the minimum purchasers are in; buyers may instead submit to the Apartment Ownership Act (a declaration-based condominium); the choice is by majority of purchasers (bcajonline.org, iPleaders, order.law summary of a Bombay HC 2024 decision). No source for AOA meeting, quorum or voting rules was found, so no `in-mh-apartment-ownership` pack was produced.

#### Sources read

- https://taxguru.in/corporate-law/maharashtra-co-operative-societies-amendment-rules-2026.html - 2026 Amendment Rules text incl. Rule 106C-13 (secondary reproduction of notification).
- https://taxguru.in/corporate-law/maharashtra-overhauls-co-operative-housing-society-rules.html - plain-language walk-through of same rules.
- https://www.freepressjournal.in/amp/mumbai/consumer-connect-maharashtras-new-redevelopment-rules-allow-online-sgbms-registrar-noc-no-longer-required - practitioner analysis of Rule 106C-13, 21 Jul 2026.
- https://adda.io/blog/wp-content/uploads/2022/02/maharashtra-co-operative-housing-society-bye-laws.pdf - model bye-laws text.
- https://consumerresourcesin.files.wordpress.com/2014/10/election_rules_final.pdf - Election to Committee Rules 2014 (Gazette copy).
- https://prsindia.org/files/bills_acts/acts_states/maharashtra/1961/1961MH24.pdf - bundle of amending Acts (2017-2019 texts); not a consolidated Act.
- https://prsindia.org/files/bills_acts/bills_states/maharashtra/2018/Bill%20no%2070%20of%202018%20MH.pdf - 2018 Bill (s.73CB proviso; proposed Chapter 154B).
- https://api.sci.gov.in/supremecourt/2013/21321/21321_2013_32_1501_28728_Judgement_20-Jul-2021.pdf - Rajendra Shah judgment.
- https://blog.ipleaders.in/election-procedure-for-housing-societies/ - secondary summary of model election regulations and bye-laws.
- https://blog.ind.adda.io/?p=12102 - secondary summary of the Feb 2021 online-AGM circular.
- https://lawtext.in/judgement.php?bid=66763 and bid=59888 - court-case summaries on s.75 (secondary; one summary is internally inconsistent).
- https://indiancooperative.com/cooperative-queries/chs-procedures-of-conducting-election/ - practitioner Q&A on s.73CB(1) and Rules 75/76.

#### Could not verify

- Consolidated, current text of MCS Act 1960 ss.27, 32, 73B, 73BBB, 73CB, 75, 76, 79A, 154B (no India Code / legislature page fetched; web search tool plus plain downloads only).
- Rules 1961 rules 59-61 (quorum, adjournment, proxy) pre-2026 text; superseded for housing by Rule 106C-13 in any case.
- The official gazette PDF of the 2026 Rules and the new 2026 model bye-laws.
- Whether Bill 70/2018's Chapter 154B (two women seats, 3 category seats, 2/3 no-confidence) was enacted as drafted.
- The "manner prescribed" for societies up to 200 members to run own elections; the 250-member 2019 proposal.
- Any state circular on online/e-voting for committee elections; SCEA website (sahakarelection.maharashtra.gov.in) not reached.
- Record retention periods; method of voting at ordinary GB meetings; special-majority thresholds (bye-law amendment, expulsion); signed-minutes deadline.
- Maharashtra Apartment Ownership Act 1970 association rules.
- The Bombay HC/SC litigation on the 21-director cap and the 2025 Bombay HC order citing model bye-law 114.

### US HOA meeting and election law: research draft (retrieved 2026-10-23)

Research only, not legal advice. Statute text was read through fetch tools that return model-made summaries of the page, not raw text, so every figure should be spot-checked against the official statute before the rule engine ships. Official primary sites (leginfo.legislature.ca.gov, statutes.capitol.texas.gov, leg.state.fl.us) were unreachable (connection refused); flsenate.gov worked. UCIOA official 2021 text was not reached.

#### 1. UCIOA (generic pack)
Version: official ULC 2021 text NOT read. Only the Minnesota enactment (Minn. Stat. 515B, based on the 1993 act) was read, so numbers below are Minnesota's, not the model act's.
- Annual meeting at least yearly; elect directors, report, noticed matters. Notice 21-30 days (annual), 7-30 days (special), by hand or mail. Special meeting called by president, and must be called on petition of a majority of board or owners with 20% of votes (Minn. 515B.3-108, https://www.revisor.mn.gov/statutes/cite/515B.3-108).
- Quorum: more than 20% of votes present at start unless bylaws differ; board quorum more than 50% (515B.3-109).
- Voting: one vote allocated per unit; co-owners must agree or the vote is not cast; proxies only if articles/bylaws allow; restrictions on voting or quorum because of unpaid assessments are void; association-owned units cannot vote. Mail/electronic vote instead of a meeting allowed if the statute permits and documents do not forbid: votes cast at least equal to quorum, voting window 15-45 days, results within 30 days (515B.3-110).
- Records: "adequate" records, owner inspection, copies at actual cost; no retention years stated (515B.3-118).
- Vermont/West Virginia enactment details (20% quorum, proxies void if undated, one-year proxy life) come from a search-result snippet only.

#### 2. Robert's Rules (RONR 12th ed.)
Primary text not accessed. Secondary only (Purdue cheat sheet, Kentucky CES manual, NACo slide deck, Fresno State FAQ):
- Default quorum: majority of all members when bylaws are silent.
- Proxies not allowed unless bylaws permit.
- Default majority basis: members present and voting; two-thirds means affirmative at least double the negative; a tie loses (NACo deck cites 12th ed. 44:12).
- Bylaws override RONR. Page numbers cited by sources may be from older editions.
- Main motion/second/amend, tellers, nominations, adjourned vs special meeting: not source-verified in this pass.

#### 3. California (Davis-Stirling; Civ. Code, plus Corp. Code 7510-7512)
Read via california.public.law, page stated up to date Jan 1 2026.
- Elections (Civ. 5100): secret ballot mandatory for director elections/recalls, amendments, certain assessments; seat elected when term expires and at least every 4 years.
- Notice (5115): 30 days before nomination deadline; 30 days before ballots go out; ballots plus two envelopes at least 30 days before the voting deadline. Quorum only if documents or law require; ballots count toward quorum; failed quorum allows a reconvened meeting at least 20 days later with 20% quorum, notice at least 15 days before. Elections may be all-mail or electronic secret ballot. Cumulative voting by secret ballot if documents provide.
- Rules (5105): electronic secret ballots allowed but not for regular/special assessment votes; member may switch between paper and electronic; rules cannot be amended within 90 days of an election; ballot cannot be denied except for non-membership; nominee disqualifiable for delinquent assessments (not fines/late charges); equal campaign media access.
- Inspector (5110, 5120, 5125): one or three independent inspectors (not director, candidate, relatives or paid contractor; may be a member); they certify voting power, proxies, ballots, tabulate; public count at noticed meeting; results to minutes and general notice within 15 days; inspector holds materials until the one-year challenge period (5145) ends. Ties: not addressed.
- Proxies (5130): only if bylaws allow, cannot replace a ballot, proxyholder votes by secret ballot.
- Member meetings (Corp. Code 7510-7512): special meeting by board, president, others, or 5% of members; notice 10-90 days; default quorum one-third; majority of voting power represented and voting; adjournment max 45 days.
- Board meetings (4920, 4090, 4925): notice 4 days (2 days for executive session only), agenda in notice; teleconference needs a listed physical location.
- Minutes (4950): available within 30 days. Records (5200, 5210): election materials kept one year; inspection of current year in 10 business days, prior two years in 30 days; minutes permanently inspectable.
- 2025/2026 changes: AB 2159 (electronic voting) and AB 2460 (reconvened quorum) appear only in secondary summaries; nothing confirmed for 2026.

#### 4. Florida (Ch. 720, 2025 text on flsenate.gov)
- 720.306: quorum 30% of voting interests unless bylaws lower; decisions by majority of voting interests present; amendments two-thirds unless documents say otherwise; special meetings by board or 10% of voting interests (unless documents differ); notice 14 days, purpose required for special; proxies allowed unless documents forbid, must be dated, state meeting, signed, revocable, expire 90 days after meeting; directors by plurality, election only if nominees exceed vacancies; delinquent members cannot run; challenges within 60 days.
- 720.317 (electronic voting, ch. 2015-97 and 2024-221): member consent, identity authentication, receipt, device test 14 days before, secret-ballot separation, board resolution noticed 14 days, e-voters count for quorum.
- 720.303: board notice 48 hours posted (14 days for special assessments/rule changes); official records 7 years, ballots 1 year; inspection within 10 business days; 100+ parcel associations need an owner website portal.
- 720.3033: director certification within 90 days; certificates kept 5 years.
- Minutes deadline, term limits, weighted voting: not found.

#### 5. Texas (Prop. Code ch. 209, via texas.public.law)
- 209.0056: written notice 10-60 days before a meeting vote; 20 days before the ballot deadline for votes outside a meeting.
- 209.0051: open board meetings; posting 144 hours (regular) or 72 hours (special) plus email, or mail 10-60 days; electronic meetings allowed with access instructions.
- 209.00592: vote in person, proxy, absentee ballot or electronic ballot; association must allow absentee or proxy; e-ballot needs identity confirmation and receipt; in-person vote overrides earlier ballot; absentee/e-ballots count for quorum only on listed items. 209.0058: written signed ballots, electronic votes count as such; secret ballot rules with candidate observers.
- 209.00593: expired seats filled by election; associations over 100 lots solicit candidates 10 days before ballots. 209.00594: candidates and third-degree relatives cannot tabulate. 209.0057: owner recount demand within 15 days at owner cost. 209.0059: bar on voting is void. 209.00591: eligibility limits.
- 209.005: inspection response by 10th business day; retention: governing docs permanent, financials 7 years, minutes 7 years, owner accounts 5 years, contracts 4 years after expiry (associations over 14 lots).
- Member quorum, majorities, special meeting calls: not found (likely Bus. Orgs. Code or documents). The user's "209.0057 membership votes / HB 886" belief was not matched: 209.0057 is recounts in the text read.

#### Sources read
- https://www.flsenate.gov/Laws/Statutes/2025/720.306, 720.303, 720.317, 720.3033, 720.3045 (FL)
- https://california.public.law/codes/civil_code_section_4040, 4045, 4090, 4920, 4925, 4950, 5100, 5105, 5110, 5115, 5120, 5125, 5130, 5145, 5200, 5210
- https://california.public.law/codes/corporations_code_section_7510, 7511, 7512
- https://texas.public.law/statutes/tex._prop._code_section_209.0051, 209.0056, 209.0057, 209.0058, 209.0059, 209.00591, 209.00592, 209.00593, 209.00594, 209.005
- https://www.revisor.mn.gov/statutes/cite/515B.3-108, 3-109, 3-110, 3-118 (Minnesota UCIOA-derived)
- Search snippets only: Vermont/West Virginia 3-109/3-110; RONR secondary pages (Purdue, Kentucky CES, NACo, Fresno State); CA AB 2460 / AB 2159 analyses (sjud.senate.ca.gov, shou.senate.ca.gov, reubenlaw.com)

#### Could not verify
- UCIOA 2021 official text (3-108, 3-109, 3-110, 3-116 numbering, electronic means, adjourned quorum, minutes).
- RONR 12th ed. primary text.
- Any official-site text (leginfo, statutes.capitol.texas.gov, leg.state.fl.us were unreachable).
- CA 2025/2026 amendments beyond secondary summaries; CA tie-break; CA amendment thresholds.
- FL 720.306 60-day election notice, minutes deadline, term limits, HB 1203 specifics; 720.305 voting suspension.
- TX member quorum, majorities, special-meeting call, 2025 amendments, HB 886 content.

---

## 4. The owner's online-voting design against the law

Requirements as stated: online voting by members; 100% secret ballot; voter may change a vote before submitting; voter sees only their own voting data; organizer/host sees attendance ID, voter name, flat/house number and "voted YES/NO"; host sets the window, may extend in 30-minute steps, may stop manually or by timer; everything logged and published; two voter kinds (official voter, proxy voter), selectable by the organizer before the election starts; a PDF receipt for the voter (date, time, link ID, IP address, mobile number, attendance number).

| Requirement | Legal reading from this study | Status |
|---|---|---|
| Online secret-ballot voting | Explicitly lawful in CA (5105, 5110, 5115), FL (720.317), TX (209.00592) with conditions. Not found in UP or Maharashtra primary text; Maharashtra's 2026 Rule 106C-13(3)(b) covers video-conference meeting attendance, not ballots. Maharashtra Election Rules r.33: secret ballot or EVM. | Allowed US; unclear India (lawyer) |
| "100% secret" AND host sees voter name, flat and "voted YES/NO" | **These two cannot both be true for the same vote.** If the host sees who voted yes or no, it is an open ballot, not a secret ballot. CA 5110/5120 and Maharashtra Rule 33 require ballot secrecy; FL 720.317 requires separation of identity from secret ballots. | **Needs an owner decision.** Recommendation: the host sees *who voted* (turnout) but not *how*; yes/no only in aggregate. Offer a separate, clearly labelled "open vote" mode for ordinary resolutions where the society's bye-laws permit a show of hands. |
| Voter can change vote before submitting | Normal (ballot not final until cast). FL/CA require a receipt; CA says an electronic vote is irrevocable once transmitted. | Compatible if "submit" is final |
| Voter sees only own data; receipt PDF | Receipt is required in FL/TX; a receipt must not let the voter prove *how* they voted to a third party (vote-selling/coercion). | Compatible if the receipt omits the choice |
| Receipt contains IP address and mobile number | Personal data. Permissible if notified, but IP and mobile on a downloadable PDF raises leak risk. | Data-minimisation decision |
| Host-set window, 30-minute extensions, manual stop or timer | Not regulated by anything found; US statutes require the voting deadline in the notice (CA 5115 30-day ballot notice; TX 209.0056 20 days). An extension after notice may breach the noticed deadline. | Lawyer: extensions need notice or society authority |
| Everything logged and published | Tamper-evident log is fine; publishing identity-linked votes conflicts with secrecy and DPDP (see `DPDP-AND-RECORDS.md`). | Publish aggregate and pseudonymous proofs only |
| **Proxy voter** | Maharashtra: **no proxy** in bye-law 105 and Election Rules r.33, so a proxy option must be disabled in the Maharashtra pack. UP: ambiguous. CA: only if bylaws allow and cannot replace a ballot. FL: allowed, dated, expiring 90 days after the meeting. TX: must be offered. | Make "proxy allowed" a per-pack parameter; default off in `in-mh-coop-society` |
| Independent oversight | CA mandates an independent inspector of elections; MH uses a Returning Officer. The product's "host/organizer" is not independent by default. | Model an election-officer role distinct from the host |

---

## 5. Gaps shared by all regimes

- Primary text could not be reached for: UCIOA 2021, RONR, the official US legislature sites, India Code's UP Apartment Act 2010 beyond s.14, UP Apartment Rules 2011, the consolidated Maharashtra Co-operative Societies Act and the 2026 Rules gazette.
- Retention periods in India are mostly not found; the engine should take them from the society's own bye-laws.
- Nothing found says online voting is *prohibited* in India; nothing found says it is *permitted* for UP/MH elections. Treat as lawyer-required.

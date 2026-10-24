# Coverage: region usa-a (US states Alabama to Montana, excluding CA / FL / TX)

Compiled 2026-10-24. Output: `docs/research/extra/usa-a.json` (32 packs; every `engine` block loads through `parseCustomPack` without error). Research only, not legal advice.

## How to read the statuses
- Every value was read through a page-fetch tool that returns a model-written paraphrase of the statute page, not the raw page. So even `high` leaves need one re-check against the official text and a lawyer.
- `READ-HIGH` = the operative meeting / notice / quorum / voting sections were read on an OFFICIAL state site. `READ-MEDIUM` = the main sections were read but on a reproduction (FindLaw, Colorado public.law, hopb.co, communitypay.us) or the statute is partly silent. `READ-LOW` = only fragments, mirrors that look dated, or the statute defers almost everything to bylaws and I could only fill nonprofit-act defaults.
- Official sites that refused access from this machine (connection refused / HTTP 403 / Cloudflare challenge, no workaround attempted): ilga.gov, malegislature.gov, legislature.mi.gov, capitol.hawaii.gov, legis.iowa.gov, revisor.mo.gov, legislature.maine.gov, legis.la.gov, delcode.delaware.gov, cga.ct.gov, akleg.gov, iga.in.gov, legislature.idaho.gov, apps.legislature (Alabama), Justia, web.archive.org. The web-search budget was also used up near the end.
- Sources that did work: azleg.gov, revisor.mn.gov, ksrevisor.gov, mca.legmt.gov (official); codes.findlaw.com, colorado.public.law (reproductions, current-as-of dates stated in each leaf); hopb.co and communitypay.us (third-party mirrors, named in every leaf's source and note). I downgraded every "high" that rested on FindLaw / public.law to "medium".

## Table (one row per regime)
| State | Regime | Status | Instruments read | What blocked / what is weak |
|---|---|---|---|---|
| Alabama | Uniform Condominium Act 1991 (35-8A) | READ-MEDIUM | 35-8A-303, -308, -309, -310 (hopb.co), -318 (communitypay) | Mirrors only; records and minutes rules thin |
| Alabama | Homeowners' Association Act (35-20) + Nonprofit Law 10A-3 | READ-LOW | 35-20-7, -9, -13; 10A-3-2.03 | HOA Act has no quorum / proxy / term rules; nonprofit quorum, proxy, special-meeting sections not read |
| Alaska | Common Interest Ownership Act (AS 34.08) | READ-MEDIUM | 34.08.330, .340, .390, .400, .410 (FindLaw) | Applicability section, records, secret ballot, e-voting not read; older Horizontal Property Regimes Act (34.07) not read |
| Arizona | Condominium Act (33-1201 ff) | READ-MEDIUM | 33-1243, -1248, -1250, -1258; Nonprofit Act 10-3702, -3705, -3722 | Official site. Condo Act has NO quorum number or minutes deadline; nonprofit fallback (10%) applies only if incorporated |
| Arizona | Planned Communities Act (33-1801 ff) | READ-MEDIUM | 33-1804, -1805, -1812, -1813 | Same as above |
| Arkansas | Horizontal Property Act (18-13) + Nonprofit Act 1993 (4-33) | READ-LOW | 18-13-102/-108/-109/-110; 4-33-701/-702/-705/-708/-720/-722/-723/-724 | Mirror only; no HOA statute; 1963 vs 1993 nonprofit act choice not modelled; director election / term sections not read |
| Colorado | CCIOA (38-33.3) | READ-MEDIUM | 38-33.3-303, -308, -309, -310, -317; Nonprofit 7-127-102, -109 | public.law reproduction; electronic voting, nominations, election timetable, defaulter rules not read |
| Connecticut | Common Interest Ownership Act (47-200 ff) | READ-MEDIUM | 47-245, -250, -251, -252, -260 | FindLaw; applicability by creation date (47-215) and older Condominium Act (47-68a) not read |
| Delaware | Uniform Common Interest Ownership Act (25 Del. C. 81) | READ-MEDIUM | 81-303, -308, -309, -310, -318 | hopb.co mirror; older Unit Property Act (25 Del. C. 2201) not read; applicability not read |
| Georgia | Condominium Act (44-3-70 ff) | READ-MEDIUM | 44-3-79, -102, -103 (+ summaries of -101, -104, -106) | Election, term, records, secret-ballot rules not located; HB 62 (2025-26) status unknown |
| Georgia | Property Owners' Association Act (44-3-220 ff) + Nonprofit Code 14-3 | READ-LOW | 44-3-230, -231; 14-3-702, -721, -722, -724, -1602 | Act is thin; default quorum depends on incorporation date; board election / terms not read |
| Hawaii | Condominium Property Act (514B) | READ-MEDIUM | 514B-106(e), -108, -121, -122, -123, -125, -126, -154.5 | hopb.co mirror (official site blocked by Cloudflare); NO quorum percentage found in the sections read |
| Hawaii | Planned Community Associations Act (421J) | READ-MEDIUM | 421J-3, -3.2, -3.3, -3.5, -4, -5, -6, -7, -12 | Who may call meetings, quorum, term length not in the chapter as read; ch. 414D not read directly |
| Idaho | Homeowner's Association Act (55-32) + Nonprofit Act (30-30) | READ-MEDIUM | 55-3204, -3204A, -3204B; 30-30-501/-502/-505/-508/-511/-512/-513 | hopb.co mirror; records section 30-30-1102 not opened |
| Idaho | Condominium Property Act (55-15) | READ-LOW | 55-1507 excerpt only (communitypay) | Not its own pack: folded into the HOA pack note |
| Illinois | Condominium Property Act (765 ILCS 605) | READ-MEDIUM | s.18 (a)(1),(8)-(11),(19), (b)(1)-(10), 18.4, s.19 (hopb.co "current through P.A. 104-465") | ilga.gov refused; sec. 22.1 not read; quorum rule for < 20 units not read |
| Illinois | Common Interest Community Association Act (765 ILCS 160) | READ-MEDIUM | 1-5, 1-25, 1-30, 1-40, 1-75 | Same mirror; General Not For Profit Act not read |
| Indiana | Homeowners Association Act (IC 32-25.5) + Nonprofit Act (IC 23-17) | READ-MEDIUM | 32-25.5-1-1, -3-2, -3-3, -3-7, -3-10, -3-11; 23-17-10, -11 | hopb.co mirror; 23-17 records and director sections not read |
| Indiana | Condominium Act (IC 32-25) | READ-LOW | 32-25-8-2, -2.5, -8, -10; 32-25-7-7 | Act sets no notice days, quorum number, proxy or requisition rule |
| Iowa | Horizontal Property Act (499B) + Nonprofit Act (504) | READ-LOW | 499B.15, 499B.2(7); 504.701, .702, .705, .712, .713, .715 | Mirror; 499B silent on annual meeting, notice, proxies; no HOA statute (499C is minutes access only, guide summary) |
| Kansas | Uniform Common Interest Owners Bill of Rights Act (58-4601 ff) | READ-HIGH | 58-4603, -4610, -4611, -4612, -4613, -4614, -4616 (official ksrevisor.gov) | Which communities the Act covers (definition) not read; older Apartment Ownership Act (58-3101 ff) read only for bylaws contents (58-3119) and records (58-3120) |
| Kentucky | Condominium Act (KRS 381.9101 ff) | READ-MEDIUM | 381.9177, .9179, .9181 (FindLaw) | HOA statute not searched / read; records, elections, terms not read |
| Louisiana | Planned Community Act (9:1141, eff. 1 Jan 2025) | READ-MEDIUM | 9:1141.3, .21, .25-.28 (text), .36 and .39 (summary only) | hopb.co mirror; records and removal sections summary only |
| Louisiana | Condominium Act (9:1121 ff) | NOT READ (guide summary only) | HOPB guide says the Act leaves meetings, notice, quorum, voting to the bylaws | 9:1122.108 text and 9:1123.106 not opened |
| Maine | Condominium Act (33 MRS 1601 ff) | READ-MEDIUM | 1601-102, 1603-103, -108, -109, -110, -118 | Mirror; special-meeting rule sits in the Maine Nonprofit Act (13-B), not opened; Unit Ownership Act not read |
| Maryland | Condominium Act (RP 11) | READ-MEDIUM | 11-109, 11-116 (FindLaw) | Electronic-voting conditions not read |
| Maryland | Homeowners Association Act (RP 11B) + nonstock corporations | READ-LOW | 11B-111, 11B-112; Corps. & Assocs. 5-202, 5-206, 2-404, 2-408 | Act sets only open-meeting / failed-quorum / records rules; no notice days or default quorum anywhere |
| Massachusetts | Condominium Act (c. 183A) + c. 180 | READ-LOW | 183A s.10, 11, 24; c. 180 s.6A, 17 | malegislature.gov refused; Act defers almost everything to master deed / by-laws; no HOA statute |
| Michigan | Condominium Act (MCL 559) + Nonprofit Corporation Act (MCL 450.2101 ff) | READ-LOW | 559.152-.157, .190; 450.2402-.2405, .2408, .2415, .2421-.2423 | legislature.mi.gov refused; condo act has no meeting rules; quorum paraphrase ambiguous so engine quorum left blank; records section 450.2487 not opened |
| Minnesota | Common Interest Ownership Act (515B) | READ-HIGH | 515B.3-103, -106, -108, -109, -110, -118 (official revisor.mn.gov) | Ch. 317A (nonprofit) and old condominium chapter 515 not read; 2026 amendments to 3-103 not read |
| Mississippi | Condominium Law (89-9) + Nonprofit Act (79-11) | READ-LOW | 89-9-17 (via mirror); 79-11-197 to -221, -283, -285 | Mirror only; condo law has no meeting rules; HOA statute none found |
| Missouri | Uniform Condominium Act (448.1-101 ff) | READ-MEDIUM | 448.1-102, 448.3-103, -108, -109, -110 | revisor.mo.gov refused; 448.3-118 (records) not read; older Condominium Property Act (448.005 ff) NOT READ |
| Missouri | Nonprofit Corporation Act (ch. 355) for subdivision HOAs | READ-LOW | 355.231, .236, .251, .281, .291 | Only first part of the mirror read; no HOA statute |
| Montana | Unit Ownership Act (70-23) + Nonprofit Act (35-2) | READ-LOW | 70-23-301, -302, -307, -308, -309 (FindLaw); 35-2-526, -527, -530, -537, -538, -539, -540 (official mca.legmt.gov) | Unit Ownership Act silent on numbers; nonprofit rules apply only if incorporated; no HOA statute |

## Counts
32 packs: READ-HIGH 2 (Kansas, Minnesota), READ-MEDIUM 19, READ-LOW 11. Plus the NOT READ rows below.

## NOT READ (no pack written)
- Louisiana Condominium Act (9:1121-1124): only a secondary guide summary.
- Idaho Condominium Property Act (55-15): excerpt only.
- Missouri Condominium Property Act (448.005-.210, pre-1984 condominiums).
- Delaware Unit Property Act (25 Del. C. 2201 ff, older condominiums).
- Maine Unit Ownership Act (33 MRS 560-587) and Maine Nonprofit Corporation Act (13-B) special-meeting / notice sections (guide summary only).
- Minnesota Nonprofit Corporation Act (317A) and old condominium chapter 515.
- Kansas Apartment Ownership Act meeting rules (58-3101 ff; only 58-3119/-3120 seen).
- Kentucky HOA / planned-community law (not searched), Mississippi HOA (none found), Montana HOA (none found), Massachusetts HOA (none found).
- Michigan Nonprofit Act records (450.2487) and director sections; Georgia Nonprofit Code director sections.
- Alaska planned-community specifics beyond the CIOA (AS 34.08 applicability).
- Connecticut CIOA applicability (47-215) and older Condominium Act.
- Every state's tie-break, secret-ballot, election-inspector, nomination-period and delinquent-owner-eligibility rules except where stated in a leaf (Maryland nomination timetable, Colorado secret-ballot rule, Indiana 6-month voting-suspension rule, Idaho proxy / household limits).

## Engine gaps (law features the product's settings cannot express)
1. Proxy life and limits: one-year (AK, CT, DE, KY, MO), 11-month (CO, ME, IL, MT, MS, ID, MO nonprofit), 180-day (MD, IN HOA Act), single-meeting (HI, KS, LA), and caps on undirected proxies (CT, KS 15%; ID 50%).
2. Proxies barred for board elections but allowed for other items (IL CICAA, MD blank proxies): the product sets proxies per event, not per agenda item. Proxies barred for post-turnover associations (AZ) are locked off but remain lawful during declarant control.
3. Per-item secret ballots (CO: mandatory only for contested board seats); ballots-without-a-meeting with their own quorum / return-window rules (CT, DE, KS, LA, MN 15-45 days, MI 20-90 days, MS).
4. Quorum counted on "votes eligible for / cast in board elections" (AK, AL, CO, KY, ME, MO), size-dependent quorum (CO 10% above 1,000 owners; IL 20-unit threshold), "more than" percentages (GA, MN, DE second limb: 25% of owners unrelated to the declarant), reconvened-meeting rules that need the original notice to mention them (MD, DE).
5. Notice that depends on mail class (30-day minimum when not first-class / registered: ID, IA, IN, MS, MO, MT, AR), notice in hours (board meetings: AZ 48h, HI 72h, IL 48h, CT 5 days), meeting-type-dependent minimums (GA 21 vs 7 days; LA 30 days).
6. Requisition expressed as a share of the SMALLEST QUORUM (MA c. 180 s.6A) or as a petition for a court-ordered meeting (MI), or capped by units-or-percent (AZ removal petitions: 25% or 100 votes, 10% or 1,000 votes; HI 100 units or 25%).
7. Removal-of-director meetings with their own quorum / threshold (AZ 20% or 1,000 votes; CO 67%; AK and MO two-thirds; HI vote must equal the votes that elected the director).
8. Nomination timetables (MD 45 and 15 days before the election notice; ID/HI proxy-solicitation notice 21 days) and election-rule lead times (IL 120 days before the election).
9. Which sub-regime applies by creation date or incorporation date (MO 1983, ME 1983, KS/LA/ID 2011 / 2025 / 2025, AR 1993 vs 1963 nonprofit act, GA 2023 nonprofit quorum default).
10. Hours-based or "reasonable" notice, emergency quorum (LA 10%), and emergency electronic-voting authority (HI 514B-121(e)).

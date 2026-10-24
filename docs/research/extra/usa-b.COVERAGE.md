# Coverage: region `usa-b` (compiled 2026-10-24)

37 engine packs for 24 jurisdictions. Research only, not legal advice. Every value needs a local lawyer before the product relies on it.

## How the text was reached (be aware when judging confidence)
- **Official text read (raw or near-raw):** Pennsylvania (legis.state.pa.us), South Carolina (scstatehouse.gov), North Dakota (ndlegis.gov PDFs), Wyoming (wyoleg.gov PDFs), South Dakota (sdlegislature.gov API), District of Columbia (code.dccouncil.gov), plus statute mirrors Oregon and Nevada (`*.public.law`, full text).
- **Official text read through a summarising fetch tool** (numbers and section numbers reliable, wording paraphrased by the tool): New York (nysenate.gov), Virginia (law.lis.virginia.gov), Washington (app.leg.wa.gov). Marked high, but spot-check before shipping.
- **Legislature site unreachable from this machine** (connection refused or Cloudflare 403; I did not try to bypass bot checks): Nebraska, New Hampshire, New Jersey, New Mexico, North Carolina, Ohio, Oklahoma, Rhode Island, Tennessee, Utah, Vermont, West Virginia, Wisconsin. For these I used two commercial summaries (vote.direct, grihak.com) and a few statute mirrors (vlex for NC 47F-3-109/-110 and NJ 45:22A-45.2, communitypay.us, onecle for Ohio 5311.08). **Rule applied: a number enters the `engine` block only if two independent sources agree; single-source figures stay in the research text at confidence `low` and out of the engine.** No value from these states is marked `high`.
- WebSearch budget ran out partway; some second-source confirmations (for example NC 47C) could not be done.

## Per-jurisdiction status
| Jurisdiction | Status | Instruments found (pack ids) | What blocked / what is missing |
|---|---|---|---|
| New York | READ-HIGH (summarised fetch) | Condominium Act RPL 339-v (`us-ny-condominium-act`); N-PCL 603-621, 703 for incorporated HOAs (`us-ny-hoa-npcl`); BCL 603-614 for co-ops (`us-ny-coop-bcl`) | Condo Act sets only bylaw topics (almost no numbers). N-PCL art. 7 board meetings, inspectors, secret ballot, defaulter rules not read. Unincorporated HOAs not covered. Co-op supermajority sections not read. |
| New Jersey | READ-LOW | PREDFDA election rules 45:22A-45.2 / N.J.A.C. 5:26-8 (`us-nj-community-association-elections`); Condominium Act 46:8B (`us-nj-condominium-act`) | NJ Legislature, Justia, FindLaw all unreachable. Election rules from a vlex statute mirror (partial) plus secondary sources; 14-60 day election notice and 14-day nomination figures medium. Condo Act text itself not read; board-meeting notice sources conflict (48 hours vs 7 days). Nonprofit Act (15A) defaults not read. |
| Pennsylvania | READ-HIGH | UCA 68 Pa.C.S. 3101ff (`us-pa-uca`); UPCA 5101ff (`us-pa-upca`); Nonprofit Corporation Law 15 Pa.C.S. 5701ff (`us-pa-nonprofit-corp-law`) | Applicability sections (older condos/communities) not read; UPCA 5303 removal and some records details not read; special-meeting % for UCA/UPCA only via nonprofit law. |
| Virginia | READ-HIGH (summarised fetch) | Condominium Act 55.1-1940..1954 (`us-va-condominium-act`); POA Act 55.1-1815/1816 + Nonstock Corp Act (`us-va-poa-act`) | POA Act applicability thresholds, POA director election/term rules, 13.1-839 special-meeting % not read. Nonstock Act text changes 1 Jan 2027. |
| Washington | READ-HIGH (summarised fetch) | WUCIOA RCW 64.90 (`us-wa-ucioa`) | Older RCW 64.38 (HOA Act) and 64.34 (Condominium Act) NOT READ; board term/removal (64.90.520) and amendment thresholds not read. |
| North Carolina | READ-MEDIUM (47F) / LOW (47C) | Planned Community Act 47F (`us-nc-planned-community-act`); Condominium Act 47C (`us-nc-condominium-act`) | ncleg.gov blocked (Cloudflare). 47F quorum/proxy from vlex statute text; notice from two summaries. 47C figures single-source, kept out of engine. Ch. 55A nonprofit defaults not read; records, election and term rules not read. |
| Nevada | READ-HIGH (mirror) | NRS 116 (`us-nv-nrs-116`) | leg.state.nv.us blocked; read full text of 116.3108, .3109, .311, .31034, .31083, .31175 on nevada.public.law. NRS 116.31068 (notice methods), 116.31036 (removal), amendment thresholds, NRS 82 default not read. |
| Oregon | READ-HIGH (mirror) | Planned Community Act ORS 94.550ff (`us-or-planned-community-act`); Condominium Act ORS 100 (`us-or-condominium-act`) | Records rules for condominiums (ORS 100.480), director terms, written-ballot procedures (94.647 / 100.425) not read; ORS 65 nonprofit defaults not read. |
| Utah | READ-LOW | Community Association Act 57-8a, Condominium Act 57-8 (`us-ut-community-association`) | le.utah.gov refused connections. Only two summaries, little overlap; no figure in engine. Utah is a large HOA market: highest-priority re-check. |
| Ohio | READ-MEDIUM (condo) / LOW (planned) | Condominium Property Law 5311.08 (`us-oh-condominium-act`); Planned Community Law 5312 (`us-oh-planned-community-act`) | codes.ohio.gov refused. 5311.08 read from an older onecle copy (statute sets no numbers). 5312 only from summaries. R.C. 1702 nonprofit defaults only via one summary. |
| Rhode Island | READ-MEDIUM (notice only) | Condominium Act 34-36.1 (`us-ri-condominium-act`) | Legislature site refused. Notice 10-60 days from two summaries; quorum/proxy single-source. Nonprofit act 7-6 and planned communities not read. |
| South Carolina | READ-HIGH | Nonprofit Corporation Act 33-31 (`us-sc-nonprofit-corp-act`); Horizontal Property Act 27-31 (`us-sc-horizontal-property-act`) | Director qualifications/election/removal (33-31-802..808), votes by class not read. No HOA act exists in what was read. |
| South Dakota | READ-HIGH | Nonprofit Corporation Act 47-23, 47-24 (`us-sd-nonprofit-corp-act`) | No annual-meeting rule found; director election/term not read; condominium chapter 43-15A (sections 9-13) has no meeting rules. |
| Tennessee | READ-MEDIUM (2008 condo act) | Condominium Act of 2008 (`us-tn-condominium-act-2008`) | Legislature unreachable. Two summaries agree on notice 10-60 days and 20% quorum; HOAs follow nonprofit act (only summary). Horizontal Property Act (older condos) and TCA 48 sections not read. |
| Vermont | READ-MEDIUM (notice) | VCIOA 27A (`us-vt-vcioa`) | Notice 10-60 days from two summaries; quorum, proxy cap (15%), records single-source. |
| West Virginia | READ-MEDIUM (notice) | UCIOA W.Va. Code 36B (`us-wv-ucioa`) | Notice 10-60 days from two summaries; quorum/proxy single-source; planned communities outside the Act not read. |
| Wisconsin | READ-MEDIUM | Condominium Ownership Act 703 (`us-wi-condominium-ownership-act`) | 10-day notice and 180-day proxy limit confirmed by two summaries; quorum left to bylaws; ch. 181 nonstock defaults and 710.18 only summaries. |
| Wyoming | READ-HIGH | Nonprofit Corporation Act 17-19 (`us-wy-nonprofit-corp-act`); Condominium Ownership Act 34-20 (`us-wy-condominium-ownership-act`) | No HOA act exists in Title 34; Act 34-20 read in full (no meeting rules). Electronic ballot sections (17-19-708) not read. |
| North Dakota | READ-HIGH | Nonprofit Corporation Act 10-33 (`us-nd-nonprofit-corp-act`); Condominium chapter 47-04.1 (`us-nd-condominium`) | A separate planned-community / common-interest act (if any) was not reachable (chapter 47-04.2 not found). Director election (ch. 10-32.1) and terms (10-33-30) not read. |
| District of Columbia | READ-HIGH (condominium only) | Condominium Act 42-1903.01..14 (`us-dc-condominium-act`) | DC Cooperative Housing Association law and nonprofit-corporation HOAs (29-401ff) NOT READ. Election mechanics (42-1903.06) not read. |
| Nebraska | READ-LOW | Condominium Property Act (`us-ne-condominium-act`) | Legislature refused. Only notice 10-50 days has two sources; quorum (35%) and proxy single-source. Nonprofit act citations conflict between sources. |
| New Hampshire | READ-MEDIUM (condominium only) | Condominium Act RSA 356-B (`us-nh-condominium-act`) | gencourt.state.nh.us 403. Notice 21/7 days and quorum >33 1/3% (floor 25%) agree across two summaries. Non-condominium HOAs (RSA 292) NOT READ. |
| New Mexico | READ-MEDIUM | HOA Act 47-16 (`us-nm-homeowner-association-act`); Condominium Act 47-7C (`us-nm-condominium-act`) | Notice (HOA 10-50, condo 10-60) and condo quorum 20% from two summaries; HOA quorum, proxies, records single-source; nonprofit act 53-8 default only via one summary. |
| Oklahoma | READ-LOW | Unit Ownership Estate Act 60 O.S. 520 + 18 O.S. nonstock (`us-ok-unit-ownership-estate-act`) | Statute leaves almost everything to bylaws; two summaries agree only on that. No engine numbers. |

## Counts
READ-HIGH 11 (NY, PA, VA, WA, NV, OR, SC, SD, WY, ND, DC), READ-MEDIUM 9 (NC, OH, RI, TN, VT, WV, WI, NH, NM), READ-LOW 4 (NJ, UT, NE, OK). Nothing was left completely unread, but several regimes inside states are NOT READ (listed above).

## NOT READ (regimes or parts)
- Washington RCW 64.38 (HOA Act) and 64.34 (old Condominium Act).
- New Hampshire non-condominium HOAs (RSA 292); New Jersey nonprofit act 15A and the Condominium Act's own text; Utah (whole statute text); Nebraska/Oklahoma/Rhode Island/Vermont/West Virginia/Tennessee/Wisconsin statute texts (summaries only); North Carolina Chapter 55A and 47C text.
- DC Cooperative Housing Association law and DC nonprofit-corporation HOAs.
- North Dakota planned-community / common-interest act (if it exists).
- New York unincorporated HOAs; N-PCL art. 7 (board); BCL supermajority sections; NY Co-op bylaws are per building.
- Ohio R.C. 1702 and 5312 statute text; South Dakota director-election rules; Virginia POA director rules.

## Engine gaps (law features the product cannot express)
1. **Per-point rules:** secret ballot / proxy bans that apply only to director elections or removals (Nevada, Washington, Virginia ballots rule) - product options are per event, not per point type.
2. **Two notice minimums:** annual/regular vs other meetings (Virginia 21/7, DC 21/7, New Hampshire 21/7, Virginia POA 14/7); only one `notice.minDays` exists (the `notice` block carries both).
3. **Quorum details:** reduced quorum at adjourned meetings (Oregon half-or-20%, North Carolina halving, Pennsylvania 15 Pa.C.S. 5756), quorum floors (NY: lesser of 100 votes or 10%), small-condominium quorum (NH), board quorum.
4. **Majority tests:** "greater of two bases" (North Dakota), "majority of votes cast AND of the quorum" (SC, WY), "like majority of units" when 50% of votes sit in 25% of units (VA, DC).
5. **Proxy features:** expiry at the first meeting after issue (VA, DC, NH), witnessed signature (DC), holder eligibility (Nevada), caps as % of votes (NH, VT) and per-holder caps; proxy-needs-bylaw-authority (Pennsylvania nonprofit default) vs default-allowed.
6. **Ballot without meeting:** deadlines, quorum-by-ballots rule (WA, OR, NV, SD, SC, NH).
7. **Requisition thresholds** that are "lesser of X members or Y%" (ND) or a bylaw-chosen range 10-50% (Oregon).
8. **Election process:** independent election reviewer (PA 500+ units), staggered terms (NY one-third, OH one-fifth, NV equal numbers), nomination notice 30 days / 14 days (NJ, NV), pre-election candidate session (PA), unopposed-seat acclamation.
9. **Secondary-source warning:** 13 states (see above) rest mainly on commercial summaries; their engine values are limited to numbers two sources agree on.

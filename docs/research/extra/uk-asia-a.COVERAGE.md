# Coverage: region `uk-asia-a` (compiled 2026-10-24)

Output: `docs/research/extra/uk-asia-a.json` (12 packs). Every engine block was loaded through `parseCustomPack()` with bun and all parameter ids / option keys were checked against `rules.ts`: all 12 parse.
Research only, not legal advice.

| # | Regime | Pack id | Status | Instruments actually read | What blocked / weak |
|---|---|---|---|---|---|
| 1 | Singapore - management corporation (MCST) | `sg-bsma-mcst` | READ-HIGH | Building (Strata Management) Act 2004 (formerly "Building Maintenance and Strata Management Act") on SSO: s.2, s.53-53B, First Schedule (all paras), Second Schedule para 3-4; BCA Strata Management Guides 3 and 4 for cross-check | s.26-27 (AGM timing), s.129 (service of notice), s.65, and the 2005 Regulations were not opened; guide used for those points (marked medium). No retention period found. |
| 2 | Hong Kong - owners' corporation | `hk-bmo-oc` | READ-HIGH | Building Management Ordinance Cap. 344, current text on e-Legislation: Schedule 3 (all), Schedule 2 paras 1-5, s.30, s.36A, definition of "corporation resolution" | Higher thresholds elsewhere in the Ordinance (dissolution, tenders, large-scale maintenance), deed of mutual covenant and OC constitution not read. No electronic-meeting rule found. |
| 3 | Malaysia - JMB / MC (Strata Management Act 2013) | `my-sma2013-jmb-mc` | READ-MEDIUM | Act 757 s.2 definitions and Second Schedule, read through a secondary reproduction (lawplayer.com) - official PDF at DBKL returned 404 and Bash could not reach any host | Official Gazette/lom.agc.gov.my text not opened; ordinary-resolution rule, electronic meetings, retention not seen. Strata Titles Act 1985 (Act 318), Act 663, 2015 Regulations, Sabah/Sarawak position: NOT READ. |
| 4 | Republic of Ireland - owners' management company | `ie-mud-omc` | READ-HIGH (engine MEDIUM) | Multi-Unit Developments Act 2011 ss.14, 16, 17 (enacted text; Statute Book directory shows no amendment to them); Companies Act 2014 ss.176-178, 180-187, 191 (enacted text; directory checked for amendments) | MUD Act s.15 (older developments), CA 2014 s.175, s.187 voting text, s.189 poll, 2024 amendments to s.176 NOT read; OMC constitutions vary the company-law defaults. Requisition 10% is expressed in share capital and may not map onto a guarantee company. |
| 5 | England & Wales - Right to Manage company | `uk-ew-rtm-company` | READ-MEDIUM | RTM prescribed articles SI 2009/2767 (as made, arts 22-41); Companies Act 2006 ss.282, 283, 284, 303, 307, 318, 321, 322A, 324, 327, 355, 358, 360A | Amendments to the 2009 articles after 2009 not checked; Commonhold and Leasehold Reform Act 2002 ss.72-113 not opened; Welsh RTM regulations and older (pre-2009) articles not read; s.304, s.336 not opened. |
| 6 | England & Wales - residents' management company (company limited by guarantee) | `uk-ew-rmc-company` | READ-MEDIUM | Companies Act 2006 sections above | The company's own articles (decisive) and the model articles SI 2008/3229 not read; most defaults are "subject to the articles". |
| 7 | England & Wales - commonhold association | `uk-ew-commonhold` | READ-LOW | Commonhold and Leasehold Reform Act 2002 ss.34-38, Schedule 3 | Commonhold Regulations 2004 Sch 2 (articles) and Sch 3 (CCS): the legislation.gov.uk "as made" schedules are image-only PDFs; lease-advice.org gave 403, vLex failed. No numbers captured. 2009 amendment regs and 2024 Act reforms not read. |
| 8 | England & Wales - recognised tenants' association (LTA 1985 s.29) | `uk-ew-recognised-tenants-association` | READ-LOW (nothing to load) | Landlord and Tenant Act 1985 s.29 | s.29 has no meeting or election rules; the pack carries no values by design. LTA 1985 ss.30B-30K, LTA 1987 not read. |
| 9 | Scotland - Tenement Management Scheme | `uk-sct-tenement-tms` | READ-HIGH | Tenements (Scotland) Act 2004 s.4 and Schedule 1 rules 1-3 | TMS rules 4-9 (costs, emergency work, procedural irregularity); Title Conditions (Scotland) Act 2003 (manager burdens, Development Management Scheme s.71); Property Factors (Scotland) Act 2011: **NOT READ**. |
| 10 | Northern Ireland | `uk-ni-owner-management-company` | READ-LOW | Companies Act 2006 s.1299 (extent: whole UK) + the same Part 13 sections | No NI apartment statute could be confirmed. An NI Assembly private member's bill (Bill 4/10, 2010) was seen as introduced only; its enactment is unverified. Freehold-flats / managing-agent / HMO ("multi-occupancy") law NOT READ. Commonhold does not exist in NI (per the bill's sponsor, not a primary source). |
| 11 | Cyprus - co-owned buildings | `cy-cap224-communal-building` | READ-HIGH (engine MEDIUM) | Immovable Property (Tenure, Registration and Valuation) Law Cap. 224, consolidated Greek text on CyLaw: ss.38Α-38ΛΓ and the Model Regulations (Annex) regs 14-47 | Consolidation date of the CyLaw text unverified; a building's own registered regulations override the model ones; English official text not used (Greek translated by the researcher). |
| 12 | Malta - Condominium Act | `mt-condominium-act` | READ-HIGH | Cap. 398 official consolidated PDF, whole Act (13 pages) | Portal's consolidated version is dated 2008; later amendments (if any) not checked. Registered condominium rules not read. |

## Counts
READ-HIGH 6 (Singapore, Hong Kong, Ireland, Scotland, Cyprus, Malta) - READ-MEDIUM 3 (Malaysia, RTM, RMC) - READ-LOW 3 (commonhold, tenants' association, Northern Ireland) - NOT READ: see below.

## NOT READ (named in the assignment or relevant, but not opened)
- Landlord and Tenant Acts 1985/1987 except s.29 (England & Wales).
- Commonhold Regulations 2004 Schedules 2-3 text (image-only on the official site).
- Title Conditions (Scotland) Act 2003; Property Factors (Scotland) Act 2011.
- Northern Ireland: freehold flats, managing agents, multi-occupancy (HMO) legislation; any enacted NI apartment statute.
- Malaysia: Strata Titles Act 1985, Building and Common Property Act 2007, 2015 Regulations, official text of Act 757.
- Singapore: Building Maintenance (Strata Management) Regulations 2005; any scheme's by-laws.
- Hong Kong: DMCs and the Ordinance's non-Schedule thresholds (s.30 resolution %, tenders).
- Ireland: MUD Act s.15 and the Planning and Development Act 2024 changes; OMC constitutions.

## Engine gaps (law features the product cannot express yet)
1. Two vote-counting bases in one meeting (Singapore: one vote per lot on ordinary votes, share value on polls / special / 90% resolutions; Malaysia, Cyprus likewise on show of hands vs poll). One `weightage` switch cannot do this.
2. Notice period depends on the resolution type (Singapore 14 vs 21 days; Malaysia 14 / 21 / 30; Ireland 7 vs 21 for EGMs).
3. Head-count quorums such as "two members present" (Companies Act 2006 s.318, Companies Act 2014 s.182) and "20% or two, whichever is greater" (RTM art 29).
4. Quorum fallback inside the same meeting after half an hour (Singapore: two owners in person; Malaysia/Cyprus: those present), and a requisitioned meeting that dissolves for want of quorum (Ireland).
5. Proxy caps that scale with building size (Singapore: higher of 2 lots or 2% of lots) or are per proxy-holder across several owners (Malaysia: one proxy per person).
6. Requisition expressed as alternatives (Singapore: 20% of share value OR 25% of owners).
7. Special majorities measured on the whole (75% of ALL common property in Cyprus; 90% of all share value in Singapore comprehensive resolutions), on valid votes cast, or after a post-meeting window of 12 weeks (consensus / comprehensive resolutions).
8. Votes allocated by complex formulas (RTM art 33 with landlord members; Scotland TMS: no vote for flats not liable for the cost).
9. Mixed-use reserved council seats (Singapore s.53A), officer term caps (Malaysia two consecutive years; Singapore treasurer 3 terms), committee size tied to flat count (Hong Kong).
10. Council terms of "every alternate AGM" (Hong Kong), and 3-year maximum director terms (Ireland).
11. Written, no-meeting decisions (Scotland rule 2.7, Singapore consensus resolutions) are only loosely covered by `absentee_voting`.
12. Short-notice consent thresholds (Companies Act 2006 s.307: 90% of members; Ireland s.181(2): all members).

## Honest weak spots
- Malaysia: every figure came from a secondary reproduction; verify against the official Act before use.
- Ireland and England company-law rules are defaults the OMC/RMC constitution can override, and no society constitution was read.
- Commonhold carries no numbers because the key schedules could not be read.
- Cyprus is a translation by the researcher of the Greek consolidated text.

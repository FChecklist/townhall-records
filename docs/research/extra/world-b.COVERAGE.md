# world-b coverage (compiled 2026-10-24)

All pages were read through WebFetch, which returns an automated summary, not verbatim statute text. Nothing here is "high" except where an official or publisher text gave clear sub-rule detail. Every engine block was loaded through `parseCustomPack` and passed.

| Regime | Status | Instruments found | What blocked / weak |
|---|---|---|---|
| Japan: Act on Building Unit Ownership | READ-HIGH | Act 69 of 1962, arts 25, 31, 34-43 (official MOJ English translation) | Art.33, art.17/61-62 special majorities, standard bylaws not read |
| South Africa: Sectional Titles | READ-HIGH | Act 8 of 2011; Management Rules (R.1231/2016) 7, 15, 17, 19, 20 | Rule 6 eligibility paywalled; Act definitions of special/unanimous resolution not read; rule 13 only via search summary; CSOS Act not read |
| Germany: WEG | READ-MEDIUM | WEG ss.23-25 (German original) | Via summary; s.23(1a) 3/4 figure and "no quorum" should be rechecked; ss.18-19, 26-28 (administrator, board) not read |
| Spain: LPH 49/1960 | READ-MEDIUM | arts 13, 15, 16, 17, 19 (BOE) | Last 8,000 characters unread; electronic voting, art.17 minor majorities, proxy cap not read |
| Brazil: Codigo Civil | READ-MEDIUM | arts 1347-1355 | Private mirror, planalto.gov.br gave ECONNRESET; notice days not in Code (convention); arts 1335-1336 not read; Lei 4.591/64 not read |
| Colombia: Ley 675/2001 | READ-MEDIUM | arts 41, 42, 44, 45 (leyes.co); 39-40 via search summary | Not official gazette; extraordinary meetings, proxies, council election (art.53+) not read |
| UAE (Dubai): Law 6/2019 | READ-MEDIUM | Arts 18, 22, 23, 48-51 (official portal) | No owners' general assembly in this law; committee is appointed by RERA; term, notice to members, owner voting not found |
| Philippines: RA 9904 (HOA) | READ-MEDIUM | RA 9904 ss.7, 9, 11, 13, 15, 16, 17, 22 | Delegates most things to by-laws |
| Philippines: RA 4726 (condominium) | READ-LOW | RA 4726 ss.2, 4, 8-10, 13, 14, 16 | Delegates to the declaration and Corporation Code (not read) |
| France: Loi 1965 / Decret 1967 | READ-LOW | service-public.gouv.fr only | Legifrance 403, court-of-appeal PDF in maintenance; quorum, proxy cap, requisition, art.26 majority not read |
| Thailand: Condominium Act 2522 | READ-LOW | s.42/1 and proxy cap via a law-firm note | Act text 404 / not retrievable; notice, quorum, majorities not read |
| Mexico (CDMX Ley de Propiedad en Condominio) | NOT READ | none | servimet/prosoc hosts refused connection (ECONNREFUSED); no source read |
| Argentina (CCyC arts 2037 ff.) | NOT READ | none | Only search-result snippets (arts 2059, 2060, 2063 appeared); no page opened, so no value recorded |
| Chile (Ley 21.442) | NOT READ | none | bcn.cl needs JavaScript; no browser fallback attempted |
| Italy, Netherlands, Portugal | NOT READ | none | not attempted (budget) |
| Abu Dhabi (Law 3/2015, 13/2008), Saudi Arabia, Qatar (Law 6/2022), Bahrain, Oman, Kuwait, Egypt | NOT READ | none | Qatar and Abu Dhabi searches returned nothing relevant; others not attempted |
| Israel, Turkey | NOT READ | none | not attempted |
| South Korea, Indonesia, Vietnam, Sri Lanka, Bangladesh, Nepal, Pakistan | NOT READ | none | not attempted |
| Kenya, Nigeria (Lagos), Ghana | NOT READ | none | not attempted |

## Counts
READ-HIGH 2, READ-MEDIUM 6, READ-LOW 3, NOT READ 25 (Mexico, Argentina, Chile, Italy, Netherlands, Portugal, Abu Dhabi, Saudi Arabia, Qatar, Bahrain, Oman, Kuwait, Egypt, Israel, Turkey, South Korea, Indonesia, Vietnam, Sri Lanka, Bangladesh, Nepal, Pakistan, Kenya, Nigeria, Ghana).

## Weak points to treat with care
- France and Thailand: only secondary pages; their engine blocks are low confidence and carry few values.
- Brazil art.1351 text showed several historic versions on the source page.
- Dubai: the law does not give owners a general assembly, so the product's owner-meeting flow does not map.

## Engine gaps (law features the product cannot express)
1. Dual majority/quorum tests: majority of owners AND of shares/votes (Spain, Japan, Brazil's "present and half of fractions", Germany's per-owner vote with optional share weighting).
2. Different quorum by scheme size (South Africa: two-thirds under 4 sections, otherwise one-third).
3. Adjourned meeting rules by clock or calendar: 30 minutes then same day next week (South Africa); half an hour or within 8 days (Spain); third business day (Colombia); permanent session of 60/90 days (Brazil).
4. A cap on required majorities (Colombia: never above 70%).
5. Notice in business days vs calendar days (Colombia).
6. Ladders of majorities by decision type (France arts 24/25/26, Spain art.17, Japan bylaw changes at 3/4 and 3/4).
7. Defaulter vote bars with conditions (Spain: court deposit exception; South Africa: only after a court/adjudicator order and not for special resolutions).
8. Proxy eligibility limits (South Africa: managing agent barred), proxy deadlines in hours (48 hours), proxy validity length (Philippines 3 years).
9. Developer's votes excluded from quorum (South Africa).
10. Waiting period and re-vote demand after a low-turnout special resolution (South Africa rule 20(9)-(10)).
11. Regulator-appointed committees instead of elections (Dubai).
12. Resolution register and "item must be in the invitation" voidness rules (Germany, Japan).
13. By-laws can override statutory notice/electronic-voting defaults (Japan, Brazil, Philippines): Organizer must enter the by-law value.

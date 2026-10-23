# LAW-FLEXIBILITY: can the Organizer set up the rules of ANY society?

Owner instruction (2026-10-23): check the laws and bye-laws of AOAs, RWAs and HOAs across India and the world and make sure the product is flexible enough for the Organizer to set them up.

## 1. What is verified and what is not (read this first)
* **Verified in this repository** (from `docs/research/`, sources and confidence recorded per value): Uttar Pradesh Apartment Act 2010 with the 2011 Model Bye-laws; Societies Registration Act 1860 as applied to RWAs (almost no defaults); Maharashtra co-operative housing societies (Act, Election Rules, model bye-laws, 2026 rules, medium confidence); a generic US HOA pack; California, Florida, Texas (read through summaries and mirrors, not official texts).
* **Not verified by me in this session:** every other jurisdiction. I did not read their statutes. The lists in section 4 are *names of regimes to research* from general knowledge, NOT findings. No pack was written for them and none should be until a researcher has read the primary text.
* So the honest claim is **"the engine is built to express the common structure of these rules, and any society can enter its own values"**, not "the law of every country is encoded". Legal conformity stays with the society and its lawyer; the product records the rules in use, applies them exactly, refuses to start with unset required values and prints a "checked against the rules" table.

## 2. How an Organizer sets up ANY society today
1. Choose a pack (a verified one, or **"Any country: enter your own bye-law values"**).
2. The 8-step console asks only for what the pack leaves unset: notice days, quorum (share of weight or number of flats, strict "more than", cap), majority bases, proxies yes/no and limit, tie rule, secret ballot, ballot mode, extensions, term and nomination information.
3. Law-locked ticks show their reason and cannot be changed (a pack can lock any checkbox).
4. A deployer can add a country, state or one society's own bye-laws as **data** (`parseCustomPack`, JSON, no code); each pack carries its confidence and a lawyer-check flag, which the public page prints.
5. Every rule value and every change is on the public page with who/when/why; rules freeze per point when voting opens.

## 3. Dimensions of variation and how the engine covers them
(Dimensions are the kinds of differences found between regimes; the examples are indicative, from general knowledge unless a pack in section 1 shows them.)

| Dimension | Typical variation | Engine |
|---|---|---|
| Who votes | one flat one vote; by area / share / unit entitlement; arrears disqualify; owners vs tenants; joint owners | `weightage` option + integer weights; `eligible` flag per flat; one ballot per flat (UNIQUE) |
| Notice | minimum and sometimes maximum days; different for AGM, special, committee; delivery method; content | `notice.minDays/maxDays` per event type, `notice.delivery` (information), notice check printed |
| Quorum | % of members / of votes / fixed number; lesser-of caps; "more than"; second-meeting rule; remote presence counts or not | `quorum.basis/percentBp/strict/capFlats`, `adjourned.*`, `quorum.countProxies` (information) |
| Majorities | ordinary, two-thirds, three-quarters, unanimous, any fraction; counted on votes cast / present / all; abstentions in or out; casting vote or lots | `majorityClass` (simple, two_thirds, three_quarters, unanimous, "n/d", "n/ds" strict), `majority.*.basis`, `abstain.inBase`, `tie.break` |
| Proxies | forbidden, allowed with form, limits per holder | `proxy_voting` option (locked by pack where the law forbids), `proxy.maxPerHolder`, kind recorded and split shown only above a small-group threshold |
| Voting method | show of hands, poll, secret ballot (required for elections in some regimes), postal, electronic | open vote by flat vs secret ballot per point; `ballot.mode` online / printed / either; locked secret ballot per pack |
| Elections | one post per vote; one vote for all posts ranked; first N; number of ticks per voter; returning officer; ties by lot; nomination and withdrawal periods; reserved seats; term limits | formats single_post / ranked_posts / top_n, min/max ticks, ties flagged for the Returning Officer, `nomination.*`, `reserved.seats`, `term.*` (information) |
| Meetings | AGM / special / committee / first statutory; requisition by a share of members | event types; `requisition.percentBp` (information) |
| Records | minutes deadline, retention, inspection rights | `minutes.deadlineDays`, `retention.years` (information) |
| Language and script | English, local languages, right-to-left | 16-language drop-down (English, Hindi complete; others core words, drafts) |
| Time and money | any time zone, local currency | IANA time zone per event; price by country (INR for India, USD elsewhere) |

## 4. Known gaps (not expressible yet) and the research backlog
**Features some regimes need that the engine cannot yet express** (ordered by how common they are believed to be; to confirm in research): quorum or majority that differs by resolution type; written resolutions without a meeting; cumulative voting (several votes spread over candidates); preferential / ranked-choice or single transferable vote; vote caps (no holder above a share); splitting a vote between joint owners; staggered terms (one third retires each year); demand for a poll after a show of hands; independent inspector of elections as a distinct role (today the Returning Officer signs the PDF); proxy forms with expiry dates; voting rights suspended by arrears with a grace rule. Each is an addition to `rules.ts` / `tally.ts` with tests, not a redesign.

**Regimes to research next** (names to look up, NOT verified): India - RERA associations of allottees (Act 2016 s.11 and state rules), Delhi (Apartment Ownership Act 1986), Karnataka (Apartment Ownership Act 1972, co-operative and societies law), Tamil Nadu (Apartment Ownership Act 1994), Gujarat (Ownership Flats Act 1973), Kerala (Apartment Ownership Act 1983), Telangana / Andhra Pradesh (Apartments Act 1987), West Bengal, Maharashtra Apartment Ownership Act 1970 and MOFA 1963 (already open question 14). World - United Kingdom (commonhold, leasehold right-to-manage companies), Ireland (owners' management companies), Australia (NSW, Victoria, Queensland strata law), New Zealand (unit titles), Canada (Ontario, British Columbia, Alberta condominium and strata law), Singapore (management corporations), Malaysia (strata management), Hong Kong (owners' corporations), UAE (jointly owned property law, Dubai), South Africa (sectional titles, HOAs), France (copropriete), Spain (propiedad horizontal), Germany (WEG), Philippines (condominium and HOA acts), further US states (New York, New Jersey, Illinois, Arizona, Nevada ...).

**Method for each regime** (so packs stay trustworthy): read the primary text, fill the parameter table, cite section numbers and a confidence level per value, mark unclear values as unset (never guess), have a local lawyer confirm, add a test fixture with a worked example. A follow-up research session is proposed for this (see the final report).

## 5. What this means for the "100% per every law and bye-law" wish
The product can be made *capable of expressing* almost any society's rules, and *strict in applying exactly what was entered*. It cannot know what a society's own bye-laws say, and it cannot make a rule lawful. That is why the sealed report shows the rules in use next to the result and the PDF carries the Returning Officer's signature block.

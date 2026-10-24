// Builds the plain-words reference document of every role, rule, option and jurisdiction pack in the product, FROM THE CODE (so it cannot drift from what is built).
// Usage: bun scripts/make-rules-doc.ts [output.html]
import rulePacks from "../docs/research/rule-packs.json";
import { CUSTOM_WORLD_PACK, FORMAT_LABEL, LANGUAGES, OPTIONS, PARAMS, ROLE_LIMITS, TERMS_VERSION, ATTENDANCE_CHECKS, defaultBallotDesign, loadAllPacks, priceFor } from "../packages/engine/src";

const out = process.argv[2] ?? `${process.env.USERPROFILE}\\Downloads\\Townhall-Rules-Options-Roles.html`;
const e = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const tbl = (head: string[], rows: unknown[][], cls = "") => `<table class="${cls}"><thead><tr>${head.map((h) => `<th>${e(h)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${typeof c === "string" && c.startsWith("<!--raw-->") ? c.slice(10) : e(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
const raw = (s: string) => "<!--raw-->" + s;
const yn = (v: unknown) => (v === true ? "Yes" : v === false ? "No" : "Organizer must decide");
const packs = [...loadAllPacks(rulePacks).values()];
const optLabel = new Map(OPTIONS.map((o) => [o.key, o.label]));
const paramLabel = new Map(PARAMS.map((p) => [p.id, p.label]));
const money = (k: "meeting" | "election", c: string) => formatMoney(priceFor(k, c));
function formatMoney(p: { amountMinor: number; currency: string }) { return `${p.currency === "INR" ? "Rs " : "USD "}${(p.amountMinor / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`; }

const ROLES = [
  ["Organizer", "1 per event (the person who creates it)", "Sets up the event, rules, flat list and agenda. The only one who pays and the only one who can erase private details after a lawful request. Can appoint Hosts and Attendance Monitors, open/close points, start and close the event, see contact details.", "Must confirm their e-mail with a 6-digit code before they can act. Counts as one of the 5 Hosts."],
  ["Host", `up to ${ROLE_LIMITS.hostsInclOrganizer - 1} more (${ROLE_LIMITS.hostsInclOrganizer} in all including the Organizer)`, "Everything the Organizer can do except pay and erase: set-up, rules, agenda, start, open / close / extend voting, close the event, see contact details. If no Attendance Monitor is appointed, a Host or the Organizer may mark attendance (then it is shown as \"not independently verified\").", "E-mail confirmed with a 6-digit code. Can also be an Attendance Monitor."],
  ["Attendance Monitor", `up to ${ROLE_LIMITS.monitorsOnly} besides the Organizer and Hosts; ${ROLE_LIMITS.monitorsTotal} in all if they also monitor`, "Checks the person's proof, enters the name against the flat, ticks the check-boxes, can take a photo with date, time and place (when the event uses photos), runs the 4-digit code exchange, and gives out voter codes. Cannot change rules, the agenda or the flat list.", "E-mail confirmed. Attendance marked by a monitor is recorded as independent."],
  ["Voter / Attendee", "one per flat per point (a proxy holder may vote for another flat, within the proxy limit)", "Checks their own name, flat and status on their own phone, enters the 4-digit number, then votes. Terms must be ticked once. Can reopen the same link on any machine they were checked in on and continue from the exact point they left.", "Must be marked present first. A flat votes at most once per point."],
  ["Platform owner (super admin)", "outside the event", "Sees full audit values only by giving a written reason, which is recorded on the public page. Cannot edit or delete the public record.", ""],
  ["Anyone (public)", "no sign-in", "Sees the live page and then the sealed report; can download it, verify it, and clone an event's structure (never its private data).", ""],
];
const ACTIONS = [
  ["Create event, edit flat list, agenda, options", "Organizer, Host", "Not after the event starts (flat list) or after a point opens (that point)"],
  ["Change rule values", "Organizer, Host", "A change to a point is refused once it opened; every change and refusal is public, with the reason"],
  ["Pay", "Organizer only", "Test mode only until live payments are connected"],
  ["Publish the agenda", "Organizer, Host", "Needs payment, at least one agenda point, flats, and every required rule set"],
  ["Start the meeting / election", "Organizer, Host", "Only after the agenda is published"],
  ["Mark attendance, give voter codes", "Attendance Monitor (Organizer / Host only if there is no monitor)", "Only once the agenda is published"],
  ["Open, extend, close a voting point", "Organizer, Host", "Only one point open at a time; quorum must be met (unless the adjourned-meeting rule applies); extensions only if allowed"],
  ["Close the event and publish the report", "Organizer, Host (or automatically at the scheduled end)", "Report is published within 120 seconds of the scheduled end when automatic publishing is on"],
  ["See contact details", "Organizer, Host", ""],
  ["Erase private details", "Organizer", "Public fingerprints remain; they can no longer be traced to a person"],
  ["View an attendee's photo", "Organizer, Host", "Every view is recorded"],
];
const MAJ = [["simple", "More than half (counted on Yes+No, or present, or total, per the rule pack)"], ["two_thirds", "Two-thirds"], ["three_quarters", "Three-quarters"], ["unanimous", "All"], ["custom n/d", "Any fraction such as 3/5; add s for \"more than\""]];
const RULE_INFO_ONLY = new Set(["nomination.days", "nomination.withdrawalDays", "term.years", "term.maxConsecutive", "requisition.percentBp", "notice.delivery", "reserved.seats", "minutes.deadlineDays", "retention.years"]);

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Townhall - Rules, Options and Roles</title>
<style>
body{font-family:Calibri,Arial,sans-serif;color:#1C2B3A;margin:0;background:#fff;line-height:1.45}
main{max-width:1000px;margin:0 auto;padding:24px 28px}
h1{font-size:28px;margin:0 0 4px} h2{font-size:20px;border-bottom:2px solid #1C2B3A;padding-bottom:4px;margin-top:34px} h3{font-size:16px;margin-top:22px}
table{border-collapse:collapse;width:100%;margin:10px 0;font-size:13px} th{background:#1C2B3A;color:#fff;text-align:left;padding:6px 8px} td{border:1px solid #bbb;padding:5px 8px;vertical-align:top}
tr:nth-child(even) td{background:#f5f7f9} .note{background:#fff7e0;border-left:4px solid #F5820A;padding:8px 12px;margin:12px 0} .small{font-size:12px;color:#555}
.tag{display:inline-block;padding:1px 7px;border-radius:9px;font-size:11px;background:#e3eaf0} .toc a{display:block;color:#1C2B3A;text-decoration:none;padding:2px 0}
details{margin:8px 0;border:1px solid #ccc;border-radius:4px;padding:6px 10px} summary{cursor:pointer;font-weight:bold}
@media print{details{display:block} details>*{display:block} h2{page-break-after:avoid} table{page-break-inside:auto}}
</style></head><body><main>
<h1>Townhall - Rules, Options and Roles</h1>
<p class="small">Working name of the service for AOA, RWA and HOA meetings and elections. Generated from the software itself on ${new Date().toISOString().slice(0, 10)}. Terms version in force: ${e(TERMS_VERSION)}.</p>
<div class="note"><b>Read this first.</b> This document describes what the software is built to do. The legal values in the jurisdiction packs come from research on public sources and are <b>not legal advice</b>; each one carries a confidence level and a "needs lawyer" mark. Where research could not read the law, the value is left <b>blank, never guessed</b>, and the Organizer must enter their own bye-law value. The app has no user screens yet; the screens are designed in the UI contract.</div>

<div class="toc"><b>Contents</b>
<a href="#s1">1. What the service does</a><a href="#s2">2. Roles and how many</a><a href="#s3">3. Who can do what</a><a href="#s4">4. Life of an event</a><a href="#s5">5. Options (tick-boxes)</a>
<a href="#s6">6. Rule values</a><a href="#s7">7. Jurisdiction packs</a><a href="#s8">8. Attendance</a><a href="#s9">9. Agenda points, ballots and majorities</a><a href="#s10">10. Voting, proxies and secrecy</a>
<a href="#s11">11. Records, audit and privacy</a><a href="#s12">12. Report, PDF and publishing</a><a href="#s13">13. Languages, price and limits</a></div>

<h2 id="s1">1. What the service does</h2>
<p>One portal for a housing society (AOA, RWA, HOA, co-operative society) to run a <b>meeting</b> or an <b>election</b>: set the rules from the right law, list the flats and their vote weightage, publish the agenda, check people in, vote, and publish one sealed report that anybody can verify. Everything that matters is written in a signed, chained, public log that cannot be edited or deleted by anyone, including the platform owner.</p>
<ul><li>Pay per event, no subscription.</li><li>Mobile first; every choice is a tick-box.</li><li>One public page: a live dashboard during the event, which becomes the sealed final report.</li><li>The report is a single file with the data and a verifier inside; any change to it is detected.</li></ul>

<h2 id="s2">2. Roles and how many</h2>
${tbl(["Role", "How many", "What they do", "Conditions"], ROLES)}
<div class="note"><b>Team limits:</b> 1 Organizer. At most ${ROLE_LIMITS.hostsInclOrganizer} Hosts including the Organizer. At most ${ROLE_LIMITS.monitorsOnly} Attendance Monitors besides them. The Organizer and Hosts may also act as Attendance Monitors, which makes at most ${ROLE_LIMITS.monitorsTotal} monitors in all. The software refuses a further appointment with a plain message, and a log that breaks the limits is flagged by the verifier. Nobody can act until their e-mail is confirmed.</div>

<h2 id="s3">3. Who can do what</h2>
${tbl(["Action", "Who", "Conditions"], ACTIONS)}

<h2 id="s4">4. Life of an event</h2>
${tbl(["Stage", "What happens"], [
  ["1 Rules", "Pick the jurisdiction pack (or \"Any country\"), see what the law locks, enter any blank values."],
  ["2 Attendance (list)", "Flat list with vote weightage and who can vote: download the Excel sheet, fill it, save as PDF, upload the PDF; or enter and correct flats by hand, each with a reason. A preview is shown and nothing is saved until confirmed."],
  ["3 Agenda and pay", "Add discussion points, resolutions and election posts; pay; publish the agenda."],
  ["4 Quorum", "Attendance is marked; the quorum is checked before each vote (unless switched off)."],
  ["5 Vote", "Points are opened one at a time; each has a voting window that may be extended within the limits."],
  ["6 Count and publish", "Results are computed from the log; the report is sealed and published, by hand or automatically."],
])}
<p>Status of an event: <span class="tag">setup</span> <span class="tag">agenda published</span> <span class="tag">live</span> <span class="tag">closed</span> <span class="tag">suspended</span>. Once the report is published nothing can be added to the event.</p>
<h3>Four dates, each with day, date, time and place</h3>
<p>Meeting (or election) starts - Voting starts - Voting ends - Meeting (or election) ends. Each can only be at or after the one before. Count-down clocks run to the next one. The schedule cannot change once the event has started.</p>

<h2 id="s5">5. Options (tick-boxes)</h2>
<p>Each option is a tick-box. A jurisdiction pack may <b>lock</b> an option (for example "secret ballot is required for director elections") and then nobody can change it; the reason is shown.</p>
${tbl(["Option", "Default", "Notes"], OPTIONS.map((o) => [o.label, o.default === null ? "Organizer must decide" : yn(o.default), o.forceDecision ? "The law pack leaves this open, so the Organizer must choose before the agenda can be published." : ""]))}

<h2 id="s6">6. Rule values</h2>
<p>Values the pack fills in (with source and confidence) or the Organizer enters. "Shown on report" means the value is information for members and is not used in a calculation.</p>
${tbl(["Rule", "Type and range", "Default", "Meaning"], PARAMS.map((p) => [p.label, p.type === "int" ? `whole number ${p.min ?? ""}-${p.max ?? ""}` : p.type === "enum" ? (p.enumValues ?? []).join(" / ") : "yes / no", p.default === null ? "blank (must be filled" + (p.required ? ", required)" : ")") : String(p.default), (RULE_INFO_ONLY.has(p.id) ? "[shown on report] " : "") + p.help]))}

<h2 id="s7">7. Jurisdiction packs</h2>
<p>${packs.length} packs are loaded. Each lists: what the law locks, what it recommends, the notice days it found, and how sure the research is. <b>Only ${packs.length - 1} regimes have been read; everywhere else use "Any country" and enter the society's own bye-law values.</b> The research data is in <code>docs/research/rule-packs.json</code> with the source of every value.</p>
${packs.map((p) => `<details><summary>${e(p.name)} <span class="tag">${e(p.jurisdiction)}</span> <span class="tag">confidence: ${e(p.confidence)}</span> ${p.needsLawyer ? '<span class="tag">needs a lawyer</span>' : ""}</summary>
${tbl(["Option", "Value from the pack", "Locked by law?"], OPTIONS.filter((o) => p.options[o.key] !== undefined || p.locked[o.key]).map((o) => [o.label, p.locked[o.key] ? yn(p.locked[o.key]!.value) : yn(p.options[o.key]), p.locked[o.key] ? "LOCKED: " + p.locked[o.key]!.reason : "no"]))}
${tbl(["Rule", "Value"], Object.entries(p.params).filter(([, v]) => v !== null && v !== undefined).map(([k, v]) => [paramLabel.get(k) ?? k, String(v)]))}
${Object.keys(p.notice).length ? tbl(["Event type", "Notice days (min - max)"], Object.entries(p.notice).map(([k, v]) => [k, `${v?.min ?? "not verified"} - ${v?.max ?? "not verified"}`])) : ""}
${p.recommended.length ? "<p><b>Recommended:</b> " + p.recommended.map(e).join("; ") + "</p>" : ""}</details>`).join("\n")}
<details><summary>${e(CUSTOM_WORLD_PACK.name)} <span class="tag">ANY</span></summary><p>For any country or any society whose law is not in the list. Nothing is pre-filled except "check quorum". The Organizer enters notice period, quorum, majorities and proxy rules from their own bye-laws, and the report shows that these values were entered by the society.</p></details>

<h2 id="s8">8. Attendance</h2>
<p>The person shows proof to the Attendance Monitor, who enters the name against the flat. If the name was uploaded earlier, the monitor confirms it; a change must go to the Organizer or a Host. The attendee then checks their own name, flat and status on their own phone and submits a <b>4-digit number</b>; the monitor enters theirs; both must match. This gives two independent confirmations.</p>
<ul><li>Exchange of the two 4-digit numbers: 5 wrong tries per side, valid 10 minutes; the monitor's device and the voter's device must differ; an optional text-message check of the mobile number is available.</li>
<li>The attendee's phone is bound to the flat. Opening the same link later on the same phone or browser takes the person back to the exact point; another phone is refused and the refusal is recorded.</li>
<li>Printed ballots can be used for people without phones (section 10).</li></ul>
<h3>The monitor's tick-boxes (one screen)</h3>
${tbl(["Tick-box", "Why"], ATTENDANCE_CHECKS.map((c) => [c.label, c.help]))}
<p>When the option "Attendance Monitor must tick every box" is on, marking present is refused until all required boxes are ticked (and, if photos are on, the photo exists).</p>
<h3>Photo of the attendee (optional)</h3>
<p>When switched on: the monitor takes the photo only after the person agrees. The record keeps the date and time, the latitude and longitude the phone reported, the place the network reports, and notes if they disagree (no location, very far apart, phone clock wrong). The photo is stored encrypted, is not public, and can be seen only by the Organizer and Hosts. The public record holds only the photo's fingerprint and time. A phone's location can be faked, so these notes are for a human to look at, not proof.</p>

<h2 id="s9">9. Agenda points, ballots and majorities</h2>
${tbl(["Point type", "What it is"], [["Discussion", "No vote; recorded in the minutes."], ["Resolution", "Yes / No, and Abstain if allowed; decided by a majority class."], ["Election post", "Two or more candidates; each option is a tick-box; the Organizer sets the minimum and maximum ticks."]])}
<h3>Majority classes</h3>${tbl(["Class", "Meaning"], MAJ)}
<p>Other majority settings: what the simple and special majorities are counted on (votes cast / present / total), whether abstentions count, and what a tie does (not carried, chair's casting vote, or lots).</p>
<h3>Election formats</h3>${tbl(["Format", "Meaning"], Object.entries(FORMAT_LABEL).map(([k, v]) => [k, v]))}
<p>The report shows the numbers; it names a winner only if the pack permits and the Organizer ticks "report names the leader(s)". Every candidate has a unique id.</p>
<h3>Ballot design (set by the Organizer)</h3>
${tbl(["Setting", "Choices"], [["Layout", "list / cards / grid"], ["Columns (wide screens)", "1 or 2"], ["Order", "as listed / shuffled for each voter"], ["Colour", "any #RRGGBB (default " + defaultBallotDesign().accent + ")"], ["Heading and extra instruction", "own text (up to 200 letters)"], ["Numbers on options", "yes / no"], ["Size of tick targets", "normal / large (default large)"]])}
<p>A ticked box means "yes, selected"; an unticked box means "no, not selected". The instruction line, such as "Tick up to 3", is printed automatically.</p>

<h2 id="s10">10. Voting, proxies and secrecy</h2>
<ul><li><b>One flat, one vote per point</b> (or the flat's weightage when weighted voting is on). Voting is allowed only for a flat that is on the list, eligible, and marked present, while the point is open and inside its time window (the server clock decides).</li>
<li><b>Proxy:</b> only if the pack or the Organizer switches it on. One person may hold a limited number of proxies (default 1, up to 20). A proxy's votes are shown separately from official votes; the split is hidden when the numbers are very small (default below 5 votes) so nobody can be identified.</li>
<li><b>Secret ballot:</b> the system records <i>that</i> a flat voted and when, but the choice is kept in a separate box with no flat number and no time. The voter gets a receipt code that proves the ballot was counted without showing the choice. Open voting (by flat) is a separate option.</li>
<li><b>Printed ballots:</b> each paper has its own unique QR code; the monitor photographs the returned paper, the system reads the ticks, and the paper is counted once. Counted, invalid, voided and not-returned papers are all accounted for in the report. A paper cannot be traced back to a voter.</li>
<li><b>Quorum:</b> counted by weight or by number of flats, with the percentage and "more than" setting from the rule; an adjourned meeting can use a lower or no quorum.</li>
<li><b>Voting window:</b> each point has a time limit; it can be extended a limited number of times if the option is on.</li></ul>

<h2 id="s11">11. Records, audit and privacy</h2>
<ul><li><b>The public log</b> is signed and chained: every entry includes the fingerprint of the one before. Removing or changing any entry breaks the chain and is detected by anyone.</li>
<li><b>Everything is logged</b> with date, time, IP address, device, browser session and browser cookie id, browser and client details, and the place the network reports. These details are stored encrypted; the public log carries only a fingerprint. If the audit entry cannot be written, the action is refused.</li>
<li><b>Terms</b> must be ticked by every Organizer, Host, monitor and voter once; the acceptance is a signed entry in the log.</li>
<li><b>Names, e-mail addresses and mobile numbers are never public in full</b>; they appear partly hidden (for example Ra***). A scanner checks the public report for any full address or number before it is sealed.</li>
<li><b>Append-only tables:</b> records of votes, attendance, rules, roll revisions, uploaded flat-list PDFs and attendance photos cannot be edited or deleted. After the report is published, nothing can be added.</li>
<li><b>6-digit passcodes</b> for sign-in: single use, tied to the person and purpose, locked after 6 wrong tries.</li>
<li><b>Resume:</b> each person can be traced across every request they made by the fingerprints, so it is possible to show that a given flat's attendee did vote.</li>
<li><b>Erasure:</b> on a lawful request the Organizer can make private details unreadable; the public fingerprints remain.</li></ul>

<h2 id="s12">12. Report, PDF and publishing</h2>
<ul><li>The final report is one sealed HTML file with an embedded verifier, plus a PDF for signature, in the chosen language. It can be e-mailed.</li>
<li>It shows: rules used and every change with reasons, the flat list summary, attendance and whether it was independently verified, quorum, each point's result and the working, the schedule, the team and who appointed whom, the access summary, and the proof of integrity.</li>
<li>With automatic publishing on (default), the event closes and the report is published within 120 seconds of the scheduled end.</li>
<li>Anyone can clone an event's structure (rules, agenda, team roles) into a new event; contacts, codes, images and votes are never copied.</li></ul>

<h2 id="s13">13. Languages, price and limits</h2>
<p><b>Price (per event):</b> India - meeting ${e(money("meeting", "IN"))}, election ${e(money("election", "IN"))}. Rest of the world - meeting ${e(money("meeting", "US"))}, election ${e(money("election", "US"))}. Payment runs in test mode only until live payments are connected.</p>
<p><b>Languages (${LANGUAGES.length}):</b> ${LANGUAGES.map((l) => `${e(l.name)} (${e(l.native)})${l.status === "complete" ? "" : " - draft"}`).join(", ")}. Languages other than English and Hindi are drafts that need a native reader before launch. Each role has a plain-words guide.</p>
<h3>What is not finished (honest list)</h3>
<ul><li>No user screens yet (the screens are designed, not built); never run on the live platform.</li>
<li>Only ${packs.length - 1} legal regimes have been researched, with confidence marks; every value needs a lawyer's review before it is relied on.</li>
<li>The printed-ballot reader is tested on drawn images only, not real photographs. The flat-list PDF reader is tested on PDFs built like Excel's, not yet on a real file saved by Excel.</li>
<li>The working name "Townhall" has not been cleared as a brand. Translations need native review.</li>
<li>No software can promise 100% correctness; the tests, simulations and breakage checks are recorded in the project's confidence document.</li></ul>
</main></body></html>`;

await Bun.write(out, html);
console.log("written", out, html.length, "bytes");

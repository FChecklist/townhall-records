// Renders the public event page. ONE page for the whole life of the event: it is the live dashboard while the event runs
// and, at the same address, becomes the sealed final report. Deterministic: same log in, same bytes out (no clock, no randomness).
import { signMessage } from "./crypto";
import type { SignedEntry } from "./log";
import { SEAL_CLOSE, SEAL_OPEN, fileDigest, reportMessage, type EmbeddedData, type ReportModel, type Seal } from "./model";
import { NOT_PUBLISHED } from "./model";
import { percentText } from "./tally";
import { FORMAT_LABEL } from "./ballot";
import { LANGUAGES, dictionary } from "./i18n";
import { BRAND, BRAND_LINE } from "./brand";
import { MILESTONE_KEYS, dayParts, milestoneLabel } from "./schedule";
import { VERIFIER_JS } from "./verifier.generated";

const esc = (x: unknown) => String(x ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const jsonForScript = (o: unknown) => JSON.stringify(o).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");

const PHASES: Array<{ id: string; en: string; hi: string; svg: string }> = [
  { id: "rules", en: "Rules", hi: "नियम", svg: '<path d="M12 6h18l8 8v28H12z"/><path d="M17 20h16M17 27h16M17 34h10"/>' },
  { id: "attendance", en: "Attendance", hi: "उपस्थिति", svg: '<circle cx="24" cy="16" r="7"/><path d="M10 40c2-9 8-12 14-12s12 3 14 12"/><path d="M32 22l4 4 7-8"/>' },
  { id: "quorum", en: "Quorum", hi: "कोरम", svg: '<circle cx="16" cy="18" r="5"/><circle cx="32" cy="18" r="5"/><circle cx="24" cy="30" r="5"/><path d="M6 42c1-7 5-9 10-9M42 42c-1-7-5-9-10-9"/>' },
  { id: "vote", en: "Vote", hi: "मतदान", svg: '<rect x="8" y="20" width="32" height="20" rx="2"/><path d="M18 20v-4h12v4M20 8l4 8 4-8"/>' },
  { id: "count", en: "Count", hi: "गिनती", svg: '<rect x="10" y="6" width="28" height="36" rx="3"/><path d="M16 14h16M16 22h4M24 22h4M32 22h0M16 30h4M24 30h4M16 37h4M24 37h4"/>' },
  { id: "publish", en: "Publish", hi: "प्रकाशन", svg: '<path d="M12 6h18l8 8v28H12z"/><path d="M17 28l5 5 9-11"/>' },
];
const bp = (n: number) => percentText(n);
const money = (minor: number, cur: string) => `${cur === "USD" ? "USD " : "Rs "}${Math.floor(minor / 100)}.${String(minor % 100).padStart(2, "0")}`;
const dt = (ms: number) => (ms ? new Date(ms).toISOString().replace("T", " ").slice(0, 16) + " UTC" : "not set");

function tree(nodes: ReportModel["tree"], by: Map<string, string>): string {
  if (!nodes.length) return "";
  return "<ul>" + nodes.map((n) => `<li><b>${esc(n.maskedName)}</b> <span class="tag">${esc(n.roles.join(" + ").replace(/_/g, " ") || "removed")}</span>${n.label ? ` <span class="tag lab">${esc(n.label)}</span>` : ""}${tree(n.children, by)}</li>`).join("") + "</ul>";
}

function pointHtml(m: ReportModel, p: ReportModel["points"][number]): string {
  const t = p.tally;
  const stateTxt = p.state === "pending" ? "Not opened yet" : p.state === "open" ? "VOTING OPEN" : "Closed";
  let h = `<section class="pt ${esc(p.state)}"><h3>${esc(p.number)} &nbsp; ${esc(p.title)} <span class="st">${stateTxt}</span></h3>`;
  if (p.body) h += `<p>${esc(p.body)}</p>`;
  const L = (id: string) => esc(p.labels[id] ?? id);
  if (p.kind !== "discussion") h += `<p class="meta">Ballot paper: ${esc(p.design.layout)} layout, ${p.design.columns === 2 ? "two columns on a wide screen, one on a phone" : "one column"}, ${p.design.order === "shuffled" ? "options in a different order for each voter" : "options in the listed order"}, ${esc(p.design.size)} tick boxes. ${esc(p.instruction)}${p.kind === "election_post" && p.format ? " Format: " + esc(FORMAT_LABEL[p.format]) + (p.format === "ranked_posts" ? " (" + p.seats.map(esc).join(", ") + ")" : p.format === "top_n" ? " (first " + p.topN + ")" : "") + "." : ""}</p>`;
  h += `<p class="meta">${p.kind === "discussion" ? "Discussion" : p.kind === "election_post" ? `Election: choose up to ${p.maxChoices}` : `Resolution, majority needed: ${esc(p.majorityClass.replace(/_/g, " "))}`} · ${p.secret ? "secret ballot" : "open vote by flat"}${p.endsMs ? ` · closes ${esc(dt(p.endsMs))}` : ""}${p.extensions ? ` · extended ${p.extensions}x` : ""}</p>`;
  if (p.kind !== "discussion" && p.state !== "pending") {
    h += `<p><b>${p.voted.length}</b> of <b>${m.attendance.present}</b> present flats have voted${p.voted.length ? ": " + p.voted.map(esc).join(", ") : ""}</p>`;
    if (p.countsHidden) h += `<p class="note">Totals appear when voting on this secret ballot closes.</p>`;
    if (t && !p.countsHidden) {
      h += `<table><tr><th data-i18n="th.option">Option</th><th data-i18n="th.ticked">Ticked = yes</th><th data-i18n="th.notTicked">Not ticked = no</th><th data-i18n="th.weight">Weight</th><th data-i18n="th.votePct">Vote %</th></tr>` + t.options.map((o) => `<tr><td>${L(o.option)} <small class="mono">${esc(o.option)}</small></td><td>${o.count}</td><td>${o.notSelected}</td><td>${o.weight}</td><td>${bp(o.percentBp)}</td></tr>`).join("") + "</table>";
      if (t.ranking) h += `<p><b>Ranking</b> (ties share a rank): ${t.ranking.map((r) => `${r.rank}. ${L(r.option)} (${r.count})${r.tied ? " tie" : ""}`).join(" | ")}</p>`;
      if (t.assignment?.seats) h += `<p><b>By rank (for the Returning Officer to confirm):</b> ${t.assignment.seats.map((x) => `${esc(x.seat)}: ${x.option ? L(x.option) : "-"}${x.tied ? " (tie)" : ""}`).join(" | ")}${t.assignment.needsReturningOfficer ? ` <span class="warn">A tie needs the Returning Officer.</span>` : ""}</p>`;
      if (t.assignment?.selected) h += `<p><b>First ${t.assignment.selected.length} by votes (for the Returning Officer to confirm):</b> ${t.assignment.selected.map(L).join(", ")}${t.assignment.tieAtCutoff ? ` <span class="warn">A tie at the cut-off needs the Returning Officer.</span>` : ""}</p>`;
      if (t.majority) h += `<p>Counted on ${esc(t.majority.basis)} (${t.majority.base}); needs ${t.majority.num}/${t.majority.den}${t.majority.strict ? " (more than)" : ""}. Result: <b>${esc(t.outcome.replace(/_/g, " "))}</b></p>`;
      else if (p.kind === "election_post") h += `<p>Numbers only. The returning officer or chair declares the result.${t.leaders ? " Leading: " + t.leaders.map(L).join(", ") : ""}</p>`;
      if (t.split) h += `<p class="note">Official voters: ${esc(JSON.stringify(t.split.official))} · Proxy voters: ${esc(JSON.stringify(t.split.proxy))}</p>`;
    }
    if (p.paper) h += `<p class="meta">Paper ballots: ${p.paper.serials} issued, ${p.paper.counted} counted, ${p.paper.invalid} invalid, ${p.paper.voided} voided, ${p.paper.uncounted} not returned. Fingerprint of the photographs: <span class="mono">${esc(p.paper.imagesDigest.slice(0, 20))}</span></p>`;
    if (p.openVotes && p.openVotes.length) h += `<details><summary>How each flat voted</summary><table><tr><th>Flat</th><th>Voter</th><th>Choice</th></tr>${p.openVotes.map((v) => `<tr><td>${esc(v.flatNo)}</td><td>${esc(v.kind)}</td><td>${esc(v.choices.map((c) => p.labels[c] ?? c).join(", "))}</td></tr>`).join("")}</table></details>`;
    if (p.receipts) h += `<details><summary>${p.receipts.length} receipt codes (check yours is in the list)</summary><p class="mono">${p.receipts.map(esc).join("<br>")}</p></details>`;
  }
  return h + "</section>";
}

/** The page, unsealed (empty seal block). `sealed` only changes the banner wording and disables live refresh. */
export function renderReportHtml(model: ReportModel, log: SignedEntry[], publicKey: string, kid: string): string {
  const live = model.live;
  const ph = PHASES.findIndex((p) => p.id === model.stage);
  const att = model.attendance;
  const q = model.quorum;
  const tracker = `<ol class="track">` + PHASES.map((p, i) => `<li class="${i < ph ? "done" : i === ph ? "now" : ""}"><svg viewBox="0 0 48 48" width="44" height="44" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p.svg}</svg><span><b data-i18n="stage.${p.id}">${p.en}</b><br><small>${p.hi}</small></span></li>`).join("") + "</ol>";
  const data: EmbeddedData = { model, log, publicKey, kid };
  const verifierJs = VERIFIER_JS.replace(/<\/script/gi, "<\\/script");
  const optionsRows = model.options.map((o) => `<li>${o.value === true ? "☑" : o.value === false ? "☐" : "◻ (undecided)"} ${esc(o.label)}${o.locked ? ` <small class="lock">locked by the rules: ${esc(o.reason)}</small>` : ""}</li>`).join("");
  const ruleRows = model.rules.filter((r) => r.value !== null).map((r) => `<tr><td>${esc(r.param)}</td><td>${esc(JSON.stringify(r.value))}</td></tr>`).join("");
  const hist = model.ruleHistory.length ? `<table><tr><th>#</th><th>Time</th><th>Rule</th><th>Was</th><th>Now</th><th>Reason</th></tr>${model.ruleHistory.map((r) => `<tr><td>${r.seq}</td><td>${esc(dt(r.ts))}</td><td>${esc(r.param)}${r.scope !== "event" ? " (point)" : ""}</td><td>${esc(JSON.stringify(r.old))}</td><td>${esc(JSON.stringify(r.new))}</td><td>${esc(r.reason)}</td></tr>`).join("")}</table>` : "<p>No rule was changed.</p>";
  const rej = model.rejected.length ? `<p class="warn">${model.rejected.length} attempt(s) to change a rule after voting opened were refused and logged.</p>` : "";
  const noticeTxt = model.notice ? (model.notice.met === null ? `Notice given: ${model.notice.givenDays} days (no minimum was set).` : `Notice given: ${model.notice.givenDays} days; required at least ${model.notice.minDays}${model.notice.maxDays !== null ? ` and at most ${model.notice.maxDays}` : ""}: <b>${model.notice.met ? "met" : "NOT met"}</b>.`) : "The agenda has not been published yet.";
  const attRows = att.rows.map((r) => `<tr><td>${esc(r.flatNo)}</td><td>${esc(r.mode)}</td><td>${esc(r.method)}${r.docType ? " · " + esc(r.docType) + (r.docLast4 ? " …" + esc(r.docLast4) : "") : ""}</td><td>${r.independent ? "officer" : "organizer/host"}</td></tr>`).join("");
  const dtl = (ms: number) => esc(dt(ms));
  const sb = (cls: string, head: string, body: string) => `<div class="card outcome ${cls}" id="outcome"><p style="font-size:1.35em;margin:.1em 0"><b>${head}</b></p>${body}</div>`;
  const reasonsLine = (rs: string[], r: string) => (rs.length || r ? `<p><b>Why:</b> ${rs.map(esc).join("; ")}${rs.length && r ? ". " : ""}${esc(r)}</p>` : "");
  const lastPp = model.postponements[model.postponements.length - 1];
  const ppRows = model.postponements.length ? `<table><tr><th>#</th><th>When decided</th><th>Moved from</th><th>Moved to</th><th>Why</th><th>Fee</th></tr>${model.postponements.map((x, i) => `<tr><td>${i + 1}</td><td>${dtl(x.ts)}${x.phase === "before_start" ? " (before the start time)" : " (after the start time)"}</td><td>${dtl(x.fromStartMs)}</td><td>${dtl(x.to.start.atMs)} · ${esc(x.to.start.place)}</td><td>${x.reasons.map(esc).join("; ")}${x.reason ? " " + esc(x.reason) : ""}</td><td>${x.feeMinor ? (x.feeMinor / 100).toFixed(2) : "free"}</td></tr>`).join("")}</table>` : "";
  const statusBlock = model.outcome === "postponed" && lastPp
    ? sb("warnbox", "POSTPONED", `<p>This ${esc(model.kind)} is postponed to <b>${dtl(lastPp.to.start.atMs)}</b> at <b>${esc(lastPp.to.start.place)}</b>. What was decided so far stays on record. Attendance is taken again on the new date.</p>${reasonsLine(lastPp.reasons, lastPp.reason)}${ppRows}`)
    : model.outcome === "completed" ? sb("okbox", "COMPLETED", `<p>Every agenda point was taken up and the ${esc(model.kind)} finished.</p>${ppRows ? "<h3>It was postponed earlier</h3>" + ppRows : ""}`)
    : model.outcome === "stopped" ? sb("warnbox", "STOPPED IN BETWEEN", `<p>The ${esc(model.kind)} began but was stopped before every point was taken up. Votes already cast are in this record. Points not taken up are marked so below.</p>${model.outcomeInfo ? reasonsLine(model.outcomeInfo.reasons, model.outcomeInfo.reason) : ""}${ppRows ? "<h3>It was postponed earlier</h3>" + ppRows : ""}`)
    : model.outcome === "cancelled" ? sb("warnbox", "CANCELLED", `<p>This ${esc(model.kind)} was cancelled and did not take place.</p>${model.outcomeInfo ? reasonsLine(model.outcomeInfo.reasons, model.outcomeInfo.reason) : ""}${ppRows ? "<h3>It was postponed earlier</h3>" + ppRows : ""}`)
    : lastPp ? sb("warnbox", "RESCHEDULED", `<p>This ${esc(model.kind)} now starts <b>${dtl(lastPp.to.start.atMs)}</b> at <b>${esc(lastPp.to.start.place)}</b>.</p>${reasonsLine(lastPp.reasons, lastPp.reason)}${ppRows}`) : "";
  const banner = live
    ? `<div class="banner live" id="banner"><b data-i18n="page.live">LIVE</b> <span data-i18n="note.liveBanner">This page updates by itself. When the event closes, this same page becomes the final signed report.</span></div>`
    : `<div class="banner done" id="banner"><b data-i18n="page.final">FINAL REPORT</b> <span data-i18n="note.finalBanner">Signed and sealed. Anyone may save this page. It cannot be edited without being detected.</span></div>`;
  const sched = MILESTONE_KEYS.map((k) => { const m = model.schedule[k]; const d = dayParts(m.atMs, model.timezone); return `<tr><td><b>${esc(milestoneLabel(model.kind, k))}</b></td><td>${esc(d.day)}</td><td>${esc(d.date)}</td><td>${esc(d.time)}</td><td>${esc(m.place)}</td></tr>`; }).join("");
  const zone = dayParts(model.schedule.start.atMs, model.timezone).zone;
  const scheduleHtml = `<h2 data-i18n="sec.schedule">Schedule</h2><div class="card"><div id="timers" class="timers" aria-live="off">${live ? '<div class="bigtime" id="tm-head">…</div><ul id="tm-list" class="tmlist"></ul>' : "<p><b data-i18n='note.ended'>This event has ended.</b></p>"}</div><table><tr><th></th><th data-i18n="th.day">Day</th><th data-i18n="th.date">Date</th><th><span data-i18n="th.time">Time</span> (${esc(zone)})</th><th data-i18n="th.place">Place</th></tr>${sched}</table>${model.scheduleChanges ? `<p class="warn">The schedule was changed ${model.scheduleChanges} time(s); see the log.</p>` : ""}</div>`;
  const styles = `:root{--ink:#1b2430;--soft:#5b6775;--ok:#117a4d;--warn:#b25b00;--bg:#fbfaf7;--card:#fff;--line:#dcd8cf}*{box-sizing:border-box}body{margin:0;font:18px/1.55 system-ui,Segoe UI,Arial,sans-serif;color:var(--ink);background:var(--bg)}main{max-width:900px;margin:0 auto;padding:16px}h1{font-size:1.6rem;margin:.2em 0}h2{font-size:1.25rem;margin:1.6em 0 .4em;border-bottom:2px solid var(--line);padding-bottom:.2em}h3{font-size:1.1rem;margin:.2em 0}.card,section.pt{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 16px;margin:12px 0}table{border-collapse:collapse;width:100%;font-size:.95rem}th,td{border-bottom:1px solid var(--line);padding:6px 8px;text-align:left;vertical-align:top}.mono{font:12px/1.4 ui-monospace,Consolas,monospace;word-break:break-all}.banner{border-radius:10px;padding:10px 14px;margin:10px 0}.live{background:#fff2d9;border:1px solid #e8c47a}.done{background:#e3f5ea;border:1px solid #8fcfa8}.track{display:flex;gap:8px;list-style:none;padding:0;margin:12px 0}.track li{flex:1;text-align:center;color:#9aa3ad;border:2px solid var(--line);border-radius:12px;padding:8px 4px;background:var(--card)}.track li.done{color:var(--ok);border-color:#8fcfa8}.track li.now{color:#fff;background:var(--ink);border-color:var(--ink)}.tag{background:#eef0f3;border-radius:999px;padding:1px 9px;font-size:.8rem}.lab{background:#fdf0d5}.st{float:right;font-size:.8rem;background:#eef0f3;border-radius:999px;padding:2px 10px}.pt.open .st{background:#ffe3a3}.warn{color:var(--warn)}.note,.meta,small{color:var(--soft)}button,input[type=file]{font:inherit;padding:10px 16px;border-radius:10px;border:2px solid var(--ink);background:#fff}button{background:var(--ink);color:#fff;cursor:pointer}details{margin:8px 0}summary{cursor:pointer;font-weight:600}.brandline{margin:6px 0 0;font-size:.95rem;color:var(--soft)}.brandline b{color:var(--ink);font-size:1.1rem;letter-spacing:.03em}.topbar{display:flex;justify-content:flex-end;align-items:center;gap:8px}.topbar select{font:inherit;padding:6px 10px;border-radius:8px;border:2px solid var(--ink);background:#fff}.bigtime{font-size:2.2rem;font-weight:700;letter-spacing:.02em}.tmlist{list-style:none;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:8px}.tmlist li{border:1px solid var(--line);border-radius:10px;padding:6px 10px}.tmlist .t{font-weight:700;font-size:1.15rem}.tmlist .past{color:#9aa3ad}.fine{font-size:.85rem;color:var(--soft)}@media print{.noprint{display:none}body{font-size:12px}}@media(max-width:560px){.track span small{display:none}}`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(model.society.name)} · ${esc(model.title)} · ${BRAND}</title><meta name="robots" content="noindex"><style>${styles}</style></head><body><main>
<div class="topbar"><label for="lang-select" data-i18n="lang.label">Language</label> <select id="lang-select" aria-label="Language">${LANGUAGES.map((l) => `<option value="${l.code}">${esc(l.native)}</option>`).join("")}</select></div>
<p class="brandline"><b>${BRAND}</b> <span>${BRAND_LINE}</span></p>
<p class="fine" data-i18n="note.privacy">Personal details on this page are partly hidden with * to protect privacy.</p>
<h1>${esc(model.title)}</h1><p><b>${esc(model.society.name)}</b> · ${esc(model.society.kind)} · Reg. no. ${esc(model.society.registrationNo)}<br>${esc(model.society.address)}<br>${esc(model.eventType.toUpperCase())} · ${esc(dt(model.scheduledMs))} · ${esc(model.venue)}${model.createdFrom ? `<br><small>Created from event ${esc(model.createdFrom.slice(0, 8))}…</small>` : ""}</p>
${tracker}${banner}
${statusBlock}
${scheduleHtml}
<div class="card"><b>Check this page</b> <button class="noprint" id="vbtn" type="button" data-i18n="btn.verify">Verify</button>${live ? "" : ` <a class="noprint" href="/api/r/${esc(model.eid)}/pdf" data-i18n="btn.pdf">Download PDF</a> <a class="noprint" href="/api/r/${esc(model.eid)}?download=1" data-i18n="btn.save">Save this page</a>`} <span id="verify-out" role="status">Not checked yet.</span>
<p class="fine mono">Log entries: ${model.head?.seq ?? 0} · head ${esc(model.head?.hash ?? "")} · key ${esc(kid)}</p>
<p class="fine">The check is done by the code inside this page. Someone who edits this file could also edit that code, so for full certainty compare the file hash with the published one, or run the check from the published verifier.</p>
<p class="noprint fine">Saved copy? Choose it to check it: <input type="file" id="vfile" accept=".html"></p></div>
<h2 data-i18n="sec.people">People and who appointed whom</h2><div class="card">${tree(model.tree, new Map())}${model.people.length ? "" : "<p>No people yet.</p>"}</div>
<h2 data-i18n="sec.options">Options used</h2><div class="card"><ul style="list-style:none;padding-left:0">${optionsRows}</ul></div>
<h2 data-i18n="sec.rules">Rules</h2><div class="card"><table>${ruleRows || "<tr><td>No numeric rules set.</td></tr>"}</table><h3>Rule change history</h3>${hist}${rej}</div>
<h2 data-i18n="sec.checks">Checked against the rules</h2><div class="card"><p class="fine">Rules in use: <b>${esc(model.compliance.packName || model.packId)}</b>${model.compliance.packConfidence ? ` · confidence of the pack: ${esc(model.compliance.packConfidence)}` : ""}${model.compliance.needsLawyer ? " · the society should confirm these values against its own bye-laws" : ""}</p><table><tr><th>Check</th><th>Result</th><th>Detail</th></tr>${model.compliance.checks.map((c) => `<tr><td>${esc(c.label)}</td><td><b>${c.status === "pass" ? "✔ pass" : c.status === "fail" ? "✘ FAIL" : c.status === "not_set" ? "not set" : "info"}</b></td><td>${esc(c.detail)}</td></tr>`).join("")}</table><p class="fine">${esc(model.compliance.disclaimer)}</p></div>
<h2 data-i18n="sec.notice">Notice</h2><div class="card"><p>${noticeTxt}</p></div>
<h2 data-i18n="sec.attendance">Attendance and quorum</h2><div class="card"><p><b>${esc(att.line)}</b></p><p>${att.present} of ${att.total} flats present${q ? ` · quorum: ${q.present} present, ${q.required} needed (${esc(q.basis ?? "")}): <b>${q.met ? "met" : "not met"}</b>` : " · quorum check was off"}</p>
${attRows ? `<details><summary>Present flats</summary><table><tr><th>Flat</th><th>Mode</th><th>Checked by</th><th>Marked by</th></tr>${attRows}</table></details>` : ""}</div>
<h2 data-i18n="sec.agenda">Agenda and results</h2>${model.points.map((p) => pointHtml(model, p)).join("") || '<div class="card">No agenda points yet.</div>'}
${model.payments.length ? `<h2 data-i18n="sec.payment">Payment</h2><div class="card">${model.payments.map((p) => `${esc(money(p.amountMinor, p.currency))} · ${esc(p.state)} · ${esc(p.mode)} mode`).join("<br>")}</div>` : ""}
${model.platformActions.length ? `<h2>Platform actions</h2><div class="card">${model.platformActions.map((a) => `#${a.seq} ${esc(a.action)}: ${esc(a.reason)}`).join("<br>")}</div>` : ""}
${model.problems.length ? `<h2 class="warn">Problems found in the log</h2><div class="card warn">${model.problems.map(esc).join("<br>")}</div>` : ""}
<h2 data-i18n="sec.log">Complete log</h2><details><summary>${log.length} entries</summary><table class="mono"><tr><th>#</th><th>Time</th><th>Type</th><th>Hash</th></tr>${log.map((l) => `<tr><td>${l.entry.seq}</td><td>${esc(dt(l.entry.ts))}</td><td>${esc(l.entry.type)}</td><td>${esc(l.hash.slice(0, 16))}…</td></tr>`).join("")}</table></details>
<h2 data-i18n="sec.access">Access trail and terms</h2><div class="card"><p>${model.access.termsAccepted} terms acceptance(s) are recorded: every Organizer, Host, Attendance Officer and voter ticked the terms before acting. ${model.access.entriesWithAccessFingerprint} of ${model.access.entries} log entries carry a coded fingerprint of the IP address and device that made the request. The addresses themselves are private (see below).</p></div>
<h2 data-i18n="sec.notpub">What is not published and why</h2><div class="card"><ul>${NOT_PUBLISHED.map((n) => `<li><b>${esc(n.item)}</b>: ${esc(n.why)}</li>`).join("")}</ul></div>
<p class="fine">${BRAND} records and checks. It is tamper-evident and independently verifiable; it does not give legal advice.</p>
</main>
<script type="application/json" id="aoa-i18n">${jsonForScript(Object.fromEntries(LANGUAGES.map((l) => [l.code, dictionary(l.code)])))}</script>
<script type="application/json" id="aoa-data">${jsonForScript(data)}</script>
<script>${verifierJs}</script>
<script>(function(){var D=JSON.parse(document.getElementById('aoa-i18n').textContent);var sel=document.getElementById('lang-select');var RTL={ar:1,ur:1};
function apply(l){var d=D[l]||D.en;document.documentElement.lang=l;document.documentElement.dir=RTL[l]?'rtl':'ltr';var ns=document.querySelectorAll('[data-i18n]');for(var i=0;i<ns.length;i++){var k=ns[i].getAttribute('data-i18n');if(d[k])ns[i].textContent=d[k];}sel.value=l;try{localStorage.setItem('aoaLang',l);}catch(e){}}
var q=(location.search.match(/[?&]lang=([a-z]{2})/)||[])[1];var saved;try{saved=localStorage.getItem('aoaLang');}catch(e){}
var start=q||saved||(navigator.language||'en').slice(0,2);if(!D[start])start='en';sel.onchange=function(){apply(sel.value);};if(start!=='en')apply(start);else sel.value='en';})();</script>
<script>(function(){var LIVE=${live ? "true" : "false"};var d=JSON.parse(document.getElementById('aoa-data').textContent);var out=document.getElementById('verify-out');
function show(ok,p){out.textContent=ok?'Verified: every entry links, every signature is valid and all figures match the log.':'NOT VERIFIED: '+p.join('; ');out.style.color=ok?'#117a4d':'#b25b00';}
async function run(){out.textContent='Checking…';try{var sealEl=document.getElementById('aoa-seal');var r=await aoaVerify.verifyEmbedded(d,undefined);var p=r.problems.slice();
if(!LIVE&&sealEl){try{var t=await (await fetch(location.href)).text();var v=await aoaVerify.verifyReportHtml(t);if(!v.ok)p=p.concat(v.problems);}catch(e){p.push('(file seal not re-checked here; choose a saved copy below)');}}
show(p.length===0||(p.length===1&&p[0].indexOf('file seal not')===0),p);}catch(e){show(false,[String(e)]);}}
document.getElementById('vbtn').onclick=run;
document.getElementById('vfile').onchange=async function(e){var f=e.target.files[0];if(!f)return;var t=await f.text();var v=await aoaVerify.verifyReportHtml(t);show(v.ok,v.problems);};
var off=0;function openEnds(){var ps=d.model.points;for(var i=0;i<ps.length;i++){if(ps[i].state==='open'&&ps[i].endsMs)return ps[i].endsMs;}return null;}
function tick(){var hd=document.getElementById('tm-head');if(!LIVE||!hd||!window.aoaTimers)return;var c=aoaTimers.countdowns(d.model.schedule,d.model.kind,Date.now()+off,openEnds());hd.textContent=c.headline?c.headline.label+' '+c.headline.text:'All steps are over';var ul=document.getElementById('tm-list');ul.innerHTML='';c.all.forEach(function(x){var li=document.createElement('li');if(x.state==='passed')li.className='past';var a=document.createElement('div');a.textContent=x.label;var b=document.createElement('div');b.className='t';b.textContent=x.state==='passed'?'done':x.text;li.appendChild(a);li.appendChild(b);ul.appendChild(li);});}
tick();setInterval(tick,1000);
if(LIVE&&location.protocol.indexOf('http')===0){fetch('/api/r/'+d.model.eid+'/head',{cache:'no-store'}).then(function(r){return r.json();}).then(function(h){if(h.serverNow)off=h.serverNow-Date.now();}).catch(function(){});setInterval(async function(){try{var h=await (await fetch('/api/r/'+d.model.eid+'/head',{cache:'no-store'})).json();if(h.serverNow)off=h.serverNow-Date.now();if(h.seq!==(d.model.head&&d.model.head.seq)||h.status==='closed')location.reload();}catch(e){}},10000);}
})();</script>
${SEAL_OPEN}<script type="application/json" id="aoa-seal">{}</script>${SEAL_CLOSE}
</body></html>`;
  return html;
}

/** Signs the file: digest of the page with the seal block emptied, Ed25519 signature, seal written between the markers. */
export async function sealReport(html: string, model: ReportModel, privateKey: string, kid: string): Promise<{ html: string; seal: Seal }> {
  const fileSha256 = await fileDigest(html);
  const head = model.head!;
  const sig = await signMessage(privateKey, reportMessage(model.eid, fileSha256));
  const seal: Seal = { fileSha256, sig, kid, headSeq: head.seq, headHash: head.hash };
  const a = html.indexOf(SEAL_OPEN), b = html.indexOf(SEAL_CLOSE);
  const sealed = html.slice(0, a + SEAL_OPEN.length) + `<script type="application/json" id="aoa-seal">${jsonForScript(seal)}</script>` + html.slice(b);
  return { html: sealed, seal };
}

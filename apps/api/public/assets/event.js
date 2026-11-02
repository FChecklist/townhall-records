// /e/<eventId>: the one public page for the whole life of an event. No sign-in, everything masked.
import { h, frame, app, mount, t, get, errorBox, loading, msg, wwh, stageBar, copyText, toast, eventIdFromUrl, shortCode, $ } from "/assets/core.js";

await frame({ nav: true });
const root = app();
const EID = eventIdFromUrl();
if (!EID) { mount(root, msg("bad", t("We could not find an event code in this link."), t("Open the link your society sent you, or type the code on the home page."), null), h("a", { class: "btn", href: "/" }, t("Go to the home page"))); throw new Error("no event id"); }

// ---------------------------------------------------------------- state
let view = null;       // { model, progress }
let sealed = null;     // { kid, publicKey, entries } after publication
let schemaLabels = {}; // rule parameter labels
let offset = 0;        // server clock minus device clock, ms
let lastSeq = -1;
let tab = (location.hash || "").replace("#", "") || "overview";
let chronoShown = 300;
const TABS = [["overview", "Overview"], ["agenda", "Agenda"], ["rules", "Rules"], ["attendance", "Attendance"], ["results", "Results"], ["record", "Record"], ["team", "Team & officials"]];
const pageUrl = () => location.origin + "/e/" + EID;
const nowMs = () => Date.now() + offset;

// ---------------------------------------------------------------- formatting
function dtf(opts, tz) { try { return new Intl.DateTimeFormat("en-GB", { ...opts, timeZone: tz || "UTC" }); } catch { return new Intl.DateTimeFormat("en-GB", { ...opts, timeZone: "UTC" }); } }
const when = (ms, tz) => ms ? dtf({ weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZoneName: "short" }, tz).format(new Date(ms)) : "";
const hhmm = (ms, tz) => dtf({ hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }, tz).format(new Date(ms));
const utcStamp = (ms) => new Date(ms).toISOString().replace("T", " ").replace(".000Z", " UTC").replace("Z", " UTC");
const dayKey = (ms, tz) => dtf({ year: "numeric", month: "2-digit", day: "2-digit" }, tz).format(new Date(ms));
const dayHead = (ms, tz) => dtf({ weekday: "long", day: "numeric", month: "long", year: "numeric" }, tz).format(new Date(ms));
function pct(bp) { let s = (bp / 100).toFixed(2); s = s.replace(/\.00$/, "").replace(/(\.\d)0$/, "$1"); return s + "%"; }
function remaining(ms) {
  if (ms <= 0) return "0:00:00";
  const s = Math.floor(ms / 1000), d = Math.floor(s / 86400), hh = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60, p = (n) => String(n).padStart(2, "0");
  return (d ? d + (d === 1 ? " day " : " days ") : "") + hh + ":" + p(m) + ":" + p(sec);
}
const kindWord = (m) => (m.kind === "election" ? t("Election") : t("Meeting"));
const TYPES = { agm: "Annual General Meeting", egm: "Extraordinary General Meeting", gbm: "General Body Meeting", committee: "Committee meeting" };
const typeWord = (m) => t(TYPES[m.eventType] || (m.eventType || "").toUpperCase());
const KIND_WORDS = { resolution: "Resolution (a vote)", election_post: "Election post", discussion: "Discussion only (no vote)" };
const MAJ = { simple: "Simple majority", special: "Special majority" };
const BASIS = { cast: "of the votes cast", present: "of the members present", total: "of all members on the list", weight: "by vote weight" };
function majorityWords(p, rules) {
  if (p.kind === "discussion") return "";
  if (p.kind === "election_post") return t("The choices with the most votes lead.");
  const cls = t(MAJ[p.majorityClass] || (p.majorityClass || "") + " " + t("majority"));
  const basis = (rules.find((r) => r.param === "majority." + p.majorityClass + ".basis") || {}).value;
  return cls + (basis && BASIS[basis] ? " " + t(BASIS[basis]) : "");
}
function ruleLabel(param) {
  if (schemaLabels[param]) return schemaLabels[param];
  return param.replace(/\./g, " > ").replace(/([a-z])([A-Z])/g, "$1 $2");
}
function ruleValue(param, v) {
  if (v === null || v === undefined) return t("not set");
  if (typeof v === "boolean") return v ? t("Yes") : t("No");
  if (/Bp$/.test(param) && typeof v === "number") return pct(v);
  if (BASIS[v]) return t(BASIS[v]);
  return String(v);
}
const optLabel = (p, o) => (p.labels && p.labels[o]) || o;
const sched = (m) => [["start", m.kind === "election" ? "Election starts" : "Meeting starts"], ["votingStart", "Voting starts"], ["votingEnd", "Voting ends"], ["end", m.kind === "election" ? "Election ends" : "Meeting ends"]].map(([k, l]) => ({ key: k, label: t(l), atMs: m.schedule[k].atMs, place: m.schedule[k].place }));
function openPoint(m) { return m.points.find((p) => p.state === "open") || null; }
function countdownOf(m) {
  if (!m.live || m.status === "suspended") return null;
  const op = openPoint(m), n = nowMs();
  if (op && op.endsMs && op.endsMs > n) return { label: t("Voting closes in"), ms: op.endsMs - n };
  const names = m.kind === "election" ? { start: "Election opens in", end: "Election closes in" } : { start: "Meeting opens in", end: "Meeting closes in" };
  const labels = { start: names.start, votingStart: "Voting opens in", votingEnd: "Voting closes in", end: names.end };
  for (const s of sched(m)) if (s.atMs > n) return { label: t(labels[s.key]), ms: s.atMs - n };
  return null;
}
function phaseOf(m) { return !m.live ? "sealed" : m.status === "live" ? "live" : "before"; }

// ---------------------------------------------------------------- small pieces
const card = (...k) => h("div", { class: "card" }, ...k);
const kv = (rows) => h("dl", { class: "kv" }, rows.filter(Boolean).flatMap(([a, b]) => [h("dt", null, a), h("dd", null, b)]));
const badge = (text, cls) => h("span", { class: "badge" + (cls ? " " + cls : "") }, text);
function table(head, rows, test) {
  return h("div", { class: "tw" }, h("table", { class: "t", "data-test": test }, h("thead", null, h("tr", null, head.map((x) => h("th", null, x)))), h("tbody", null, rows.map((r) => h("tr", null, r.map((c) => h("td", null, c)))))));
}
function bar(frac) { return h("div", { class: "bar", role: "img", "aria-label": Math.round(frac * 100) + " per cent" }, h("i", { style: "width:" + Math.max(0, Math.min(1, frac)) * 100 + "%" })); }
function bigCountdown(m) {
  const c = countdownOf(m);
  if (!c) return null;
  return h("div", { class: "card tint center", "data-test": "countdown" }, h("div", { class: "eyebrow" }, h("span", { "data-cd-label": "1" }, c.label)), h("div", { class: "mono", style: "font-size:40px;font-weight:700;color:var(--blue)", "data-cd": "1" }, remaining(c.ms)), h("div", { class: "tiny muted" }, t("Counted from the server clock, not your phone clock.")));
}
function tickCountdown() {
  if (!view) return;
  const c = countdownOf(view.model);
  for (const el of document.querySelectorAll("[data-cd]")) el.textContent = c ? remaining(c.ms) : "";
  for (const el of document.querySelectorAll("[data-cd-label]")) if (c) el.textContent = c.label;
}
function statusBadge(m) {
  if (!m.live) return badge(m.outcomeLabel || t("Finished"), m.outcome === "completed" ? "ok" : "warn");
  if (m.status === "live") return badge(t("Live now"), "ok");
  if (m.status === "agenda_published") return badge(t("Notice published"), "gold");
  if (m.status === "postponed") return badge(t("Postponed"), "warn");
  if (m.status === "suspended") return badge(t("Paused by the platform"), "bad");
  return badge(t("Notice not published yet"));
}

// ---------------------------------------------------------------- outcome box
function outcomeBox(m) {
  const resched = m.live && m.status !== "postponed" && m.postponements.length && m.postponements[m.postponements.length - 1].phase === "before_start";
  let word = null, cls = "info", plain = "";
  if (!m.live || m.status === "postponed") {
    const o = m.outcome || (m.status === "postponed" ? "postponed" : null);
    word = { completed: "COMPLETED", stopped: "STOPPED IN BETWEEN", postponed: "POSTPONED", cancelled: "CANCELLED" }[o] || null;
    cls = o === "completed" ? "ok" : o === "cancelled" ? "bad" : "warn";
    plain = { completed: "Every agenda point was taken up and the event finished.", stopped: "It began but was stopped before every point was taken up. What was done is recorded.", postponed: "It will continue on a new date, time and place. The record so far stays.", cancelled: "It will not take place." }[o] || "";
  } else if (resched) { word = "RESCHEDULED"; cls = "warn"; plain = "The date, time or place was changed before the start."; }
  if (!word) return null;
  const info = m.outcomeInfo, last = m.postponements[m.postponements.length - 1];
  const reasons = info ? info.reasons : last ? last.reasons : [];
  const text = info ? info.reason : last ? last.reason : "";
  const newTo = (word === "POSTPONED" || word === "RESCHEDULED") && last ? last.to : null;
  return h("div", { class: "msg " + cls, role: "status", "data-test": "outcome-box" }, h("div", null,
    h("span", { class: "ti", style: "font-size:24px;letter-spacing:.04em" }, t(word)),
    plain ? h("span", null, t(plain)) : null,
    reasons.length ? h("span", null, h("b", null, t("Reasons: ")), reasons.join("; ")) : null,
    text ? h("span", null, h("b", null, t("Note: ")), text) : null,
    newTo ? h("span", null, h("b", null, t("New date: ")), when(newTo.start.atMs, m.timezone) + " · " + newTo.start.place) : null,
    info ? h("span", { class: "tiny" }, t("Recorded on ") + when(info.atTs, m.timezone)) : null,
    m.postponements.length ? h("span", { class: "tiny" }, t("Times moved: ") + m.postponements.length) : null,
    word !== "RESCHEDULED" && info ? h("span", { class: "tiny" }, t("Votes already cast stay in the record.")) : null));
}

// ---------------------------------------------------------------- results
function resultCard(p, m) {
  const tl = p.tally;
  const head = h("div", { class: "row" }, h("h3", { style: "margin:0" }, h("em", null, p.number + "."), " ", p.title), h("span", { class: "sp" }), p.secret ? badge(t("Secret ballot")) : badge(t("Open vote")));
  if (p.kind === "discussion") return card(head, h("p", { class: "muted" }, t("Discussion only. There was no vote on this point.")));
  if (!tl) {
    return card(head, p.countsHidden ? msg("info", t("Counts appear when voting closes."), p.voted.length ? p.voted.length + " " + t("flats have voted so far.") : null, null) : h("p", { class: "muted" }, p.state === "pending" ? t("Voting has not opened on this point.") : t("No result yet.")));
  }
  const final = p.state === "closed";
  const label = { carried: ["Passed", "ok"], not_carried: ["Did not pass", "bad"], tie: ["Tied", "warn"], counted: ["Counted", "gold"] }[tl.outcome] || ["Counted", "gold"];
  const rows = tl.options.map((o) => h("div", { style: "margin:10px 0" }, h("div", { class: "row" }, h("b", null, optLabel(p, o.option)), h("span", { class: "sp" }), h("span", { class: "mono" }, o.count + " " + (o.count === 1 ? t("vote") : t("votes")) + (o.weight !== o.count ? " · " + t("weight") + " " + o.weight : "") + " · " + pct(o.percentBp))), bar(o.percentBp / 10000)));
  const notes = [];
  if (tl.outcome === "tie") notes.push(t("The votes are tied. The rules decide what happens next; nothing has been picked by the system."));
  if (tl.majority) notes.push(t("Needed: ") + tl.majority.num + "/" + tl.majority.den + (tl.majority.strict ? " " + t("(more than)") : "") + " " + t(BASIS[tl.majority.basis] || tl.majority.basis || "") + " (" + t("base") + " " + tl.majority.base + ").");
  if (tl.leaders && tl.leaders.length) notes.push(t("Leading: ") + tl.leaders.map((x) => optLabel(p, x)).join(", "));
  const extra = [];
  if (tl.ranking && tl.ranking.length) extra.push(h("details", null, h("summary", null, t("Ranking")), table([t("Rank"), t("Choice"), t("Votes"), t("Tied")], tl.ranking.map((r) => [r.rank, optLabel(p, r.option), r.count, r.tied ? t("Yes") : ""]))));
  if (tl.assignment && tl.assignment.seats) extra.push(h("details", null, h("summary", null, t("Seats")), table([t("Seat"), t("Choice"), t("Tied")], tl.assignment.seats.map((s) => [s.seat, s.option ? optLabel(p, s.option) : t("not decided"), s.tied ? t("Yes") : ""]))));
  if (tl.assignment && tl.assignment.selected) extra.push(h("p", null, t("Top choices: ") + tl.assignment.selected.map((x) => optLabel(p, x)).join(", ")));
  if (tl.assignment && tl.assignment.needsReturningOfficer) notes.push(t("A tie needs the Returning Officer."));
  if (tl.split) extra.push(h("details", null, h("summary", null, t("Own votes and proxy votes")), h("pre", { class: "mono small" }, JSON.stringify(tl.split))));
  if (p.receipts && p.receipts.length) extra.push(h("details", null, h("summary", null, t("Receipt codes") + " (" + p.receipts.length + ")"), h("p", { class: "small muted" }, t("Each voter got one code. Compare yours with this list. A code shows that a vote was counted, never how anyone voted.")), h("div", { class: "mono tiny", style: "word-break:break-all" }, p.receipts.join("  "))));
  return card(head,
    h("div", { class: "row" }, h("span", { class: "badge " + label[1], style: "font-size:15px", "data-test": "result-" + p.number }, final ? t(label[0]) : t("Running count")), h("span", { class: "muted small" }, t("Cast: ") + tl.ballots + " " + t("of") + " " + tl.presentWeight + " " + t("present weight") + " · " + t("turnout") + " " + pct(tl.turnoutBp))),
    rows, notes.map((x) => h("p", { class: "small" }, x)), extra,
    p.paper ? h("p", { class: "tiny muted" }, t("Paper ballots: ") + p.paper.counted + " " + t("counted") + ", " + p.paper.invalid + " " + t("invalid") + ", " + p.paper.voided + " " + t("voided") + ".") : null);
}

// ---------------------------------------------------------------- state panels
function noticePanel(m, pr) {
  const sc = sched(m);
  const notice = m.notice;
  return h("div", null,
    bigCountdown(m),
    card(h("h3", null, t("When and where")),
      table([t("Step"), t("When"), t("Place")], sc.map((s) => [h("b", null, s.label), when(s.atMs, m.timezone), s.place]), "schedule"),
      h("p", { class: "tiny muted" }, t("Times are shown in the event's own time zone: ") + m.timezone + ". " + (m.scheduleChanges ? t("The schedule was changed ") + m.scheduleChanges + " " + t("time(s). Every change is in the Record tab.") : "")),
      notice ? (notice.met === false ? msg("warn", t("Notice period check: not met."), t("Notice given: ") + notice.givenDays + " " + t("days. The rules ask for ") + (notice.minDays ?? "-") + t(" to ") + (notice.maxDays ?? "-") + t(" days."), null) : msg("ok", t("Notice period check: met."), t("Notice given: ") + notice.givenDays + " " + t("days. The rules ask for ") + (notice.minDays ?? "-") + t(" to ") + (notice.maxDays ?? "-") + t(" days."), null)) : msg("info", t("The notice has not been published yet."), t("This page will show the agenda once it is."), null)),
    m.status === "postponed" ? msg("warn", t("This event was postponed."), t("The same page will show the new date as soon as it is set."), null) : null);
}
function livePanel(m, pr) {
  const q = m.quorum, a = m.attendance;
  const pointRows = m.points.map((p) => {
    const st = p.state === "open" ? ["Voting open", "ok"] : p.state === "closed" ? ["Voting closed", "gold"] : ["Not opened yet", ""];
    return h("div", { class: "card", "data-test": "live-point-" + p.number }, h("div", { class: "row" }, h("h3", { style: "margin:0" }, h("em", null, p.number + "."), " ", p.title), h("span", { class: "sp" }), badge(t(st[0]), st[1]), p.secret ? badge(t("Secret ballot")) : badge(t("Open vote"))),
      p.kind !== "discussion" ? h("p", { class: "small muted" }, p.voted.length + " " + t("flat(s) have voted so far.") + (p.countsHidden ? " " + t("Counts appear when voting closes.") : "")) : h("p", { class: "small muted" }, t("Discussion only.")),
      p.tally && !p.countsHidden ? p.tally.options.map((o) => h("div", { class: "row small" }, h("b", null, optLabel(p, o.option)), h("span", { class: "sp" }), h("span", { class: "mono" }, o.count + " · " + pct(o.percentBp)))) : null);
  });
  return h("div", null,
    stageBar(m.stage),
    bigCountdown(m),
    h("div", { class: "grid g2" },
      card(h("h3", null, t("Quorum")), q ? [h("div", { class: "mono", style: "font-size:30px;font-weight:700", "data-test": "quorum-line" }, q.present + " " + t("of") + " " + q.total + " " + t("present")), h("p", { class: "muted" }, t("Needed: ") + q.required + " · " + (q.met ? t("quorum is complete") : t("quorum is not complete yet"))), bar(q.required ? q.present / q.required : 0), badge(q.met ? t("Quorum met") : t("Quorum not met"), q.met ? "ok" : "warn")] : h("p", { class: "muted" }, t("The quorum check is switched off for this event."))),
      card(h("h3", null, t("Who is here")), h("div", { class: "mono", style: "font-size:30px;font-weight:700", "data-test": "attendance-count" }, a.present + " " + t("of") + " " + a.total + " " + t("flats")), h("p", { class: "muted" }, a.line), h("p", { class: "small muted" }, t("Checked in by ") + a.officers + " " + t("Attendance Monitor(s)")))),
    h("h2", null, t("Questions")), pointRows,
    msg("info", t("This page updates by itself."), t("You do not need to reload it."), null));
}
function sealedPanel(m) {
  const withVotes = m.points.filter((p) => p.kind !== "discussion");
  return h("div", null,
    stageBar("publish"),
    withVotes.length ? [h("h2", null, t("Results")), withVotes.map((p) => resultCard(p, m))] : card(h("p", { class: "muted" }, t("This event has no votes to report."))),
    card(h("h3", null, t("The record")),
      h("p", null, t("The record of this event is closed and signed. You can keep a copy and check it later, even if this website is gone.")),
      h("div", { class: "row" },
        h("a", { class: "btn", href: "/api/r/" + EID + "/pdf", "data-test": "dl-pdf" }, t("Download PDF")),
        h("a", { class: "btn ghost", href: "/api/r/" + EID + "?download=1", "data-test": "dl-report" }, t("Download the sealed report")),
        h("a", { class: "btn ghost", href: "/api/r/" + EID, "data-test": "open-report" }, t("Open the full official report")),
        h("a", { class: "btn gold", href: "/verify/?e=" + EID, "data-test": "verify-btn" }, t("Verify"))),
      sealed ? h("p", { class: "small muted mono", "data-test": "sealed-facts" }, sealed.entries + " " + t("entries in the record") + " · " + t("signing key") + " " + sealed.kid + (m.head ? " · " + t("last entry") + " " + m.head.hash.slice(0, 16) + "…" : "")) : null));
}

// ---------------------------------------------------------------- share / calendar / QR
function icsText(m) {
  const z = (ms) => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const esc = (s) => String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
  const s = m.schedule.start.atMs, e = Math.max(m.schedule.end.atMs, s + 3600000);
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Townhall//EN", "CALSCALE:GREGORIAN", "BEGIN:VEVENT", "UID:" + m.eid + "@townhall", "DTSTAMP:" + z(Date.now()), "DTSTART:" + z(s), "DTEND:" + z(e), "SUMMARY:" + esc(m.title + " - " + m.society.name), "LOCATION:" + esc(m.schedule.start.place || m.venue), "DESCRIPTION:" + esc("Notice, live status and result: " + pageUrl()), "URL:" + pageUrl(), "END:VEVENT", "END:VCALENDAR"].join("\r\n");
}
function addToCalendar(m) {
  const blob = new Blob([icsText(m)], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = h("a", { href: url, download: "townhall-" + EID.slice(0, 8) + ".ics" }); document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
function shareText(m) { return m.title + " - " + m.society.name + "\n" + when(m.schedule.start.atMs, m.timezone) + "\n" + pageUrl(); }
const qrBox = h("div", { "data-test": "qr", style: "width:180px;height:180px;background:#fff;padding:8px;border:1px solid var(--line);border-radius:10px;display:none" });
async function drawQr() {
  try {
    const mod = await import("./qr.js");
    const fn = mod.qrSvg || mod.qrSVG || mod.svg || mod.toSvg || mod.default || mod.qr;
    if (typeof fn !== "function") return;
    let out = fn(pageUrl());
    if (out && typeof out.then === "function") out = await out;
    let node = null;
    if (out instanceof Node) node = out;
    else if (typeof out === "string" && out.trim().startsWith("<svg")) { const d = new DOMParser().parseFromString(out, "image/svg+xml").documentElement; if (d && d.nodeName.toLowerCase() === "svg") { d.querySelectorAll("script,foreignObject").forEach((x) => x.remove()); node = document.importNode(d, true); } }
    if (!node) return;
    node.setAttribute("width", "164"); node.setAttribute("height", "164"); node.setAttribute("aria-label", t("QR code of this page"));
    qrBox.replaceChildren(node); qrBox.style.display = "block";
  } catch { /* qr.js not available yet: skip quietly */ }
}
function sharePanel(m) {
  return card(h("h3", null, t("Share this page")),
    h("p", { class: "muted small" }, t("Anyone with the link can read this page. No sign-in. Names are hidden.")),
    h("div", { class: "mono small", style: "word-break:break-all;margin-bottom:10px" }, pageUrl()),
    h("div", { class: "row" },
      h("button", { class: "btn ghost", "data-test": "copy-link", onclick: () => copyText(pageUrl()) }, t("Copy link")),
      h("a", { class: "btn ghost", "data-test": "share-whatsapp", target: "_blank", rel: "noopener noreferrer", href: "https://wa.me/?text=" + encodeURIComponent(shareText(m)) }, t("Send on WhatsApp")),
      navigator.share ? h("button", { class: "btn ghost", "data-test": "share-native", onclick: () => navigator.share({ title: m.title, text: shareText(m), url: pageUrl() }).catch(() => {}) }, t("Share…")) : null,
      m.live ? h("button", { class: "btn", "data-test": "add-calendar", onclick: () => addToCalendar(m) }, t("Add to calendar")) : null),
    h("div", { style: "margin-top:14px" }, qrBox));
}

// ---------------------------------------------------------------- tabs
function overviewTab(m, pr) {
  const op = m.live ? t("Notice, live status and, afterwards, the signed result are all on this page.") : t("This event is finished. The signed result is above.");
  return h("div", null,
    card(h("h3", null, t("About this event")), kv([[t("Society"), m.society.name + " (" + m.society.kind + ")"], [t("Registration no."), m.society.registrationNo], [t("Address"), m.society.address], [t("Type"), kindWord(m) + " · " + typeWord(m)], [t("Venue"), m.venue], [t("Starts"), when(m.schedule.start.atMs, m.timezone)], [t("Time zone"), m.timezone], [t("Event code"), h("span", { class: "mono" }, shortCode(EID))], m.createdFrom ? [t("Made from"), h("a", { href: "/e/" + m.createdFrom }, shortCode(m.createdFrom))] : null, [t("Sitting"), String(m.sitting || 1)]]), h("p", { class: "small muted" }, op)),
    card(h("h3", null, t("Rules in short")), rulesSummary(m)),
    card(h("h3", null, t("Agenda in short")), m.points.length ? h("ol", null, m.points.map((p) => h("li", null, h("b", null, p.title), " ", h("span", { class: "muted small" }, "- " + t(KIND_WORDS[p.kind] || p.kind) + (p.kind === "discussion" ? "" : ", " + (p.secret ? t("secret ballot") : t("open vote")))))) ) : h("p", { class: "muted" }, t("No agenda points yet.")), h("a", { href: "#agenda", onclick: () => setTab("agenda") }, t("See the full agenda"))),
    sharePanel(m),
    h("div", { class: "card tint" }, h("div", { class: "row" }, h("a", { class: "btn ghost", "data-test": "use-template", href: "/start/#clone=" + EID }, t("Use this as a template")), h("a", { class: "btn ghost", "data-test": "privacy-request", href: "/privacy/?e=" + EID }, t("Privacy request")), m.live ? h("a", { class: "btn ghost", "data-test": "hall-link", href: "/hall/" + EID }, t("Hall screen")) : null)));
}
function rulesSummary(m) {
  const g = (p) => (m.rules.find((r) => r.param === p) || {}).value;
  const optOn = (k) => (m.options.find((o) => o.key === k) || {}).value;
  const qp = g("quorum.percentBp");
  const items = [
    m.quorum ? t("Quorum: ") + (qp != null ? pct(qp) + " " : "") + t("of the list, which is ") + m.quorum.required + " " + t("of") + " " + m.quorum.total + " " + t("flats.") : t("The quorum check is off."),
    g("notice.minDays") != null ? t("Notice: at least ") + g("notice.minDays") + t(" days") + (g("notice.maxDays") != null ? t(" and at most ") + g("notice.maxDays") + t(" days.") : ".") : null,
    optOn("proxy_voting") ? t("Proxy voting is allowed.") : t("Proxy voting is not allowed."),
    optOn("weightage") ? t("Votes are weighted.") : t("One flat, one vote."),
  ].filter(Boolean);
  return h("ul", null, items.map((x) => h("li", null, x)));
}
/** Points withdrawn after the notice went out stay visible here (never deleted), with the reason and the time. */
function withdrawnPoints(m) {
  const w = m.withdrawn || []; if (!w.length) return null;
  return card(h("h3", null, t("Withdrawn points")), h("p", { class: "small muted" }, t("These points were on the notice but were taken off the agenda. They stay on the record.")),
    h("ul", { "data-test": "withdrawn-points" }, w.map((x) => h("li", null, h("b", null, x.number + ". " + x.title), " ", badge(t("Withdrawn"), "warn"), h("div", { class: "small muted" }, t("Reason: ") + x.reason + " · " + when(x.ts, m.timezone))))));
}
function agendaTab(m) {
  if (!m.points.length) return h("div", null, card(h("p", { class: "muted" }, t("No agenda points have been added yet."))), withdrawnPoints(m));
  return h("div", null, m.points.map((p) => card(
    h("div", { class: "row" }, h("h3", { style: "margin:0" }, h("em", null, p.number + "."), " ", p.title), h("span", { class: "sp" }), badge(t(KIND_WORDS[p.kind] || p.kind), "gold")),
    p.body ? h("p", null, p.body) : null,
    p.kind !== "discussion" ? h("div", null,
      h("p", { class: "small" }, h("b", null, p.secret ? t("Secret ballot: ") : t("Open vote: ")), p.secret ? t("nobody can see how any flat voted. Only totals and receipt codes are published.") : t("the flat number of each vote is recorded.")),
      majorityWords(p, m.rules) ? h("p", { class: "small" }, h("b", null, t("Majority needed: ")), majorityWords(p, m.rules)) : null,
      p.instruction ? h("p", { class: "small" }, h("b", null, t("How to vote: ")), p.instruction) : null,
      h("p", { class: "small" }, h("b", null, p.kind === "election_post" ? t("Candidates: ") : t("Choices: ")), p.options.map((o) => optLabel(p, o)).join(" · ")),
      p.seats && p.seats.length ? h("p", { class: "small" }, h("b", null, t("Seats: ")), p.seats.join(", ")) : null) : null,
    h("div", { class: "tiny muted" }, t("State: ") + (p.state === "pending" ? t("not opened") : p.state === "open" ? t("voting open") : t("voting closed")))
  )), withdrawnPoints(m));
}
function rulesTab(m) {
  const cmp = m.compliance;
  return h("div", null,
    card(h("h3", null, t("Rules in short")), rulesSummary(m)),
    card(h("h3", null, t("Rule values")), m.rules.length ? table([t("Rule"), t("Value")], m.rules.map((r) => [ruleLabel(r.param), h("b", null, ruleValue(r.param, r.value))]), "rules") : h("p", { class: "muted" }, t("No rule values are set yet.")), m.customRules.length ? [h("h3", { style: "margin-top:18px" }, t("The society's own extra rules")), table([t("Rule"), t("Value"), t("Note")], m.customRules.map((r) => [r.title, String(r.value), r.note]))] : null),
    card(h("h3", null, t("Options")), table([t("Option"), t("Setting"), t("Why")], m.options.map((o) => [o.label, o.value === null ? t("not set") : o.value ? badge(t("On"), "ok") : badge(t("Off")), o.locked ? (o.reason || t("Fixed by the law pack")) : ""])),
      m.overrides.length ? [h("h3", { style: "margin-top:18px" }, t("Where the society's own bye-laws differ")), m.overrides.map((o) => h("div", { class: "msg warn" }, h("div", null, h("span", { class: "ti" }, o.label + ": " + (o.value ? t("On") : t("Off"))), h("span", null, t("The law pack said: ") + o.lawReason), h("span", null, t("Declaration: ") + o.declaration))))] : null),
    m.ruleHistory.length ? card(h("h3", null, t("Rule changes")), table([t("#"), t("When"), t("Rule"), t("From"), t("To"), t("Reason")], m.ruleHistory.map((r) => [r.seq, when(r.ts, m.timezone), ruleLabel(r.param), r.old === null ? "-" : ruleValue(r.param, r.old), r.new === null ? "-" : ruleValue(r.param, r.new), r.reason]))) : null,
    card(h("h3", null, t("Checked against the rules")), h("p", { class: "small muted" }, t("Rules in use: ") + (cmp.packName || m.packId)),
      table([t("Check"), t("Result"), t("Detail")], cmp.checks.map((c) => [c.label, badge(c.status === "pass" ? t("Pass") : c.status === "fail" ? t("Does not pass") : c.status === "not_set" ? t("Not set") : t("Info"), c.status === "pass" ? "ok" : c.status === "fail" ? "bad" : c.status === "not_set" ? "warn" : ""), c.detail])), h("p", { class: "tiny muted" }, cmp.disclaimer)));
}
function attendanceTab(m) {
  const a = m.attendance, q = m.quorum;
  return h("div", null,
    card(h("h3", null, t("Who is present")), h("div", { class: "mono", style: "font-size:30px;font-weight:700" }, a.present + " " + t("of") + " " + a.total + " " + t("flats")), h("p", { class: "muted" }, a.line), kv([[t("Vote weight present"), a.presentWeight + " " + t("of") + " " + a.totalWeight], q ? [t("Quorum"), q.present + " " + t("present, ") + q.required + " " + t("needed: ") + (q.met ? t("met") : t("not met"))] : [t("Quorum"), t("check was off")]])),
    card(h("h3", null, t("Check-in list")), h("p", { class: "small muted" }, t("Only flat numbers and hidden names are shown here.")),
      a.rows.length ? table([t("Flat"), t("Attendee (hidden)"), t("How"), t("ID checked by"), t("Marked by"), t("Time")], a.rows.map((r) => [h("b", null, r.flatNo), r.maskedName, r.mode + (r.method ? " / " + r.method : ""), r.idVerifiedByName ? r.idVerifiedByName + " (" + r.idVerifiedByRole + ")" : "-", r.byName + " (" + r.byRole + ")", when(r.ts, m.timezone)]), "attendance-table") : h("p", { class: "muted" }, t("Nobody has been checked in yet."))));
}
function resultsTab(m) {
  const pts = m.points.filter((p) => p.kind !== "discussion");
  return h("div", null,
    pts.length ? pts.map((p) => resultCard(p, m)) : card(h("p", { class: "muted" }, t("There are no votes on the agenda."))),
    m.postponements.length ? card(h("h3", null, t("Times this event was moved")), table([t("When"), t("Sitting"), t("Why"), t("Fee"), t("New start")], m.postponements.map((x) => [when(x.ts, m.timezone), x.sitting, x.reasons.join("; ") + (x.reason ? " - " + x.reason : ""), x.feeMinor ? x.feeMinor / 100 : t("Free"), when(x.to.start.atMs, m.timezone)]))) : null);
}
function recordTab(m) {
  const tz = m.timezone, days = new Map();
  const shown = m.chronology.slice(0, chronoShown);
  for (const r of shown) { const k = dayKey(r.ts, tz); if (!days.has(k)) days.set(k, { head: dayHead(r.ts, tz), rows: [] }); days.get(k).rows.push(r); }
  const tl = [...days.values()].map((d) => h("div", null, h("h3", { style: "margin-top:18px" }, d.head), h("div", { class: "timeline" }, d.rows.map((r) => h("div", { class: "e" }, h("div", null, h("span", { class: "mono", title: utcStamp(r.ts) }, hhmm(r.ts, tz)), " ", h("b", null, r.what)), h("div", { class: "tiny muted" }, r.who + " · #" + r.seq + " · " + t("fingerprint") + " " + r.hash.slice(0, 10)))))));
  return h("div", null,
    card(h("h3", null, t("Everything that happened, in order")), h("p", { class: "small muted" }, t("Times are in ") + tz + t(". Hold the pointer over a time (or press and hold on a phone) to see it in UTC. Each line has a fingerprint that ties it to the signed record.")),
      m.chronology.length ? [tl, m.chronology.length > chronoShown ? h("button", { class: "btn ghost", "data-test": "chrono-more", onclick: () => { chronoShown += 300; renderBody(); } }, t("Show more") + " (" + (m.chronology.length - chronoShown) + ")") : null] : h("p", { class: "muted" }, t("Nothing has been recorded yet."))),
    card(h("h3", null, t("Who did what")), h("p", { class: "small muted" }, t("Every action of the Organizer, Hosts and Attendance Monitors, with the hidden name, role, date and time.")),
      m.accountability.length ? h("div", { class: "tw" }, h("table", { class: "t", "data-test": "accountability" }, h("thead", null, h("tr", null, [t("#"), t("When"), t("Who"), t("What")].map((x) => h("th", null, x)))), h("tbody", null, m.accountability.slice(0, chronoShown).map((a) => h("tr", null, h("td", null, a.seq), h("td", { title: utcStamp(a.ts) }, when(a.ts, tz)), h("td", null, h("b", null, a.who), " (", a.role, ")"), h("td", null, a.what)))))) : h("p", { class: "muted" }, t("No named actions yet."))),
    card(h("h3", null, t("Refused changes")), h("p", { class: "small muted" }, t("Attempts to change a rule that were refused, for example after voting had opened. They are kept on purpose.")),
      m.rejected.length ? table([t("#"), t("Rule"), t("Why it was refused")], m.rejected.map((r) => [r.seq, ruleLabel(r.param), r.reason])) : h("p", { class: "muted" }, t("None."))),
    m.platformActions.length ? card(h("h3", null, t("Actions by the platform")), table([t("#"), t("Action"), t("Reason")], m.platformActions.map((a) => [a.seq, a.action, a.reason]))) : null,
    m.problems.length ? msg("warn", t("Problems found in the record"), m.problems.join("; "), null) : null,
    card(h("h3", null, t("Access trail")), h("p", { class: "small" }, m.access.termsAccepted + " " + t("terms acceptances are recorded. ") + m.access.entriesWithAccessFingerprint + " " + t("of") + " " + m.access.entries + " " + t("entries carry a coded fingerprint of the device that made the request. The addresses themselves are private.")), m.contactsReads ? h("p", { class: "small" }, t("Times private contact details were opened by staff: ") + m.contactsReads) : null));
}
function teamTab(m) {
  const roleWord = (r) => (r === "attendance_officer" ? t("Attendance Monitor") : r === "host" ? t("Host") : r === "organizer" ? t("Organizer") : r);
  function node(n) { return h("li", null, h("b", null, n.maskedName), " ", n.roles.map((r) => badge(roleWord(r), "gold")), n.label ? " " + badge(n.label) : null, n.children && n.children.length ? h("ul", null, n.children.map(node)) : null); }
  const groups = new Map(); for (const o of m.officials) { if (!groups.has(o.groupLabel)) groups.set(o.groupLabel, []); groups.get(o.groupLabel).push(o); }
  return h("div", null,
    card(h("h3", null, t("People who run this event")), h("p", { class: "small muted" }, t("Names are hidden on purpose. The tree shows who appointed whom.")), m.tree.length ? h("ul", null, m.tree.map(node)) : h("p", { class: "muted" }, t("Nobody yet.")),
      m.people.length ? table([t("Person (hidden)"), t("Role"), t("E-mail confirmed")], m.people.map((p) => [p.maskedName, p.roles.map(roleWord).join(" + ") + (p.label ? " · " + p.label : ""), p.verified ? t("Yes") : t("Not yet")]), "people") : null),
    card(h("h3", null, t("Committee, officers and observers")), groups.size ? [...groups.entries()].map(([g, list]) => h("div", null, h("h3", { style: "margin-top:14px" }, g), table([t("Name"), t("Designation"), t("Authority"), t("Present"), t("Published")], list.map((o) => [o.name, o.designation, o.authority, o.present ? t("Yes") + (o.mode ? " (" + o.mode + ")" : "") : t("No"), o.beforeStart ? t("Before the start") : t("After the start")])))) : h("p", { class: "muted" }, t("None were named for this event."))));
}
const TAB_FN = { overview: overviewTab, agenda: agendaTab, rules: rulesTab, attendance: attendanceTab, results: resultsTab, record: recordTab, team: teamTab };
function setTab(k) { tab = k; try { history.replaceState(null, "", "#" + k); } catch { /* */ } renderBody(); }

// ---------------------------------------------------------------- page
let bodyEl = null, topEl = null;
function renderTop() {
  const { model: m, progress: pr } = view, ph = phaseOf(m);
  const head = h("section", { class: "hero", style: "padding:30px 28px" },
    h("div", { class: "row" }, h("span", { class: "eyebrow", style: "color:var(--gold2)", "data-test": "kind" }, kindWord(m) + " · " + typeWord(m)), h("span", { class: "sp" }), statusBadge(m)),
    h("h1", { "data-test": "title" }, m.title),
    h("p", { style: "margin-bottom:6px" }, h("b", null, m.society.name), " · ", m.society.kind),
    h("p", { style: "margin:0" }, when(m.schedule.start.atMs, m.timezone) + " · " + (m.schedule.start.place || m.venue)));
  const panel = ph === "sealed" ? sealedPanel(m) : ph === "live" ? livePanel(m, pr) : noticePanel(m, pr);
  const ob = outcomeBox(m);
  mount(topEl, head, ob, ph === "before" ? stageBar(m.stage) : null, panel);
}
function renderBody() {
  if (!view) return;
  const m = view.model;
  const tabs = h("div", { class: "tabs", role: "tablist" }, TABS.map(([k, l]) => h("button", { type: "button", role: "tab", class: tab === k ? "on" : "", "aria-selected": tab === k ? "true" : "false", "data-test": "tab-" + k, onclick: () => setTab(k) }, t(l))));
  const fn = TAB_FN[tab] || overviewTab;
  mount(bodyEl, tabs, fn(m, view.progress));
}
function renderAll() {
  renderTop(); renderBody(); tickCountdown();
  if (!view.model.title) document.title = "Townhall"; else document.title = view.model.title + " - " + view.model.society.name;
  drawQr();
}
async function loadModel() {
  view = await get("/api/events/" + EID);
  lastSeq = view.model.head ? view.model.head.seq : 0;
  if (!view.model.live && !sealed) { try { const d = await get("/api/r/" + EID + "/data"); sealed = { kid: d.kid || "", publicKey: d.publicKey || "", entries: (d.log || []).length }; } catch { sealed = null; } }
  renderAll();
}

// ---------------------------------------------------------------- start
const shell = h("div", null);
topEl = h("div", { "data-test": "top" }); bodyEl = h("div", { "data-test": "body" });
shell.append(topEl, bodyEl, h("p", { class: "tiny muted center", style: "margin-top:26px", "data-test": "footer-note" }, t("Names are hidden on this page on purpose. Full details are only ever shown to the person doing the check.")));
mount(root, loading());
async function boot() {
  try {
    const [, sc] = await Promise.all([loadModel(), get("/api/schema").catch(() => null)]);
    if (sc && sc.params) { for (const p of sc.params) schemaLabels[p.id] = p.label; renderBody(); }
    mount(root, shell); renderAll();
  } catch (e) {
    mount(root, errorBox(e, boot), h("div", { class: "row", style: "margin-top:10px" }, h("a", { class: "btn ghost", href: "/" }, t("Go to the home page"))));
    return;
  }
  poll();
}
let timer = null, failures = 0;
async function checkHead() {
  if (document.hidden || !view) return;
  try {
    const hd = await get("/api/r/" + EID + "/head");
    if (hd.serverNow) offset = hd.serverNow - Date.now();
    failures = 0; const off = $("[data-test=offline-note]"); if (off) off.remove();
    if (hd.seq !== lastSeq || (hd.status && hd.status !== view.model.status)) { lastSeq = hd.seq; await loadModel(); }
  } catch {
    failures++;
    if (failures === 2 && !$("[data-test=offline-note]")) topEl.before(h("div", { "data-test": "offline-note" }, msg("warn", t("We cannot reach the server right now."), t("What you see is the last update. We keep trying."), null)));
  }
}
function poll() {
  clearInterval(timer);
  checkHead();
  timer = setInterval(() => { if (view && !view.model.live) { /* sealed: nothing more changes */ clearInterval(timer); return; } checkHead(); }, 8000);
}
setInterval(tickCountdown, 1000);
document.addEventListener("visibilitychange", () => { if (!document.hidden && view && view.model.live) checkHead(); });
window.addEventListener("hashchange", () => { const k = (location.hash || "").replace("#", ""); if (TAB_FN[k] && k !== tab) { tab = k; renderBody(); } });
boot();

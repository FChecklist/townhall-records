// /hall/<eventId>: projector screen. Huge text, high contrast, no names. Polls at most every 6 seconds.
import { h, initLang, app, mount, t, get, errorBox, stageBar, msg, eventIdFromUrl } from "/assets/core.js";

await initLang();
const root = app();
const EID = eventIdFromUrl();
if (!EID) { mount(root, msg("bad", t("We could not find an event code in this link."), null, null)); throw new Error("no event id"); }

let model = null, lastSeq = -1, offset = 0, failures = 0, timer = null;
const nowMs = () => Date.now() + offset;
const pct = (bp) => { let s = (bp / 100).toFixed(2); return s.replace(/\.00$/, "").replace(/(\.\d)0$/, "$1") + "%"; };
function remaining(ms) {
  if (ms <= 0) return "0:00";
  const s = Math.floor(ms / 1000), d = Math.floor(s / 86400), hh = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60, p = (n) => String(n).padStart(2, "0");
  return (d ? d + "d " : "") + (hh || d ? hh + ":" + p(m) : m) + ":" + p(sec);
}
const optLabel = (p, o) => (p.labels && p.labels[o]) || o;

const el = { when: h("div", { class: "sub", "data-test": "hall-when" }), cd: h("div", { class: "num", "data-test": "hall-countdown" }), cdl: h("div", { class: "lbl", "data-test": "hall-countdown-label" }) };
let layout = null;

function countdown() {
  if (!model || !model.live) return null;
  const n = nowMs(), op = model.points.find((p) => p.state === "open");
  if (op && op.endsMs && op.endsMs > n) return { label: t("Voting ends in"), ms: op.endsMs - n };
  const k = model.schedule;
  if (k.votingStart.atMs > n) return { label: t("Voting starts in"), ms: k.votingStart.atMs - n };
  if (k.start.atMs > n) return { label: model.kind === "election" ? t("Election starts in") : t("Meeting starts in"), ms: k.start.atMs - n };
  return null;
}
function tick() {
  const c = countdown();
  const box = document.querySelector("[data-hall-cd]");
  if (!box) return;
  box.classList.toggle("hidden", !c);
  if (c) { el.cd.textContent = remaining(c.ms); el.cdl.textContent = c.label; }
}

function questionBox(m) {
  const op = m.points.find((p) => p.state === "open");
  if (!m.live) return h("div", { class: "hq" }, h("div", { class: "lbl" }, t("This event has ended")), h("div", { class: "big", "data-test": "hall-state" }, m.outcomeLabel || t("Finished")));
  if (op) {
    return h("div", { class: "hq" }, h("div", { class: "lbl" }, t("Voting is open now") + " · " + t("Question") + " " + op.number), h("div", { class: "big", "data-test": "hall-question" }, op.title),
      h("div", { class: "sub" }, op.secret ? t("Secret ballot") : t("Open vote")), h("div", { class: "sub" }, op.voted.length + " " + t("flats have voted")),
      h("div", { class: "sub" }, op.options.map((o) => optLabel(op, o)).join("   ·   ")));
  }
  const next = m.points.find((p) => p.state === "pending" && p.kind !== "discussion");
  return h("div", { class: "hq" }, h("div", { class: "big", "data-test": "hall-question" }, t("Voting is not open")),
    m.status === "postponed" ? h("div", { class: "sub" }, t("This event has been postponed.")) : next && m.status === "live" ? h("div", { class: "sub" }, t("Next question: ") + next.number + ". " + next.title) : null);
}
function quorumBox(m) {
  const q = m.quorum, a = m.attendance;
  const quorum = q ? h("div", { class: "hq" }, h("div", { class: "lbl" }, t("Quorum")),
    h("div", { class: "big", "data-test": "hall-quorum" }, q.present + " " + t("present of") + " " + q.total),
    h("div", { class: "sub" }, t("Needed") + ": " + q.required),
    h("div", { class: "hbarbig" + (q.met ? " met" : ""), role: "img", "aria-label": q.present + " / " + q.required }, h("i", { style: "width:" + Math.min(100, q.required ? (q.present / q.required) * 100 : 0) + "%" })),
    h("span", { class: "pill " + (q.met ? "ok" : "no"), "data-test": "hall-quorum-state" }, q.met ? t("Quorum is complete") : t("Quorum is not complete"))) : h("div", { class: "hq" }, h("div", { class: "lbl" }, t("Quorum")), h("div", { class: "sub" }, t("The quorum check is off for this event.")));
  const att = h("div", { class: "hq" }, h("div", { class: "lbl" }, t("Present")), h("div", { class: "num", "data-test": "hall-attendance" }, a.present), h("div", { class: "sub" }, t("of") + " " + a.total + " " + t("flats")));
  return h("div", { class: "hgrid" }, quorum, att);
}
function resultLines(m) {
  const rows = m.points.filter((p) => p.kind !== "discussion" && p.tally && !p.countsHidden && p.state === "closed");
  if (!rows.length) return null;
  const word = { carried: "Passed", not_carried: "Did not pass", tie: "Tied", counted: "Counted" };
  return h("div", { class: "hq", "data-test": "hall-results" }, h("div", { class: "lbl" }, t("Results")), rows.map((p) => h("div", { class: "rl" }, h("span", { class: "t" }, p.number + ". " + p.title), h("span", { class: "pill " + (p.tally.outcome === "carried" ? "ok" : "no") }, t(word[p.tally.outcome] || "Counted")), h("span", { class: "o" }, p.tally.options.map((o) => optLabel(p, o.option) + " " + o.count + " (" + pct(o.percentBp) + ")").join("   ")))));
}
function render() {
  const m = model;
  const full = h("button", { class: "btn", "data-test": "hall-fullscreen", onclick: toggleFull }, document.fullscreenElement ? t("Leave full screen") : t("Full screen"));
  const cdBox = h("div", { class: "hq center", "data-hall-cd": "1" }, el.cdl, el.cd);
  mount(root,
    h("div", { class: "hbar" }, h("b", null, m.society.name), h("span", null, "·"), h("span", null, m.kind === "election" ? t("Election") : t("Meeting")), h("span", { class: "sp" }), full),
    h("h1", { "data-test": "hall-title" }, m.title),
    stageBar(m.stage),
    questionBox(m), cdBox, quorumBox(m), resultLines(m),
    failures >= 2 ? msg("warn", t("The screen cannot reach the server."), t("It shows the last update and keeps trying."), null) : null,
    h("p", { class: "center", style: "color:#98A9CF;font-size:clamp(14px,1.4vw,22px)" }, t("Names are never shown on this screen.") + " " + location.host + "/e/" + EID.slice(0, 8) + "…"));
  tick();
}
function toggleFull() {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  else document.documentElement.requestFullscreen && document.documentElement.requestFullscreen().catch(() => {});
}
document.addEventListener("fullscreenchange", () => { if (model) render(); });

async function load() { const v = await get("/api/events/" + EID); model = v.model; lastSeq = model.head ? model.head.seq : 0; render(); }
async function check() {
  if (document.hidden) return;
  try {
    const hd = await get("/api/r/" + EID + "/head");
    if (hd.serverNow) offset = hd.serverNow - Date.now();
    const had = failures; failures = 0;
    if (hd.seq !== lastSeq || (model && hd.status !== model.status)) await load(); else if (had >= 2) render();
  } catch { failures++; if (failures === 2 && model) render(); }
}
async function boot() {
  try { await load(); }
  catch (e) { mount(root, errorBox(e, boot)); return; }
  check();
  timer = setInterval(() => { if (model && !model.live) { clearInterval(timer); return; } check(); }, 6000);
}
setInterval(tick, 1000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) check(); });
boot();

// Team Desk tab "Voting day": the control panel for the Organizer and Host. Start the meeting, open / extend / close each question, hand out voter codes,
// handle printed ballots, close the meeting and publish. One module, `render(ctx, el)`; see docs/UI-BUILD-BRIEF.md "Desk module contract".
import { h, t, mount, msg, errorBox, confirmBox, modal, toast, busy, get, field, radios, checks, stageBar, wwh, fmtTime, copyText } from "/assets/core.js";
import { qrSvg, drawQrInto } from "/assets/qr.js";

// What must survive a re-draw (the desk re-renders this tab after every write and every poll) lives here, in memory only. Nothing goes to storage.
const S = { eid: "", code: null, papers: {}, published: null, emailed: null, timers: [], offset: 0 };
const clearTimers = () => { S.timers.forEach((id) => clearInterval(id)); S.timers = []; };
const visible = () => document.visibilityState === "visible";
const unit = (q) => (q.basis === "weight" ? t("votes") : t("flats"));

function fmtDur(ms) {
  const s = Math.max(0, Math.round(ms / 1000)); if (s < 60) return s + " " + t("s");
  const m = Math.floor(s / 60); if (m < 10) return m + " " + t("min") + " " + (s % 60) + " " + t("s");
  if (m < 120) return m + " " + t("min");
  const hh = Math.floor(m / 60); if (hh < 48) return hh + " " + t("h") + " " + (m % 60) + " " + t("min");
  return Math.floor(hh / 24) + " " + t("days");
}
const nowMs = () => Date.now() + S.offset;
function cdText(at) { const d = at - nowMs(); return Math.abs(d) < 15000 ? t("now") : d > 0 ? t("in") + " " + fmtDur(d) : fmtDur(-d) + " " + t("ago"); }
function tickCountdowns(el) { if (!visible()) return; el.querySelectorAll("[data-at]").forEach((n) => { n.textContent = cdText(Number(n.getAttribute("data-at"))); }); }

/** Run a write; show the plain error under the button; refresh the desk on success. */
async function act(btn, slot, ctx, fn, done) {
  slot.replaceChildren();
  try { await busy(btn, fn); if (done) toast(done); await ctx.refresh(); }
  catch (e) { slot.replaceChildren(errorBox(e, () => act(btn, slot, ctx, fn, done))); }
}

export async function render(ctx, el) {
  clearTimers();
  if (S.eid !== ctx.eid) { S.eid = ctx.eid; S.code = null; S.papers = {}; S.published = null; S.emailed = null; }
  if (!ctx.priv) { mount(el, msg("info", t("This part is for the Organizer or Host."), t("Voting day is controlled by the Organizer or a Host. Attendance Monitors use the Check-in tab."))); return; }
  try { const hd = await get(`/api/r/${ctx.eid}/head`); if (hd && hd.serverNow) S.offset = hd.serverNow - Date.now(); } catch { /* the page clock is good enough */ }
  const m = ctx.model, status = m.status;
  const isElection = m.kind === "election";
  const kids = [];

  const what = status === "live" ? t("Run the voting, one question at a time.") : status === "closed" ? t("The meeting is closed. Share the report.") : t("Start the meeting when you are ready.");
  kids.push(wwh(t("Organizer or Host"), what,
    t("Use the big buttons below. Each one asks you to confirm."),
    t("Every button here is written to the public record, so the result can be checked by anyone.")));
  kids.push(statusCard(ctx, m));
  if (S.code) kids.push(codeShowCard());

  if (status === "setup") kids.push(msg("warn", t("The agenda is not published yet."), t("Finish the setup steps and publish the agenda first."), null), h("button", { class: "btn", "data-test": "go-setup", onclick: () => ctx.go("setup") }, t("Go to Setup")));
  else if (status === "agenda_published" || status === "postponed") kids.push(startCard(ctx, m));
  else if (status === "live") {
    const pts = (m.points || []).filter((p) => p.kind !== "discussion");
    if (!pts.length) kids.push(msg("info", t("There is nothing to vote on."), t("The agenda has no voting questions."), null));
    kids.push(h("h2", null, t("Questions")), ...pts.map((p) => pointCard(ctx, m, p)));
    kids.push(voterCodeCard(ctx, m));
    kids.push(closeCard(ctx, m));
  } else if (status === "closed") kids.push(publishedCard(ctx, m));
  else kids.push(msg("warn", t("This event is paused."), t("Nothing can be done on voting day until the paused event is released."), null));

  if (status === "live" && S.published) kids.push(publishedCard(ctx, m));
  mount(el, h("div", { "data-test": "day-root" }, kids));

  // timers: countdown text every second, a fresh copy of the event every 8 s. Both stop while the tab is hidden and while someone is typing or a pop-up is open.
  S.timers.push(setInterval(() => { if (!el.isConnected) return clearTimers(); tickCountdowns(el); }, 1000));
  S.timers.push(setInterval(() => {
    if (!el.isConnected) return clearTimers();
    if (!visible() || document.querySelector(".veil")) return;
    const a = document.activeElement; if (a && el.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return;
    ctx.refresh().catch(() => {});
  }, 8000));
  tickCountdowns(el);
}

// ------------------------------------------------------------------------------------------------ status panel
function statusCard(ctx, m) {
  const q = m.quorum || {}, a = m.attendance || {};
  const open = (m.points || []).find((p) => p.state === "open");
  const label = { setup: t("Setting up"), agenda_published: t("Agenda published, not started"), live: t("Meeting is live"), closed: t("Closed and published"), postponed: t("Postponed"), suspended: t("Paused") }[m.status] || m.status;
  const need = q.enabled ? (q.present >= q.required ? "ok" : "warn") : "";
  const pct = q.enabled && q.required ? Math.min(100, Math.round((q.present / q.required) * 100)) : 0;
  const sch = m.schedule || {};
  const names = isElectionKind(m) ? [t("Election starts"), t("Voting opens"), t("Voting closes"), t("Election ends")] : [t("Meeting starts"), t("Voting opens"), t("Voting closes"), t("Meeting ends")];
  const rows = ["start", "votingStart", "votingEnd", "end"].map((k, i) => {
    const at = k === "votingEnd" && open && open.endsMs ? open.endsMs : sch[k] && sch[k].atMs;
    return at ? h("tr", null, h("td", null, names[i]), h("td", null, fmtTime(at, m.timezone)), h("td", { "data-at": at, class: "mono", "data-test": "cd-" + k }, "")) : null;
  });
  return h("div", { class: "card", "data-test": "status-panel" },
    h("div", { class: "row" }, h("h2", { style: "margin:0" }, m.title), h("span", { class: "sp" }), h("span", { class: "badge gold", "data-test": "status-badge" }, label)),
    stageBar(m.stage),
    h("div", { class: "grid g2" },
      h("div", null,
        h("div", { class: "eyebrow" }, t("Quorum")),
        q.enabled
          ? [h("p", { style: "font:600 22px var(--serif);margin:4px 0", "data-test": "quorum-line" }, `${t("Present")} ${q.present} ${t("of")} ${q.total} ${unit(q)}, ${t("need")} ${q.required}`),
            h("div", { class: "bar", role: "progressbar", "aria-valuenow": pct, "aria-valuemin": 0, "aria-valuemax": 100, "aria-label": t("Quorum progress") }, h("i", { style: `width:${pct}%` })),
            h("p", { class: "small " + (need === "ok" ? "" : "muted"), style: "margin-top:6px" }, need === "ok" ? t("Quorum is complete.") : t("Quorum is not complete yet."))]
          : h("p", { class: "muted" }, t("This event does not check quorum.")),
        h("div", { class: "eyebrow", style: "margin-top:14px" }, t("Checked in")),
        h("p", { style: "font:600 22px var(--serif);margin:4px 0", "data-test": "attendance-count" }, `${a.present || 0} ${t("of")} ${a.total || 0} ${t("flats")}`),
        a.line ? h("p", { class: "small muted" }, a.line) : null),
      h("div", null, h("div", { class: "eyebrow" }, t("Timetable")),
        h("table", { class: "t" }, h("tbody", null, rows)))));
}
const isElectionKind = (m) => m.kind === "election";

// ------------------------------------------------------------------------------------------------ before the start
function startCard(ctx, m) {
  const pts = (m.points || []).filter((p) => p.kind !== "discussion");
  const paid = (m.payments || []).some((p) => p.state === "paid");
  const sch = m.schedule && m.schedule.start && m.schedule.start.atMs;
  const items = [
    [true, t("The agenda is published.")],
    [pts.length > 0, pts.length ? `${pts.length} ${t("question(s) to vote on.")}` : t("There is no question to vote on yet. Add one in Setup.")],
    [paid, paid ? t("The fee is paid.") : t("The fee is not paid yet. Pay it in Setup.")],
  ];
  const warns = [];
  if (m.notice && m.notice.met === false) warns.push(`${t("The notice period was")} ${m.notice.givenDays} ${t("days; the rules ask for")} ${m.notice.minDays ?? "-"} ${t("to")} ${m.notice.maxDays ?? "-"}. ${t("The public record will show this.")}`);
  if (!(m.people || []).some((p) => (p.roles || []).includes("attendance_officer"))) warns.push(t("No Attendance Monitor is appointed. You can check people in yourself, but the report will say attendance was not independently checked."));
  if (sch && nowMs() < sch) warns.push(t("The planned start time has not come yet. You may still start early."));
  const blockers = items.filter(([ok]) => !ok);
  const slot = h("div");
  const btn = h("button", { class: "btn gold big", "data-test": "start-meeting", disabled: blockers.length > 0, onclick: async () => {
    if (!(await confirmBox(t("Start the meeting?"), t("Check-in and voting can begin. The agenda and the rules cannot be changed after this. This is written to the public record."), t("Yes, start"), t("Not yet")))) return;
    await act(btn, slot, ctx, () => ctx.call.post("/start", {}), t("The meeting has started."));
  } }, t("Start the meeting"));
  return h("div", { class: "card", "data-test": "start-card" },
    h("h2", null, t("Start the meeting")),
    h("p", { class: "muted" }, t("Check this list. A green tick means ready. An orange mark is a warning you can still go past.")),
    h("ul", { style: "list-style:none;padding:0;margin:0 0 14px" },
      items.map(([ok, text]) => h("li", { style: "padding:6px 0" }, h("span", { class: "badge " + (ok ? "ok" : "bad") }, ok ? "✓" : "!"), " ", text)),
      warns.map((w) => h("li", { style: "padding:6px 0" }, h("span", { class: "badge warn" }, "!"), " ", w))),
    btn, blockers.length ? h("div", { class: "why-off", "data-test": "start-why-off" }, t("Cannot start yet: ") + blockers.map((b) => b[1]).join(" ")) : null, slot);
}

// ------------------------------------------------------------------------------------------------ one agenda point
const modeText = (k) => ({ online: t("Online on the voter's phone"), printed: t("On printed paper"), either: t("Online or on paper (the officer chooses)") })[k];
function ruleLines(ctx, m, p) {
  const r = Object.fromEntries((m.rules || []).map((x) => [x.param, x.value]));
  const q = m.quorum || {}, out = [];
  out.push([t("Kind of vote"), p.secret ? t("Secret ballot: who voted what is never shown.") : t("Open vote: each flat's choice is shown.")]);
  const basis = r[`majority.${p.majorityClass}.basis`], mj = p.tally && p.tally.majority;
  out.push([t("Majority needed"), `${p.majorityClass} ${t("majority")}` + (mj ? `, ${mj.strict ? t("more than") : t("at least")} ${mj.num}/${mj.den}` : "") + (basis ? ` ${t("of the votes")} ${basis === "cast" ? t("cast") : basis === "present" ? t("of those present") : basis}` : "")]);
  if (q.enabled) out.push([t("Quorum"), `${r["quorum.percentBp"] != null ? r["quorum.percentBp"] / 100 + "% " : ""}${t("of the")} ${unit(q)} ${t("must be present")}`]);
  out.push([t("How people vote"), modeText(r["ballot.mode"] || "online") || String(r["ballot.mode"])]);
  out.push([t("Choices allowed"), p.minChoices === p.maxChoices ? String(p.maxChoices) : `${p.minChoices} ${t("to")} ${p.maxChoices}`]);
  if (r["window.maxExtensions"] != null) out.push([t("Extensions allowed"), String(r["window.maxExtensions"])]);
  return out;
}
const channel = (m) => ((m.rules || []).find((x) => x.param === "ballot.mode") || {}).value || "online";

function pointCard(ctx, m, p) {
  const q = m.quorum || {};
  const badge = { pending: ["Not opened", ""], open: ["Voting is open", "ok"], closed: ["Voting closed", "gold"] }[p.state] || [p.state, ""];
  const slot = h("div", { "data-test": "slot-" + p.pointId });
  const parts = [h("div", { class: "row" }, h("h3", { style: "margin:0" }, `${p.number}. ${p.title}`), h("span", { class: "sp" }), h("span", { class: "badge " + badge[1], "data-test": "point-state-" + p.pointId }, t(badge[0])), h("span", { class: "badge" }, p.secret ? t("Secret ballot") : t("Open vote")))];
  if (p.body) parts.push(h("p", { class: "muted" }, p.body));
  const opts = h("p", { class: "small" }, h("b", null, t("Choices: ")), p.options.filter((o) => o !== "").map((o) => (p.labels && p.labels[o]) || o).join(", "));
  parts.push(opts);

  if (p.state === "pending") {
    const quorumBad = q.enabled && !q.met;
    parts.push(h("div", { class: "eyebrow" }, t("These rules freeze the moment you open this question")),
      h("dl", { class: "kv", style: "margin:6px 0 14px" }, ruleLines(ctx, m, p).map(([k, v]) => [h("dt", null, k), h("dd", null, v)])));
    if (quorumBad) parts.push(msg("warn", t("Quorum is not complete."), `${q.present} ${t("of")} ${q.total} ${unit(q)} ${t("are present and")} ${q.required} ${t("are needed. Voting cannot open until enough people are checked in. If nobody else is coming, you can postpone from the End tab.")}`, null), h("button", { class: "btn ghost", onclick: () => ctx.go("end") }, t("Go to the End tab")));
    const mins = h("input", { type: "number", min: 1, max: 720, value: 30, "data-test": "minutes-" + p.pointId, "aria-label": t("Minutes voting stays open") });
    const btn = h("button", { class: "btn big", "data-test": "open-" + p.pointId, disabled: quorumBad, onclick: async () => {
      const n = Number(mins.value); if (!(n >= 1 && n <= 720)) { slot.replaceChildren(msg("bad", t("Type a number of minutes from 1 to 720."), null, null)); return; }
      if (!(await confirmBox(t("Open voting on this question?"), `${t("Voting will stay open for")} ${n} ${t("minutes. The rules listed above freeze now and cannot be changed.")}`, t("Yes, open voting"), t("Not yet")))) return;
      await act(btn, slot, ctx, () => ctx.call.post(`/points/${p.pointId}/open`, { minutes: n }), t("Voting is open."));
    } }, t("Open voting"));
    parts.push(field(t("How many minutes should voting stay open?"), mins), h("div", { style: "margin-top:12px" }, btn), quorumBad ? h("div", { class: "why-off" }, t("Grey because quorum is not complete.")) : null);
  } else if (p.state === "open") {
    const cast = (p.voted || []).length, present = (m.attendance && m.attendance.present) || 0;
    parts.push(h("div", { class: "grid g2" },
      h("div", null, h("div", { class: "eyebrow" }, t("Time left")), h("p", { style: "font:600 28px var(--serif);margin:2px 0", class: "mono", "data-at": p.endsMs || 0, "data-test": "point-left-" + p.pointId }, "")),
      h("div", null, h("div", { class: "eyebrow" }, t("Votes so far")), h("p", { style: "font:600 28px var(--serif);margin:2px 0", "data-test": "votes-" + p.pointId }, `${cast} ${t("of")} ${present} ${t("flats")}`))));
    if (papersOf(p.pointId).length) parts.push(paperSummary(p));
    if (!p.secret && !p.countsHidden && p.tally) parts.push(h("p", { class: "small" }, p.tally.options.map((o) => `${(p.labels && p.labels[o.option]) || o.option}: ${o.count}`).join("  ·  ")));
    else parts.push(h("p", { class: "small muted" }, t("The counts stay hidden until voting closes.")));
    const reason = h("input", { type: "text", maxlength: 200, placeholder: t("Why extend? (shown in the public record)"), "data-test": "extend-reason-" + p.pointId, "aria-label": t("Reason for extending") });
    const ext = h("button", { class: "btn ghost", "data-test": "extend-" + p.pointId, onclick: async () => {
      if (reason.value.trim().length < 3) { reason.classList.add("err"); slot.replaceChildren(msg("bad", t("Type a short reason first."), t("It is shown on the public record."), null)); return; }
      await act(ext, slot, ctx, () => ctx.call.post(`/points/${p.pointId}/extend`, { reason: reason.value.trim() }), t("Voting was extended."));
    } }, t("Extend voting"));
    const close = h("button", { class: "btn wine", "data-test": "close-" + p.pointId, onclick: async () => {
      if (!(await confirmBox(t("Close voting on this question?"), t("Nobody can vote on it after this. The result is counted and written to the public record."), t("Yes, close voting"), t("Keep it open")))) return;
      await act(close, slot, ctx, () => ctx.call.post(`/points/${p.pointId}/close`, {}), t("Voting is closed."));
    } }, t("Close voting"));
    parts.push(h("div", { class: "row", style: "margin-top:8px" }, h("div", { style: "flex:1;min-width:220px" }, reason), ext, close));
    if (p.extensions) parts.push(h("p", { class: "tiny muted" }, `${t("Extended")} ${p.extensions} ${t("time(s).")}`));
  } else {
    const t0 = p.tally;
    if (t0) parts.push(h("div", { "data-test": "result-" + p.pointId }, h("div", { class: "eyebrow" }, t("Result")),
      h("p", null, t0.options.map((o) => `${(p.labels && p.labels[o.option]) || o.option}: ${o.count} (${(o.percentBp / 100).toFixed(1)}%)`).join("  ·  ")),
      t0.outcome ? h("p", null, h("span", { class: "badge gold" }, String(t0.outcome).replace(/_/g, " "))) : null));
    if (p.paper) parts.push(h("p", { class: "small muted", "data-test": "paper-stats-" + p.pointId }, `${t("Paper ballots: given out")} ${p.paper.serials}, ${t("counted")} ${p.paper.counted}, ${t("invalid")} ${p.paper.invalid}, ${t("cancelled")} ${p.paper.voided}, ${t("not returned")} ${p.paper.uncounted}`));
    const waiting = p.secret && p.countsHidden; // a secret ballot stays "closed, counting" until the Host finishes counting
    if (waiting) {
      const fin = h("button", { class: "btn gold", "data-test": "finish-count-" + p.pointId, onclick: async () => {
        const left = papersOf(p.pointId).filter((x) => x.status === "issued").length;
        if (!(await confirmBox(t("Finish counting paper ballots?"), left ? `${left} ${t("paper ballot(s) were given out but not scanned on this screen. Papers not scanned are reported as not returned.")}` : t("All papers are scanned. The box will be sealed and the result written to the record."), t("Yes, finish counting"), t("Not yet")))) return;
        await act(fin, slot, ctx, () => ctx.call.post(`/points/${p.pointId}/count/finish`, {}), t("Counting is finished."));
      } }, t("Finish counting"));
      parts.push(h("div", { class: "row" }, fin, h("span", { class: "small muted" }, t("Scan every returned paper first."))));
    }
  }
  if (p.state === "open" || (p.state === "closed" && p.secret && p.countsHidden)) parts.push(paperTools(ctx, m, p, slot));
  parts.push(slot);
  return h("div", { class: "card", "data-test": "point-" + p.pointId }, parts);
}

// ------------------------------------------------------------------------------------------------ paper side
function papersOf(pid) { return Array.isArray(S.papers[pid]) ? S.papers[pid] : (S.papers[pid] = []); }
function parseSvg(text, forScreen) {
  const doc = new DOMParser().parseFromString(text, "image/svg+xml"), svg = document.importNode(doc.documentElement, true);
  if (forScreen) { svg.removeAttribute("width"); svg.removeAttribute("height"); svg.setAttribute("style", "width:100%;max-width:380px;border:1px solid var(--line);background:#fff"); }
  const g = svg.querySelector("#qr"); if (g) drawQrInto(g, g.getAttribute("data-token") || "", Number(g.getAttribute("data-size")) || 34);
  return svg;
}
function printPaper(rec) {
  const box = h("div", { class: "ballot-print" }, parseSvg(rec.svg, false));
  document.body.append(box); document.body.classList.add("printing-ballot");
  const done = () => { document.body.classList.remove("printing-ballot"); box.remove(); window.removeEventListener("afterprint", done); };
  window.addEventListener("afterprint", done); setTimeout(() => window.print(), 50); setTimeout(done, 60000);
}
function paperSummary(p) {
  const l = papersOf(p.pointId), n = (k) => l.filter((x) => x.status === k).length;
  return h("p", { class: "small muted", "data-test": "paper-summary-" + p.pointId }, `${t("Paper ballots (this screen): given out")} ${l.length}, ${t("counted")} ${n("counted")}, ${t("invalid")} ${n("invalid")}, ${t("cancelled")} ${n("voided")}, ${t("still to scan")} ${n("issued")}`);
}
function paperTools(ctx, m, p, slot) {
  const mode = channel(m);
  if (mode === "online") return h("p", { class: "tiny muted" }, t("This event uses online ballots only, so there are no paper ballots."));
  const list = papersOf(p.pointId), present = ((m.attendance && m.attendance.rows) || []).map((r) => r.flatNo);
  const body = h("div");
  const out = h("div", { "data-test": "paper-out-" + p.pointId });
  const sel = h("select", { "data-test": "paper-flat-" + p.pointId, "aria-label": t("Flat for the paper ballot") }, present.map((f) => h("option", { value: f }, f)));
  const pbtn = h("button", { class: "btn", "data-test": "print-ballot-" + p.pointId, disabled: p.state !== "open" || !present.length, onclick: async () => {
    out.replaceChildren();
    try {
      const r = await busy(pbtn, () => ctx.call.post(`/points/${p.pointId}/paper`, { flatNo: sel.value }));
      const rec = { flatNo: sel.value, serial: r.serial, token: r.token, qrText: r.qrText, svg: r.svg, status: "issued", n: list.length + 1 }; list.push(rec);
      showPaper(rec); paintList(); await ctx.refresh();
    } catch (e) { out.replaceChildren(errorBox(e)); }
  } }, t("Print ballot"));
  const listBox = h("div", { "data-test": "paper-list-" + p.pointId });
  function paintList() {
    listBox.replaceChildren(...list.map((r) => h("div", { class: "row", style: "padding:6px 0;border-top:1px solid var(--line2)" },
      h("span", null, h("b", null, r.flatNo), " · ", t("Paper"), " ", r.n), h("span", { class: "badge " + (r.status === "counted" ? "ok" : r.status === "issued" ? "" : "warn") }, ({ issued: t("Given out"), counted: t("Counted"), invalid: t("Invalid"), voided: t("Cancelled") })[r.status] || r.status), h("span", { class: "sp" }),
      r.status === "issued" ? [h("button", { class: "btn ghost", style: "min-height:40px", onclick: () => showPaper(r) }, t("Show / print")),
        p.state !== "pending" ? h("button", { class: "btn ghost", style: "min-height:40px", "data-test": "scan-" + p.pointId, onclick: () => scanDialog(ctx, p, r, list, paintList) }, t("Scan entry")) : null,
        h("button", { class: "btn ghost", style: "min-height:40px", "data-test": "void-" + p.pointId, onclick: async () => {
          if (!(await confirmBox(t("Cancel this paper?"), t("Use this for a spoiled paper. The flat may be given a new one."), t("Yes, cancel it"), t("No")))) return;
          try { await ctx.call.post(`/points/${p.pointId}/paper/void`, { token: r.token, flatNo: r.flatNo }); r.status = "voided"; paintList(); toast(t("Paper cancelled.")); await ctx.refresh(); }
          catch (e) { out.replaceChildren(errorBox(e)); }
        } }, t("Void"))] : null)));
  }
  paintList();
  body.append(h("div", { class: "eyebrow", style: "margin-top:14px" }, t("Paper ballots")),
    p.state === "open" ? h("div", { class: "row" }, h("div", { style: "min-width:140px" }, sel), pbtn) : null,
    p.state === "open" && !present.length ? h("div", { class: "why-off" }, t("Grey because nobody is checked in yet.")) : null,
    out, listBox,
    h("div", { class: "row", style: "margin-top:10px" }, h("button", { class: "btn ghost", "data-test": "scan-other-" + p.pointId, onclick: () => scanDialog(ctx, p, null, list, paintList) }, t("Scan a paper by its code"))));
  return body;
}
function showPaper(rec) {
  const m = modal([h("h3", null, `${t("Ballot for flat")} ${rec.flatNo}`), parseSvg(rec.svg, true),
    h("p", { class: "small muted" }, t("Do not write the voter's name or flat on the paper. Print it, hand it over, and close this window.")),
    h("div", { class: "row", style: "justify-content:flex-end" }, h("button", { class: "btn ghost", onclick: () => m.close() }, t("Close")), h("button", { class: "btn", "data-test": "print-now", onclick: () => printPaper(rec) }, t("Print")))]);
}
async function sha256Hex(buf) { const d = await crypto.subtle.digest("SHA-256", buf); return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join(""); }
function scanDialog(ctx, p, rec, list, repaint) {
  const labelOf = (o) => (p.labels && p.labels[o]) || o;
  const code = h("input", { type: "text", value: rec ? rec.token : "", placeholder: "bp_xxxxxxxxxxxx.xxxxxxxxxxxxxxxx", "data-test": "scan-code", "aria-label": t("Paper code under the QR"), autocomplete: "off" });
  const boxes = checks("mark", p.options.filter((o) => o !== "").map((o) => ({ value: o, label: labelOf(o) })), []);
  const photo = h("input", { type: "file", accept: "image/*", capture: "environment", "data-test": "scan-photo", "aria-label": t("Photo of the paper") });
  const res = h("div", { "data-test": "scan-result" });
  let m;
  const send = h("button", { class: "btn", "data-test": "scan-send", onclick: async () => {
    res.replaceChildren();
    const tok = code.value.trim(); if (!tok) { res.replaceChildren(msg("bad", t("Type or choose the paper code first."), t("It is printed under the QR code on the paper."), null)); return; }
    const ticked = boxes.values(), marks = Object.fromEntries(p.options.filter((o) => o !== "").map((o) => [o, ticked.includes(o)]));
    try {
      const file = photo.files && photo.files[0];
      const imageSha256 = file ? await sha256Hex(await file.arrayBuffer()) : await sha256Hex(new TextEncoder().encode(`entered-by-hand|${tok}|${Date.now()}`));
      const r = await busy(send, () => ctx.call.post(`/points/${p.pointId}/paper/scan`, { token: tok, marks, imageSha256 }));
      const mine = list.find((x) => x.token === tok); if (mine) { mine.status = r.result; repaint(); }
      res.replaceChildren(r.result === "counted" ? msg("ok", t("Counted."), t("This paper is now in the box."), file ? null : t("No photo was attached; it is filed as entered by hand.")) : msg("warn", t("Not counted: invalid paper."), r.reason ? String(r.reason).replace(/_/g, " ") : null, t("It is recorded as invalid and is not guessed.")));
      code.value = ""; photo.value = ""; boxes.querySelectorAll("input").forEach((i) => { i.checked = false; i.dispatchEvent(new Event("change")); });
      await ctx.refresh();
    } catch (e) { res.replaceChildren(errorBox(e)); }
  } }, t("Save this paper"));
  m = modal([h("h3", null, t("Scan entry")), h("p", { class: "muted" }, t("Look at the paper. Tick the boxes that are ticked on the paper. Leave empty boxes empty.")),
    field(t("Paper code"), code), h("div", { class: "hint", style: "margin-top:12px" }, t("Boxes ticked on the paper")), boxes,
    field(t("Photo of the paper (optional but recommended)"), photo, t("Only its fingerprint is sent. The photo itself stays on your phone.")),
    res, h("div", { class: "row", style: "justify-content:flex-end;margin-top:14px" }, h("button", { class: "btn ghost", onclick: () => m.close() }, t("Close")), send)]);
}

// ------------------------------------------------------------------------------------------------ voter code (shown once)
function codeShowCard() {
  const c = S.code, self = h("div", { class: "card", "data-test": "voter-code-card", role: "status" });
  mount(self, h("div", { class: "eyebrow" }, `${t("Voter code for flat")} ${c.flatNo}`),
    h("span", { class: "code", style: "font-size:min(22vw,110px);margin:10px 0", "data-test": "voter-code" }, c.digits),
    h("p", { style: "font-weight:600" }, t("Read it out or send it. It will not be shown again.")),
    h("button", { class: "btn big", "data-test": "voter-code-done", onclick: () => { S.code = null; self.remove(); } }, t("Done")));
  return self;
}
function voterCodeCard(ctx, m) {
  const present = ((m.attendance && m.attendance.rows) || []).map((r) => r.flatNo);
  const sel = h("select", { "data-test": "code-flat", "aria-label": t("Flat") }, present.map((f) => h("option", { value: f }, f)));
  const proxy = checks("proxy", [{ value: "proxy", label: t("This person votes as a proxy"), desc: t("Only if proxy voting is switched on for this event.") }], []);
  const ref = h("input", { type: "text", maxlength: 80, placeholder: t("Proxy holder reference"), "data-test": "code-proxy-ref", "aria-label": t("Proxy holder reference") });
  ref.classList.add("hidden"); proxy.addEventListener("change", () => ref.classList.toggle("hidden", !proxy.values().includes("proxy")));
  const slot = h("div");
  const btn = h("button", { class: "btn", "data-test": "issue-code", disabled: !present.length, onclick: async () => {
    slot.replaceChildren();
    const isProxy = proxy.values().includes("proxy");
    if (isProxy && ref.value.trim().length < 2) { slot.replaceChildren(msg("bad", t("Type the proxy holder's reference."), null, null)); return; }
    try {
      const r = await busy(btn, () => ctx.call.post("/passcodes/voter", isProxy ? { flatNo: sel.value, kind: "proxy", holderRef: ref.value.trim() } : { flatNo: sel.value }));
      S.code = { flatNo: r.flatNo || sel.value, digits: r.code }; await ctx.refresh(); window.scrollTo({ top: 0 });
    } catch (e) { slot.replaceChildren(errorBox(e)); }
  } }, t("Issue a voter code"));
  return h("div", { class: "card", "data-test": "voter-code-form" }, h("h2", null, t("Issue a voter code")),
    h("p", { class: "muted" }, t("For a voter who cannot use the check-in link. The flat must be checked in first. A new code cancels the old one.")),
    present.length ? [field(t("Flat"), sel), proxy, ref] : msg("info", t("Nobody is checked in yet."), t("Check a flat in first."), null),
    h("div", { style: "margin-top:12px" }, btn), !present.length ? h("div", { class: "why-off" }, t("Grey because no flat is checked in yet.")) : null, slot);
}

// ------------------------------------------------------------------------------------------------ close and publish, then share
function closeCard(ctx, m) {
  const slot = h("div");
  const open = (m.points || []).filter((p) => p.state === "open").length;
  const btn = h("button", { class: "btn wine big", "data-test": "close-meeting", onclick: async () => {
    if (!(await confirmBox(t("Close the meeting and publish?"), (open ? `${open} ${t("question(s) are still open and will be closed now. ")}` : "") + t("The results are counted, the record is sealed and the public report is published. This cannot be undone."), t("Yes, close and publish"), t("Not yet")))) return;
    await act(btn, slot, ctx, async () => { S.published = await ctx.call.post("/close", {}); }, t("The meeting is closed and the report is published."));
  } }, t("Close the meeting and publish"));
  return h("div", { class: "card tint", "data-test": "close-card" }, h("h2", null, t("Close the meeting and publish")),
    h("p", { class: "muted" }, t("Do this when every question is finished. The report is published at once.")), btn, slot);
}
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function publishedCard(ctx, m) {
  const eid = ctx.eid, url = location.origin + "/e/" + eid;
  const box = h("textarea", { rows: 3, placeholder: t("One e-mail address per line (up to 10)"), "data-test": "report-emails", "aria-label": t("E-mail addresses") });
  const slot = h("div");
  const btn = h("button", { class: "btn", "data-test": "report-email", onclick: async () => {
    slot.replaceChildren();
    const to = [...new Set(box.value.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean))];
    if (!to.length || to.length > 10 || to.some((x) => !EMAIL.test(x))) { box.classList.add("err"); slot.replaceChildren(msg("bad", t("Give 1 to 10 valid e-mail addresses."), t("Put each one on its own line."), null)); return; }
    box.classList.remove("err");
    try { const r = await busy(btn, () => ctx.call.post("/report/email", { to })); S.emailed = r.sent; slot.replaceChildren(msg("ok", `${t("Report sent to")} ${r.sent} ${t("address(es).")}`, null, null)); await ctx.refresh(); }
    catch (e) { slot.replaceChildren(errorBox(e, () => btn.click())); }
  } }, t("E-mail the report"));
  return h("div", { class: "card", "data-test": "published-card" }, h("h2", null, t("The report is published")),
    m.status !== "closed" ? msg("ok", t("Closed."), t("Open the public page to see the report."), null) : null,
    h("div", { class: "row" }, h("a", { class: "btn gold", href: "/e/" + eid, target: "_blank", rel: "noopener", "data-test": "public-link" }, t("Open the public page")),
      h("a", { class: "btn ghost", href: `/api/r/${eid}/pdf`, target: "_blank", rel: "noopener", "data-test": "pdf-link" }, t("Download PDF")),
      h("button", { class: "btn ghost", onclick: () => copyText(url) }, t("Copy the link"))),
    h("p", { class: "small mono muted", style: "word-break:break-all" }, url),
    h("h3", { style: "margin-top:18px" }, t("E-mail the report")), field(t("Send to"), box), h("div", { style: "margin-top:10px" }, btn), slot);
}

// Desk > Setup: the numbered 8-step wizard for the Organizer / Host.
// 1 Basics & schedule · 2 Rules · 3 Flat list · 4 Agenda & ballot · 5 Helpers · 6 Pay · 7 Publish the notice · 8 Voting day
import { h, t, mount, field, radios, checks, stepBar, wwh, errorBox, msg, busy, toast, confirmBox, get, post, deviceId, TownError, fmtTime, fmtMoney, copyText, loading, shortCode } from "/assets/core.js";
import { renderAgenda } from "./desk-ballot.js";

const TITLES = ["Basics and times", "Rules", "Flat list", "Agenda and ballot", "Helpers", "Pay", "Publish the notice", "Voting day"];
const MILESTONES = [["start", "The meeting starts"], ["votingStart", "Voting opens"], ["votingEnd", "Voting closes"], ["end", "The meeting ends"]];
const STATE = new Map(); // per event: current step and temporary screens (kept while the tab re-draws after a save)
const stateOf = (eid) => { if (!STATE.has(eid)) STATE.set(eid, { step: null, imp: null }); return STATE.get(eid); };

const pad = (n) => String(n).padStart(2, "0");
const toLocal = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const fromLocal = (v) => new Date(v).getTime();
const b = (s) => h("b", null, s);
const whyLine = (text) => h("p", { class: "muted small", "data-test": "why-step" }, b(t("Why this step: ")), text);

export async function render(ctx, el) {
  if (!ctx.priv) { mount(el, msg("info", t("This part is for the Organizer or Host."), null, t("Ask the Organizer to do the setup steps."))); return; }
  const S = stateOf(ctx.eid);
  const ps = (i) => ctx.progress?.steps?.[i];
  const stateOfStep = (i) => (ps(i)?.status === "done" ? "done" : "todo");
  if (S.step == null) { const first = TITLES.findIndex((_, i) => i < 7 && !(i === 4) && stateOfStep(i) !== "done"); S.step = first < 0 ? 7 : first; }

  const bar = h("div"), page = h("div"), nav = h("div", { class: "nav sticky" });
  const go = (i) => { S.step = Math.max(0, Math.min(7, i)); draw(); window.scrollTo?.({ top: 0 }); };
  async function draw() {
    const i = S.step;
    bar.replaceChildren(stepBar(TITLES.map((x, k) => ({ title: t(x), state: k === i ? "cur" : stateOfStep(k) })), go));
    nav.replaceChildren(
      h("button", { class: "btn ghost", "data-test": "step-back", disabled: i === 0, onclick: () => go(i - 1) }, t("Back")),
      h("span", { class: "muted small", style: "align-self:center" }, `${t("Step")} ${i + 1} ${t("of")} 8`),
      h("button", { class: "btn ghost", "data-test": "step-next", disabled: i === 7, onclick: () => go(i + 1) }, t("Next")));
    page.replaceChildren(loading());
    const api = { ctx, S, go, next: () => go(S.step + 1), redraw: draw, act: mkAct(ctx, S) };
    try {
      const body = await [step1, step2, step3, step4, step5, step6, step7, step8][i](api);
      page.replaceChildren(...[].concat(body).filter(Boolean));
    } catch (e) { page.replaceChildren(errorBox(e, draw)); }
  }
  mount(el, h("div", { "data-test": "setup-wizard" }, h("p", { class: "muted small" }, `${t("Event code")}: ${shortCode(ctx.eid)} · ${ctx.progress?.percent ?? 0}% ${t("of the setup is done")}`), bar, page, nav));
  await draw();
}

/** Runs a write: shows the error in `box` (with Try again), keeps what the user typed, and re-loads the desk after success. */
function mkAct(ctx, S) {
  return async function act(box, btn, fn, o = {}) {
    box.replaceChildren();
    try { await busy(btn, fn); } catch (e) { box.replaceChildren(errorBox(e, () => act(box, btn, fn, o))); return false; }
    if (o.ok) toast(o.ok);
    if (o.step != null) S.step = o.step; // set before the reload so the next screen shows after the desk re-draws
    if (o.refresh !== false) await ctx.refresh();
    return true;
  };
}
const card = (...kids) => h("div", { class: "card" }, kids);
const note = (text) => h("p", { class: "muted" }, text);

// ================================================================ 1 Basics & schedule
function step1({ ctx, act, next }) { // eslint-disable-line
  const m = ctx.model, sc = m.schedule || {}; const box = h("div");
  const tz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return ""; } })();
  const rows = MILESTONES.map(([k, label]) => {
    const dt = h("input", { type: "datetime-local", value: sc[k]?.atMs ? toLocal(sc[k].atMs) : "", "data-test": "sched-" + k, "aria-label": t(label) });
    const pl = h("input", { type: "text", value: sc[k]?.place || "", maxlength: "120", "data-test": "place-" + k, "aria-label": t(label) + " - " + t("place") });
    return { k, label, dt, pl };
  });
  const reason = h("input", { type: "text", maxlength: "300", placeholder: t("For example: the hall is booked for Sunday"), "data-test": "sched-reason", "aria-label": t("Reason for the change") });
  const changed = () => rows.some((r) => fromLocal(r.dt.value) !== Math.floor((sc[r.k]?.atMs || 0) / 60000) * 60000 || r.pl.value.trim() !== (sc[r.k]?.place || ""));
  const save = h("button", { class: "btn gold big", "data-test": "step1-save", onclick: async () => {
    if (!changed()) return next();
    if (rows.some((r) => !r.dt.value || !r.pl.value.trim())) { box.replaceChildren(msg("bad", t("Every time and every place must be filled."), null, t("Fill the empty boxes and press the button again."))); return; }
    if (reason.value.trim().length < 3) { box.replaceChildren(msg("bad", t("A reason is needed for this change."), null, t("Type a few words in the Reason box. It is shown on the public record."))); reason.classList.add("err"); reason.focus(); return; }
    const schedule = Object.fromEntries(rows.map((r) => [r.k, { atMs: fromLocal(r.dt.value), place: r.pl.value.trim() }]));
    await act(box, save, () => ctx.call.put("/schedule", { schedule, reason: reason.value.trim() }), { ok: t("Times saved."), step: 1 });
  } }, t("Save and go to the rules"));
  return [
    wwh(t("You, the Organizer or Host"), t("Check the title, the four times and the places"), t("Change a time or place if needed, give a reason, then press the big button"), t("Members plan their day around these. The notice period is counted from the day you publish to the start time.")),
    card(h("h3", null, t("Your event")),
      h("dl", { class: "kv" }, h("dt", null, t("Title")), h("dd", { "data-test": "event-title" }, m.title), h("dt", null, t("Society")), h("dd", null, m.society?.name || ""), h("dt", null, t("Kind")), h("dd", null, m.kind === "election" ? t("Election") : t("Meeting")), h("dt", null, t("Changes so far")), h("dd", null, String(m.scheduleChanges || 0))),
      h("p", { class: "muted small" }, t("The title cannot be changed here. If it is wrong, tell the Grievance Officer or create a new event.")),
      whyLine(t("A wrong time or place is the most common reason a meeting is challenged later."))),
    card(h("h3", null, t("The four times")), h("p", { class: "muted small" }, `${t("Times are in your browser's time zone")}${tz ? ": " + tz : ""}.`),
      rows.map((r) => h("div", { class: "grid g2", style: "margin-bottom:6px" }, field(t(r.label), r.dt), field(t("Place"), r.pl))),
      field(t("Reason (only if you change something)"), reason, t("It is shown on the public record.")),
      box, h("div", { style: "margin-top:16px" }, save)),
  ];
}

// ================================================================ 2 Rules
async function step2({ ctx, act, next, S }) {
  const rules = ctx.priv.rules || { params: {}, options: {}, locked: {} }; const box = h("div");
  let pack = null; try { pack = await get("/api/packs/" + ctx.model.packId); } catch { /* the page still works without it */ }
  const locked = { ...(pack?.locked || {}), ...(rules.locked || {}) };
  const defs = ctx.schema?.params || [], odefs = ctx.schema?.options || [];
  const quorumOn = rules.options?.quorum_check !== false;

  // ---- rule values
  const inputs = {};
  const mkParam = (d) => {
    const curV = rules.params?.[d.id] ?? null; let ctl, get1;
    if (d.type === "int") { ctl = h("input", { type: "number", value: curV ?? "", min: d.min, max: d.max, "data-test": "rule-" + d.id, "aria-label": d.label }); get1 = () => (ctl.value === "" ? null : +ctl.value); }
    else if (d.type === "bool") { ctl = radios("p_" + d.id, [{ value: "y", label: t("Yes") }, { value: "n", label: t("No") }], (curV ?? d.default ?? false) ? "y" : "n"); get1 = () => ctl.value() === "y"; }
    else { ctl = radios("p_" + d.id, (d.enumValues || []).map((v) => ({ value: v, label: v.replace(/_/g, " ") })), curV ?? d.default ?? undefined); get1 = () => ctl.value(); }
    inputs[d.id] = { get: get1, cur: curV, def: d.default, type: d.type };
    const needs = d.required && curV == null && (!d.conditional || quorumOn);
    return h("div", { style: "margin-bottom:10px", "data-test": "rule-row-" + d.id }, h("label", { class: "f" }, d.label, " ", needs ? h("span", { class: "badge bad", "data-test": "must-set" }, t("You must set this")) : curV != null ? h("span", { class: "badge ok" }, t("Set")) : null),
      d.help || needs ? h("div", { class: "hint" }, needs ? t("The law pack for your place does not fix this. Type the number from your society's bye-laws. ") + (d.help ? t(d.help) : "") : t(d.help)) : null, ctl);
  };
  const main = defs.filter((d) => d.required || rules.params?.[d.id] != null), more = defs.filter((d) => !main.includes(d));
  const reason = h("input", { type: "text", maxlength: "300", placeholder: t("For example: bye-law 12 says 35 percent"), "data-test": "rules-reason", "aria-label": t("Reason for changing the rules") });

  // ---- options (tick boxes). Locked by law: ticked or empty, grey, with the law's reason.
  const free = odefs.filter((o) => !locked[o.key]);
  const decide = free.filter((o) => rules.options?.[o.key] == null && o.forceDecision);
  const ticks = free.filter((o) => !decide.includes(o));
  const optChecks = checks("opt", ticks.map((o) => ({ value: o.key, label: t(o.label) })), ticks.filter((o) => rules.options?.[o.key] ?? o.default).map((o) => o.key));
  const decideR = decide.map((o) => ({ o, r: radios("d_" + o.key, [{ value: "y", label: t("Yes") }, { value: "n", label: t("No") }], undefined) }));
  const lockedRows = Object.entries(locked).map(([key, l]) => {
    const od = odefs.find((o) => o.key === key); const form = h("div", { class: "hidden card tint" });
    const decl = h("textarea", { rows: "3", maxlength: "500", "data-test": "override-decl-" + key, "aria-label": t("Declaration") });
    const valR = radios("ov_" + key, [{ value: "y", label: t("Ticked (yes)") }, { value: "n", label: t("Not ticked (no)") }], l.value ? "n" : "y");
    const obox = h("div");
    const send = h("button", { class: "btn", "data-test": "override-send-" + key, onclick: async () => {
      if (decl.value.trim().length < 10) { obox.replaceChildren(msg("bad", t("The declaration is too short."), null, t("Write which bye-law says so, for example: our registered bye-laws, clause 14."))); return; }
      await act(obox, send, () => ctx.call.post("/options/override", { key, value: valR.value() === "y", declaration: decl.value.trim() }), { ok: t("Saved. The report shows both the law and your declaration.") });
    } }, t("Save our own rule"));
    form.append(h("p", null, t("Use this only if your society's registered bye-laws really say otherwise. The public page will show what the law pack said and your declaration.")), field(t("What do your bye-laws say?"), valR), field(t("Declaration (which bye-law, in your words)"), decl), obox, send);
    return h("div", { "data-test": "locked-" + key }, checks("lk_" + key, [{ value: key, label: t(od?.label || key), disabled: true, reason: t("Fixed by law: ") + t(l.reason || "") }], l.value ? [key] : []),
      h("button", { class: "btn ghost", style: "min-height:38px", onclick: () => form.classList.toggle("hidden") }, t("Our society's own bye-laws differ")), form);
  });

  // ---- own rules
  const custom = ctx.model.customRules || [];
  const cTitle = h("input", { type: "text", maxlength: "80", "data-test": "custom-title", "aria-label": t("Name of the rule") });
  const cKind = radios("ckind", [{ value: "text", label: t("Words") }, { value: "number", label: t("A number") }, { value: "yes_no", label: t("Yes or no") }], "text", () => syncC());
  const cVal = h("input", { type: "text", "data-test": "custom-value", "aria-label": t("Value") });
  const cYes = radios("cyes", [{ value: "y", label: t("Yes") }, { value: "n", label: t("No") }], "y");
  const cNote = h("input", { type: "text", maxlength: "200", "data-test": "custom-note", "aria-label": t("Note") });
  const cbox = h("div");
  function syncC() { const k = cKind.value(); cVal.classList.toggle("hidden", k === "yes_no"); cYes.classList.toggle("hidden", k !== "yes_no"); cVal.type = k === "number" ? "number" : "text"; }
  const cAdd = h("button", { class: "btn", "data-test": "custom-add", onclick: async () => {
    const k = cKind.value(); const value = k === "yes_no" ? cYes.value() === "y" : k === "number" ? +cVal.value : cVal.value.trim();
    if (cTitle.value.trim().length < 3 || (k !== "yes_no" && cVal.value.trim() === "")) { cbox.replaceChildren(msg("bad", t("Name and value are needed."), null, t("Type a name (at least 3 letters) and the value."))); return; }
    await act(cbox, cAdd, () => ctx.call.post("/custom-rules", { title: cTitle.value.trim(), kind: k, value, note: cNote.value.trim() || undefined }), { ok: t("Rule added.") });
  } }, t("Add this rule"));
  syncC();

  const hist = ctx.model.ruleHistory || [];
  const label = (id) => defs.find((d) => d.id === id)?.label || id;
  const save = h("button", { class: "btn gold big", "data-test": "step2-save", onclick: async () => {
    const changes = {}; for (const [id, i] of Object.entries(inputs)) { const v = i.get(); if (v != null && v !== (i.cur ?? i.def ?? (i.type === "bool" ? false : null))) changes[id] = v; }
    const optionsOut = Object.fromEntries(ticks.map((o) => [o.key, optChecks.values().includes(o.key)])); for (const { o, r } of decideR) if (r.value()) optionsOut[o.key] = r.value() === "y";
    const missing = decideR.filter(({ r }) => !r.value());
    const unset = defs.filter((d) => d.required && rules.params?.[d.id] == null && inputs[d.id].get() == null && (!d.conditional || (ticks.some((o) => o.key === "quorum_check") ? optChecks.values().includes("quorum_check") : quorumOn)));
    if (missing.length || unset.length) { box.replaceChildren(msg("bad", t("Some rules are not set yet."), unset.map((d) => d.label).concat(missing.map(({ o }) => o.label)).join("; "), t("Fill the boxes marked \"You must set this\" and press the button again."))); return; }
    if (Object.keys(changes).length && reason.value.trim().length < 3) { box.replaceChildren(msg("bad", t("A reason is needed for this change."), null, t("Type a few words in the Reason box under the rules. It is shown on the public record."))); reason.classList.add("err"); reason.focus(); return; }
    await act(box, save, async () => { await ctx.call.put("/options", { options: optionsOut }); if (Object.keys(changes).length) await ctx.call.put("/rules", { changes, reason: reason.value.trim() }); }, { ok: t("Rules saved."), step: 2 });
  } }, t("Save the rules and go to the flat list"));

  return [
    wwh(t("You, the Organizer or Host"), t("Check each rule and tick what your society needs"), t("Rules from your law pack are filled in. Fill the ones marked \"You must set this\"."), t("The meeting and the report are checked against these rules. They are fixed when voting opens.")),
    card(h("h3", null, t("Rules of your law pack")), pack ? h("p", null, b(pack.name), null) : null,
      (pack?.recommended || []).length ? h("ul", null, pack.recommended.map((r) => h("li", null, r))) : null,
      h("p", { class: "muted small" }, t("This is a record and a check, not legal advice.")), whyLine(t("A rule that is not set cannot be checked, so the notice cannot be published."))),
    card(h("h3", null, t("Rule values")), main.map(mkParam),
      more.length ? h("details", null, h("summary", { style: "cursor:pointer;font-weight:600;margin:8px 0" }, t("More rules you can set (optional)")), more.map(mkParam)) : null,
      field(t("Reason for changing any rule"), reason, t("Needed only if you change a number or choice above. It is shown on the public record."))),
    card(h("h3", null, t("What do you want to use?")), h("p", { class: "muted small" }, t("Tick the ones you want.")), optChecks,
      decideR.length ? h("div", null, h("h4", null, t("Please decide")), decideR.map(({ o, r }) => field(t(o.label), r, t("You must choose Yes or No.")))) : null),
    lockedRows.length ? card(h("h3", null, t("Fixed by law")), h("p", { class: "muted small" }, t("These cannot be changed in the normal way. The reason is shown next to each.")), lockedRows) : null,
    card(h("h3", null, t("Your society's own extra rules (optional)")),
      custom.length ? h("ul", { "data-test": "custom-list" }, custom.map((r) => h("li", null, b(r.title), ": ", typeof r.value === "boolean" ? (r.value ? t("Yes") : t("No")) : String(r.value), r.note ? " (" + r.note + ")" : "", " ",
        h("button", { class: "btn ghost", style: "min-height:34px", onclick: async () => { if (await confirmBox(t("Withdraw this rule?"), r.title, t("Yes"), t("No"))) await act(cbox, cAdd, () => ctx.call.post("/custom-rules", { title: r.title, kind: "text", value: "-", remove: true }), { ok: t("Rule withdrawn.") }); } }, t("Withdraw"))))) : null,
      field(t("Name of the rule"), cTitle, t("For example: Maximum speaking minutes")), field(t("Kind"), cKind), field(t("Value"), h("div", null, cVal, cYes)), field(t("Note (optional)"), cNote), cbox, cAdd),
    hist.length ? card(h("h3", null, t("History of rule changes")), h("div", { class: "tw" }, h("table", { class: "t", "data-test": "rule-history" }, h("thead", null, h("tr", null, [t("When"), t("Rule"), t("Before"), t("After"), t("Reason")].map((x) => h("th", null, x)))),
      h("tbody", null, hist.map((r) => h("tr", null, h("td", null, fmtTime(r.ts)), h("td", null, label(r.param)), h("td", null, String(r.old ?? "-")), h("td", null, String(r.new ?? "-")), h("td", null, r.reason || "")))))), (ctx.model.overrides || []).length ? h("p", { class: "muted small" }, t("Your own bye-law declarations: ") + ctx.model.overrides.map((o) => `${o.key || o.label}`).join(", ")) : null) : null,
    box, h("div", null, save),
  ].filter(Boolean);
}

// ================================================================ 3 Flat list
function step3({ ctx, act, next, S, redraw }) {
  const m = ctx.model; const flats = m.attendance?.total || 0, weight = m.attendance?.totalWeight || 0;
  const tbox = h("div"), ubox = h("div"), mbox = h("div"), hbox = h("div");
  const n = h("input", { type: "number", min: "1", max: "3000", value: flats || 50, "data-test": "tpl-flats", "aria-label": t("Number of flats") });
  const dl = h("button", { class: "btn", "data-test": "tpl-download", onclick: async () => {
    await act(tbox, dl, async () => {
      const r = await fetch(`/api/events/${ctx.eid}/roll/template?flats=${encodeURIComponent(+n.value || 50)}`, { headers: { authorization: "Bearer " + ctx.token, "x-device-id": deviceId() } });
      if (!r.ok) { let d = null; try { d = await r.json(); } catch { /* */ } throw new TownError(r.status, d?.error, d?.message); }
      const url = URL.createObjectURL(await r.blob()); const a = h("a", { href: url, download: "flat-list-template.xlsx" }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000);
    }, { ok: t("The sheet was downloaded."), refresh: false });
  } }, t("Download the Excel sheet"));
  const file = h("input", { type: "file", accept: "application/pdf,.pdf", "data-test": "roll-file", "aria-label": t("Choose the PDF") });
  const check = h("button", { class: "btn gold big", "data-test": "roll-check", onclick: async () => {
    const f = file.files && file.files[0];
    if (!f) { ubox.replaceChildren(msg("bad", t("No file chosen."), null, t("Press \"Choose file\", pick your PDF, then press this button again."))); return; }
    if (f.size > 6 * 1024 * 1024) { ubox.replaceChildren(errorBox({ code: "too_large", status: 413, message: t("The PDF is bigger than 6 MB.") })); return; }
    await act(ubox, check, async () => {
      const b64 = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1] || ""); r.onerror = () => rej({ code: "bad_file", message: t("That file could not be read.") }); r.readAsDataURL(f); });
      const pv = await ctx.call.post("/roll/import", { pdfBase64: b64, fileName: f.name.slice(0, 100) }); S.imp = { b64, name: f.name.slice(0, 100), pv };
    }, { refresh: false });
    if (S.imp) redraw();
  } }, t("Check my PDF"));

  const out = [
    wwh(t("You, the Organizer or Host"), t("Give us the list of flats and their votes"), t("Download the sheet, fill it, save it as PDF, upload the PDF, check the result, confirm"), t("Only flats on this list can vote. It is published (without names) so everyone can see it.")),
    card(h("h3", null, t("Your flat list now")), flats ? h("p", { "data-test": "roll-now" }, `${flats} ${t("flats")} · ${t("total weight")} ${weight}`) : h("p", { class: "muted" }, t("No flats yet.")), whyLine(t("Quorum, majorities and who may vote are all worked out from this list."))),
    card(h("h3", null, t("1. Get the sheet and fill it")),
      h("ol", null, [t("Press \"Download the Excel sheet\" (set the number of flats first)."), t("Open it in Excel. One row per flat: flat number, vote weight, can vote (Yes/No), then name, mobile and e-mail if you have them."), t("Press File, then Save As, then choose PDF."), t("Come back here and upload that PDF.")].map((x) => h("li", null, x))),
      h("div", { class: "row" }, field(t("Number of flats"), n), dl), tbox),
    card(h("h3", null, t("2. Upload the PDF")), file, ubox, h("div", { style: "margin-top:12px" }, S.imp ? null : check)),
  ];
  if (S.imp) out.push(previewCard(ctx, S, act, redraw, ubox));

  // manual add / change / remove
  const op = radios("op", [{ value: "add", label: t("Add a flat") }, { value: "change", label: t("Change a flat's weight or vote") }, { value: "remove", label: t("Remove a flat") }], "add", () => syncM());
  const fno = h("input", { type: "text", maxlength: "24", "data-test": "flat-no", "aria-label": t("Flat number") });
  const wt = h("input", { type: "number", min: "1", value: "1", "data-test": "flat-weight", "aria-label": t("Vote weight") });
  const elig = checks("elig", [{ value: "y", label: t("This flat can vote") }], ["y"]);
  const nm = h("input", { type: "text", maxlength: "80", "data-test": "flat-name", "aria-label": t("Name of the holder") });
  const rs = h("input", { type: "text", maxlength: "300", "data-test": "flat-reason", "aria-label": t("Reason") });
  const wrapW = field(t("Vote weight"), wt, t("1 means one flat, one vote.")), wrapE = elig, wrapN = field(t("Name of the holder (optional, kept private)"), nm);
  function syncM() { const o = op.value(); wrapW.classList.toggle("hidden", o === "remove"); wrapE.classList.toggle("hidden", o === "remove"); wrapN.classList.toggle("hidden", o !== "add"); }
  const mgo = h("button", { class: "btn", "data-test": "flat-go", onclick: async () => {
    if (!fno.value.trim()) { mbox.replaceChildren(msg("bad", t("Type the flat number."), null, null)); return; }
    if (rs.value.trim().length < 5) { mbox.replaceChildren(msg("bad", t("A reason is needed for this change."), null, t("Type at least 5 letters in the Reason box. It is shown on the public record."))); return; }
    const o = op.value(); const body = { op: o, flatNo: fno.value.trim(), reason: rs.value.trim() };
    if (o !== "remove") { body.weight = +wt.value || 1; body.eligible = elig.values().includes("y"); } if (o === "add" && nm.value.trim()) body.name = nm.value.trim();
    await act(mbox, mgo, () => ctx.call.post("/roll/flat", body), { ok: t("Flat list changed.") });
  } }, t("Make this change"));
  syncM();
  out.push(card(h("details", { "data-test": "manual-flat" }, h("summary", { style: "cursor:pointer;font-weight:600" }, t("Add, change or remove one flat by hand")),
    h("p", { class: "muted small" }, t("Every change needs a reason. The list before and after is public (without names).")), field(t("What do you want to do?"), op), field(t("Flat number"), fno), wrapW, wrapE, wrapN, field(t("Reason"), rs), mbox, mgo)));

  // holder contacts
  const hf = h("input", { type: "text", maxlength: "24", "data-test": "holder-flat", "aria-label": t("Flat number") });
  const hn = h("input", { type: "text", maxlength: "80", "data-test": "holder-name", "aria-label": t("Name") });
  const he = h("input", { type: "email", maxlength: "120", "data-test": "holder-email", "aria-label": t("E-mail") });
  const hp = h("input", { type: "tel", maxlength: "20", "data-test": "holder-phone", "aria-label": t("Mobile number") });
  const hgo = h("button", { class: "btn", "data-test": "holder-go", onclick: async () => {
    if (!hf.value.trim() || hn.value.trim().length < 2) { hbox.replaceChildren(msg("bad", t("Flat number and name are needed."), null, null)); return; }
    await act(hbox, hgo, () => ctx.call.post("/holders", { flatNo: hf.value.trim(), name: hn.value.trim(), email: he.value.trim() || undefined, phone: hp.value.trim() || undefined }), { ok: t("Contact saved privately.") });
  } }, t("Save this contact"));
  out.push(card(h("details", null, h("summary", { style: "cursor:pointer;font-weight:600" }, t("Add a flat holder's contact (optional)")),
    h("p", { class: "muted small" }, t("Kept private and encrypted. The public page and the report show only a hidden form such as Raj****** A******. Used to send the holder their voting information.")),
    h("div", { class: "grid g2" }, field(t("Flat number"), hf), field(t("Name"), hn), field(t("E-mail (optional)"), he), field(t("Mobile (optional)"), hp)), hbox, hgo)));
  out.push(h("div", null, h("button", { class: "btn gold big", "data-test": "step3-next", disabled: !flats, onclick: next }, t("The flat list is ready: next, the agenda")), flats ? null : h("div", { class: "why-off" }, t("Upload and confirm your flat list first."))));
  return out;
}

function previewCard(ctx, S, act, redraw, ubox) {
  const { pv, b64, name } = S.imp; const box = h("div");
  const list = (arr, max = 30) => arr.slice(0, max).join(", ") + (arr.length > max ? ` ... ${t("and")} ${arr.length - max} ${t("more")}` : "");
  const weights = pv.rows.filter((r) => r.eligible).map((r) => r.weight); const unique = pv.ok && ctx.priv.rules?.options?.weightage && weights.some((w) => weights.filter((x) => x === w).length === 1) && weights.length > 2;
  const reason = h("input", { type: "text", maxlength: "300", placeholder: t("For example: two flats changed hands"), "data-test": "roll-reason", "aria-label": t("Reason for replacing the list") });
  const again = h("button", { class: "btn ghost", "data-test": "roll-again", onclick: () => { S.imp = null; redraw(); } }, t("Choose a different file"));
  const confirm = h("button", { class: "btn gold big", "data-test": "roll-confirm", disabled: !pv.ok, onclick: async () => {
    if (pv.replacesExisting && reason.value.trim().length < 5) { box.replaceChildren(msg("bad", t("This replaces the list you already have."), null, t("Type why, at least 5 letters, in the Reason box."))); reason.classList.add("err"); reason.focus(); return; }
    const ok = await act(box, confirm, () => ctx.call.post("/roll/import", { pdfBase64: b64, fileName: name, confirm: pv.confirmCode, reason: reason.value.trim() || undefined }), { ok: t("The flat list is saved.") });
    if (ok) S.imp = null;
  } }, t("Confirm and save this list"));
  return h("div", { class: "card", "data-test": "roll-preview" }, h("h3", null, t("3. Check what we read")),
    pv.ok ? msg("ok", t("The sheet was read without problems."), `${pv.flats} ${t("flats")} · ${pv.eligible} ${t("can vote")} · ${t("total weight")} ${pv.totalWeight}`, t("Nothing is saved yet. Look at the table, then press the big button."))
      : msg("bad", t("The sheet has problems. Nothing was saved."), null, t("Fix them in the Excel sheet, save it as PDF again and upload it again.")),
    pv.problems?.length ? h("ul", { "data-test": "roll-problems" }, pv.problems.map((p) => h("li", null, p.message || String(p)))) : null,
    pv.ok ? h("div", null,
      h("p", null, `${t("New")}: ${pv.diff.added.length} · ${t("Removed")}: ${pv.diff.removed.length} · ${t("Changed")}: ${pv.diff.changed.length} · ${t("Same")}: ${pv.diff.same}`),
      pv.diff.added.length ? h("p", { class: "small" }, b(t("New: ")), list(pv.diff.added)) : null, pv.diff.removed.length ? h("p", { class: "small" }, b(t("Removed: ")), list(pv.diff.removed)) : null,
      pv.diff.changed.length ? h("p", { class: "small" }, b(t("Changed: ")), list(pv.diff.changed.map((c) => c.flatNo || c))) : null,
      unique ? msg("warn", t("Some flats have a vote weight that no other flat has."), t("In a secret ballot, a total could then point to one flat. Equal weights keep the ballot more private. Only continue if your bye-laws need these weights."), null) : null,
      h("div", { class: "tw" }, h("table", { class: "t" }, h("thead", null, h("tr", null, [t("Flat"), t("Name"), t("Weight"), t("Can vote")].map((x) => h("th", null, x)))),
        h("tbody", null, pv.rows.slice(0, 100).map((r) => h("tr", null, h("td", null, r.flatNo), h("td", null, r.name || ""), h("td", null, String(r.weight)), h("td", null, r.eligible ? t("Yes") : t("No"))))))),
      pv.rows.length > 100 ? h("p", { class: "muted small" }, `${t("Showing the first 100 of")} ${pv.rows.length}.`) : null,
      pv.replacesExisting ? field(t("Why are you replacing the list?"), reason, t("Needed because a list already exists. It is shown on the public record.")) : null) : null,
    box, h("div", { class: "row", style: "margin-top:14px" }, pv.ok ? confirm : null, again));
}

// ================================================================ 4 Agenda & ballot
async function step4({ ctx, next }) {
  const holder = h("div");
  const head = [
    wwh(t("You, the Organizer or Host"), t("Write the points members will discuss or vote on"), t("Add each point, choose open vote or secret ballot, and design the ballot"), t("Members see the agenda in the notice. Points cannot be changed once voting opens on them.")),
    whyLine(t("The agenda is what the meeting is allowed to decide.")),
  ];
  await renderAgenda(ctx, holder, { next });
  return [...head, holder];
}

// ================================================================ 5 Helpers
async function step5({ ctx, next }) {
  const holder = h("div");
  const out = [wwh(t("You, the Organizer or Host"), t("Add helpers (optional)"), t("Add a Host or an Attendance Monitor by e-mail. They get a code by e-mail."), t("Helpers check people in at the door and share the work. You can skip this step.")), whyLine(t("A second person means the meeting does not depend on one phone.")), holder];
  try { const mod = await import("./desk-team.js"); await mod.renderTeam(ctx, holder); }
  catch (e) { holder.replaceChildren(card(h("h3", null, t("The helpers screen is not available right now")), note(t("You can skip this step and add helpers later from the Team tab.")), h("button", { class: "btn ghost", onclick: () => ctx.go("team") }, t("Open the Team tab")))); }
  out.push(h("div", { style: "margin-top:16px" }, h("button", { class: "btn gold big", "data-test": "step5-next", onclick: next }, t("Helpers are done (or skip): next, pay"))));
  return out;
}

// ================================================================ 6 Pay
function step6({ ctx, act, next, S, redraw }) {
  const m = ctx.model, paid = (m.payments || []).some((p) => p.state === "paid");
  const pr = (ctx.schema?.prices || {})[m.country === "IN" ? "india" : "world"]?.[m.kind];
  const priceText = pr ? fmtMoney(pr.amountMinor, pr.currency) : null;
  const box = h("div"), lbox = h("div");
  const out = [
    wwh(t("You, the Organizer"), t("Pay once for this event"), t("Pay yourself, or send a payment link to someone else"), t("The notice can only be published after payment. Nothing is charged for helpers or members.")),
    card(h("h3", null, t("The price")), h("p", { class: "code s", "data-test": "price" }, priceText || "-"), h("p", { class: "muted small" }, t("One payment for this one event. There is no card form on this site: payment is handled by our payment partner.")), whyLine(t("It pays for running the event and keeping the record safe."))),
  ];
  if (paid) { out.push(msg("ok", t("This event is paid."), null, t("Go to the next step.")), h("div", null, h("button", { class: "btn gold big", "data-test": "step6-next", onclick: next }, t("Paid: next, publish the notice")))); return out; }
  const pay = h("button", { class: "btn gold big", "data-test": "pay-now", disabled: !ctx.priv.can?.pay, onclick: async () => {
    await act(box, pay, async () => {
      const p = await ctx.call.post("/pay", {});
      if (p.mode === "test") await post("/api/pay/test-confirm", { eventId: ctx.eid, paymentId: p.paymentId }, ctx.token);
      else S.livePay = p.payPath;
    }, { ok: t("Payment received.") });
  } }, priceText ? `${t("Pay")} ${priceText} ${t("(test mode)")}` : t("Pay now"));
  out.push(card(h("h3", null, t("Option A: I will pay")), h("p", { class: "muted small" }, t("In test mode no money moves. The payment is marked as paid at once.")), box, pay, ctx.priv.can?.pay ? null : h("div", { class: "why-off" }, t("Only the Organizer can pay. Use option B to send a link."))));
  if (S.livePay) out.push(msg("info", t("Open the payment page to finish."), null, null), h("a", { class: "btn", href: S.livePay }, t("Open the payment page")));
  const linkBtn = h("button", { class: "btn", "data-test": "pay-link", onclick: async () => {
    await act(lbox, linkBtn, async () => { const r = await ctx.call.post("/pay-link", {}); S.payLink = location.origin + r.payPath; }, { refresh: false });
    if (S.payLink) redraw();
  } }, S.payLink ? t("Show the link again") : t("Someone else will pay"));
  const linkOut = S.payLink ? h("div", { "data-test": "pay-link-box" },
    h("input", { type: "text", readonly: "readonly", value: S.payLink, "data-test": "pay-link-url", "aria-label": t("Payment link"), onclick: (e) => e.target.select() }),
    h("div", { class: "row", style: "margin-top:8px" },
      h("button", { class: "btn ghost", "data-test": "pay-link-copy", onclick: () => copyText(S.payLink) }, t("Copy the link")),
      navigator.share ? h("button", { class: "btn ghost", "data-test": "pay-link-share", onclick: () => navigator.share({ title: m.title, text: `${t("Please pay for")} ${m.title}`, url: S.payLink }).catch(() => {}) }, t("Share")) : null,
      h("button", { class: "btn ghost", "data-test": "pay-check", onclick: () => ctx.refresh() }, t("Check if it was paid"))),
    h("p", { class: "muted small" }, t("Anyone with this link can pay. They do not need to sign in. We never ask them for card details on this site."))) : null;
  out.push(card(h("h3", null, t("Option B: someone else will pay")), h("p", { class: "muted small" }, t("You get a link. Send it to whoever pays, for example the society treasurer.")), lbox, linkBtn, linkOut));
  out.push(h("p", { class: "muted small", "data-test": "pay-status" }, `${t("Payment status")}: ${(m.payments || []).length ? t("waiting for payment") : t("not started")}.`));
  return out;
}

// ================================================================ 7 Publish the notice
function step7({ ctx, act, next }) {
  const m = ctx.model, paid = (m.payments || []).some((p) => p.state === "paid"), flats = m.attendance?.total || 0, pts = (m.points || []).length;
  const published = ["agenda_published", "live", "closed"].includes(m.status) || !!m.notice;
  const box = h("div"); const url = `${location.origin}/e/${ctx.eid}`;
  const when = m.schedule?.start?.atMs ? fmtTime(m.schedule.start.atMs) : "";
  const share = `${m.society?.name || ""}: ${m.title}${when ? " - " + when : ""}${m.venue ? ", " + m.venue : ""}. ${t("See the notice and agenda here:")} ${url}`;
  const need = [[flats > 0, t("The flat list is ready.")], [pts > 0, t("The agenda has at least one point.")], [paid, t("The event is paid.")]];
  const ready = need.every((x) => x[0]);
  const pub = h("button", { class: "btn gold big", "data-test": "publish", disabled: !ready || !ctx.priv.can?.publish_agenda, onclick: async () => {
    await act(box, pub, () => ctx.call.post("/agenda/publish", {}), { ok: t("The notice is published.") });
  } }, published ? t("Publish again") : t("Publish the notice"));
  const n = m.notice;
  const out = [
    wwh(t("You, the Organizer or Host"), t("Publish the notice and agenda"), t("Press the big button. We check the notice period for you."), t("Members must be told in time. The check is shown on the public record.")),
    card(h("h3", null, t("Before you publish")), h("ul", { "data-test": "publish-checks" }, need.map(([ok, text]) => h("li", null, (ok ? "✓ " : "✗ "), text))), whyLine(t("A notice that is published too late can be challenged. We tell you now."))),
  ];
  if (n) out.push(n.met ? msg("ok", `${t("The notice period is fine.")} ${n.givenDays} ${t("days")}`, `${t("The rules ask for")} ${n.minDays}${n.maxDays ? " " + t("to") + " " + n.maxDays : "+"} ${t("days.")}`, null)
    : msg("warn", `${t("The notice period does not match the rules.")} ${n.givenDays} ${t("days given")}`, `${t("The rules ask for")} ${n.minDays}${n.maxDays ? " " + t("to") + " " + n.maxDays : "+"} ${t("days before the meeting.")}`, t("Go back to step 1 and move the meeting date if you need to. The check is recorded either way.")));
  out.push(card(h("h3", null, t("What happens next")), h("ul", null, [t("Members can see the notice and agenda on the event page."), t("The notice period is checked and the result is shown to everyone."), t("You can still add helpers and move the dates before the meeting starts."), t("On the day, go to Voting day.")].map((x) => h("li", null, x))), box, pub,
    ready ? null : h("div", { class: "why-off" }, t("Finish the items above first.")), ctx.priv.can?.publish_agenda ? null : h("div", { class: "why-off" }, t("Only the Organizer or Host can publish."))));
  if (published) out.push(card(h("h3", null, t("Share with members")), h("p", { class: "muted small" }, t("Members only need this link. It does not show any private details.")),
    h("input", { type: "text", readonly: "readonly", value: url, "data-test": "public-link", "aria-label": t("Public link"), onclick: (e) => e.target.select() }),
    h("div", { class: "row", style: "margin-top:8px" }, h("button", { class: "btn ghost", "data-test": "copy-link", onclick: () => copyText(url) }, t("Copy the link")), h("button", { class: "btn ghost", "data-test": "copy-share", onclick: () => copyText(share) }, t("Copy a message to send")),
      navigator.share ? h("button", { class: "btn ghost", onclick: () => navigator.share({ title: m.title, text: share, url }).catch(() => {}) }, t("Share")) : null),
    h("p", { class: "small", style: "background:var(--ivory);padding:10px;border-radius:8px", "data-test": "share-text" }, share)));
  out.push(h("div", null, h("button", { class: "btn big" + (published ? " gold" : " ghost"), "data-test": "step7-next", disabled: !published, onclick: next }, t("Go to voting day")), published ? null : h("div", { class: "why-off" }, t("Publish the notice first."))));
  return out;
}

// ================================================================ 8 Voting day
function step8({ ctx }) {
  const m = ctx.model, published = ["agenda_published", "live", "closed"].includes(m.status), flats = m.attendance?.total || 0;
  const paid = (m.payments || []).some((p) => p.state === "paid"), team = (m.people || []).length;
  const row = (k, v, ok) => [h("dt", null, k), h("dd", null, ok == null ? v : h("span", { class: "badge " + (ok ? "ok" : "warn") }, v))];
  return [
    wwh(t("You, the Organizer or Host"), t("Check the summary, then run the day"), t("Press the big button to open the voting-day screen"), t("On the day you check people in, open each point and close the meeting.")),
    card(h("h3", null, t("Your event at a glance")), h("dl", { class: "kv", "data-test": "day-summary" },
      row(t("Title"), m.title), row(t("Starts"), m.schedule?.start?.atMs ? fmtTime(m.schedule.start.atMs) : "-"), row(t("Place"), m.schedule?.start?.place || m.venue || "-"),
      row(t("Flats on the list"), `${flats} (${t("weight")} ${m.attendance?.totalWeight || 0})`, flats > 0), row(t("Agenda points"), String((m.points || []).length), (m.points || []).length > 0),
      row(t("People on the team"), String(team)), row(t("Paid"), paid ? t("Yes") : t("No"), paid), row(t("Notice published"), published ? t("Yes") : t("No"), published),
      row(t("Notice period"), m.notice ? (m.notice.met ? t("Fine") : t("Does not match the rules")) : "-", m.notice ? m.notice.met : null)), whyLine(t("Everything above must be ready before people arrive."))),
    h("div", null, h("button", { class: "btn gold big", "data-test": "go-day", disabled: !published, onclick: () => ctx.go("day") }, t("Open the voting day screen")), published ? null : h("div", { class: "why-off" }, t("Publish the notice first (step 7)."))),
  ];
}

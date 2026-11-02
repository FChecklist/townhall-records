// Desk > Setup > step 4 "Agenda & ballot": agenda points, secret or open ballot, election settings, ballot designer with live previews.
// Used by desk-setup.js: import { renderAgenda } from "./desk-ballot.js";
import { h, t, field, radios, checks, errorBox, msg, busy, toast } from "/assets/core.js";
import { removePointDialog } from "./desk-items.js";

const UI = new Map(); // per event: what the person is editing (kept while the tab re-draws after a save)
const ui = (eid) => { if (!UI.has(eid)) UI.set(eid, { editing: null, adding: false, preview: null }); return UI.get(eid); };
const KIND = { discussion: "Discussion (no vote)", resolution: "Resolution (yes / no)", election_post: "Election post (choose people)" };
const MAJ = [
  ["simple", "Simple majority", "More yes than no."],
  ["two_thirds", "Two-thirds majority", "At least two out of every three."],
  ["three_quarters", "Three-quarters majority", "At least three out of every four."],
];
const FORMATS = [
  ["single_post", "One post, one election", "Use this for President, then Secretary, and so on, each as its own point."],
  ["ranked_posts", "One election for all posts", "The highest vote gets the first post, the next the second, and so on. Name the posts below."],
  ["top_n", "Select the first N candidates", "For example the top 5 become committee members."],
];
const lines = (s) => String(s || "").split("\n").map((x) => x.trim()).filter(Boolean);

export async function renderAgenda(ctx, el, nav) {
  const u = ui(ctx.eid);
  const pts = ctx.model.points || [];
  const rules = ctx.priv?.rules || {};
  const forceSecret = !!rules.locked?.secret_ballot?.value;
  const ballotMode = rules.params?.["ballot.mode"] || "online";
  const cur = u.editing ? pts.find((p) => p.pointId === u.editing) : null;
  if (u.editing && !cur) u.editing = null;

  const list = pts.length
    ? h("div", { class: "tw" }, h("table", { class: "t", "data-test": "agenda-list" },
        h("thead", null, h("tr", null, ["No.", "Point", "Kind", "Ballot", ""].map((x) => h("th", null, t(x))))),
        h("tbody", null, pts.map((p) => h("tr", null,
          h("td", null, p.number),
          h("td", null, h("b", null, p.title), p.kind === "election_post" ? h("div", { class: "small muted" }, `${p.options.length} ${t("candidates")} · ${t("tick")} ${p.minChoices}-${p.maxChoices}`) : null),
          h("td", null, t(KIND[p.kind] || p.kind)),
          h("td", null, p.kind === "discussion" ? "-" : h("span", { class: "badge " + (p.secret ? "ok" : "warn") }, p.secret ? t("Secret ballot") : t("Open vote"))),
          h("td", null, h("div", { class: "row" },
            h("button", { class: "btn ghost", style: "min-height:38px", "data-test": "point-edit-" + p.number, onclick: () => { u.editing = p.pointId; u.adding = false; u.preview = null; redo(); } }, p.state === "pending" ? t("Edit") : t("View")),
            // a point can leave the agenda only while its voting has not opened (the server refuses it after that, with a plain reason)
            p.state === "pending" ? h("button", { class: "btn ghost", style: "min-height:38px", "data-test": "point-remove-" + p.number, onclick: () => removePointDialog(ctx, p) }, t("Remove")) : null)))))))
    : h("p", { class: "muted" }, t("No points yet. Add the first one below."));

  const redo = () => ctx.refresh();
  const showForm = u.adding || cur;
  const addBtn = h("button", { class: "btn ghost", "data-test": "point-add", onclick: () => { u.adding = true; u.editing = null; u.preview = null; redo(); } }, t("+ Add a point"));

  const parts = [h("div", { class: "card" }, h("h3", null, t("Your agenda")), list, showForm ? null : addBtn)];
  if (showForm) parts.push(pointForm(ctx, u, cur, { forceSecret, redo, ballotMode }));
  if (cur && cur.kind !== "discussion") parts.push(designer(ctx, u, cur, { ballotMode, redo }));

  const enough = pts.length > 0;
  const next = h("button", { class: "btn gold big", disabled: !enough, "data-test": "agenda-next", onclick: nav.next }, t("The agenda is ready: next, helpers"));
  parts.push(h("div", null, next, enough ? null : h("div", { class: "why-off" }, t("Add at least one point first."))));
  el.replaceChildren(...parts);
}

function pointForm(ctx, u, cur, o) {
  const frozen = cur && cur.state !== "pending";
  const box = h("div");
  const kindR = radios("kind", Object.entries(KIND).map(([v, l]) => ({ value: v, label: t(l), disabled: !!cur && v !== cur.kind })), cur?.kind || "resolution", () => sync());
  const title = h("input", { type: "text", value: cur?.title || "", maxlength: "200", "data-test": "point-title", "aria-label": t("Title of the point") });
  const body = h("textarea", { rows: "3", maxlength: "4000", "data-test": "point-body", "aria-label": t("Details") }, cur?.body || "");
  const secretDefault = cur ? (cur.secret ? "secret" : "open") : (o.forceSecret || ctx.priv?.rules?.options?.secret_ballot ? "secret" : "open");
  const secretR = radios("secret", [
    { value: "secret", label: t("Secret ballot"), desc: t("Nobody can see how a flat voted. Only the totals are published. Printed ballots need this.") },
    { value: "open", label: t("Open vote"), desc: t("The record shows how each flat voted. Use it only if your bye-laws say so."), disabled: o.forceSecret, reason: o.forceSecret ? t("The law pack for your place fixes this as a secret ballot.") : null },
  ], o.forceSecret ? "secret" : secretDefault);
  // resolution
  const abstain = checks("abstain", [{ value: "abstain", label: t("Allow \"Abstain\""), desc: t("Members may choose Yes, No or Abstain.") }], (cur ? cur.options.includes("abstain") : true) ? ["abstain"] : []);
  const majR = radios("maj", MAJ.map(([v, l, d]) => ({ value: v, label: t(l), desc: t(d) })), cur?.majorityClass && MAJ.some((m) => m[0] === cur.majorityClass) ? cur.majorityClass : "simple");
  // election
  const cands = h("textarea", { rows: "5", "data-test": "point-candidates", "aria-label": t("Candidates, one per line") }, cur && cur.kind === "election_post" ? cur.options.map((id) => cur.labels[id]).join("\n") : "");
  const maxIn = h("input", { type: "number", min: "1", max: "50", value: cur?.maxChoices ?? 1, "data-test": "point-max" });
  const minIn = h("input", { type: "number", min: "0", max: "50", value: cur?.minChoices ?? 1, "data-test": "point-min" });
  const fmtR = radios("format", FORMATS.map(([v, l, d]) => ({ value: v, label: t(l), desc: t(d) })), cur?.format || "single_post", () => sync());
  const seats = h("textarea", { rows: "3", "data-test": "point-seats", "aria-label": t("Post names, one per line") }, (cur?.seats || []).join("\n"));
  const topN = h("input", { type: "number", min: "1", max: "50", value: cur?.topN ?? 3, "data-test": "point-topn" });
  const secRes = h("div", null, field(t("How many votes are needed to pass?"), majR), abstain);
  const secEl = h("div", null,
    field(t("Candidates"), cands, t("One name per line, at least two. Do not type phone numbers or e-mail addresses.")),
    h("div", { class: "grid g2" }, field(t("Most a voter may tick"), maxIn), field(t("Fewest a voter must tick (0 allows a blank ballot)"), minIn)),
    field(t("What kind of election is this?"), fmtR),
    h("div", { class: "seats" }, field(t("Names of the posts, one per line"), seats, t("Needed for \"One election for all posts\". Not more posts than candidates."))),
    h("div", { class: "topn" }, field(t("How many will be selected?"), topN)));
  const secVote = h("div", null, field(t("Open vote or secret ballot?"), secretR));
  function sync() {
    const k = kindR.value();
    secRes.classList.toggle("hidden", k !== "resolution"); secEl.classList.toggle("hidden", k !== "election_post"); secVote.classList.toggle("hidden", k === "discussion");
    const f = fmtR.value(); secEl.querySelector(".seats").classList.toggle("hidden", f !== "ranked_posts"); secEl.querySelector(".topn").classList.toggle("hidden", f !== "top_n");
  }
  const save = h("button", { class: "btn gold big", "data-test": "point-save", disabled: !!frozen, onclick: async () => {
    box.replaceChildren();
    const kind = kindR.value(); const b = { kind, title: title.value.trim(), body: body.value.trim() };
    if (b.title.length < 2) { box.replaceChildren(msg("bad", t("The point needs a title."), null, t("Type a short title, at least 2 letters."))); title.classList.add("err"); title.focus(); return; }
    if (kind !== "discussion") b.secret = secretR.value() === "secret";
    if (kind === "resolution") { b.abstain = abstain.values().includes("abstain"); b.majorityClass = majR.value(); }
    if (kind === "election_post") {
      const names = lines(cands.value); if (names.length < 2) { box.replaceChildren(msg("bad", t("An election needs at least two candidates."), null, t("Type one name on each line."))); cands.classList.add("err"); return; }
      const byLabel = new Map(); if (cur) for (const id of cur.options) byLabel.set(String(cur.labels[id]).toLowerCase(), id); // keep ids of people already listed
      b.candidates = names.map((n) => byLabel.has(n.toLowerCase()) ? { id: byLabel.get(n.toLowerCase()), label: n } : n);
      b.maxChoices = +maxIn.value || 1; b.minChoices = +minIn.value || 0; b.format = fmtR.value();
      if (b.format === "ranked_posts") b.seats = lines(seats.value); if (b.format === "top_n") b.topN = +topN.value || 1;
    }
    try {
      await busy(save, async () => { if (cur) await ctx.call.put("/points/" + cur.pointId, b); else { const r = await ctx.call.post("/points", b); u.editing = r.pointId; u.adding = false; } });
      toast(t("Saved.")); await ctx.refresh();
    } catch (e) { box.replaceChildren(errorBox(e)); }
  } }, cur ? t("Save this point") : t("Add this point"));
  const cancel = h("button", { class: "btn ghost", "data-test": "point-close", onclick: () => { u.adding = false; u.editing = null; u.preview = null; o.redo(); } }, t("Close"));
  const card = h("div", { class: "card", "data-test": "point-form" },
    h("h3", null, cur ? t("Edit point ") + cur.number : t("Add a point")),
    frozen ? msg("warn", t("Voting has opened on this point, so it can no longer be changed."), null, t("You can still read it here.")) : null,
    field(t("What kind of point is this?"), kindR), field(t("Title"), title), field(t("Details (optional)"), body, t("Shown to members with the notice. Do not type e-mail addresses or phone numbers.")),
    secVote, secRes, secEl, box, h("div", { class: "row", style: "margin-top:16px" }, save, cancel));
  sync();
  return card;
}

function designer(ctx, u, cur, o) {
  const d = cur.design || {};
  const frozen = cur.state !== "pending";
  const box = h("div");
  const layoutR = radios("layout", [["list", "List", "One option under another."], ["cards", "Cards", "Each option in its own box."], ["grid", "Grid", "Options side by side on a wide screen."]].map(([v, l, x]) => ({ value: v, label: t(l), desc: t(x) })), d.layout || "list", () => live());
  const colsR = radios("columns", [{ value: "1", label: t("1 column") }, { value: "2", label: t("2 columns (wide screens only)") }], String(d.columns || 1), () => live());
  const orderR = radios("order", [{ value: "listed", label: t("As typed"), desc: t("Every voter sees the same order.") }, { value: "shuffled", label: t("Shuffled for each voter"), desc: t("Fair to candidates at the bottom of a list.") }], d.order || "listed", () => live());
  const accent = h("input", { type: "color", value: d.accent || "#1c2b3a", "data-test": "design-accent", "aria-label": t("Accent colour"), style: "width:80px;padding:2px", oninput: () => live() });
  const dTitle = h("input", { type: "text", value: d.title || "", maxlength: "200", placeholder: cur.title, "data-test": "design-title", "aria-label": t("Heading on the ballot"), oninput: () => live() });
  const dInstr = h("input", { type: "text", value: d.instruction || "", maxlength: "200", "data-test": "design-instruction", "aria-label": t("Extra line for voters"), oninput: () => live() });
  const nums = checks("nums", [{ value: "n", label: t("Number the options 1, 2, 3 ...") }], d.showNumbers === false ? [] : ["n"], () => live());
  const sizeR = radios("size", [{ value: "large", label: t("Large tick boxes (easier on a phone)") }, { value: "normal", label: t("Normal tick boxes") }], d.size || "large", () => live());
  const phone = h("div", { "data-test": "phone-preview", style: "width:min(100%,340px);border:6px solid var(--deep);border-radius:26px;padding:14px;background:#fff;margin:0 auto" });
  const paper = h("div", { "data-test": "paper-preview", class: "center" });

  const values = () => ({ layout: layoutR.value(), columns: +colsR.value(), order: orderR.value(), accent: accent.value, title: dTitle.value.trim(), instruction: dInstr.value.trim(), showNumbers: nums.values().includes("n"), size: sizeR.value() });
  function live() {
    const v = values(); const big = v.size === "large";
    phone.replaceChildren(
      h("div", { style: `font:700 17px var(--sans);color:${v.accent};margin-bottom:6px` }, v.title || cur.title),
      h("div", { class: "small muted", style: "margin-bottom:8px" }, v.instruction || cur.instruction || ""),
      ...cur.options.map((id, i) => h("label", { class: "choice", style: `border-left:6px solid ${v.accent};min-height:${big ? 60 : 46}px;margin:6px 0` }, h("input", { type: "checkbox", disabled: true, style: big ? "" : "width:18px;height:18px" }), h("div", null, h("b", null, (v.showNumbers ? (i + 1) + ". " : "") + (cur.labels[id] || id))))),
      v.order === "shuffled" ? h("div", { class: "tiny muted" }, t("The order is different for each voter.")) : null,
      h("div", { class: "tiny muted", style: "margin-top:8px" }, t("A phone always shows one column.")));
  }
  function showPaper() {
    if (u.preview && u.preview.pid === cur.pointId) paper.replaceChildren(h("img", { src: "data:image/svg+xml;charset=utf-8," + encodeURIComponent(u.preview.svg), alt: t("Preview of the printed ballot paper"), style: "width:min(100%,320px);border:1px solid var(--line);background:#fff" }), h("div", { class: "tiny muted" }, t("This is a sample. The squares in the corners and the code are added when the ballot is printed.")));
    else paper.replaceChildren(h("p", { class: "muted small" }, t("Press the button to see the printed ballot.")));
  }
  const save = h("button", { class: "btn gold big", "data-test": "design-save", disabled: frozen, onclick: async () => {
    box.replaceChildren();
    try {
      await busy(save, async () => {
        await ctx.call.put("/points/" + cur.pointId, { design: values() });
        const pv = await ctx.call.get("/points/" + cur.pointId + "/paper/preview"); u.preview = { pid: cur.pointId, svg: pv.svg };
      });
      toast(t("Design saved.")); await ctx.refresh();
    } catch (e) { box.replaceChildren(errorBox(e)); }
  } }, t("Save the design and show the paper"));
  live(); showPaper();
  return h("div", { class: "card", "data-test": "ballot-designer" },
    h("h3", null, t("Ballot design for point ") + cur.number),
    h("p", { class: "muted" }, t("This is what members see on their phone and on printed paper. Every option is a tick box: ticked means yes, not ticked means no.")),
    frozen ? msg("warn", t("Voting has opened, so the design is fixed."), null, null) : null,
    o.ballotMode !== "online" && !cur.secret ? msg("warn", t("Printed ballots need a secret ballot."), null, t("Choose \"Secret ballot\" above, or the notice cannot be published.")) : null,
    h("div", { class: "grid g2" },
      h("div", null, field(t("Layout"), layoutR), field(t("Columns"), colsR), field(t("Order"), orderR), field(t("Accent colour"), accent), field(t("Heading (leave empty to use the title)"), dTitle), field(t("Extra line for voters (optional)"), dInstr), nums, field(t("Tick box size"), sizeR)),
      h("div", null, h("h4", { style: "margin:0 0 8px" }, t("On a phone")), phone, h("h4", { style: "margin:18px 0 8px" }, t("On paper")), paper)),
    box, h("div", { style: "margin-top:16px" }, save));
}

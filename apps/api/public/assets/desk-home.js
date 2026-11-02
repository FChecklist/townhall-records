// Team Desk tab "Home", and the greyed-out panel. Home is the one page every role lands on: a tile for each part of the desk.
// The tiles this person may work on are bright; the rest are grey and say whose they are. Who may do what comes from desk-rights.js (one table).
// Contract: export async function render(ctx, el). renderLocked(ctx, el, name) draws the look-only panel for a section the role does not cover; desk.js picks it.
// Nothing private is loaded or drawn here: the grey panels show only the names of the steps, never any data, so an Attendance Monitor sees no private detail by looking at Setup.
import { h, t, mount, wwh } from "/assets/core.js";
import { ORDER, SECTIONS, ROLE_WORD, rightsOf } from "/assets/desk-rights.js";

const num = (x) => (typeof x === "number" && isFinite(x) ? x : 0);
const mineOf = (ctx) => (ctx.roles || []).map((r) => t(ROLE_WORD[r] || r)).join(" + ");
const parts = ORDER.filter((k) => k !== "home");

/** One plain, live line for a section the person may work on. Reads only public figures (status, progress, attendance, the team list). */
function lineFor(name, ctx) {
  const m = ctx.model || {}, a = m.attendance || {}, pr = ctx.progress || {}, v = pr.voting || {}, st = m.status;
  if (name === "setup") { const ask = (m.changeRequests || []).length; return (st === "setup" ? `${num(pr.percent)}% ${t("of the setup is done")}` : t("The notice is published.")) + (ask ? `. ${ask} ${ask === 1 ? t("name correction was asked for") : t("name corrections were asked for")}` : ""); }
  if (name === "day") {
    if (st === "setup") return t("Not started. Publish the notice first.");
    if (st === "live") return `${num(v.pointsClosed)} ${t("of")} ${num(v.pointsTotal)} ${t("questions closed")}`;
    if (st === "closed") return t("The meeting is finished.");
    return t("The notice is out. Start the meeting when it is time.");
  }
  if (name === "team") { const n = (m.people || []).length; return `${n} ${n === 1 ? t("person") : t("people")} ${t("on the team")}`; }
  if (name === "checkin") return `${num(a.present)} ${t("of")} ${num(a.total)} ${t("flats checked in")}` + ((ctx.roles || []).includes("attendance_officer") ? "" : ". " + t("No Attendance Monitor is appointed, so you check people in."));
  if (name === "end") return st === "closed" ? t("The meeting is finished.") : st === "live" ? t("You can end or postpone from here.") : t("Postpone or cancel from here if plans change.");
  return t("Every action is written here with its time.");
}

function tile(ctx, k, r) {
  const S = SECTIONS[k];
  if (r.ok) {
    return h("div", { class: "tile on", "data-test": "tile-" + k },
      h("div", { class: "eyebrow" }, t(S.who)), h("h3", null, t(S.label)), h("p", { class: "line", "data-test": "line-" + k }, lineFor(k, ctx)), h("p", { class: "muted small" }, t(S.what)),
      h("button", { class: "btn gold", "data-test": "open-" + k, onclick: () => ctx.go(k) }, t(S.open)));
  }
  return h("div", { class: "tile off", "aria-disabled": "true", "data-test": "tile-" + k },
    h("div", { class: "eyebrow" }, "🔒 " + t(S.who)), h("h3", null, t(S.label)), h("p", { class: "small" }, t(S.what)), h("p", { class: "why-off", "data-test": "why-" + k }, t(r.why)),
    h("button", { class: "btn ghost", "data-test": "peek-" + k, onclick: () => ctx.go(k) }, t("See what is inside")));
}

export async function render(ctx, el) {
  const R = rightsOf(ctx.roles, ctx.model), mine = mineOf(ctx);
  const open = parts.filter((k) => R[k].ok), shut = parts.filter((k) => !R[k].ok);
  const chips = ["organizer", "host", "attendance_officer"].map((r) => { const on = (ctx.roles || []).includes(r); return h("span", { class: "badge" + (on ? " gold" : ""), "data-test": "role-chip-" + r }, (on ? "✓ " : "") + t(ROLE_WORD[r])); });
  const sum = t("You can work on: ") + open.map((k) => t(SECTIONS[k].label)).join(", ") + "." + (shut.length ? " " + t("Greyed out for your role: ") + shut.map((k) => t(SECTIONS[k].label)).join(", ") + "." : "");
  mount(el,
    wwh(mine, t("See your whole desk on one page."), t("Open a bright tile to work. A grey tile belongs to another role."), t("Everyone works only on their own part, so nothing is changed by mistake.")),
    h("div", { class: "card tint", "data-test": "home-roles" },
      h("div", { class: "row" }, h("div", { class: "sp" }, h("div", { class: "eyebrow" }, t("You are signed in as")), h("h2", { style: "margin:2px 0 0", "data-test": "home-me" }, mine)), h("div", { class: "row" }, chips)),
      h("p", { class: "muted small", style: "margin:10px 0 0", "data-test": "home-summary" }, sum)),
    h("div", { class: "tiles", "data-test": "home-tiles" }, parts.map((k) => tile(ctx, k, R[k]))));
}

export async function renderLocked(ctx, el, name) {
  const key = SECTIONS[name] ? name : "home", S = SECTIONS[key], R = rightsOf(ctx.roles, ctx.model);
  const usable = ORDER.filter((k) => R[k].ok && k !== key);
  mount(el,
    wwh(t(S.who), t("This part is greyed out for you."), t("Look, but do not change. Ask the person named under Who."), t("Each part has one owner, so nothing is changed by mistake.")),
    h("div", { class: "card locked", "aria-disabled": "true", "data-test": "locked-panel" },
      h("div", { class: "row" }, h("div", { class: "sp" }, h("div", { class: "eyebrow" }, "🔒 " + t("Greyed out for your role")), h("h2", { style: "margin:2px 0 0" }, t(S.label))), h("span", { class: "badge warn", "data-test": "locked-who" }, t(S.who))),
      h("p", { style: "margin-top:10px", "data-test": "locked-why" }, t((R[key] && R[key].why) || "")), h("p", { class: "muted" }, t(S.what)),
      h("ul", { class: "ghostlist", "data-test": "locked-items" }, S.items.map((x) => h("li", null, t(x))))),
    h("div", { class: "card" }, h("h3", null, t("What you can do instead")),
      h("div", { class: "row" }, usable.map((k) => h("button", { class: "btn" + (k === "home" ? " gold" : " ghost"), "data-test": "instead-" + k, onclick: () => ctx.go(k) }, t(SECTIONS[k].open))))));
}

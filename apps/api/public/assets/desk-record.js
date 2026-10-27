// Team Desk tab "Record": the unchangeable record, in plain words. Time-line by day, who did what, what was refused, and (Organizer and Host only) the audit trail.
// Module contract: export async function render(ctx, el). Monitors see everything except the audit trail.
import { h, mount, t, msg, errorBox, field, wwh, busy, loading, fmtTime } from "/assets/core.js";

let SUB = "timeline";
const SECTIONS = [["timeline", "Time-line"], ["who", "Who did what"], ["refused", "Refused"], ["audit", "Audit trail"]];
const REFUSAL = /refus|reject|not allowed|denied|locked out|too many|stopped for safety|invalid/i;

/** Plain words for the requests in the audit trail. First match wins. */
const ROUTES = [[/^POST \/api\/vote\/cast/, "Cast a vote"], [/^POST \/api\/vote\/prepare/, "Checked a ballot before voting"], [/^POST \/api\/vote\/login/, "Voter signed in with a code"], [/^GET \/api\/vote\//, "Voter opened the ballot"], [/^(GET|POST) \/api\/h\//, "Voter used a check-in link"],
  [/handshakes.*confirm/, "Officer typed the voter's number"], [/handshakes/, "Started a check-in"], [/attendance\/photo/, "Saved an attendance photo"], [/attendance/, "Marked a flat present"], [/^POST \/api\/auth\/verify/, "Signed in with a code"], [/^POST \/api\/auth\/(request|lookup)/, "Asked for a sign-in code"],
  [/\/intent/, "Asked to end or move the event"], [/\/confirm$/, "Confirmed ending or moving the event"], [/points\/[^/]+\/open/, "Opened a question for voting"], [/points\/[^/]+\/close/, "Closed a question"], [/points\/[^/]+\/extend/, "Extended voting time"], [/\/points/, "Changed the agenda"], [/\/start$/, "Started the meeting"], [/\/close$/, "Closed the event"],
  [/agenda\/publish/, "Published the notice"], [/\/roll/, "Changed the flat list"], [/\/people/, "Changed the team"], [/\/rules/, "Changed a rule"], [/\/options/, "Changed an option"], [/\/audit$/, "Opened the audit trail"], [/\/contacts/, "Opened private contact details"], [/\/privacy\/erase|crypto-shred/, "Erased private details"], [/\/privacy/, "Privacy request"], [/\/pay/, "Payment"], [/^GET \/api\/events\/[0-9a-f]{32}$/, "Opened the event"]];
const routeWords = (method, route) => { const k = method + " " + route; for (const [re, w] of ROUTES) if (re.test(k)) return t(w); return method + " " + String(route).replace(/[0-9a-f]{32}/g, "…").replace(/(p|pt|pay|hs|in)_[0-9a-f]{6,}/g, "…"); };
const resultWords = (s) => s < 300 ? ["Done", "ok"] : s === 401 ? ["Not signed in", "warn"] : s === 403 ? ["Refused", "bad"] : s === 404 ? ["Not found", "warn"] : s === 409 ? ["Clashed with an earlier action", "warn"] : s === 423 ? ["Locked", "bad"] : s === 429 ? ["Too many tries", "bad"] : ["Error " + s, "bad"];
const ACTORS = { staff: "Team member", voter: "Voter", public: "Anyone", super: "Platform owner", system: "System" };

export async function render(ctx, el) {
  const m = ctx.model || {}; const tz = m.timezone || "Asia/Kolkata"; const priv = !!ctx.priv;
  const parts = (ms, o) => new Intl.DateTimeFormat(undefined, { timeZone: tz, ...o }).format(new Date(ms));
  const dayOf = (ms) => parts(ms, { weekday: "long", day: "numeric", month: "long", year: "numeric" }), timeOf = (ms) => parts(ms, { hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  const iso = (ms) => new Date(ms).toISOString().replace(".000Z", "Z");
  const body = h("div");
  const tabs = h("div", { class: "tabs", role: "tablist" }, SECTIONS.map(([id, label]) => h("button", { role: "tab", "data-id": id, "data-test": "rec-tab-" + id, class: SUB === id ? "on" : "", "aria-selected": String(SUB === id), onclick: () => { SUB = id; for (const b of tabs.children) b.classList.toggle("on", b.getAttribute("data-id") === id); draw(); } }, t(label))));
  mount(el, wwh(t("Anyone on the team"), t("Read what happened, in order, and who did it"), t("Pick a tab. Type in the search box to find a word or a name"), t("Every action is written once and cannot be changed, so the record can be trusted")),
    h("div", { class: "msg info", "data-test": "record-line" }, h("div", null, h("span", { class: "ti" }, t("Nobody, including us, can edit or delete this record.")), t("Each line carries a short fingerprint. Anyone can check the whole record on the Verify page."), " ", h("a", { href: "/verify/" }, t("Open the Verify page")))), tabs, body);
  draw();
  function draw() { ({ timeline, who, refused, audit })[SUB](); }
  const search = (onin, ph) => h("input", { type: "search", "data-test": "rec-search", placeholder: ph, "aria-label": ph, oninput: (e) => onin(e.target.value.trim().toLowerCase()), style: "margin-bottom:12px" });
  const more = (shown, total, fn) => shown < total ? h("button", { class: "btn ghost", "data-test": "rec-more", onclick: fn }, t("Show more") + " (" + (total - shown) + ")") : null;
  const timeSpan = (ms) => h("span", { class: "mono", title: "UTC " + iso(ms) }, timeOf(ms));

  // ---------------------------------------------------------------- time-line, grouped by day
  function timeline() {
    const all = m.chronology || []; let q = "", limit = 150, newest = false; const out = h("div");
    const paint = () => {
      let rows = all.filter((x) => !q || (x.who + " " + x.what + " " + x.hash + " #" + x.seq).toLowerCase().includes(q)); if (newest) rows = [...rows].reverse();
      const shown = rows.slice(0, limit); const kids = []; let day = null, box = null;
      for (const x of shown) {
        const d = dayOf(x.ts); if (d !== day) { day = d; kids.push(h("h3", { style: "margin:18px 0 8px" }, d)); box = h("div", { class: "timeline" }); kids.push(box); }
        box.append(h("div", { class: "e", "data-test": "tl-entry" }, h("div", null, timeSpan(x.ts), h("span", { class: "muted small" }, " · " + t("entry") + " #" + x.seq + " · "), h("span", { class: "mono tiny muted", title: x.hash }, String(x.hash).slice(0, 8))), h("div", null, h("b", null, x.who), " ", x.what)));
      }
      mount(out, h("p", { class: "muted small", "data-test": "tl-count" }, rows.length + " " + t("lines") + " · " + t("times are in ") + tz + t("; hover a time to see UTC")), ...kids, rows.length ? null : h("p", { class: "muted" }, t("Nothing matches.")), more(shown.length, rows.length, () => { limit += 150; paint(); }));
    };
    mount(body, h("div", { class: "card" }, h("h2", null, t("What happened, in order")), search((v) => { q = v; limit = 150; paint(); }, t("Search the time-line")),
      h("button", { class: "btn ghost", style: "margin-bottom:10px", "data-test": "tl-order", onclick: (e) => { newest = !newest; e.currentTarget.textContent = newest ? t("Show oldest first") : t("Show newest first"); paint(); } }, t("Show newest first")), out));
    paint();
  }

  // ---------------------------------------------------------------- who did what
  function who() {
    const all = m.accountability || []; let q = "", limit = 100; const out = h("div");
    const paint = () => {
      const rows = all.filter((x) => !q || (x.who + " " + x.role + " " + x.what).toLowerCase().includes(q)); const shown = rows.slice(0, limit);
      mount(out, rows.length ? h("div", { class: "tw" }, h("table", { class: "t", "data-test": "who-table" }, h("thead", null, h("tr", null, [t("When"), t("Who"), t("Role"), t("What they did"), t("Entry")].map((x) => h("th", null, x)))),
        h("tbody", null, shown.map((x) => h("tr", null, h("td", null, h("div", null, dayOf(x.ts)), timeSpan(x.ts)), h("td", null, h("b", null, x.who), x.email ? h("div", { class: "muted tiny" }, x.email) : null), h("td", null, t(x.role || "")), h("td", null, x.what), h("td", { class: "mono" }, "#" + x.seq)))))) : h("p", { class: "muted" }, all.length ? t("Nothing matches.") : t("Nobody has acted yet.")), more(shown.length, rows.length, () => { limit += 100; paint(); }));
    };
    mount(body, h("div", { class: "card" }, h("h2", null, t("Who did what")), h("p", { class: "muted" }, t("Every action by a named person. Names and e-mails are partly hidden, the same way as on the public page.")), search((v) => { q = v; limit = 100; paint(); }, t("Search by name, role or action")), out));
    paint();
  }

  // ---------------------------------------------------------------- refused actions
  function refused() {
    const rej = m.rejected || []; const logRef = (m.chronology || []).filter((x) => REFUSAL.test(x.what));
    mount(body, h("div", { class: "card" }, h("h2", null, t("Refused")), h("p", { class: "muted" }, t("Things the system would not allow, and why. A refusal is also part of the record.")),
      h("h3", null, t("Rule changes that were refused")), rej.length ? h("div", { class: "tw" }, h("table", { class: "t", "data-test": "rej-table" }, h("thead", null, h("tr", null, [t("Entry"), t("Rule"), t("Where"), t("Why it was refused")].map((x) => h("th", null, x)))),
        h("tbody", null, rej.map((x) => h("tr", null, h("td", { class: "mono" }, "#" + x.seq), h("td", null, x.param), h("td", null, x.scope), h("td", null, x.reason)))))) : h("p", { class: "muted" }, t("No rule change was refused.")),
      h("h3", { style: "margin-top:20px" }, t("Other refusals in the time-line")), logRef.length ? h("div", { class: "timeline" }, logRef.map((x) => h("div", { class: "e" }, h("div", null, dayOf(x.ts) + " ", timeSpan(x.ts), h("span", { class: "muted small" }, " · #" + x.seq)), h("div", null, h("b", null, x.who), " ", x.what)))) : h("p", { class: "muted" }, t("Nothing else was refused."))));
  }

  // ---------------------------------------------------------------- audit trail (Organizer and Host)
  function audit() {
    if (!priv) { mount(body, msg("info", t("The audit trail is for the Organizer and Host."), t("It lists who looked at or changed what, from which device. Monitors can read the rest of the record."), null)); return; }
    const out = h("div"); const go = h("button", { class: "btn", "data-test": "audit-load", onclick: load }, t("Show the audit trail"));
    mount(body, h("div", { class: "card" }, h("h2", null, t("Audit trail")), h("p", { class: "muted" }, t("Every request made to this event: who, what, the result, and the network and device it came from. Network addresses and device codes are shortened here. The full values are released only on a lawful request.")), go, out));
    async function load() {
      await busy(go, async () => {
        mount(out, loading());
        try {
          const r = await ctx.call.get("/audit"); const all = r.rows || []; let q = "", limit = 50;
          const tbl = h("div"); const paint = () => {
            const rows = all.filter((x) => !q || (routeWords(x.method, x.route) + " " + x.actor + " " + (x.ref || "") + " " + (x.ip || "") + " " + (x.device || "")).toLowerCase().includes(q)); const shown = rows.slice(0, limit);
            mount(tbl, h("p", { class: "muted small" }, rows.length + " " + t("lines, newest first") + " · " + t("times are in ") + tz), rows.length ? h("div", { class: "tw" }, h("table", { class: "t", "data-test": "audit-table" },
              h("thead", null, h("tr", null, [t("When"), t("Who"), t("What they did"), t("Result"), t("Network address"), t("Device"), t("Browser"), t("Entry")].map((x) => h("th", null, x)))),
              h("tbody", null, shown.map((x) => { const [rw, kind] = resultWords(x.status); return h("tr", null, h("td", null, h("div", null, dayOf(x.at)), timeSpan(x.at)), h("td", null, t(ACTORS[x.actor] || x.actor || ""), x.ref ? h("div", { class: "mono tiny muted" }, String(x.ref).length > 12 ? String(x.ref).slice(0, 10) + "…" : x.ref) : null), h("td", null, routeWords(x.method, x.route)),
                h("td", null, h("span", { class: "badge " + kind }, t(rw))), h("td", { class: "mono" }, x.erased ? t("erased") : x.ip || x.ipFingerprint), h("td", { class: "mono" }, x.erased ? t("erased") : x.device || x.deviceFingerprint), h("td", null, x.userAgent || ""), h("td", { class: "mono" }, x.logSeq ? "#" + x.logSeq : "")); })))) : h("p", { class: "muted" }, t("Nothing matches.")),
              more(shown.length, rows.length, () => { limit += 50; paint(); }));
          };
          mount(out, r.note ? h("p", { class: "muted small" }, t(r.note)) : null, search((v) => { q = v; limit = 50; paint(); }, t("Search the audit trail")), tbl); paint();
        } catch (e) { mount(out, errorBox(e, load)); }
      });
    }
  }
}

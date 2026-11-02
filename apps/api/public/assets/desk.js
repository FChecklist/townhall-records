// /desk/ : the Team Desk shell. Signs the person in (one-tap link, 6-digit code, or lost-link lookup), loads the event and shows a role-aware tab bar.
// Each tab is a separate module: desk-<name>.js exporting render(ctx, el) (the team tab: renderTeam). See docs/UI-BUILD-BRIEF.md "Desk module contract".
import { h, $, frame, app, mount, t, get, post, put, store, field, wwh, stageBar, errorBox, msg, busy, loading, shortCode, turnstileToken, TownError } from "/assets/core.js";
import { ORDER, ROLE_WORD, rightsOf, landingTab } from "/assets/desk-rights.js"; // who may work on which section: the one table (also used by desk-home.js)
await frame({ active: "/desk/" });

const root = app();
const STAFF = ["organizer", "host"];
const STATUS_WORD = { setup: "Setting up", agenda_published: "Notice published", live: "Live now", postponed: "Postponed", closed: "Finished" };
const TABS = { home: ["Home", "desk-home.js", "render"], setup: ["Setup", "desk-setup.js", "render"], day: ["Voting day", "desk-day.js", "render"], team: ["Team", "desk-team.js", "renderTeam"], checkin: ["Check-in", "desk-checkin.js", "render"], end: ["End or move", "desk-end.js", "render"], record: ["Record", "desk-record.js", "render"] };

let SES = store.get("desk"); // {eid, pid, token, roles}  (this tab only; gone when the tab closes)
let ctx = null, curTab = null, drawSeq = 0, termsInfo = null, oneTap = null; // oneTap = {e,p,c}: the code from the link lives only in memory
let shell = null;

// ---------------------------------------------------------------- read the one-tap link, then take it out of the address bar
(function readFragment() {
  if (!location.hash) return;
  const q = new URLSearchParams(location.hash.slice(1)); const e = q.get("e") || "", p = q.get("p") || "", c = q.get("c") || "";
  try { history.replaceState(null, "", location.pathname + location.search); } catch { /* old browser */ }
  if (/^[0-9a-f]{32}$/.test(e) && /^p_[0-9a-f]{8,40}$/.test(p)) {
    store.set("desk_pending", { e, p });
    if (/^\d{6}$/.test(c)) oneTap = { e, p, c };
  }
})();

const eventKey = (x) => String(x || "").replace(/-/g, "").toLowerCase();
const parseEid = (s) => { const m = /[0-9a-f]{32}/.exec(eventKey(s)); return m ? m[0] : null; };
const note = (kind, a, b, c) => msg(kind, a, b, c);
const recents = () => { const l = store.pref("events"); return Array.isArray(l) ? l.filter((x) => x && /^[0-9a-f]{32}$/.test(x.e)) : []; };
function rememberEvent(e, p, title) {
  const l = recents().filter((x) => x.e !== e); l.unshift({ e, p: p || "", t: title || "", ms: Date.now() }); store.pref("events", l.slice(0, 8));
}
const page = (...kids) => mount(root, h("div", { class: "narrow", style: "margin:0 auto" }, ...kids));
async function getTerms() { if (!termsInfo) termsInfo = await get("/api/terms"); return termsInfo; }

// ---------------------------------------------------------------- sign-in screens
function viewLanding(notice) {
  shell = null;
  const list = recents();
  const eventIn = h("input", { type: "text", autocomplete: "off", placeholder: t("Paste your event code or link"), "data-test": "lost-event", "aria-label": t("Event code") });
  const emailIn = h("input", { type: "email", autocomplete: "email", placeholder: "name@example.com", "data-test": "lost-email", "aria-label": t("Your e-mail") });
  const out = h("div", { "data-test": "lost-result" });
  const send = h("button", { class: "btn big", "data-test": "lost-send", onclick: (e) => {
    out.replaceChildren(); for (const i of [eventIn, emailIn]) i.classList.remove("err");
    const id = parseEid(eventIn.value); const em = emailIn.value.trim(); let bad = false;
    if (!id) { eventIn.classList.add("err"); out.append(note("bad", t("That does not look like an event code."), t("It is 32 letters and digits, or a link that contains them."))); bad = true; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em)) { emailIn.classList.add("err"); out.append(note("bad", t("Please type your e-mail correctly."), t("Use the e-mail you were added with."))); bad = true; }
    if (bad) return;
    busy(e.currentTarget, async () => {
      try {
        const ts = await turnstileToken(); await post("/api/auth/lookup", { eventId: id, email: em, turnstile: ts });
        out.replaceChildren(note("ok", t("Done. If those details match, an e-mail is on its way."), t("It has a 6-digit code and a one-tap link. Open the e-mail on this device and tap the link."), t("Nothing arrived in two minutes? Look in Spam, or check the spelling of the e-mail.")));
      } catch (er) { out.replaceChildren(errorBox(er)); }
    });
  } }, t("E-mail me a new link"));
  page(
    wwh(t("Organizer, Host or Attendance Monitor"), t("Sign in to your Team Desk."), t("Open the link in your e-mail, or type the 6-digit code we sent."), t("Only the team can change a meeting. Signing in keeps it safe.")),
    notice ? note("warn", notice, null, null) : null,
    list.length ? h("div", { class: "card", "data-test": "recent" }, h("h2", null, t("Your events")), h("p", { class: "muted small" }, t("Saved on this device only: the event code and title. No personal details.")),
      list.map((x) => h("div", { class: "row", style: "padding:10px 0;border-top:1px solid var(--line2)" }, h("div", { class: "sp" }, h("b", null, x.t || t("Event")), h("div", { class: "muted small mono" }, shortCode(x.e))),
        h("button", { class: "btn", "data-test": "open-" + x.e.slice(0, 6), onclick: () => openRecent(x) }, t("Open")),
        h("button", { class: "btn ghost", "aria-label": t("Remove from this list"), onclick: () => { store.pref("events", recents().filter((y) => y.e !== x.e)); viewLanding(notice); } }, t("Remove"))))) : null,
    h("div", { class: "card" }, h("h2", null, t("Sign in")),
      h("ol", { class: "small" }, h("li", null, t("Best: open the e-mail we sent you and tap the sign-in link.")), h("li", null, t("Or open the Team Desk from your event page and type the 6-digit code.")), h("li", null, t("Lost the e-mail? Use the box below."))),
      h("p", { class: "muted small" }, t("New here? "), h("a", { href: "/start/" }, t("Start a meeting or election")), ".")),
    h("div", { class: "card" }, h("h3", null, t("Lost your link?")), h("p", { class: "muted" }, t("Type the event code and the e-mail you were added with. We send a new code and link.")),
      field(t("Event code"), eventIn), field(t("Your e-mail"), emailIn), h("div", { style: "margin-top:14px" }, send), out));
}

function openRecent(x) {
  if (SES && SES.eid === x.e) return loadEvent();
  if (x.p && /^p_/.test(x.p)) { store.set("desk_pending", { e: x.e, p: x.p }); return viewCode(x.e, x.p, null, true); }
  viewLanding(t("We do not have your sign-in for that event on this device. Use the box below to get a new link."));
}

function viewTap(l) {
  const out = h("div", { "data-test": "tap-result" });
  page(wwh(t("Team member"), t("Sign in to your Team Desk."), t("Tap the big button once."), t("We never sign you in by itself, so a link opened by mistake does nothing.")),
    h("div", { class: "card center" }, h("div", { class: "eyebrow" }, t("Event ") + shortCode(l.e)), h("h1", null, t("Ready when you are")),
      h("p", { class: "muted" }, t("You opened your sign-in link from the e-mail.")),
      h("button", { class: "btn gold big", "data-test": "tap-signin", onclick: (e) => busy(e.currentTarget, () => signIn(l.e, l.p, l.c, false, () => viewTap(l), out)) }, t("Tap to sign in")), out,
      h("p", { style: "margin-top:18px" }, h("a", { href: "#", "data-test": "use-code", onclick: (ev) => { ev.preventDefault(); oneTap = null; viewCode(l.e, l.p); } }, t("Not now. I will type the code instead.")))));
}

function viewCode(e, p, notice, fresh) {
  const code = h("input", { type: "text", inputmode: "numeric", pattern: "[0-9]*", maxlength: 6, autocomplete: "one-time-code", "aria-label": t("6-digit code"), "data-test": "code", placeholder: "000000", class: "mono", style: "font-size:34px;letter-spacing:.35em;text-align:center;min-height:68px",
    oninput: (ev) => { ev.target.value = ev.target.value.replace(/\D/g, "").slice(0, 6); }, onkeydown: (ev) => { if (ev.key === "Enter") go.click(); } });
  const out = h("div", { "data-test": "code-result" });
  const go = h("button", { class: "btn gold big", "data-test": "signin", onclick: (ev) => {
    out.replaceChildren(); code.classList.remove("err");
    if (!/^\d{6}$/.test(code.value)) { code.classList.add("err"); out.append(note("bad", t("Please type all 6 digits."), t("The code in your e-mail has 6 numbers."))); code.focus(); return; }
    busy(ev.currentTarget, () => signIn(e, p, code.value, false, () => viewCode(e, p), out));
  } }, t("Sign in"));
  let wait = 0;
  const again = h("button", { class: "btn ghost", "data-test": "resend", onclick: (ev) => {
    out.replaceChildren();
    busy(ev.currentTarget, async () => {
      try {
        await post("/api/auth/request", { eventId: e, personId: p, turnstile: await turnstileToken() });
        out.replaceChildren(note("ok", t("A new code is on its way."), t("Use the newest e-mail. The old code no longer works."), null));
      } catch (er) { out.replaceChildren(errorBox(er)); }
    });
  } }, t("Send me a new code"));
  page(wwh(t("Team member"), t("Type the 6-digit code from your e-mail."), t("Type it in the big box and press Sign in."), t("The code proves the e-mail is yours. It works once.")),
    notice ? note("warn", notice, null, null) : null,
    h("div", { class: "card center" }, h("div", { class: "eyebrow" }, t("Event ") + shortCode(e)), h("h2", null, t("Your 6-digit code")),
      fresh ? h("p", { class: "muted small" }, t("No code yet? Press \"Send me a new code\" first.")) : null,
      code, h("div", { style: "margin-top:14px" }, go), out, h("div", { class: "row", style: "justify-content:center;margin-top:16px" }, again),
      h("p", { class: "muted small", style: "margin-top:16px" }, h("a", { href: "#", "data-test": "lost", onclick: (ev) => { ev.preventDefault(); store.del("desk_pending"); viewLanding(); } }, t("Lost the e-mail? Get a new link.")))));
  code.focus();
}

/** Tries the sign-in. If this is the person's first time, the API asks for the terms: show them with a tick box, then try again. */
async function signIn(eid, pid, code, accepted, retryView, out) {
  const show = (el) => { if (out) out.replaceChildren(el); };
  try {
    let body = { eventId: eid, personId: pid, code };
    if (accepted) { const tm = await getTerms(); body = { ...body, acceptTerms: true, termsVersion: tm.version }; }
    const r = await post("/api/auth/verify", body);
    oneTap = null; SES = { eid, pid, token: r.token, roles: r.roles || [] }; store.set("desk", SES); store.del("desk_pending");
    rememberEvent(eid, pid, (recents().find((x) => x.e === eid) || {}).t);
    await loadEvent();
  } catch (e) {
    if (e instanceof TownError && e.code === "terms_required") return viewTerms(eid, pid, code, retryView);
    if (e instanceof TownError && e.code === "invalid_code") { show(errorBox(e, null)); return; }
    show(errorBox(e, () => signIn(eid, pid, code, accepted, retryView, out)));
  }
}

async function viewTerms(eid, pid, code) {
  let tm; try { tm = await getTerms(); } catch (e) { page(errorBox(e, () => viewTerms(eid, pid, code))); return; }
  const agree = h("input", { type: "checkbox", "data-test": "agree" });
  const out = h("div");
  const go = h("button", { class: "btn gold big", "data-test": "agree-signin", onclick: (ev) => {
    out.replaceChildren(); if (!agree.checked) { out.append(note("bad", t("Please tick \"I agree\" first."), t("The box is just above the button."))); return; }
    busy(ev.currentTarget, () => signIn(eid, pid, code, true, () => viewTerms(eid, pid, code), out));
  } }, t("I agree. Sign me in"));
  page(wwh(t("Team member, first sign-in"), t("Read the terms and tick the box."), t("Scroll the text, tick \"I agree\", press the button."), t("Everyone who works on a meeting accepts the same terms once.")),
    h("div", { class: "card" }, h("h2", null, t("Terms")), h("div", { tabindex: "0", role: "region", "aria-label": t("Terms and conditions"), "data-test": "terms-text", style: "max-height:260px;overflow:auto;border:1px solid var(--line);border-radius:12px;padding:12px 14px;background:#fff;white-space:pre-wrap;font-size:14px" }, tm.text),
      h("label", { class: "choice" }, agree, h("div", null, h("b", null, t("I agree to these terms")), h("span", { class: "d" }, t("Version ") + tm.version))), h("div", { style: "margin-top:14px" }, go), out));
}

// ---------------------------------------------------------------- session end
function expire(message) {
  const e = SES?.eid, p = SES?.pid; SES = null; ctx = null; store.del("desk");
  if (e && p) { store.set("desk_pending", { e, p }); viewCode(e, p, message || t("Your sign-in has ended. Please sign in again with a new code.")); } else viewLanding(message || t("Your sign-in has ended. Please sign in again."));
}
function signOut() { SES = null; ctx = null; shell = null; store.del("desk"); store.del("desk_pending"); store.del("desk_tab"); viewLanding(); }

// ---------------------------------------------------------------- loading the event
const authed = async (fn) => { try { return await fn(); } catch (e) { if (e instanceof TownError && e.status === 401) { expire(); throw Object.assign(e, { handled: true }); } throw e; } };
async function fetchData() {
  const { eid, token } = SES;
  const pub = await authed(() => get(`/api/events/${eid}`));
  let priv = null;
  if (SES.roles.some((r) => STAFF.includes(r))) { try { priv = await authed(() => get(`/api/events/${eid}/private`, token)); } catch (e) { if (e.handled || (e.status !== 403 && e.status !== 404)) throw e; } }
  if (priv?.me?.roles) { SES.roles = priv.me.roles; store.set("desk", SES); }
  return { pub, priv };
}
function makeCtx(d, schema) {
  const { eid, pid, token } = SES; const base = `/api/events/${eid}`;
  const wrap = (f) => (path, body) => authed(() => f(base + path, body, token));
  const c = {
    eid, pid, token, roles: SES.roles, model: d.pub.model, progress: d.pub.progress, priv: d.priv, schema,
    call: { get: (path) => authed(() => get(base + path, token)), post: wrap(post), put: wrap(put) },
    go: (name) => { if (shell?.tabs.includes(name)) showTab(name); },
    refresh: async () => { const nd = await fetchData(); Object.assign(c, { roles: SES.roles, model: nd.pub.model, progress: nd.pub.progress, priv: nd.priv }); drawHeader(); await drawTab(curTab, true); },
  };
  return c;
}
async function loadEvent() {
  mount(root, loading(t("Opening your Team Desk…")));
  try {
    const [d, schema] = await Promise.all([fetchData(), ctx?.schema ? ctx.schema : get("/api/schema").catch(() => ({}))]);
    ctx = makeCtx(d, schema); rememberEvent(SES.eid, SES.pid, d.pub.model.title);
    const staff = SES.roles.some((r) => STAFF.includes(r)), mon = SES.roles.includes("attendance_officer");
    if (!staff && !mon) { mount(root, wwh(t("Team member"), t("You have no role in this event."), t("Ask the Organizer to add you."), t("Only appointed people can work here.")), note("warn", t("You are signed in, but you have no role in this event yet."), t("Ask the Organizer to add you as a Host or an Attendance Monitor, then sign in again."), null), h("button", { class: "btn", onclick: signOut }, t("Sign out"))); return; }
    const tabs = ORDER; // one page for every role: all sections are shown, and the ones this role may not work on are greyed out (see rightsOf)
    // On a phone the seven sections collapse into one menu button (see .tabs-menu-btn / .tabs.collapsible in townhall.css); on a laptop the bar is shown as before.
    shell = { tabs, head: h("div", { "data-test": "head" }), menu: h("button", { class: "tabs-menu-btn", type: "button", "aria-haspopup": "true", "aria-expanded": "false", "aria-controls": "desk-tabs", "data-test": "tabs-menu", onclick: () => setMenu(!shell.bar.classList.contains("open")) }),
      bar: h("div", { class: "tabs scroll collapsible", id: "desk-tabs", role: "tablist", "aria-label": t("Team Desk sections"), "data-test": "tabs", onkeydown: (ev) => { if (ev.key === "Escape") { setMenu(false); shell.menu.focus(); } } }),
      hint: h("div", { "data-test": "tab-hint-box" }), body: h("div", { "data-test": "tab-body" }) };
    mount(root, shell.head, shell.menu, shell.bar, shell.hint, shell.body);
    drawHeader();
    const saved = store.get("desk_tab"); // a saved tab is used only while this role may still work on it; otherwise an Attendance Monitor lands on Check-in (the door job) and everyone else on Home
    await showTab(landingTab(ctx.roles, ctx.model, saved));
  } catch (e) { if (e.handled) return; mount(root, errorBox(e, loadEvent), h("p", { class: "muted small" }, t("Your sign-in is still active.")), h("button", { class: "btn ghost", onclick: signOut }, t("Sign out"))); }
}

function drawHeader() {
  if (!shell || !ctx) return; const m = ctx.model;
  const roles = ctx.roles.map((r) => t(ROLE_WORD[r] || r)).join(" + ");
  shell.head.replaceChildren(h("div", { class: "deskhead" },
    h("div", { class: "sp" }, h("div", { class: "eyebrow" }, (m.society?.name || "") + " · " + shortCode(ctx.eid)), h("h1", { "data-test": "event-title" }, m.title),
      h("div", { class: "row small" }, h("span", { class: "badge gold", "data-test": "status" }, t(STATUS_WORD[m.status] || m.status)), h("span", { class: "badge" }, m.kind === "election" ? t("Election") : t("Meeting")), h("span", { class: "muted" }, t("Signed in as ") + roles))),
    h("div", { class: "row" }, h("a", { class: "btn ghost", href: "/e/" + ctx.eid, "data-test": "public-page" }, t("Public page")), h("button", { class: "btn ghost", "data-test": "signout", onclick: signOut }, t("Sign out")))),
    stageBar(m.stage));
  const R = rightsOf(ctx.roles, m); // a greyed tab still opens (look only, with the reason); it is aria-disabled, not disabled, so it can be focused and explained
  // The reason a tab is grey is VISIBLE TEXT, not only a hover tip (a phone has no hover): inside the menu under each grey section, and as a short note under the bar (grouped by reason).
  shell.bar.replaceChildren(...shell.tabs.map((k) => h("div", { class: "ti" + (R[k].ok ? "" : " locked"), role: "presentation" },
    h("button", { role: "tab", "data-test": "tab-" + k, "aria-selected": k === curTab ? "true" : "false", "aria-disabled": R[k].ok ? null : "true", "aria-describedby": R[k].ok ? null : "why-tab-" + k, title: R[k].ok ? null : t(R[k].why), class: (k === curTab ? "on" : "") + (R[k].ok ? "" : " locked"), onclick: () => showTab(k) }, t(TABS[k][0])),
    R[k].ok ? null : h("span", { class: "why", id: "why-tab-" + k, "data-test": "why-tab-" + k }, t(R[k].why)))));
  shell.menu.replaceChildren(h("span", { "aria-hidden": "true" }, "☰"), h("span", { class: "sp", "data-test": "tabs-menu-label" }, t("Section: ") + t(TABS[curTab || "home"][0])), h("span", { "aria-hidden": "true", class: "chev" }, "▾"));
  setMenu(false);
  const byWhy = new Map(); for (const k of shell.tabs) if (!R[k].ok) { const w = t(R[k].why); byWhy.set(w, [...(byWhy.get(w) || []), t(TABS[k][0])]); }
  shell.hint.replaceChildren(...(byWhy.size ? [h("div", { class: "tab-hint small", "data-test": "tab-hint" }, [...byWhy].map(([why, names]) => h("p", null, h("b", null, "🔒 " + names.join(", ") + ": "), why)))] : []));
}
function setMenu(open) { if (!shell) return; shell.bar.classList.toggle("open", !!open); shell.menu.setAttribute("aria-expanded", open ? "true" : "false"); }

async function showTab(name) {
  curTab = name; store.set("desk_tab", name); drawHeader(); await drawTab(name, false);
  const on = shell?.bar.querySelector(".on"); if (on && on.scrollIntoView) on.scrollIntoView({ block: "nearest", inline: "center" });
}
async function drawTab(name, keep) {
  if (!shell || !ctx || !name) return; const my = ++drawSeq; let [label, file, fn] = TABS[name];
  if (!rightsOf(ctx.roles, ctx.model)[name].ok) { file = "desk-home.js"; fn = "renderLocked"; } // a section this role does not cover: the grey, look-only panel (no data is loaded)
  const el = h("div", { "data-test": "tab-" + name + "-body" });
  if (!keep) shell.body.replaceChildren(loading());
  let mod = null;
  try { mod = await import("./" + file); } catch (e) { console.warn("desk module missing or broken:", file, e); }
  if (my !== drawSeq) return;
  const f = mod && (mod[fn] || mod.render);
  if (typeof f !== "function") { shell.body.replaceChildren(h("div", { class: "card center", "data-test": "unfinished" }, h("h3", null, t("This part is being finished")), h("p", { class: "muted" }, t("The \"") + t(label) + t("\" section is not ready yet. Please check again soon. Everything you did so far is safe.")))); return; }
  try {
    await f(ctx, el, name); if (my !== drawSeq) return;
    shell.body.replaceChildren(el);
  } catch (e) {
    if (e.handled) return; if (my !== drawSeq) return;
    if (e instanceof TownError && e.status === 401) { expire(); return; }
    shell.body.replaceChildren(errorBox(e, () => drawTab(name, false)));
  }
}

// ---------------------------------------------------------------- start
if (oneTap) viewTap(oneTap);
else if (SES && SES.token) loadEvent();
else { const pend = store.get("desk_pending"); if (pend && pend.e && pend.p) viewCode(pend.e, pend.p); else viewLanding(); }

import { h, frame, app, mount, t, get, post, store, field, errorBox, msg, busy, loading, fmtTime, fmtMoney, confirmBox, toast, api } from "/assets/core.js";
await frame({ nav: false });
const TOK = "super";
const tok = () => store.get(TOK);
const FUTURE = ["setup", "agenda_published"];

// ---------------------------------------------------------------- sign-in by e-mail code
function signIn(note) {
  const box = h("div"); const code = h("input", { type: "text", inputmode: "numeric", autocomplete: "one-time-code", maxlength: 6, id: "o-code", "aria-label": t("6-digit code"), "data-test": "owner-code" });
  const ask = h("button", { class: "btn", "data-test": "owner-request", onclick: () => busy(ask, async () => { try { await post("/api/super/request", {}); mount(box, msg("ok", t("If this console is set up, a code was e-mailed to the owner."), t("It works once, for 15 minutes."))); code.focus(); } catch (e) { mount(box, errorBox(e)); } }) }, t("E-mail me a code"));
  const go = h("button", { class: "btn gold", "data-test": "owner-verify", onclick: () => busy(go, async () => {
    if (!/^\d{6}$/.test(code.value.trim())) { mount(box, msg("warn", t("Type the 6 digits from the e-mail."))); return; }
    try { const r = await post("/api/super/verify", { code: code.value.trim() }); store.set(TOK, r.token); await home(); } catch (e) { mount(box, errorBox(e)); }
  }) }, t("Sign in"));
  mount(app(), h("div", { class: "card", style: "max-width:520px;margin:30px auto" }, h("h1", null, t("Owner console")), note,
    h("p", { class: "muted" }, t("For the service owner only. We e-mail a 6-digit code to the owner's address.")),
    h("div", null, ask), field(t("Code"), code), h("div", { style: "margin-top:14px" }, go), box));
}

// ---------------------------------------------------------------- the console
let ledgerKey = ""; // kept in memory only
async function home() {
  if (!tok()) return signIn(null);
  mount(app(), loading());
  let o, rel = null;
  try { [o, rel] = await Promise.all([get("/api/super/overview", tok()), get("/release.json").catch(() => null)]); }
  catch (e) { if (e.status === 401) { store.del(TOK); return signIn(msg("warn", t("Your sign-in ended."), t("Sign in again."))); } return mount(app(), h("h1", null, t("Owner console")), errorBox(e, home)); }

  const evs = o.events || [], pays = o.payments || [];
  const societies = new Set(evs.map((e) => e.society)).size;
  const byStatus = {}; for (const e of evs) byStatus[e.status || "?"] = (byStatus[e.status || "?"] || 0) + 1;
  const latestPay = new Map(); for (const p of [...pays].reverse()) latestPay.set(p.payment_id, p);
  const payList = [...latestPay.values()].reverse();
  const stat = (label, value, sub, test) => h("div", { class: "card tint" }, h("div", { class: "eyebrow" }, label), h("h2", { style: "margin:4px 0", "data-test": test }, String(value)), sub ? h("div", { class: "muted" }, sub) : null);
  const mail = o.mail || {}; const mt = Array.isArray(mail.today) ? mail.today : [];
  const sent = mt.reduce((a, r) => a + (+r.n || 0), 0); const mailToday = String(sent) + (mt.length ? " (" + mt.map((r) => r.provider + " " + r.n).join(", ") + ")" : "");
  const anchors = o.anchors || [];

  const out = h("div");
  mount(app(),
    h("div", { class: "row", style: "justify-content:space-between" }, h("h1", { style: "margin:0" }, t("Owner console")), h("div", { class: "row" }, h("button", { class: "btn ghost", "data-test": "owner-refresh", onclick: home }, t("Reload")), h("button", { class: "btn ghost", "data-test": "owner-signout", onclick: () => { store.del(TOK); ledgerKey = ""; signIn(null); } }, t("Sign out")))),
    h("div", { class: "msg info" }, h("div", null, h("span", { class: "ti" }, t("Read-only, except two logged actions.")), h("span", null, t("You can suspend an event that has not started, and mark a payment as reconciled. Every look at private audit data is written on that event's public record, with your reason.")))),
    h("div", { class: "grid g4" },
      stat(t("Societies"), societies, null, "k-societies"), stat(t("Events"), evs.length, Object.entries(byStatus).map(([k, v]) => v + " " + k).join(" · "), "k-events"),
      stat(t("Payments"), payList.length, payList.filter((p) => p.state === "paid").length + t(" paid"), "k-payments"),
      stat(t("Release"), rel ? rel.version : "?", rel ? rel.date : null, "k-release")),
    h("div", { class: "grid g3" },
      h("div", { class: "card" }, h("h3", null, t("E-mail today")), h("p", { "data-test": "mail-count" }, mailToday + " / " + (mail.dailyLimit ?? "?")),
        mail.quotaReached ? h("span", { class: "badge bad", "data-test": "mail-quota" }, t("Daily limit reached. New codes will not be sent.")) : h("span", { class: "badge ok", "data-test": "mail-quota" }, t("Within the daily limit"))),
      h("div", { class: "card" }, h("h3", null, t("Health")), h("span", { class: o.health?.ok ? "badge ok" : "badge bad", "data-test": "health" }, o.health?.ok ? t("Running") : t("Problem")), " ", o.health?.testMode ? h("span", { class: "badge warn" }, t("Test mode")) : null,
        h("dl", { class: "kv", style: "margin-top:10px" }, ...Object.entries(o.storage || {}).flatMap(([k, v]) => [h("dt", null, k.replace(/_/g, " ")), h("dd", null, String(v))]))),
      h("div", { class: "card" }, h("h3", null, t("Chain and anchors")), h("p", { "data-test": "anchors" }, anchors.length ? t("Latest anchor: ") + fmtTime(anchors[0].at_ms) + " (" + anchors[0].kind + ", entry " + anchors[0].head_seq + ")" : t("No anchors yet.")),
        h("p", { class: "muted" }, t("Anchors are written by the daily scheduler for events that are live.")))),
    h("h2", null, t("Events")), eventsTable(evs, out),
    out,
    h("h2", null, t("Payments")), paymentsTable(payList),
    reconcileCard(), ledgerCard());
}

function eventsTable(evs, out) {
  if (!evs.length) return h("p", { class: "muted" }, t("No events yet."));
  return h("div", { class: "tw card" }, h("table", { class: "t", "data-test": "events" },
    h("thead", null, h("tr", null, ["Society", "Event", "Status", "Entries", "Actions"].map((x) => h("th", null, t(x))))),
    h("tbody", null, evs.map((e) => h("tr", null,
      h("td", null, e.society), h("td", null, e.title, h("div", { class: "muted" }, e.id.slice(0, 8) + "…")), h("td", null, h("span", { class: "badge" }, e.status || "?")), h("td", null, e.head_seq),
      h("td", null, h("div", { class: "row" },
        FUTURE.includes(e.status) ? h("button", { class: "btn ghost", style: "min-height:40px", "data-test": "suspend-" + e.id.slice(0, 8), onclick: () => suspendForm(e, out) }, t("Suspend")) : h("span", { class: "muted" }, e.status === "suspended" ? t("Suspended") : t("Cannot suspend: already started")),
        h("button", { class: "btn ghost", style: "min-height:40px", "data-test": "audit-" + e.id.slice(0, 8), onclick: () => auditForm(e, out) }, t("Audit view")))))))));
}

function suspendForm(e, out) {
  const reason = h("textarea", { rows: 2, maxlength: 300, "aria-label": t("Reason"), "data-test": "suspend-reason" }); const box = h("div");
  const go = h("button", { class: "btn", "data-test": "suspend-go", onclick: () => busy(go, async () => {
    if (reason.value.trim().length < 5) { mount(box, msg("warn", t("Type a reason of a few words."))); return; }
    if (!(await confirmBox(t("Suspend this event?"), t("It cannot start while suspended. The reason is written on the event's public record."), t("Suspend"), t("Cancel")))) return;
    try { await post(`/api/super/events/${e.id}/suspend`, { reason: reason.value.trim() }, tok()); toast(t("Event suspended.")); await home(); } catch (x) { mount(box, errorBox(x)); }
  }) }, t("Suspend event"));
  mount(out, h("section", { class: "card", "data-test": "suspend-panel" }, h("h3", null, t("Suspend: ") + e.title),
    msg("warn", t("This will be written on the event's public record."), t("Everyone can see that the platform suspended the event, and your reason.")),
    field(t("Reason"), reason, t("Only possible before the event starts.")), h("div", { style: "margin-top:12px" }, go), box));
  out.scrollIntoView({ behavior: "smooth" });
}

function auditForm(e, out) {
  const reason = h("input", { type: "text", maxlength: 300, "aria-label": t("Reason"), "data-test": "audit-reason" }); const res = h("div", { "data-test": "audit-result" });
  const go = h("button", { class: "btn", "data-test": "audit-go", onclick: () => busy(go, async () => {
    const r = reason.value.trim(); if (r.length < 5) { mount(res, msg("warn", t("Type a reason of a few words."))); return; }
    try {
      const d = await get(`/api/super/events/${e.id}/audit?reason=${encodeURIComponent(r)}`, tok());
      mount(res, msg("ok", t("Opened. Your reason is now on the event's public record.")), auditTable(d.rows || []));
    } catch (x) { mount(res, errorBox(x)); }
  }) }, t("Open the audit view"));
  mount(out, h("section", { class: "card", "data-test": "audit-panel" }, h("h3", null, t("Audit view: ") + e.title),
    msg("warn", t("This will be written on the event's public record."), t("Opening the full audit shows IP addresses and device numbers. The fact that you looked, and your reason, appear on the public page. Do not put personal details in the reason.")),
    field(t("Reason (required)"), reason, t("For example: support ticket 123, voter says vote not accepted.")), h("div", { style: "margin-top:12px" }, go), res));
  out.scrollIntoView({ behavior: "smooth" });
}
function auditTable(rows) {
  if (!rows.length) return h("p", { class: "muted" }, t("No rows."));
  const cols = ["at", "method", "route", "actor", "status", "ip", "device", "userAgent", "logSeq"].filter((c) => c in rows[0]);
  return h("div", { class: "tw working" }, h("div", { class: "lbl" }, t("Working screen: full values, shown only to you")), h("table", { class: "t" }, h("thead", null, h("tr", null, cols.map((c) => h("th", null, c)))),
    h("tbody", null, rows.map((r) => h("tr", null, cols.map((c) => h("td", { style: "word-break:break-all" }, c === "at" ? fmtTime(r[c]) : String(r[c] ?? ""))))))));
}

function paymentsTable(list) {
  if (!list.length) return h("p", { class: "muted" }, t("No payments yet."));
  return h("div", { class: "tw card" }, h("table", { class: "t", "data-test": "payments" }, h("thead", null, h("tr", null, ["Payment", "Event", "State", "Mode", "Amount", "When"].map((x) => h("th", null, t(x))))),
    h("tbody", null, list.map((p) => h("tr", null, h("td", null, p.payment_id), h("td", null, p.event_id.slice(0, 8) + "…"), h("td", null, h("span", { class: "badge " + (p.state === "paid" || p.state === "reconciled" ? "ok" : "") }, p.state)), h("td", null, p.mode), h("td", null, fmtMoney(p.amount_minor, "INR")), h("td", null, fmtTime(p.at_ms)))))));
}

function reconcileCard() {
  const pid = h("input", { type: "text", maxlength: 40, "data-test": "rec-id" }), note = h("input", { type: "text", maxlength: 300, "data-test": "rec-note" }); const box = h("div");
  const go = h("button", { class: "btn", "data-test": "rec-go", onclick: () => busy(go, async () => {
    if (pid.value.trim().length < 3 || note.value.trim().length < 3) { mount(box, msg("warn", t("Fill both boxes."))); return; }
    try { await post("/api/super/payments/reconcile", { paymentId: pid.value.trim(), note: note.value.trim() }, tok()); mount(box, msg("ok", t("Marked as reconciled."))); pid.value = ""; note.value = ""; } catch (e) { mount(box, errorBox(e)); }
  }) }, t("Mark reconciled"));
  return h("section", { class: "card" }, h("h3", null, t("Reconcile a payment")), h("p", { class: "muted" }, t("Use after you have matched a payment with the bank or Razorpay. This adds a dated row; it does not move money.")),
    field(t("Payment number (pay_...)"), pid), field(t("Note"), note), h("div", { style: "margin-top:12px" }, go), box);
}

function ledgerCard() {
  const key = h("input", { type: "password", autocomplete: "off", "aria-label": t("Ledger key"), "data-test": "ledger-key" }), month = h("input", { type: "text", placeholder: "YYYY-MM", maxlength: 7, "data-test": "ledger-month" }); const box = h("div");
  const go = h("button", { class: "btn ghost", "data-test": "ledger-go", onclick: () => busy(go, async () => {
    ledgerKey = key.value.trim(); if (!ledgerKey) { mount(box, msg("warn", t("Type the ledger key."))); return; }
    try {
      const d = await api("GET", "/api/owner/ledger" + (/^\d{4}-\d{2}$/.test(month.value.trim()) ? "?month=" + month.value.trim() : ""), undefined, ledgerKey);
      const rows = d.rows || [];
      mount(box, rows.length ? h("div", { class: "tw" }, h("table", { class: "t", "data-test": "ledger" }, h("thead", null, h("tr", null, ["Payment", "Status", "Amount", "Refunded", "Net", "Path"].map((x) => h("th", null, t(x))))),
        h("tbody", null, rows.map((r) => h("tr", null, h("td", null, r.payment_id), h("td", null, r.status), h("td", null, fmtMoney(r.amount_minor, r.currency)), h("td", null, fmtMoney(r.refunded_minor, r.currency)), h("td", null, r.net_minor == null ? "" : fmtMoney(r.net_minor, r.currency)), h("td", { class: "muted" }, r.ledgerPath)))))) : msg("info", t("No rows for that month.")));
    } catch (e) { mount(box, e.status === 404 ? msg("warn", t("The ledger did not open."), t("The key is wrong, or the ledger is not switched on for this site.")) : errorBox(e)); } finally { key.value = ""; ledgerKey = ""; }
  }) }, t("Show ledger"));
  return h("section", { class: "card" }, h("h3", null, t("Payments ledger (ledger C)")), h("p", { class: "muted" }, t("Needs the separate ledger key. It is used once and not kept.")),
    field(t("Ledger key"), key), field(t("Month (optional)"), month), h("div", { style: "margin-top:12px" }, go), box);
}

home();

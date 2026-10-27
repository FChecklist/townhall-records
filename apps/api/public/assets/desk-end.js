// Team Desk tab "End or move": end / stop / postpone / cancel (with the "Are you sure?" and the 4-digit number), the pay link, recreate, erase, privacy requests, e-mail the report.
// Module contract: export async function render(ctx, el). Works with priv = null (monitor): then it only says the part is for the Organizer or Host.
import { h, mount, t, get, msg, errorBox, radios, checks, field, stepBar, wwh, busy, confirmBox, toast, loading, fmtMoney, fmtTime, copyText, turnstileToken, shortCode } from "/assets/core.js";

const SECTIONS = [["end", "End or move this event"], ["link", "Pay link"], ["recreate", "Recreate this event"], ["privacy", "Privacy"], ["report", "E-mail the report"]];
let SUB = "end", FLASH = null, pollGen = 0; // remembered while the tab is re-drawn after a successful write

const MILES = ["start", "votingStart", "votingEnd", "end"];
const milestoneLabel = (kind, k) => { const w = kind === "election" ? "Election" : "Meeting"; return { start: w + " starts", votingStart: "Voting starts", votingEnd: "Voting ends", end: w + " ends" }[k]; };
const REQ_WORDS = { access: "Asks to see their data", correct: "Asks for a correction", erase: "Asks for erasure", withdraw: "Withdraws consent", grievance: "Complaint" };
const quoteWords = (q) => (!q ? "" : q.free ? t("Free. ") + t(q.why) : t("Half the price: ") + fmtMoney(q.feeMinor, q.currency) + ". " + t(q.why));

/** "2026-11-03T18:30" typed as wall-clock time in the event's zone -> UTC milliseconds. */
function offsetAt(ms, tz) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(ms / 1000) * 1000;
}
export function zonedToMs(s, tz) {
  const m = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)/.exec(s || ""); if (!m) return null;
  const [y, mo, d, hh, mi] = m.slice(1).map(Number); const wall = Date.UTC(y, mo - 1, d, hh, mi);
  try { let g = wall; for (let k = 0; k < 3; k++) g = wall - offsetAt(g, tz); return g; } catch { return new Date(y, mo - 1, d, hh, mi).getTime(); }
}
const addHours = (s, hrs) => { const m = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)/.exec(s || ""); if (!m) return ""; const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) + hrs * 3600000); return d.toISOString().slice(0, 16); };

export async function render(ctx, el) {
  pollGen++;
  const roles = ctx.roles || [];
  if (!ctx.priv || !(roles.includes("organizer") || roles.includes("host"))) {
    mount(el, wwh(t("Attendance Monitor or other helper"), t("Nothing to do here"), t("Use the other tabs"), t("Only the Organizer or a Host can end, move or erase")), msg("info", t("This part is for the Organizer or Host."), t("You can read the unchangeable record in the Record tab."), null));
    return;
  }
  const isOrg = roles.includes("organizer"); const m = ctx.model || {}; const tz = m.timezone || "Asia/Kolkata";
  const body = h("div"); const flash = FLASH; FLASH = null;
  const tabs = h("div", { class: "tabs", role: "tablist" }, SECTIONS.map(([id, label]) => h("button", { role: "tab", "data-id": id, "data-test": "end-tab-" + id, class: SUB === id ? "on" : "", "aria-selected": String(SUB === id), onclick: () => { SUB = id; pollGen++; for (const b of tabs.children) b.classList.toggle("on", b.getAttribute("data-id") === id); draw(); } }, t(label))));
  mount(el, wwh(t("Organizer or Host"), t("End the event, move it, pay, recreate it, or look after private details"), t("Pick one of the tabs below, then follow the steps"), t("These actions are recorded on the public page and cannot be undone")),
    flash ? msg(flash.kind || "ok", flash.title, flash.body, flash.fix) : null, tabs, body);
  draw();

  function draw() { ({ end: secEnd, link: secLink, recreate: secRecreate, privacy: secPrivacy, report: secReport })[SUB](); }
  const done = async (flashMsg) => { FLASH = flashMsg; await ctx.refresh(); };
  const alive = (g) => g === pollGen && el.isConnected;
  /** Shows a payment link with Copy and Share and checks by itself every 6 seconds until it is paid. */
  function linkBox(payPath, lines, onPaid) {
    const url = location.origin + payPath; const tok = payPath.split("/").pop(); const g = pollGen; const status = h("p", { "data-test": "pay-status", class: "small", style: "font-weight:600" }, t("Waiting for the payment. This page updates by itself."));
    const tick = async () => { if (!alive(g)) return; if (!document.hidden) { try { const d = await get("/api/pay/link/" + tok); if (d.paid) { mount(status, h("span", { class: "badge ok" }, t("Paid")), " ", t("Thank you. The payment has arrived.")); toast(t("Payment received")); onPaid && onPaid(); return; } } catch { /* try again */ } } setTimeout(tick, 6000); };
    setTimeout(tick, 6000);
    return h("div", { class: "card tint", "data-test": "pay-box" }, ...lines, h("p", { style: "font-weight:700;margin:10px 0 4px" }, t("Anyone can pay this link. They do not need to sign in.")), h("code", { class: "code s", style: "font-size:15px;letter-spacing:0;word-break:break-all", "data-test": "pay-url" }, url),
      h("div", { class: "row", style: "margin-top:12px" }, h("button", { class: "btn", onclick: () => copyText(url), "data-test": "pay-copy" }, t("Copy link")), navigator.share ? h("button", { class: "btn gold", onclick: () => navigator.share({ title: t("Payment link"), text: t("Please pay for the event with this link"), url }).catch(() => {}), "data-test": "pay-share" }, t("Share")) : null, h("a", { class: "btn ghost", href: payPath, target: "_blank", rel: "noopener" }, t("Open the pay page"))), status);
  }

  // ------------------------------------------------------------ 1. end or move
  async function secEnd() {
    mount(body, loading()); let o;
    try { o = await ctx.call.get("/end-options"); } catch (e) { mount(body, errorBox(e, secEnd)); return; }
    const E = { step: 0, choice: null, codes: [], other: "", sched: {}, places: {}, intent: null };
    const anyOpen = (m.points || []).some((p) => p.state === "open"), anyEver = (m.points || []).some((p) => p.state !== "pending");
    const whyOff = (c) => o.status === "closed" ? t("This event is already over.") : c.id === "complete" ? t("Only a meeting that is running can be completed.") : c.id === "stop" ? t("It has not started yet. Choose Cancelled or Postponed instead.")
      : c.id === "cancel" ? (anyEver ? t("Voting has already begun, so choose Stopped in between. Votes already cast stay on record.") : t("This is not possible right now.")) : anyOpen ? t("A question is open for voting. Close it first.") : t("This is not possible right now.");
    const choice = () => o.choices.find((c) => c.id === E.choice);
    const stepsFor = () => stepBar(["Choose", E.choice === "postpone" ? "New date and place" : "Reasons", "Check", "Confirm"].map((x, i) => ({ title: t(x), state: i < E.step ? "done" : i === E.step ? "cur" : "todo" })));
    const page = (title, ...kids) => mount(body, stepsFor(), h("div", { class: "card" }, h("h2", null, title), ...kids));

    function s0() {
      const slot = h("div"), why = h("div", { class: "why-off" }); const q = o.choices.find((c) => c.id === "postpone")?.quote;
      const next = h("button", { class: "btn big", "data-test": "end-next", onclick: () => { E.step = 1; s1(); } }, t("Next"));
      const r = radios("end-choice", o.choices.map((c) => ({ value: c.id, label: t(c.label), desc: c.plain ? t(c.plain) : null, disabled: !c.allowed, reason: c.allowed ? null : whyOff(c) })), E.choice, (v) => { E.choice = v; upd(); });
      r.setAttribute("data-test", "end-choice");
      const upd = () => { next.disabled = !E.choice; why.textContent = E.choice ? "" : t("Choose one of the four to continue."); mount(slot, E.choice === "postpone" && q ? msg(q.free ? "ok" : "warn", t("Price of moving it now"), quoteWords(q), null) : null); }; upd();
      page(t("What has happened to this event?"), o.note ? h("p", { class: "muted" }, t(o.note)) : null, r, slot, h("div", { class: "nav" }, h("span"), next), why);
    }
    function s1() {
      const postpone = E.choice === "postpone"; const kind = m.kind || "meeting"; const slot = h("div");
      const rs = checks("end-reasons", o.reasons.map((x) => ({ value: x.id, label: t(x.label) })), E.codes, (v) => { E.codes = v; }); rs.setAttribute("data-test", "end-reasons");
      const other = h("textarea", { rows: 3, maxlength: 400, "data-test": "end-reason-text", "aria-label": t("Other details"), placeholder: t("Write a short reason in plain words. No phone numbers or e-mail addresses."), value: E.other, oninput: () => { E.other = other.value; } });
      const inputs = {}, places = {};
      const mk = postpone ? MILES.map((k) => {
        const i = h("input", { type: "datetime-local", "data-test": "new-" + k, value: E.sched[k] || "", "aria-label": t(milestoneLabel(kind, k)) });
        const pl = h("input", { type: "text", "data-test": "new-place-" + k, value: E.places[k] ?? m.schedule?.[k]?.place ?? "", "aria-label": t(milestoneLabel(kind, k)) + " - " + t("place"), maxlength: 200 });
        inputs[k] = i; places[k] = pl;
        if (k === "start") i.addEventListener("change", () => { for (const [j, hrs] of [["votingStart", 0], ["votingEnd", 2], ["end", 3]]) if (!inputs[j].value) inputs[j].value = addHours(i.value, hrs); });
        return h("div", { class: "card tint" }, h("b", null, t(milestoneLabel(kind, k))), h("div", { class: "grid g2" }, field(t("Date and time"), i), field(t("Place"), pl)));
      }) : null;
      const q = o.choices.find((c) => c.id === "postpone")?.quote;
      const collect = () => { E.codes = rs.values(); E.other = other.value; if (postpone) for (const k of MILES) { E.sched[k] = inputs[k].value; E.places[k] = places[k].value; } };
      const next = h("button", { class: "btn big", "data-test": "end-next", onclick: () => {
        collect(); const bad = [];
        if (E.choice !== "complete" && !E.codes.length && !E.other.trim()) bad.push(t("Tick at least one reason, or write one."));
        if (postpone) {
          const ms = MILES.map((k) => zonedToMs(E.sched[k], tz)); if (ms.some((x) => x == null)) bad.push(t("Give a date and time for all four lines."));
          else { if (ms.some((x, i) => i && x < ms[i - 1])) bad.push(t("The four times must be in order: start, voting starts, voting ends, end.")); if (ms[0] <= Date.now()) bad.push(t("The new date and time must be in the future.")); }
          if (MILES.some((k) => (E.places[k] || "").trim().length < 2)) bad.push(t("Give a place for all four lines."));
          if (!bad.length) E.newSchedule = Object.fromEntries(MILES.map((k, i) => [k, { atMs: ms[i], place: E.places[k].trim() }]));
        }
        if (bad.length) { mount(slot, msg("bad", bad[0], bad.slice(1).join(" ") || null, null)); return; }
        E.step = 2; s2();
      } }, t("Next"));
      page(postpone ? t("New date, time and place") : E.choice === "complete" ? t("Anything to add? (optional)") : t("Why? Tick every reason that applies"),
        postpone && q ? msg(q.free ? "ok" : "warn", t("Price of moving it now"), quoteWords(q), null) : null, postpone ? h("p", { class: "muted small" }, t("Times are in the event's time zone: ") + tz) : null, mk,
        h("h3", null, E.choice === "complete" ? t("Reasons (optional)") : t("Reasons")), rs, field(t("Other details"), other), slot, h("div", { class: "nav" }, h("button", { class: "btn ghost", "data-test": "end-back", onclick: () => { collect(); E.step = 0; s0(); } }, t("Back")), next));
    }
    function s2() {
      const c = choice(); const slot = h("div"); const labels = E.codes.map((id) => o.reasons.find((x) => x.id === id)?.label || id);
      const go = h("button", { class: "btn big wine", "data-test": "end-submit", onclick: () => busy(go, async () => {
        try {
          const r = await ctx.call.post("/intent", { action: E.choice, reasonCodes: E.codes, reason: E.other.trim() || undefined, newSchedule: E.newSchedule });
          if (!(await confirmBox(t("Are you sure?"), r.areYouSure || t("This is recorded on the public page and cannot be undone."), t("Yes"), t("No")))) { return; }
          E.intent = r; E.step = 3; s3();
        } catch (e) { mount(slot, errorBox(e, () => go.click())); }
      }) }, t("Submit"));
      page(t("Check before you go on"), h("dl", { class: "kv" }, h("dt", null, t("What")), h("dd", { "data-test": "end-what" }, t(c.label)), h("dt", null, t("Reasons")), h("dd", null, [...labels.map(t), E.other.trim()].filter(Boolean).join("; ") || t("none")),
        E.choice === "postpone" ? MILES.map((k) => [h("dt", null, t(milestoneLabel(m.kind || "meeting", k))), h("dd", null, fmtTime(E.newSchedule[k].atMs, tz) + " · " + E.newSchedule[k].place)]) : null),
        msg("warn", t("This cannot be undone."), t("It is written on the public page with the reasons. Votes already cast stay on record."), null), slot,
        h("div", { class: "nav" }, h("button", { class: "btn ghost", "data-test": "end-back", onclick: () => { E.step = 1; s1(); } }, t("Back")), go));
    }
    function s3() {
      const it = E.intent; const inp = h("input", { type: "text", inputmode: "numeric", pattern: "[0-9]*", maxlength: "4", autocomplete: "off", "data-test": "confirm-input", "aria-label": t("Type the 4-digit number"), style: "font-size:34px;text-align:center;letter-spacing:.3em;min-height:68px", placeholder: "----" });
      const slot = h("div"), why = h("div", { class: "why-off" });
      const go = h("button", { class: "btn big", "data-test": "confirm-submit", onclick: send }, t("Submit")); const upd = () => { const ok = /^\d{4}$/.test(inp.value.trim()); go.disabled = !ok; why.textContent = ok ? "" : t("Type the 4 digits shown above."); }; inp.addEventListener("input", upd); upd();
      async function send() {
        await busy(go, async () => {
          try {
            const r = await ctx.call.post("/confirm", { intentId: it.intentId, code: inp.value.trim() });
            if (r.awaitingPayment) return payPanel(r);
            const word = { completed: "COMPLETED", stopped: "STOPPED IN BETWEEN", cancelled: "CANCELLED", postponed: "POSTPONED" }[r.outcome] || r.outcome;
            await done({ kind: "ok", title: t("Done. The public page now says ") + word + ".", body: r.outcome === "postponed" ? t("The new date is on the public page.") : t("The reasons are on the public page. Votes already cast stay on record."), fix: null });
          } catch (e) {
            if (e.code === "wrong_code") { mount(slot, msg("bad", e.message, null, t("Type the 4-digit number shown on the screen."))); inp.value = ""; upd(); inp.focus(); }
            else if (["too_many_tries", "expired", "no_intent", "already_done"].includes(e.code)) mount(slot, msg("bad", e.message, null, null), h("button", { class: "btn", "data-test": "start-again", onclick: () => { E.step = 0; s0(); } }, t("Start again")));
            else mount(slot, errorBox(e, send));
          }
        }); upd();
      }
      page(t("Type this number to confirm"), h("p", { class: "muted" }, t("Look at the number below and type it into the box. This makes sure you did not press by accident.")), h("code", { class: "code", "data-test": "confirm-code" }, it.confirmCode),
        field(t("Type the number here"), inp), go, why, slot, h("div", { class: "nav" }, h("button", { class: "btn ghost", "data-test": "end-back", onclick: () => { E.step = 2; s2(); } }, t("Back")), h("span")));
      inp.focus();
    }
    function payPanel(r) {
      pollGen++; const lines = [h("h3", null, t("A fee is due before the new date takes effect")), h("p", { "data-test": "fee-line" }, t("Fee: ") + fmtMoney(r.feeMinor, r.currency) + ". " + t(r.why || "")), h("p", { class: "muted small" }, t(r.message || ""))];
      mount(body, stepsFor(), linkBox(r.payPath, lines, async () => { await done({ kind: "ok", title: t("Paid. The event has been moved."), body: t("The new date is on the public page."), fix: null }); }));
    }
    s0();
  }

  // ------------------------------------------------------------ 2. pay link
  function secLink() {
    const slot = h("div"); const go = h("button", { class: "btn big", "data-test": "paylink-make", onclick: () => busy(go, async () => {
      try { const r = await ctx.call.post("/pay-link", {}); mount(slot, linkBox(r.payPath, [h("h3", null, t("Payment link for the event fee")), h("p", { "data-test": "paylink-amount" }, t("Amount: ") + (r.price || fmtMoney(r.amountMinor, r.currency))), h("p", { class: "muted small" }, t(r.note || ""))], () => done({ kind: "ok", title: t("The event fee is paid."), body: null, fix: null }))); }
      catch (e) { mount(slot, e.code === "already_paid" ? msg("ok", e.message, null, null) : errorBox(e, () => go.click())); }
    }) }, t("Make the payment link"));
    mount(body, h("div", { class: "card" }, h("h2", null, t("Let someone else pay")), h("p", null, t("A treasurer, a committee member or a member can pay the event fee. Make a link and send it. They do not need to sign in, and they never see your event's private details.")), go, slot));
  }

  // ------------------------------------------------------------ 3. recreate
  async function secRecreate() {
    const title = h("input", { type: "text", "data-test": "rc-title", value: m.title || "", maxlength: 200 }), venue = h("input", { type: "text", "data-test": "rc-place", value: m.venue || "", maxlength: 200 }), when = h("input", { type: "datetime-local", "data-test": "rc-when" });
    const priv = h("input", { type: "checkbox", checked: true, "data-test": "rc-private" }), agree = h("input", { type: "checkbox", "data-test": "rc-agree" }); const slot = h("div"), why = h("div", { class: "why-off" });
    let tm = null; try { tm = await get("/api/terms"); } catch { /* shown below */ }
    const go = h("button", { class: "btn big", "data-test": "rc-go", onclick: () => busy(go, async () => {
      try {
        const r = await ctx.call.post("/recreate", { title: title.value.trim(), venue: venue.value.trim(), scheduledMs: zonedToMs(when.value, tz), privateRoll: priv.checked, acceptTerms: true, termsVersion: tm?.version, turnstile: await turnstileToken() });
        mount(slot, msg("ok", t("The new event is created."), t("Its event code is ") + shortCode(r.eventId) + ". " + t(r.next || ""), null), h("code", { class: "code s", "data-test": "rc-eid", style: "font-size:15px;letter-spacing:0;word-break:break-all" }, r.eventId),
          h("div", { class: "row", style: "margin-top:10px" }, h("button", { class: "btn", onclick: () => copyText(r.eventId) }, t("Copy the event code")), h("a", { class: "btn ghost", href: "/desk/" }, t("Go to the sign-in page"))));
      } catch (e) { mount(slot, errorBox(e, () => go.click())); }
    }) }, t("Create the new event"));
    const upd = () => { const miss = title.value.trim().length < 2 ? t("Give the new event a title.") : !when.value ? t("Choose the new date and time.") : venue.value.trim().length < 2 ? t("Give the place.") : !agree.checked ? t("Tick the box to agree to the terms.") : ""; go.disabled = !!miss; why.textContent = miss; };
    for (const i of [title, venue, when, agree]) i.addEventListener("input", upd); upd();
    mount(body, h("div", { class: "card" }, h("h2", null, t("Recreate this event")), h("p", null, t("Start a new meeting or election from this one. You only give the new title, date and place.")),
      h("div", { class: "grid g2" }, h("div", { class: "msg ok" }, h("div", null, h("span", { class: "ti" }, t("Copied")), t("The society, rules and options, your own rules, the officials, the agenda with candidates and ballot design, the flat list, and (if ticked) the private names and contacts."))), h("div", { class: "msg warn" }, h("div", null, h("span", { class: "ti" }, t("Not copied")), t("Votes, attendance, codes, payments, photos, dates, and the team. Add your helpers again.")))),
      field(t("New title"), title), field(t("New date and time (event's time zone: ") + tz + ")", when), field(t("New place"), venue),
      h("label", { class: "choice" }, priv, h("div", null, h("b", null, t("Also copy the private names and contacts")), h("span", { class: "d" }, t("They are kept encrypted in the new event too.")))),
      tm ? h("details", null, h("summary", { style: "cursor:pointer;min-height:44px;display:flex;align-items:center;font-weight:600" }, t("Read the terms")), h("div", { style: "white-space:pre-wrap;max-height:30vh;overflow:auto;font-size:14px" }, tm.text)) : msg("warn", t("The terms could not be loaded."), t("Reload the page and try again."), null),
      h("label", { class: "choice" }, agree, h("div", null, h("b", null, t("I agree to the terms")))), go, why, slot));
  }

  // ------------------------------------------------------------ 4. privacy
  function secPrivacy() {
    const honest = h("p", { class: "muted small" }, t("Townhall is designed around DPDP and GDPR. Erasing destroys the key that unlocks private details, so they can no longer be read. The public record stays as it is."));
    if (!isOrg) { mount(body, honest, msg("info", t("Erasing is for the Organizer."), t("A Host can read and answer privacy requests below."), null), reqCard()); return; }
    // erase one person or flat
    const kindR = radios("erase-kind", [{ value: "person", label: t("A team member") }, { value: "flat", label: t("A flat (name and photos taken at check-in)") }], "person", () => sw());
    const people = (m.people || []); const pick = h("select", { "data-test": "erase-person", "aria-label": t("Person") }, people.map((p) => h("option", { value: p.pid }, p.maskedName + " (" + (p.roles || []).join(", ") + ")")));
    const flat = h("input", { type: "text", "data-test": "erase-flat", placeholder: t("for example A-101"), maxlength: 24 }); const reason = h("textarea", { rows: 2, maxlength: 300, "data-test": "erase-reason", placeholder: t("Why? For example: the person asked us to erase their details.") });
    const pw = field(t("Which person"), pick), fw = field(t("Flat number"), flat); const slot = h("div");
    const sw = () => { const k = kindR.value(); pw.classList.toggle("hidden", k !== "person"); fw.classList.toggle("hidden", k !== "flat"); }; sw();
    const go = h("button", { class: "btn wine", "data-test": "erase-go", onclick: () => busy(go, async () => {
      const k = kindR.value(); const bodyJson = k === "person" ? { personId: pick.value } : { flatNo: flat.value.trim() }; const rs = reason.value.trim();
      if ((k === "person" && !pick.value) || (k === "flat" && !bodyJson.flatNo)) { mount(slot, msg("bad", t("Say which person or flat."), null, null)); return; } if (rs.length < 5) { mount(slot, msg("bad", t("Write a reason (at least 5 letters)."), null, null)); return; }
      if (!(await confirmBox(t("Are you sure?"), t("The private details of this ") + (k === "person" ? t("person") : t("flat")) + t(" will no longer be readable by anyone. This cannot be undone. The public record is not changed."), t("Yes, erase"), t("No")))) return;
      try { const r = await ctx.call.post("/privacy/erase", { ...bodyJson, reason: rs }); await done({ kind: "ok", title: t("Erased."), body: r.note, fix: null }); } catch (e) { mount(slot, errorBox(e, () => go.click())); }
    }) }, t("Erase"));
    // erase everything
    const num = String(1000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 9000)); const typed = h("input", { type: "text", inputmode: "numeric", maxlength: "4", "data-test": "shred-input", "aria-label": t("Type the 4-digit number"), style: "font-size:28px;text-align:center;letter-spacing:.3em;min-height:60px", placeholder: "----" });
    const sure = h("input", { type: "checkbox", "data-test": "shred-sure" }); const slot2 = h("div"), why2 = h("div", { class: "why-off" });
    const go2 = h("button", { class: "btn wine", "data-test": "shred-go", onclick: () => busy(go2, async () => {
      if (!(await confirmBox(t("Erase all private details?"), t("Every name, e-mail address and phone number kept for this event will no longer be readable by anyone, including you and us. Votes and the public record stay as they are. This cannot be undone."), t("Yes, erase all"), t("No")))) return;
      try { const r = await ctx.call.post("/crypto-shred", {}); await done({ kind: "ok", title: t("All private details of this event were erased."), body: r.note, fix: null }); } catch (e) { mount(slot2, errorBox(e, () => go2.click())); }
    }) }, t("Erase all private details"));
    const upd2 = () => { const ok = sure.checked && typed.value.trim() === num; go2.disabled = !ok; why2.textContent = ok ? "" : !sure.checked ? t("Tick the box first.") : t("Type the 4-digit number shown above to unlock the button."); }; sure.addEventListener("change", upd2); typed.addEventListener("input", upd2); upd2();
    mount(body, honest,
      h("div", { class: "card" }, h("h2", null, t("Erase one person or flat")), h("p", null, t("Use this when someone asks for their own details to be erased.")), kindR, pw, fw, field(t("Reason"), reason), go, slot),
      h("div", { class: "card" }, h("h2", null, t("Erase all private details")), h("p", null, t("This removes the key to every name, e-mail address and phone number kept for this event. Use it when the event is over and you no longer need them.")),
        h("p", { class: "center", style: "margin-bottom:4px" }, t("To unlock the button, type this number:")), h("code", { class: "code s", "data-test": "shred-number" }, num), field(t("Type the number here"), typed),
        h("label", { class: "choice" }, sure, h("div", null, h("b", null, t("I understand this cannot be undone")))), go2, why2, slot2), reqCard());
  }
  function reqCard() {
    const list = h("div"); const go = h("button", { class: "btn", "data-test": "req-load", onclick: load }, t("Show the privacy requests"));
    async function load() {
      await busy(go, async () => {
        mount(list, loading());
        try {
          const r = await ctx.call.get("/privacy/requests");
          if (!r.requests.length) return mount(list, msg("info", t("No privacy requests."), null, null));
          mount(list, r.requests.map(reqRow));
        } catch (e) { mount(list, errorBox(e, load)); }
      });
    }
    function reqRow(q) {
      const slot = h("div"); const act = radios("res-" + q.id, [{ value: "done", label: t("Done") }, { value: "refused", label: t("Refused (with a reason)") }], "done"); const note = h("textarea", { rows: 2, maxlength: 500, "data-test": "res-note", placeholder: t("What was done, or why not. At least 5 letters.") });
      const go2 = h("button", { class: "btn", "data-test": "res-go", onclick: () => busy(go2, async () => {
        if (note.value.trim().length < 5) { mount(slot, msg("bad", t("Write a short note (at least 5 letters)."), null, null)); return; }
        try { await ctx.call.post(`/privacy/requests/${q.id}/resolve`, { action: act.value(), note: note.value.trim() }); await done({ kind: "ok", title: t("Answer recorded."), body: null, fix: null }); } catch (e) { mount(slot, errorBox(e, () => go2.click())); }
      }) }, t("Save the answer"));
      return h("div", { class: "card tint", "data-test": "req-" + q.id }, h("div", { class: "row" }, h("b", null, t(REQ_WORDS[q.type] || q.type)), h("span", { class: "badge " + (q.status === "open" ? "warn" : "ok") }, q.status === "open" ? t("Open") : q.status === "done" ? t("Done") : t("Refused")), h("span", { class: "muted small" }, fmtTime(q.atMs, tz))),
        q.erased ? h("p", { class: "muted" }, t("The details of this request were erased.")) : h("div", { class: "working", style: "margin:8px 0" }, h("div", { class: "lbl" }, t("Visible only to you, only here")), q.note ? h("p", { style: "white-space:pre-wrap" }, q.note) : null, q.name ? h("p", null, q.name + (q.email ? " · " + q.email : "")) : null),
        q.status === "open" ? [act, field(t("Your answer"), note), go2, slot] : null);
    }
    return h("div", { class: "card" }, h("h2", null, t("Privacy requests")), h("p", { class: "muted" }, t("People can ask to see, correct or erase their details, withdraw consent, or complain. Answer within 30 days. Opening this list is recorded on the public page.")), go, list);
  }

  // ------------------------------------------------------------ 5. e-mail the report
  function secReport() {
    const to = h("textarea", { rows: 3, "data-test": "report-to", placeholder: t("One or more e-mail addresses, separated by commas (up to 10)"), "aria-label": t("E-mail addresses") }), slot = h("div");
    const go = h("button", { class: "btn big", "data-test": "report-go", onclick: () => busy(go, async () => {
      const list = to.value.split(/[,\s;]+/).map((x) => x.trim()).filter(Boolean);
      if (!list.length || list.length > 10 || list.some((x) => !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(x))) { mount(slot, msg("bad", t("Check the e-mail addresses."), t("Give 1 to 10 addresses, separated by commas."), null)); return; }
      try { await ctx.call.post("/report/email", { to: list }); mount(slot, msg("ok", t("The report was sent."), null, null)); } catch (e) { mount(slot, errorBox(e, () => go.click())); }
    }) }, t("Send the report"));
    mount(body, h("div", { class: "card" }, h("h2", null, t("E-mail the final report")), h("p", { class: "muted" }, t("Available once the report has been published. The addresses are used to send this one e-mail.")), field(t("To"), to), go, slot));
  }
}

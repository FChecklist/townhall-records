// Team Desk: the Attendance Monitor cannot come on the day. The Organizer or a Host has two ways forward, both a signed entry in the log with the reason (see "Who did what" in the Record):
//   1. take the check-in over (POST /checkin/takeover {on:true, reason}) and hand it back later ({on:false});
//   2. replace the Monitor with another person (POST /people {role:"attendance_officer", replaces:<pid>, reason, name, email}).
// Used by desk-team.js (the Team section) and desk-checkin.js (the banner while the check-in is taken over). Nothing private is shown: names are the hidden form from the public model.
import { h, t, field, errorBox, msg, busy, toast, fmtTime } from "/assets/core.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const attendanceOpen = (m) => ["agenda_published", "live", "postponed"].includes(m.status);

/** Who the Monitors are right now (people with the Attendance Monitor role). */
export const monitorsOf = (m) => (m.people || []).filter((p) => (p.roles || []).includes("attendance_officer"));

/** Hand the check-in back to the Monitor. Used by both the Team card and the Check-in banner. */
export async function handBack(ctx) {
  await ctx.call.post("/checkin/takeover", { on: false });
  toast(t("Handed back. The Attendance Monitor does the check-in again."));
  await ctx.refresh();
}

/** The banner on the Check-in section while an Organizer or Host has taken the check-in over. Returns null when it has not been taken over, or for a person who is not on the Organizer/Host side. */
export function takeoverBanner(ctx) {
  const tk = ctx.model.checkinTakeover; const staff = (ctx.roles || []).some((r) => r === "organizer" || r === "host");
  if (!tk || !staff) return null;
  const out = h("div");
  return h("div", { class: "card tint", "data-test": "takeover-banner" },
    h("b", null, t("You are doing the check-in because the Attendance Monitor is absent.")),
    h("p", { class: "small", style: "margin:6px 0" }, t("Reason: ") + tk.reason + " · " + fmtTime(tk.ts, ctx.model.timezone) + " · " + tk.byName),
    h("p", { class: "small muted", style: "margin:0 0 8px" }, t("Your marks are recorded as made by you, not by an independent Monitor.")),
    h("button", { class: "btn ghost", "data-test": "takeover-handback-banner", onclick: (ev) => { out.replaceChildren(); busy(ev.currentTarget, async () => { try { await handBack(ctx); } catch (e) { out.replaceChildren(errorBox(e)); } }); } }, t("Hand the check-in back")), out);
}

/**
 * The Team section card. `done(text)` re-draws the Team section after a change; `fail(e, retry)` shows an error.
 * Returns null when there is no Attendance Monitor to be absent.
 */
export function absentCard(ctx, done, fail) {
  const m = ctx.model, mons = monitorsOf(m); if (!mons.length) return null;
  const tk = m.checkinTakeover, can = attendanceOpen(m);
  const reason = h("input", { type: "text", maxlength: 160, placeholder: t("For example: the Monitor is ill and cannot come"), "data-test": "absent-reason", "aria-label": t("Why the Attendance Monitor cannot do the check-in") });
  const out = h("div", { "data-test": "absent-result" });
  const need = () => { out.replaceChildren(); reason.classList.remove("err"); if (reason.value.trim().length < 3) { reason.classList.add("err"); out.replaceChildren(msg("bad", t("Please say why, in a few words."), t("The reason is written in the record."), null)); reason.focus(); return false; } return true; };

  if (tk) {
    return h("div", { class: "card", "data-test": "absent-card" }, h("h3", null, t("If the Attendance Monitor cannot come")),
      msg("ok", t("The check-in is taken over."), t("Reason: ") + tk.reason + " · " + fmtTime(tk.ts, m.timezone) + " · " + tk.byName, t("The Organizer and Hosts can now check people in. Hand it back when the Monitor arrives.")),
      h("div", { class: "row", style: "margin-top:10px" }, h("button", { class: "btn gold", "data-test": "takeover-handback", onclick: (ev) => { out.replaceChildren(); busy(ev.currentTarget, async () => { try { await handBack(ctx); } catch (e) { fail(e); } }); } }, t("Hand the check-in back to the Monitor"))), out);
  }

  // ---- replace the Monitor: a small form that opens under the button
  const slot = h("div", { "data-test": "replace-slot" });
  function openReplace() {
    if (!need()) return;
    const which = mons.length > 1 ? h("select", { "aria-label": t("Which Attendance Monitor is replaced"), "data-test": "replace-which" }, mons.map((p) => h("option", { value: p.pid }, p.maskedName))) : null;
    const nm = h("input", { type: "text", maxlength: 80, autocomplete: "off", "data-test": "replace-name", "aria-label": t("Name of the new Attendance Monitor") });
    const em = h("input", { type: "email", maxlength: 120, autocomplete: "off", "data-test": "replace-email", "aria-label": t("E-mail of the new Attendance Monitor") });
    const ph = h("input", { type: "tel", maxlength: 20, autocomplete: "off", "data-test": "replace-phone", "aria-label": t("Mobile number (optional)") });
    const eout = h("div");
    const go = h("button", { class: "btn gold", "data-test": "replace-go", onclick: (ev) => {
      eout.replaceChildren(); nm.classList.remove("err"); em.classList.remove("err");
      let bad = false;
      if (nm.value.trim().length < 2) { nm.classList.add("err"); bad = true; }
      if (!EMAIL_RE.test(em.value.trim())) { em.classList.add("err"); bad = true; }
      if (bad) { eout.replaceChildren(msg("bad", t("Please type the new person's name and a correct e-mail."), null, null)); return; }
      busy(ev.currentTarget, async () => {
        try { await ctx.call.post("/people", { role: "attendance_officer", name: nm.value.trim(), email: em.value.trim(), ...(ph.value.trim() ? { phone: ph.value.trim() } : {}), replaces: which ? which.value : mons[0].pid, reason: reason.value.trim() }); await done(t("Done. The new Attendance Monitor was sent a sign-in code. The old one no longer has the role.")); }
        catch (e) { eout.replaceChildren(errorBox(e)); }
      });
    } }, t("Replace the Monitor"));
    slot.replaceChildren(h("div", { class: "card tint", "data-test": "replace-form" }, h("h4", { style: "margin:0 0 6px" }, t("Who takes over from the Monitor?")), which ? field(t("Which Monitor is replaced"), which) : null,
      field(t("Name"), nm), field(t("E-mail"), em), field(t("Mobile number (optional)"), ph, t("Only for the team. Never shown to members.")), h("div", { class: "row", style: "margin-top:10px" }, go, h("button", { class: "btn ghost", "data-test": "replace-cancel", onclick: () => slot.replaceChildren() }, t("Cancel"))), eout));
  }

  const takeBtn = h("button", { class: "btn gold", "data-test": "takeover-go", disabled: !can, "aria-disabled": can ? null : "true", onclick: (ev) => { if (!need()) return; busy(ev.currentTarget, async () => { try { await ctx.call.post("/checkin/takeover", { on: true, reason: reason.value.trim() }); await done(t("Done. You can now check people in. It is written in the record.")); } catch (e) { fail(e); } }); } }, t("I will do the check-in myself"));
  const repBtn = h("button", { class: "btn", "data-test": "replace-open", onclick: openReplace }, t("Replace the Monitor"));
  return h("div", { class: "card", "data-test": "absent-card" }, h("h3", null, t("If the Attendance Monitor cannot come")),
    h("p", { class: "muted" }, t("The Organizer or a Host can do the check-in instead, or appoint another person. Either way the reason and the time are written in the record.")),
    field(t("Why (a few words)"), reason),
    h("div", { class: "row", style: "margin-top:10px" }, takeBtn, repBtn),
    can ? null : h("p", { class: "why-off", "data-test": "absent-why" }, t("Check-in opens once the notice is published.")),
    out, slot);
}

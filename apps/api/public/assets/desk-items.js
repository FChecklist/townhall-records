// Team Desk screens for four small additions: change the title and place, remove an agenda point, see the flat list, ask for a name correction.
// One module so the long desk files (desk-setup.js, desk-ballot.js, desk-checkin.js) change by a line each; see docs/ui-api-requests.md for why each one was wanted.
// Nothing here shows a private value: the flat list and the requests carry flat numbers, vote weights and reasons only, never a name.
import { h, t, field, radios, errorBox, msg, busy, toast, modal, fmtTime } from "/assets/core.js";

const card = (...kids) => h("div", { class: "card" }, kids);
// the four reasons the server accepts for a name correction (POST /flats/:flat/change-request): [key, label, help]
const REASONS = [
  ["spelling", "The spelling of the name is wrong", "A letter or a word is wrong."],
  ["owner_changed", "The owner has changed", "The flat has a new owner or holder."],
  ["wrong_flat", "The name sits against the wrong flat", "This person belongs to another flat number."],
  ["other", "Another reason", "The Organizer or Host will ask you."],
];
const REASON_WORD = Object.fromEntries(REASONS.map(([key, label]) => [key, label]));

/** Setup step 1: change the title and the main place until the meeting starts (PUT /basics). `act` is the setup wizard's save helper. */
export function basicsCard(ctx, act) {
  const m = ctx.model, box = h("div"), frozen = m.status === "live" || m.status === "closed";
  const title = h("input", { type: "text", value: m.title || "", maxlength: "160", disabled: frozen, "data-test": "basics-title", "aria-label": t("Title of the meeting") });
  const venue = h("input", { type: "text", value: m.venue || "", maxlength: "200", disabled: frozen, "data-test": "basics-venue", "aria-label": t("Main place") });
  const reason = h("input", { type: "text", maxlength: "200", disabled: frozen, placeholder: t("For example: the hall has changed"), "data-test": "basics-reason", "aria-label": t("Reason for the change") });
  const save = h("button", { class: "btn", "data-test": "basics-save", disabled: frozen, onclick: async () => {
    const ti = title.value.trim(), ve = venue.value.trim();
    if (ti.length < 3 || ve.length < 2) { box.replaceChildren(msg("bad", t("The title needs at least 3 letters and the place at least 2."), null, t("Fix the boxes and press the button again."))); return; }
    if (ti === (m.title || "") && ve === (m.venue || "")) { box.replaceChildren(msg("info", t("Nothing has changed."), null, null)); return; }
    await act(box, save, () => ctx.call.put("/basics", { title: ti, venue: ve, ...(reason.value.trim() ? { reason: reason.value.trim() } : {}) }), { ok: t("Title and place saved."), step: 0 });
  } }, t("Save the title and place"));
  return card(h("h3", null, t("Title and main place")),
    field(t("Title"), title), field(t("Main place"), venue, t("A time below that still uses the old place moves to the new one.")),
    field(t("Reason (optional)"), reason, t("It is shown on the public record, with the old and the new words.")),
    box, h("div", { style: "margin-top:14px" }, save),
    frozen ? h("div", { class: "why-off", "data-test": "basics-why" }, t("The title and place are fixed once the meeting has started."))
      : h("p", { class: "muted small", "data-test": "basics-mail-note", style: "margin-top:10px" }, m.status === "setup"
        ? t("Nobody has had the notice yet, so no mail is sent. Once the notice is out, a change is mailed to members who have an e-mail on the flat list.")
        : t("Members who have an e-mail on the flat list are sent a short mail with the old and the new words. Members without one are not: tell them yourself if the change matters.")));
}

/** Setup step 4, agenda list: ask why, then take a point off the agenda (POST /points/:pid/remove). Only for a point whose voting has not opened. Resolves true when it was removed.
 *  Before the notice is published the point is simply removed. After that it is NEVER deleted: it is WITHDRAWN, a reason is required, and it stays on the record and in the minutes. */
export function removePointDialog(ctx, p) {
  const out_ = ctx.model.status !== "setup"; // the notice has gone out
  return new Promise((done) => {
    const why = h("input", { type: "text", maxlength: "200", placeholder: out_ ? t("For example: the committee dropped this item") : t("For example: this item is already dealt with"), "data-test": "point-remove-reason", "aria-label": out_ ? t("Reason for withdrawing this point") : t("Reason for removing this point") });
    const out = h("div");
    let dlg = null;
    const yes = h("button", { class: "btn", "data-test": "point-remove-yes", onclick: async () => {
      out.replaceChildren();
      if (out_ && why.value.trim().length < 3) { why.classList.add("err"); out.replaceChildren(msg("bad", t("Please say why, in a few words."), null, t("The notice has already gone out, so the reason is kept on the record."))); return; }
      try { await busy(yes, () => ctx.call.post(`/points/${p.pointId}/remove`, { reason: why.value.trim() })); dlg.close(); toast(out_ ? t("The point was withdrawn. It stays on the record.") : t("The point was removed.")); await ctx.refresh(); done(true); }
      catch (e) { out.replaceChildren(errorBox(e)); }
    } }, out_ ? t("Yes, withdraw it") : t("Yes, remove it"));
    dlg = modal([h("h3", null, out_ ? t("Withdraw this point?") : t("Remove this point?")),
      h("p", { "data-test": "point-remove-text" }, `${t("Point")} ${p.number}: ${p.title}. ` + (out_
        ? t("The notice has already gone out, so the point is not deleted. It stays on the record and in the minutes as Withdrawn, with your reason and the time.")
        : t("It leaves the agenda. The record keeps that you removed it, with the time."))),
      field(out_ ? t("Reason (required, a few words)") : t("Reason (a few words)"), why), out,
      h("div", { class: "row", style: "justify-content:flex-end;margin-top:16px" }, h("button", { class: "btn ghost", "data-test": "point-remove-no", onclick: () => { dlg.close(); done(false); } }, t("No, keep it")), yes)]);
  });
}

/** Setup step 4: the points withdrawn after the notice went out, kept on screen (grey) with the reason and the time. Returns a card, or null when there are none. */
export function withdrawnCard(ctx) {
  const w = ctx.model.withdrawn || []; if (!w.length) return null;
  return card(h("h3", null, t("Withdrawn points")), h("p", { class: "muted small" }, t("These points were taken off the agenda after the notice went out. They are not deleted: they stay on the record and in the minutes.")),
    h("div", { class: "tw" }, h("table", { class: "t", "data-test": "withdrawn-list" }, h("thead", null, h("tr", null, [t("No."), t("Point"), t("Status"), t("Reason"), t("When")].map((x) => h("th", null, x)))),
      h("tbody", null, w.map((x) => h("tr", { "data-test": "withdrawn-" + x.number }, h("td", null, x.number), h("td", null, x.title), h("td", null, h("span", { class: "badge warn" }, t("Withdrawn"))), h("td", null, x.reason), h("td", null, fmtTime(x.ts, ctx.model.timezone))))))));
}

/** Setup step 3: the flat list as a table (from the public model: flat, weight, can vote) and the name corrections an Attendance Monitor asked for. Returns a list of cards. */
export function flatListCards(ctx) {
  const m = ctx.model, roll = m.roll || [], asks = m.changeRequests || [], MAX = 300, out = [];
  if (roll.length) {
    const head = h("thead", null, h("tr", null, [t("Flat"), t("Vote weight"), t("Can vote")].map((x) => h("th", null, x))));
    const body = h("tbody", null, roll.slice(0, MAX).map((f) => h("tr", null, h("td", null, f.flatNo), h("td", null, String(f.weight)), h("td", null, f.eligible ? t("Yes") : t("No")))));
    out.push(card(h("details", { "data-test": "roll-list" }, h("summary", { style: "cursor:pointer;font-weight:600" }, t("See every flat on the list")),
      h("p", { class: "muted small" }, t("Flat numbers and vote weights only. Names are never shown here.")),
      h("div", { class: "tw" }, h("table", { class: "t", "data-test": "roll-table" }, head, body)),
      roll.length > MAX ? h("p", { class: "muted small" }, `${t("Showing the first")} ${MAX} ${t("of")} ${roll.length}.`) : null)));
  }
  if (asks.length) {
    const head = h("thead", null, h("tr", null, [t("Flat"), t("Why"), t("When")].map((x) => h("th", null, x))));
    const body = h("tbody", null, asks.map((a) => h("tr", null, h("td", null, a.flatNo), h("td", null, t(REASON_WORD[a.reason] || "Another reason")), h("td", null, fmtTime(a.ts, m.timezone)))));
    out.push(card(h("h3", null, t("Name corrections asked for")),
      h("p", { class: "muted small" }, t("An Attendance Monitor saw a name that does not match the person at the door. To fix a name, save the right contact under \"Add a flat holder's contact\" below, or upload a corrected list.")),
      h("div", { class: "tw" }, h("table", { class: "t", "data-test": "change-requests" }, head, body))));
  }
  return out;
}

/** Check-in, "the name is wrong": the Monitor taps a reason and it goes to the Organizer and Host (POST /flats/:flat/change-request). No name is typed. `k` = the check-in screen's own helpers. */
export function wrongNameScreen(k) {
  const { C, stepTitle, bar, backBtn, blank, draw } = k, s = C.s;
  if (s.sent) {
    return [stepTitle(2, t("Sent to the Organizer and Host")),
      h("div", { class: "card", "data-test": "wrong-sent" },
        msg("ok", t("Your request was sent."), t("The Organizer and Host will see it in Setup and in the Record. Nothing was changed on the list."), t("Do not check this person in until the name is fixed.")),
        h("button", { class: "btn gold big", style: "width:100%;margin-top:8px", "data-test": "wrong-done", onclick: () => { Object.assign(s, { ...blank(), step: "pick" }); draw(); } }, t("Done: pick another flat"))),
      bar(null, null)];
  }
  const slot = h("div", { "data-test": "wrong-slot" });
  const why = radios("why", REASONS.map(([value, label, desc]) => ({ value, label: t(label), desc: t(desc) })), "");
  const send = h("button", { class: "btn gold big", "data-test": "wrong-send", onclick: async () => {
    slot.replaceChildren(); const reason = why.value();
    if (!reason) { slot.replaceChildren(msg("bad", t("Choose what is wrong first."), null, t("Tap one of the choices above, then press the button again."))); return; }
    try { await busy(send, () => C.ctx.call.post(`/flats/${encodeURIComponent(s.flat)}/change-request`, { reason })); s.checks.name_matches = false; s.sent = true; draw(); window.scrollTo({ top: 0 }); }
    catch (e) { slot.replaceChildren(errorBox(e)); }
  } }, t("Send to the Organizer and Host"));
  return [stepTitle(2, t("What is wrong with the name?")),
    h("div", { class: "card" }, h("p", null, t("You cannot change the list from here. That is on purpose: only the Organizer or Host may change it, and every change is recorded.")), why, slot),
    h("div", { class: "card tint" }, h("p", { class: "small muted", style: "margin:0" }, t("No name is typed here. Only the flat number and your reason are sent."))),
    bar(backBtn("check", t("Back to the check")), send)];
}

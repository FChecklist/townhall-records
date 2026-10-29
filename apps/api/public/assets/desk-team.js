// Team Desk module: the team (Hosts, Attendance Monitors) and the optional "Committee, officers and observers" list.
// Used as the "Team" tab and by Setup step 5 ("Helpers"). Contract: export async function renderTeam(ctx, el).
import { h, mount, t, get, field, radios, checks, wwh, errorBox, msg, confirmBox, toast, busy, loading } from "/assets/core.js";

const ROLE_WORD = { organizer: "Organizer", host: "Host", attendance_officer: "Attendance Monitor" };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function clearErrs(root) { for (const n of root.querySelectorAll("[data-err]")) n.remove(); for (const n of root.querySelectorAll(".err")) n.classList.remove("err"); }
function errAt(input, text) {
  input.classList.add("err");
  input.after(h("div", { class: "hint", role: "alert", "data-err": "1", "data-test": "error", style: "color:var(--bad);font-weight:600" }, text));
  return false;
}

export async function renderTeam(ctx, el) {
  const isStaff = ctx.roles.some((r) => r === "organizer" || r === "host") && !!ctx.priv;
  if (!isStaff) {
    mount(el, wwh(t("Attendance Monitor"), t("Nothing to do here."), t("Use the Check-in tab."), t("Only the Organizer or a Host manages the team.")),
      msg("info", t("This part is for the Organizer or Host."), t("Ask the Organizer if the team needs a change."), null));
    return;
  }
  mount(el, loading());
  let team, groups = [];
  try {
    [team, groups] = await Promise.all([ctx.call.get("/team"), get("/api/officials/groups").then((g) => g.groups || []).catch(() => [])]);
  } catch (e) { mount(el, errorBox(e, () => renderTeam(ctx, el))); return; }

  const m = ctx.model, c = team.counts, lim = team.limits;
  const people = m.people || [];
  const hostWhy = t("The team already has ") + lim.hostsInclOrganizer + t(" Hosts (the Organizer counts as one). Remove a Host first.");
  const monWhy = t("There are already ") + lim.monitorsOnly + t(" Attendance Monitors. Remove one first.");
  const anyOpen = team.canAdd.host || team.canAdd.attendance_officer;
  const out = h("div", { "data-test": "team-result" });
  const fail = (e, retry) => { out.replaceChildren(errorBox(e, retry)); out.scrollIntoView({ block: "center", behavior: "smooth" }); };
  const done = async (text) => { toast(text); out.replaceChildren(); await ctx.refresh(); };

  // ---- counts
  const counts = h("div", { class: "card", "data-test": "counts" }, h("h3", null, t("Your team")),
    h("div", { class: "row" },
      h("span", { class: "badge gold", "data-test": "count-hosts" }, t("Hosts ") + c.hostsInclOrganizer + t(" of ") + lim.hostsInclOrganizer),
      h("span", { class: "badge gold", "data-test": "count-monitors" }, t("Attendance Monitors ") + c.monitorsOnly + t(" of ") + lim.monitorsOnly + " " + t("(up to ") + lim.monitorsTotal + t(" if the Organizer or Hosts also monitor)"))),
    h("p", { class: "muted small", style: "margin-top:10px" }, t("A Host is also called a Co-host. The Organizer counts as one of the Hosts. Hosts can do everything the Organizer can, except payment. Attendance Monitors check people in on the day.")));

  // ---- people
  async function removeRole(p, role) {
    const ok = await confirmBox(t("Are you sure?"), t("Remove ") + p.maskedName + t(" as ") + t(ROLE_WORD[role]) + t("? They will not be able to work on this event any more."), t("Yes, remove"), t("No"));
    if (!ok) return;
    try { await ctx.call.post(`/people/${p.pid}/remove`, { role }); await done(t("Removed.")); } catch (e) { fail(e, () => removeRole(p, role)); }
  }
  async function toggleMonitor(p, on, box) {
    try {
      if (on) await ctx.call.post("/people", { personId: p.pid, role: "attendance_officer" }); else await ctx.call.post(`/people/${p.pid}/remove`, { role: "attendance_officer" });
      await done(on ? t("Done. This person can now also check people in.") : t("Done. This person no longer checks people in."));
    } catch (e) { box.checked = !on; fail(e); }
  }
  async function saveLabel(p, value, btn) {
    const label = value.trim(); out.replaceChildren();
    if (label.length < 2 || label.length > 40) { out.replaceChildren(msg("bad", t("The label must be 2 to 40 letters."), t("Example: Secretary, Treasurer, Chairman."), null)); return; }
    const role = p.roles.find((r) => r === "host") || p.roles.find((r) => r === "attendance_officer");
    await busy(btn, async () => {
      try {
        try { await ctx.call.post(`/people/${p.pid}/label`, { label }); }
        catch (e) { if (e.status !== 404 || !role) throw e; await ctx.call.post("/people", { personId: p.pid, role, label }); }
        await done(t("Label saved."));
      } catch (e) { fail(e); }
    });
  }
  function personRow(p) {
    const me = p.pid === ctx.pid; const canMon = p.roles.includes("organizer") || p.roles.includes("host"); const isMon = p.roles.includes("attendance_officer");
    const monOff = !isMon && c.monitorsTotal >= lim.monitorsTotal;
    const lab = h("input", { type: "text", maxlength: 40, value: p.label || "", placeholder: t("e.g. Secretary"), "aria-label": t("Label for ") + p.maskedName, "data-test": "label-" + p.pid, style: "max-width:220px" });
    const labBtn = h("button", { class: "btn ghost", "data-test": "label-save-" + p.pid, style: "min-height:46px", onclick: (ev) => saveLabel(p, lab.value, ev.currentTarget) }, t("Save label"));
    const monBox = canMon ? h("input", { type: "checkbox", checked: isMon, disabled: monOff, "data-test": "also-monitor-" + p.pid, onchange: (ev) => toggleMonitor(p, ev.target.checked, ev.target) }) : null;
    return h("div", { class: "card tint", style: "margin-bottom:10px", "data-test": "person-" + p.pid },
      h("div", { class: "row" }, h("div", { class: "sp" }, h("b", { class: "mono", "data-test": "pname" }, p.maskedName), me ? " " + t("(you)") : "", h("div", { class: "muted small mono" }, p.maskedEmail)),
        h("div", { class: "row" }, p.roles.map((r) => h("span", { class: "badge", "data-test": "role-" + r }, t(ROLE_WORD[r] || r))), p.verified ? h("span", { class: "badge ok", "data-test": "verified" }, "✓ " + t("E-mail confirmed")) : h("span", { class: "badge warn", "data-test": "unverified" }, t("Not signed in yet")))),
      p.roles.some((r) => r !== "organizer") ? h("div", { class: "row", style: "margin-top:10px" }, lab, labBtn) : p.label ? h("div", { class: "small muted", style: "margin-top:6px" }, t("Label: ") + p.label) : null,
      monBox ? h("label", { class: "choice", style: "margin-top:10px" + (monOff ? ";opacity:.7" : "") }, monBox, h("div", null, h("b", null, me ? t("I will also act as an Attendance Monitor") : t("Also acts as an Attendance Monitor")), monOff ? h("span", { class: "d", style: "color:var(--warn)" }, t("All ") + lim.monitorsTotal + t(" Attendance Monitor places are taken. Remove a monitor first.")) : h("span", { class: "d" }, t("Tick this if this person will also check people in at the door.")))) : null,
      h("div", { class: "row", style: "margin-top:10px" }, p.roles.filter((r) => r !== "organizer" && !(canMon && r === "attendance_officer")).map((r) => h("button", { class: "btn ghost", "data-test": "remove-" + r + "-" + p.pid, onclick: () => removeRole(p, r) }, t("Remove as ") + t(ROLE_WORD[r])))));
  }
  const list = h("div", { "data-test": "people" }, people.map(personRow));

  // ---- add person
  const name = h("input", { type: "text", maxlength: 80, autocomplete: "off", "data-test": "add-name", "aria-label": t("Name") });
  const email = h("input", { type: "email", maxlength: 120, autocomplete: "off", "data-test": "add-email", "aria-label": t("E-mail") });
  const phone = h("input", { type: "tel", maxlength: 20, autocomplete: "off", "data-test": "add-phone", "aria-label": t("Mobile number") });
  const label = h("input", { type: "text", maxlength: 40, autocomplete: "off", "data-test": "add-label", "aria-label": t("Label") });
  const roleR = radios("role", [
    { value: "host", label: t("Host"), desc: t("Helps the Organizer run the meeting. Can set up and run voting."), disabled: !team.canAdd.host, reason: hostWhy },
    { value: "attendance_officer", label: t("Attendance Monitor"), desc: t("Checks people in at the door on the day. Cannot change the setup."), disabled: !team.canAdd.attendance_officer, reason: monWhy },
  ], team.canAdd.host ? "host" : team.canAdd.attendance_officer ? "attendance_officer" : "");
  const add = h("button", { class: "btn gold big", "data-test": "add-person", disabled: !anyOpen, onclick: (ev) => {
    clearErrs(form); out.replaceChildren(); let ok = true;
    const nm = name.value.trim(), em = email.value.trim(), ph = phone.value.trim(), lb = label.value.trim(), role = roleR.value();
    if (nm.length < 2) ok = errAt(name, t("Please type the person's name."));
    if (!EMAIL_RE.test(em)) ok = errAt(email, t("Please type a correct e-mail, like name@example.com."));
    if (ph && (ph.replace(/\D/g, "").length < 7 || !/^[+()\d\s-]{7,20}$/.test(ph))) ok = errAt(phone, t("That mobile number looks wrong. Use digits only, or leave it empty."));
    if (lb && (lb.length < 2 || lb.length > 40)) ok = errAt(label, t("The label must be 2 to 40 letters, or leave it empty."));
    if (!role) { out.replaceChildren(msg("bad", t("Please choose Host or Attendance Monitor."), null, null)); ok = false; }
    if (!ok) return;
    busy(ev.currentTarget, async () => {
      try {
        await ctx.call.post("/people", { name: nm, email: em, ...(ph ? { phone: ph } : {}), role, ...(lb ? { label: lb } : {}) });
        await done(t("Added. We e-mailed them a sign-in code."));
      } catch (e) { fail(e); }
    });
  } }, t("Add this person"));
  const form = h("div", { class: "card", "data-test": "add-form" }, h("h3", null, t("Add a person")),
    h("p", { class: "muted" }, t("We e-mail them a code and a sign-in link. Their name is hidden on the public page.")),
    h("div", { class: "grid g2" }, h("div", null, field(t("Name"), name), field(t("E-mail"), email)), h("div", null, field(t("Mobile number (optional)"), phone, t("Only for the team. Never shown to members.")), field(t("Label (optional)"), label, t("A title shown next to the name, like Secretary. It gives no extra rights.")))),
    h("label", { class: "f" }, t("What will this person do?")), roleR,
    h("div", { style: "margin-top:14px" }, add, !anyOpen ? h("div", { class: "why-off", "data-test": "why-off" }, t("The team is full. Remove someone first, or tick \"also acts as an Attendance Monitor\" on a Host's row.")) : null));

  // ---- committee, officers, observers (optional)
  const offBox = h("div", { "data-test": "officials" });
  const locked = m.status === "live" || m.status === "closed";
  const lockWhy = t("The list is published before the meeting starts, so it cannot change now. It opens again if the meeting is postponed.");
  function officialsView() {
    const offs = m.officials || [];
    const editor = h("div");
    function openEditor(o) {
      const g = groups.length ? groups : [{ id: "other", label: "Other (write the title yourself)", example: "Auditor" }];
      const sel = h("select", { "aria-label": t("Group"), "data-test": "off-group", onchange: () => { const x = g.find((q) => q.id === sel.value); head.value = x && x.id !== "other" ? x.label : ""; head.placeholder = x ? x.example : ""; } }, g.map((x) => h("option", { value: x.id, selected: o && o.group === x.id }, x.label)));
      const x0 = g.find((q) => q.id === (o ? o.group : g[0].id)) || g[0];
      const head = h("input", { type: "text", maxlength: 100, value: o ? o.groupLabel || "" : x0.id !== "other" ? x0.label : "", placeholder: x0.example, "data-test": "off-heading", "aria-label": t("Heading") });
      const nm = h("input", { type: "text", maxlength: 120, value: o ? o.name : "", "data-test": "off-name", "aria-label": t("Name") });
      const des = h("input", { type: "text", maxlength: 160, value: o ? o.designation || "" : "", "data-test": "off-designation", "aria-label": t("Designation") });
      const aut = h("input", { type: "text", maxlength: 200, value: o ? o.authority || "" : "", "data-test": "off-authority", "aria-label": t("Authority or status") });
      const nt = h("input", { type: "text", maxlength: 300, value: o ? o.note || "" : "", "data-test": "off-note", "aria-label": t("Note") });
      const eout = h("div");
      const save = h("button", { class: "btn gold", "data-test": "off-save", onclick: (ev) => {
        clearErrs(editor); eout.replaceChildren(); if (nm.value.trim().length < 2) { errAt(nm, t("Please type the person's name.")); return; }
        busy(ev.currentTarget, async () => {
          try { await ctx.call.post("/officials", { group: sel.value, groupLabel: head.value.trim(), name: nm.value.trim(), designation: des.value.trim(), authority: aut.value.trim(), note: nt.value.trim(), ...(o ? { id: o.id } : {}) }); await done(o ? t("Saved.") : t("Added.")); }
          catch (e) { eout.replaceChildren(errorBox(e)); }
        });
      } }, o ? t("Save changes") : t("Add to the list"));
      editor.replaceChildren(h("div", { class: "card tint", "data-test": "off-form" }, h("h4", { style: "margin:0 0 6px" }, o ? t("Change this entry") : t("Add an entry")),
        field(t("Who is it?"), sel), field(t("Heading (you may change the words)"), head), field(t("Name"), nm), field(t("Designation"), des, t("Example: Retired District Judge.")), field(t("Authority or status"), aut, t("Example: Appointed by the Registrar.")), field(t("Note"), nt),
        h("p", { class: "hint" }, t("Use plain text. Do not type e-mail addresses or phone numbers here; this list is public.")),
        h("div", { class: "row", style: "margin-top:12px" }, save, h("button", { class: "btn ghost", "data-test": "off-cancel", onclick: () => editor.replaceChildren() }, t("Cancel"))), eout));
      editor.scrollIntoView({ block: "center", behavior: "smooth" });
    }
    async function delOff(o) {
      const ok = await confirmBox(t("Are you sure?"), t("Remove ") + o.name + t(" from this list?"), t("Yes, remove"), t("No")); if (!ok) return;
      try { await ctx.call.post("/officials", { id: o.id, remove: true }); await done(t("Removed.")); } catch (e) { fail(e); }
    }
    return h("div", { class: "card", "data-test": "officials-card" },
      h("h3", null, t("Committee, officers and observers")), h("p", { class: "muted" }, t("Anyone else who runs or watches this meeting? (optional - skip if your society has none)")),
      offs.length ? h("div", { class: "tw" }, h("table", { class: "t", "data-test": "officials-table" }, h("thead", null, h("tr", null, ["Role", "Name", "Designation", "Authority", ""].map((x) => h("th", null, t(x))))),
        h("tbody", null, offs.map((o) => h("tr", { "data-test": "official-" + o.id }, h("td", null, o.groupLabel || o.group), h("td", null, o.name), h("td", null, o.designation), h("td", null, o.authority),
          h("td", null, h("div", { class: "row" }, h("button", { class: "btn ghost", disabled: locked, "data-test": "off-edit-" + o.id, onclick: () => openEditor(o) }, t("Edit")), h("button", { class: "btn ghost", disabled: locked, "data-test": "off-delete-" + o.id, onclick: () => delOff(o) }, t("Delete"))))))))) : h("p", { class: "muted", "data-test": "officials-empty" }, t("No one added. That is fine.")),
      h("div", { style: "margin-top:12px" }, h("button", { class: "btn", disabled: locked, "data-test": "off-add", onclick: () => openEditor(null) }, t("Add")), locked ? h("div", { class: "why-off", "data-test": "off-why" }, lockWhy) : null),
      editor);
  }
  offBox.replaceChildren(officialsView());

  mount(el,
    wwh(t("Organizer or Host"), t("Add the people who will help on the day."), t("Fill in the form and press Add. Each person gets a sign-in e-mail."), t("Every action is recorded under the name of the person who did it.")),
    counts, list, out, form, offBox);
}

export const render = renderTeam;

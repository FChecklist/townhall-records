// /start/ : "Start a meeting or election" - five numbered steps with Back / Next, then the e-mailed code.
import { h, $, frame, app, mount, t, get, post, store, field, radios, checks, wwh, stepBar, errorBox, msg, busy, fmtTime, turnstileToken, loading } from "/assets/core.js";
await frame({ active: "/start/" });

const COUNTRIES = [["IN", "India"], ["US", "United States"], ["GB", "United Kingdom"], ["AU", "Australia"], ["NZ", "New Zealand"], ["CA", "Canada"], ["SG", "Singapore"], ["HK", "Hong Kong"], ["MY", "Malaysia"], ["IE", "Ireland"], ["AE", "United Arab Emirates"], ["ZA", "South Africa"], ["DE", "Germany"], ["FR", "France"], ["ES", "Spain"], ["BR", "Brazil"], ["CO", "Colombia"], ["PH", "Philippines"], ["JP", "Japan"], ["TH", "Thailand"], ["CY", "Cyprus"], ["MT", "Malta"], ["NP", "Nepal"], ["LK", "Sri Lanka"], ["BD", "Bangladesh"], ["PK", "Pakistan"], ["KE", "Kenya"], ["NG", "Nigeria"], ["ID", "Indonesia"], ["SA", "Saudi Arabia"], ["QA", "Qatar"], ["KW", "Kuwait"], ["OM", "Oman"], ["BH", "Bahrain"]];
const countryName = (c) => (COUNTRIES.find((x) => x[0] === c) || [c, c])[1];
const TYPE_LABEL = { agm: ["Annual General Meeting (AGM)", "The yearly meeting of all members."], sgm: ["Special General Meeting (SGM)", "A meeting called for one special matter."], committee: ["Committee meeting", "Only the committee members meet."], monthly: ["Monthly meeting", "The regular meeting held each month."], custom: ["Something else", "Any other meeting or election. You write the title."] };
const TYPE_TITLE = { agm: "Annual General Meeting", sgm: "Special General Meeting", committee: "Committee meeting", monthly: "Monthly meeting", custom: "" };
const KINDS = [["AOA", "AOA", "Association of Apartment Owners"], ["RWA", "RWA", "Residents' Welfare Association"], ["HOA", "HOA", "Homeowners' Association"], ["Co-operative society", "Co-operative", "Co-operative housing society"]];
const STEPS = ["Meeting or election", "Your society", "The rules", "When and where", "You and the terms"];

let schema = {}, packs = [], terms = null;
mount(app(), loading());
try {
  [schema, packs, terms] = await Promise.all([get("/api/schema"), get("/api/packs"), get("/api/terms")]);
} catch (e) { mount(app(), errorBox(e, () => location.reload())); throw e; }
const TYPES = (schema.eventTypes && schema.eventTypes.length ? schema.eventTypes : Object.keys(TYPE_LABEL));

// ---------------------------------------------------------------- time helpers (the four milestones are typed as wall-clock time in the chosen time zone)
const browserTz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; } })();
function tzOffset(ms, tz) {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const p = {}; for (const x of f.formatToParts(new Date(ms))) p[x.type] = x.value;
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(ms / 1000) * 1000;
}
function wallToMs(v, tz) {
  const m = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)/.exec(v || ""); if (!m) return NaN;
  const g = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  try { let r = g - tzOffset(g, tz); r = g - tzOffset(r, tz); return r; } catch { return NaN; }
}
const pad = (n) => String(n).padStart(2, "0");
const localStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
function defaultTimes() {
  const d = new Date(); d.setDate(d.getDate() + 14); d.setHours(10, 0, 0, 0);
  const at = (hrs) => localStr(new Date(d.getTime() + hrs * 3600_000));
  return { start: at(0), votingStart: at(0), votingEnd: at(2), end: at(3) };
}
const zones = (() => { let z = []; try { z = Intl.supportedValuesOf("timeZone"); } catch { z = ["Asia/Kolkata", "UTC", "America/New_York", "America/Los_Angeles", "Europe/London", "Australia/Sydney", "Pacific/Auckland", "Asia/Dubai", "Asia/Singapore"]; } return z.includes(browserTz) ? z : [browserTz, ...z]; })();

// ---------------------------------------------------------------- state (everything typed stays here, so Back / Next / a failed send never loses it)
const regionGuess = (() => { const m = /-([A-Za-z]{2})\b/.exec(navigator.language || ""); const c = m ? m[1].toUpperCase() : "IN"; return COUNTRIES.some((x) => x[0] === c) ? c : "IN"; })();
const S = {
  step: 0, kind: "meeting", eventType: "agm", title: "", society: { name: "", address: "", registrationNo: "", kind: "AOA" }, country: regionGuess,
  rulesMode: "pack", packId: "", useRecommended: true, search: "",
  venue: "", tz: browserTz, times: defaultTimes(),
  org: { name: "", email: "", phone: "" }, agree: false, clone: null, cloneCode: "", done: null, sending: false,
};
S.title = TYPE_TITLE.agm;
const priceFor = () => { const p = (schema.priceText || {})[S.country === "IN" ? "india" : "world"] || (S.country === "IN" ? ["Rs 499", "Rs 1499"] : ["USD 5", "USD 15"]); return S.kind === "election" ? p[1] : p[0]; };

// ---------------------------------------------------------------- inline errors in plain words
function clearErrs(root) { for (const n of root.querySelectorAll("[data-err]")) n.remove(); for (const n of root.querySelectorAll(".err")) n.classList.remove("err"); }
function errAt(input, text) {
  if (input.classList) input.classList.add("err");
  const note = h("div", { class: "hint", role: "alert", "data-err": "1", "data-test": "error", style: "color:var(--bad);font-weight:600" }, text);
  (input.closest && input.closest("[data-wrap]") ? input.closest("[data-wrap]") : input).after(note);
  return false;
}
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const ev32 = (s) => { const m = /[0-9a-f]{32}/.exec(String(s || "").replace(/-/g, "").toLowerCase()); return m ? m[0] : null; };
const ti = (attrs) => h("input", { type: "text", autocomplete: "off", ...attrs });

// ---------------------------------------------------------------- the five steps. Each returns {node, check()}; check() saves into S and returns true when all is fine.
function stepKind() {
  const kindR = radios("kind", [{ value: "meeting", label: t("A meeting"), desc: t("Members discuss and vote on resolutions (yes / no / abstain).") }, { value: "election", label: t("An election"), desc: t("Members choose office-bearers or committee members.") }], S.kind, (v) => { S.kind = v; });
  const typeR = radios("etype", TYPES.map((k) => ({ value: k, label: t((TYPE_LABEL[k] || [k])[0]), desc: TYPE_LABEL[k] ? t(TYPE_LABEL[k][1]) : "" })), S.eventType, (v) => { if (!S.title || S.title === TYPE_TITLE[S.eventType]) { S.title = TYPE_TITLE[v] || ""; title.value = S.title; } S.eventType = v; });
  const title = ti({ value: S.title, maxlength: 120, "data-test": "title", "aria-label": t("Title"), oninput: (e) => { S.title = e.target.value; } });
  const code = ti({ value: S.cloneCode, placeholder: t("Paste the old event code or link"), "data-test": "clone-code", "aria-label": t("Old event code"), oninput: (e) => { S.cloneCode = e.target.value; } });
  const cloneOut = h("div", { "data-test": "clone-result" });
  const showClone = () => {
    if (!S.clone) { cloneOut.replaceChildren(); return; }
    const c = S.clone.tpl;
    cloneOut.replaceChildren(msg("ok", t("Copied from: ") + (c.title || t("the old event")), t("Society, rules and settings, ") + (c.flats?.length || 0) + t(" flats and ") + (c.points?.length || 0) + t(" agenda items will be copied. No votes, no attendance and no passcodes are copied. You can change everything later."), null),
      h("button", { class: "btn ghost", "data-test": "clone-remove", onclick: () => { S.clone = null; S.cloneCode = ""; code.value = ""; showClone(); } }, t("Do not copy it")));
  };
  const look = h("button", { class: "btn ghost", "data-test": "clone-look", onclick: async (e) => {
    clearErrs(cloneWrap); const id = ev32(code.value);
    if (!id) { errAt(code, t("That does not look like an event code. It is 32 letters and digits, or a link that contains them.")); return; }
    await busy(e.currentTarget, async () => {
      try {
        const tpl = await get("/api/events/" + id + "/template");
        S.clone = { id, tpl }; S.kind = tpl.kind || S.kind; S.eventType = tpl.eventType || S.eventType; S.title = tpl.title || S.title;
        S.society = { ...S.society, ...(tpl.society || {}) }; S.rulesMode = tpl.packId === "custom-world" ? "own" : "pack"; S.packId = tpl.packId || S.packId; S.useRecommended = false; if (tpl.timezone) S.tz = tpl.timezone;
        render();
      } catch (er) { cloneOut.replaceChildren(errorBox(er)); }
    });
  } }, t("Look it up"));
  const cloneWrap = h("details", { class: "card tint", open: !!S.clone }, h("summary", { style: "cursor:pointer;font-weight:600;min-height:32px" }, t("Start from an old event (optional)")),
    h("p", { class: "muted", style: "margin-top:10px" }, t("Held a meeting with us before? Copy its society, rules and flat list. You will not have to type them again.")),
    field(t("Old event code"), h("div", { class: "row", "data-wrap": "1" }, code, look), t("The code is shown on the old event's page and in your e-mails.")), cloneOut);
  showClone();
  const node = h("div", null, h("h2", null, t("What do you want to run?")), kindR,
    h("h3", { style: "margin-top:22px" }, t("What kind of event is it?")), typeR,
    field(t("Title"), title, t("This is shown to every member. Example: Annual General Meeting 2026.")), cloneWrap);
  return { node, check() {
    clearErrs(node); let ok = true; S.title = title.value.trim();
    if (S.title.length < 3) ok = errAt(title, t("Please type a title of at least 3 letters.")); else if (S.title.length > 120) ok = errAt(title, t("The title is too long. Keep it under 120 letters."));
    return ok;
  } };
}

function stepSociety() {
  const v = S.society;
  const name = ti({ value: v.name, maxlength: 120, "data-test": "society-name", "aria-label": t("Society name"), oninput: (e) => { v.name = e.target.value; } });
  const addr = h("textarea", { rows: 2, maxlength: 240, "data-test": "society-address", "aria-label": t("Address"), oninput: (e) => { v.address = e.target.value; } }, v.address);
  const reg = ti({ value: v.registrationNo, maxlength: 60, "data-test": "society-reg", "aria-label": t("Registration number"), oninput: (e) => { v.registrationNo = e.target.value; } });
  const kindR = radios("skind", KINDS.map(([val, lab, d]) => ({ value: val, label: lab, desc: t(d) })), v.kind, (x) => { v.kind = x; });
  const country = h("select", { "data-test": "country", "aria-label": t("Country"), onchange: (e) => { S.country = e.target.value; } }, COUNTRIES.map(([c, n]) => h("option", { value: c, selected: c === S.country }, n)));
  const node = h("div", null, h("h2", null, t("Tell us about your society")),
    field(t("Society name"), name, t("As written in your registration papers.")),
    field(t("Address"), addr), field(t("Registration number"), reg, t("If you do not have one yet, type: not yet registered.")),
    h("label", { class: "f" }, t("What kind of society is it?")), kindR, field(t("Country"), country, t("This decides the price and the list of rule packs.")));
  return { node, check() {
    clearErrs(node); let ok = true; v.name = name.value.trim(); v.address = addr.value.trim(); v.registrationNo = reg.value.trim(); v.kind = kindR.value() || v.kind; S.country = country.value;
    if (v.name.length < 2) ok = errAt(name, t("Please type the name of your society."));
    if (v.address.length < 2) ok = errAt(addr, t("Please type the address of your society."));
    if (v.registrationNo.length < 1) ok = errAt(reg, t("Please type the registration number, or: not yet registered."));
    return ok;
  } };
}

const CONF = { high: t("High"), medium: t("Medium"), low: t("Low") };
function packGroup(p) {
  const m = /^([A-Z]{2})\b/.exec(p.jurisdiction); const c = m ? m[1] : "US";
  return c;
}
function stepRules() {
  if (S.clone) {
    const c = S.clone.tpl; const p = packs.find((x) => x.id === c.packId);
    const node = h("div", null, h("h2", null, t("The rules")), msg("info", t("The rules are copied from your old event."), (p ? p.name + ". " : "") + t("Every number and setting is copied. You can still change any of them in the next screens after you start."), t("To choose different rules, go back to step 1 and press \"Do not copy it\".")));
    return { node, check() { S.packId = c.packId; return true; } };
  }
  const modeR = radios("rmode", [{ value: "pack", label: t("Use a ready rule pack"), desc: t("Pick your country or state. We fill in the usual notice, quorum and majority rules. You can change every number.") }, { value: "own", label: t("Any country: enter my own bye-law values"), desc: t("Use this if your country or state is not listed, or you want to type the numbers from your own bye-laws.") }], S.rulesMode, (v) => { S.rulesMode = v; sync(); });
  const rec = checks("rec", [{ value: "yes", label: t("Use the recommended settings"), desc: t("Switches on the options most societies need (like the attendance check-list). You can change them later.") }], S.useRecommended ? ["yes"] : [], (vals) => { S.useRecommended = vals.includes("yes"); });
  const search = ti({ type: "search", value: S.search, placeholder: t("Type a country, state or law name"), "data-test": "pack-search", "aria-label": t("Search rule packs"), oninput: (e) => { S.search = e.target.value; drawList(); } });
  const list = h("div", { "data-test": "pack-list", style: "max-height:420px;overflow:auto;border:1px solid var(--line);border-radius:12px;padding:4px 12px" });
  const detail = h("div", { "data-test": "pack-detail" });
  const packWrap = h("div", null, field(t("Find your rules"), search), list, detail);
  const ownNote = h("div", { class: "hidden" }, msg("info", t("You will type your own numbers."), t("After you start, the setup screens ask for the notice days, quorum and majority from your bye-laws."), t("Keep your bye-laws open next to you.")));
  const own = packs.find((x) => x.id === "custom-world");
  function sync() { packWrap.classList.toggle("hidden", S.rulesMode !== "pack"); ownNote.classList.toggle("hidden", S.rulesMode !== "own"); }
  function showDetail() {
    const p = packs.find((x) => x.id === S.packId); if (!p || S.rulesMode !== "pack") { detail.replaceChildren(); return; }
    detail.replaceChildren(h("div", { class: "card tint", style: "margin-top:12px" }, h("b", null, p.name),
      h("p", { class: "small" }, t("How sure we are about our summary of this law: ") + (CONF[p.confidence] || p.confidence) + "."),
      p.needsLawyer ? msg("warn", t("Needs a lawyer's check."), t("We are not lawyers. Please compare these rules with your own bye-laws and ask a lawyer if in doubt."), null) : msg("info", t("No lawyer check is flagged for this pack."), t("Still compare it with your own bye-laws. We do not decide what the law is."), null),
      p.recommended && p.recommended.length ? h("div", null, h("b", { class: "small" }, t("Recommended settings in this pack:")), h("ul", { class: "small" }, p.recommended.map((r) => h("li", null, r)))) : null));
  }
  function drawList() {
    const q = S.search.trim().toLowerCase();
    const items = packs.filter((p) => p.id !== "custom-world" && (!q || (p.name + " " + p.jurisdiction + " " + p.id + " " + countryName(packGroup(p))).toLowerCase().includes(q)));
    const groups = new Map(); for (const p of items) { const g = packGroup(p); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(p); }
    const order = [...groups.keys()].sort((a, b) => (a === S.country ? -1 : b === S.country ? 1 : countryName(a).localeCompare(countryName(b))));
    list.replaceChildren();
    if (!items.length) list.append(h("p", { class: "muted", style: "padding:12px" }, t("No rule pack matches that. Try fewer letters, or choose \"Any country\" above.")));
    for (const g of order) {
      const arr = groups.get(g).sort((a, b) => a.jurisdiction.localeCompare(b.jurisdiction) || a.name.localeCompare(b.name));
      list.append(h("div", { class: "eyebrow", style: "margin:14px 0 2px" }, countryName(g) + (g === S.country ? " - " + t("your country") : "")),
        radios("pack", arr.map((p) => ({ value: p.id, label: p.name, desc: p.jurisdiction + " · " + t("Our confidence: ") + (CONF[p.confidence] || p.confidence) + (p.needsLawyer ? " · " + t("Needs a lawyer's check") : "") })), S.packId, (v) => { S.packId = v; for (const r of list.querySelectorAll("label.choice")) r.classList.toggle("on", r.dataset.v === v); showDetail(); }));
    }
    showDetail();
  }
  drawList(); sync();
  const node = h("div", null, h("h2", null, t("Choose the rules for your meeting")), h("p", { class: "muted" }, t("The rules say how much notice is needed, how many members must be present (quorum) and how many votes win.")), modeR, packWrap, ownNote, h("div", { style: "margin-top:14px" }, rec));
  return { node, check() {
    clearErrs(node);
    if (S.rulesMode === "own") { S.packId = own ? own.id : "custom-world"; return true; }
    if (!S.packId || S.packId === "custom-world" || !packs.some((p) => p.id === S.packId)) return errAt(search, t("Please pick one rule pack from the list, or choose \"Any country\" above."));
    return true;
  } };
}

const MILES = [["start", "The meeting starts", "When people begin to gather."], ["votingStart", "Voting opens", "When the first question can be voted on."], ["votingEnd", "Voting closes", "The last moment to vote."], ["end", "The meeting ends", "When you close the meeting."]];
function stepWhen() {
  const venue = ti({ value: S.venue, maxlength: 200, placeholder: t("Example: Clubhouse, Green Park Apartments"), "data-test": "venue", "aria-label": t("Venue"), oninput: (e) => { S.venue = e.target.value; } });
  const tz = h("select", { "data-test": "timezone", "aria-label": t("Time zone"), onchange: (e) => { S.tz = e.target.value; } }, zones.map((z) => h("option", { value: z, selected: z === S.tz }, z)));
  const pick = {};
  const rows = MILES.map(([k, lab, d]) => { pick[k] = h("input", { type: "datetime-local", value: S.times[k], "data-test": "time-" + k, "aria-label": t(lab), oninput: (e) => { S.times[k] = e.target.value; } }); return field(t(lab), pick[k], t(d)); });
  const node = h("div", null, h("h2", null, t("When and where?")), field(t("Venue"), venue, t("The place where members meet. For an online-only meeting, type: Online.")),
    h("div", { class: "grid g2" }, h("div", null, rows.slice(0, 2)), h("div", null, rows.slice(2))),
    field(t("Time zone"), tz, t("Times above are in this time zone. We picked the one your device uses.")),
    msg("info", t("Price for this event: ") + priceFor(), t("Paid once per event, later, from your Team Desk. Nothing is charged now."), null));
  return { node, check() {
    clearErrs(node); let ok = true; S.venue = venue.value.trim(); S.tz = tz.value;
    if (S.venue.length < 2) ok = errAt(venue, t("Please type the place where the meeting is held."));
    let prev = -Infinity; const ms = {};
    for (const [k, lab] of MILES) {
      const v = wallToMs(pick[k].value, S.tz);
      if (!Number.isFinite(v)) { ok = errAt(pick[k], t("Please choose a date and time for: ") + t(lab) + "."); continue; }
      if (v < prev) { ok = errAt(pick[k], t(lab) + t(" cannot be earlier than the step before it.")); continue; }
      prev = v; ms[k] = v;
    }
    if (ok && ms.start < Date.now()) ok = errAt(pick.start, t("The start must be in the future. Please choose a later date."));
    if (ok && ms.start > Date.now() + 3 * 365 * 86400_000) ok = errAt(pick.start, t("That date is too far away. Please choose a date within 3 years."));
    S.ms = ms; return ok;
  } };
}

function stepYou() {
  const o = S.org;
  const name = ti({ value: o.name, maxlength: 80, autocomplete: "name", "data-test": "org-name", "aria-label": t("Your name"), oninput: (e) => { o.name = e.target.value; } });
  const email = h("input", { type: "email", value: o.email, maxlength: 120, autocomplete: "email", "data-test": "org-email", "aria-label": t("Your e-mail"), oninput: (e) => { o.email = e.target.value; } });
  const phone = h("input", { type: "tel", value: o.phone, maxlength: 20, autocomplete: "tel", "data-test": "org-phone", "aria-label": t("Your mobile number"), oninput: (e) => { o.phone = e.target.value; } });
  const agree = h("input", { type: "checkbox", checked: S.agree, "data-test": "agree", onchange: (e) => { S.agree = e.target.checked; } });
  const agreeBox = h("label", { class: "choice", "data-wrap": "1" }, agree, h("div", null, h("b", null, t("I agree to these terms")), h("span", { class: "d" }, t("Version ") + (terms?.version || ""))));
  const termsBox = h("div", { tabindex: "0", role: "region", "aria-label": t("Terms and conditions"), "data-test": "terms-text", style: "max-height:220px;overflow:auto;border:1px solid var(--line);border-radius:12px;padding:12px 14px;background:#fff;white-space:pre-wrap;font-size:14px" }, terms?.text || "");
  const node = h("div", null, h("h2", null, t("About you")),
    msg("info", t("Price for this event: ") + priceFor(), t("You pay once per event, from your Team Desk, before you publish the notice. Nothing is charged now."), null),
    h("p", { class: "muted" }, t("You become the Organizer. We send a 6-digit code to your e-mail so we know it is you.")),
    field(t("Your name"), name), field(t("Your e-mail"), email, t("The code and your sign-in link come here.")), field(t("Your mobile number (optional)"), phone, t("Only for the team. It is never shown to members.")),
    h("h3", { style: "margin-top:22px" }, t("The terms")), h("p", { class: "muted small" }, t("Please read them. Scroll to the end.")), termsBox, agreeBox);
  return { node, check() {
    clearErrs(node); let ok = true; o.name = name.value.trim(); o.email = email.value.trim(); o.phone = phone.value.trim();
    if (o.name.length < 2) ok = errAt(name, t("Please type your name."));
    if (!EMAIL_RE.test(o.email)) ok = errAt(email, t("Please type a correct e-mail, like name@example.com."));
    if (o.phone && (o.phone.replace(/\D/g, "").length < 7 || !/^[+()\d\s-]{7,20}$/.test(o.phone))) ok = errAt(phone, t("That mobile number looks wrong. Use digits only (you may add + and spaces), or leave it empty."));
    if (!S.agree) ok = errAt(agreeBox, t("Please tick \"I agree\" to continue."));
    return ok;
  } };
}

const BUILD = [stepKind, stepSociety, stepRules, stepWhen, stepYou];

// ---------------------------------------------------------------- page
let current = null;
function render() {
  if (S.done) return renderDone();
  current = BUILD[S.step]();
  const bar = stepBar(STEPS.map((s, i) => ({ title: t(s), state: i < S.step ? "done" : i === S.step ? "cur" : "todo" })), (i) => { if (i < S.step) { S.step = i; render(); } });
  const last = S.step === BUILD.length - 1;
  const err = h("div", { "data-test": "send-error" });
  const next = h("button", { class: "btn gold big", "data-test": last ? "send" : "next", onclick: async (e) => {
    if (!current.check()) { const f = $("[data-err]", app()); if (f) f.scrollIntoView({ block: "center", behavior: "smooth" }); return; }
    if (!last) { S.step++; render(); window.scrollTo(0, 0); return; }
    await busy(e.currentTarget, () => submit(err));
  } }, last ? t("Start my event and e-mail me the code") : t("Next"));
  const back = S.step > 0 ? h("button", { class: "btn ghost big", "data-test": "back", onclick: () => { S.step--; render(); window.scrollTo(0, 0); } }, t("Back")) : h("a", { class: "btn ghost big", href: "/", "data-test": "cancel" }, t("Cancel"));
  mount(app(), h("div", { class: "narrow", style: "margin:0 auto" },
    wwh(t("The person who runs the meeting (the Organizer)"), t("Answer five short screens. Step ") + (S.step + 1) + t(" of ") + BUILD.length + ".", t("Type your answers and press Next. You can go Back any time."), t("Your society's rules and your details go into the record, so everything stays clear and checkable.")),
    bar, h("div", { class: "card" }, current.node), err, h("div", { class: "nav sticky" }, back, next)));
}

async function submit(errBox) {
  errBox.replaceChildren();
  let ts = ""; try { ts = await turnstileToken(); } catch { /* none */ }
  if (!ts) { errBox.replaceChildren(errorBox({ code: "turnstile", message: t("We could not confirm you are a person.") })); return; }
  const ms = S.ms; const place = S.venue;
  const body = {
    kind: S.kind, eventType: S.eventType, title: S.title, venue: place, scheduledMs: ms.start, timezone: S.tz, country: S.country,
    schedule: Object.fromEntries(MILES.map(([k]) => [k, { atMs: ms[k], place }])),
    packId: S.rulesMode === "own" ? "custom-world" : S.packId, useRecommended: S.clone ? false : S.useRecommended,
    society: { ...S.society }, organizer: { name: S.org.name, email: S.org.email, ...(S.org.phone ? { phone: S.org.phone } : {}) },
    turnstile: ts, acceptTerms: true, termsVersion: terms?.version,
  };
  if (S.clone) { body.cloneFrom = S.clone.id; body.packId = S.clone.tpl.packId; }
  try {
    const r = await post("/api/events", body);
    S.done = r;
    const list = (store.pref("events") || []).filter((x) => x.e !== r.eventId); list.unshift({ e: r.eventId, p: r.personId, t: S.title, ms: Date.now() });
    store.pref("events", list.slice(0, 8));
    render();
  } catch (e) {
    errBox.replaceChildren(errorBox(e, () => submit(errBox)), h("p", { class: "muted small" }, t("Everything you typed is still here. Nothing was lost.")));
    errBox.scrollIntoView({ block: "center", behavior: "smooth" });
  }
}

function renderDone() {
  const r = S.done; const link = `/desk/#e=${r.eventId}&p=${r.personId}`;
  mount(app(), h("div", { class: "narrow", style: "margin:0 auto" },
    wwh(t("The Organizer"), t("Open your e-mail and find the 6-digit code."), t("Press the big button, then type the code. Or tap the link in the e-mail."), t("The code proves the e-mail is yours.")),
    h("div", { class: "card center" }, h("h1", null, t("We e-mailed you a "), h("em", null, t("6-digit code"))),
      h("p", null, t("It was sent to ") + S.org.email + t(". It works once and lasts 15 minutes. If you cannot see it, look in Spam.")),
      h("a", { class: "btn gold big", href: link, "data-test": "go-desk" }, t("Enter my code")),
      h("p", { class: "muted small", style: "margin-top:18px" }, t("Your event code (keep it safe, you can share it with members): ")), h("div", { class: "code s mono", "data-test": "event-code" }, r.eventId)),
    msg("info", t("Your event \"") + S.title + t("\" has been started."), t("Next you will set up the rules, the flat list, the agenda and your helpers in the Team Desk."), null)));
}

render();

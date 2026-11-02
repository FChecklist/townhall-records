// Team Desk tab "Check-in": the Attendance Monitor station. Phone first: one decision per screen, big tick boxes, a sticky bottom button.
// Steps: 1 pick the flat, 2 check the person, 3 photo (only when the event uses photos), 4 the person's own phone (two 4-digit numbers), 5 mark present.
// `render(ctx, el)`; see docs/UI-BUILD-BRIEF.md "Desk module contract". The person's full name and mobile are shown only inside the `.working` box and are dropped after marking.
import { h, t, mount, msg, errorBox, confirmBox, toast, busy, get, field, wwh, fmtTime, copyText } from "/assets/core.js";
import { qrSvg } from "/assets/qr.js";
import { wrongNameScreen } from "./desk-items.js";

const ALL_CHECKS = [
  ["proof_seen", "I have seen the person's proof (ID or a known face)", "Look at the proof. Do not copy or photograph the ID number."],
  ["name_matches", "The name matches the flat in the list", "If it does not match, do not edit anything. Use the red button to tell the Organizer or Host."],
  ["flat_matches", "This person lives in, or holds the vote for, this flat", "For a proxy, tick this and give the holder reference when you issue the voter code."],
  ["person_agrees", "The person agreed to the photo and to the record", "Without a Yes, do not take a photo. Ask the Organizer for another way."],
  ["photo_taken", "Photo taken, with the place switched on", ""],
  ["person_checked", "The person has checked their name, flat and status on their own phone", "They then enter the 4-digit number; you enter yours."],
];
const FLAG_TEXT = {
  ok: "Time and place saved.",
  no_location: "The phone did not share its place. Switch location on and take the photo again if you can.",
  bad_location: "The place the phone gave looks wrong. Please look at it and take the photo again if you can.",
  far_from_network: "The phone's place is more than 150 km from where the network places it. A person will look at this.",
  time_off: "The phone's clock is more than 10 minutes away from ours. A person will look at this.",
};
const blank = () => ({ step: "pick", q: "", flat: null, verify: null, attendee: "", checks: {}, photo: null, hs: null, hsStatus: null, hsMsg: null, method: null, done: null, code: null, codeFlat: "", showList: false, exchanged: false, sent: false });
const C = { eid: "", flats: null, s: blank(), timers: [], busy: false, ctx: null, el: null };
const visible = () => document.visibilityState === "visible";
const clearTimers = () => { C.timers.forEach((id) => clearInterval(id)); C.timers = []; };
const opts = () => { const o = {}; for (const x of (C.ctx.model.options || [])) o[x.key] = x.value; return o; };
const needPhoto = () => !!opts().attendance_photo;
const required = () => ["proof_seen", "name_matches", "flat_matches", ...(needPhoto() ? ["person_agrees", "photo_taken"] : []), "person_checked"];
const labelOf = (id) => t(ALL_CHECKS.find((c) => c[0] === id)[1]);
const missing = () => required().filter((id) => C.s.checks[id] !== true);
const presentRows = () => (C.ctx.model.attendance && C.ctx.model.attendance.rows) || [];
const maskedFor = (flat) => { const r = presentRows().find((x) => x.flatNo === flat); return r ? r.maskedName : ""; };

export async function render(ctx, el) {
  clearTimers(); stopPolling();
  C.ctx = ctx; C.el = el;
  if (C.eid !== ctx.eid) { C.eid = ctx.eid; C.flats = null; C.s = blank(); }
  if (!C.flats) { try { C.flats = (await get(`/api/events/${ctx.eid}/template`)).flats || []; } catch (e) { mount(el, errorBox(e, () => render(ctx, el))); return; } }
  draw();
  // keep the "checked in" list fresh while idle; the exchange status has its own faster timer
  C.timers.push(setInterval(() => {
    if (!el.isConnected) return clearTimers();
    if (!visible() || C.busy || !["pick", "done"].includes(C.s.step)) return;
    const a = document.activeElement; if (a && el.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return;
    ctx.refresh().catch(() => {});
  }, 15000));
  if (C.s.hs && !C.s.hs.complete) startPolling();
}

// ------------------------------------------------------------------------------------------------ drawing
function shell(...kids) { return h("div", { class: "phone", style: "max-width:560px;margin:0 auto", "data-test": "checkin-root" }, kids); }
function bar(back, primary) { return h("div", { class: "nav sticky" }, back || h("span"), primary || h("span")); }
function draw() {
  const s = C.s, el = C.el;
  const fn = { pick: screenPick, check: screenCheck, photo: screenPhoto, phone: screenPhone, mark: screenMark, done: screenDone, wrong: screenWrong, code: screenCode }[s.step] || screenPick;
  mount(el, shell(fn()));
}
const go = (step) => { C.s.step = step; draw(); window.scrollTo({ top: 0 }); };
const backBtn = (to, label) => h("button", { class: "btn ghost", "data-test": "back", onclick: () => go(to) }, label || t("Back"));
const stepTitle = (n, text) => h("div", null, h("div", { class: "eyebrow" }, `${t("Step")} ${n} ${t("of")} ${needPhoto() ? 5 : 4}`), h("h2", { style: "margin:2px 0 10px" }, text));

// ---- step 1: pick the flat
function screenPick() {
  const s = C.s, m = C.ctx.model;
  const list = h("div", { "data-test": "flat-list" });
  const input = h("input", { type: "text", value: s.q, placeholder: t("Flat or house number"), inputmode: "search", autocomplete: "off", "data-test": "flat-search", "aria-label": t("Search for a flat"), style: "min-height:56px;font-size:20px", oninput: () => { s.q = input.value; paint(); } });
  const norm = (x) => String(x).toLowerCase().replace(/[^a-z0-9]/g, "");
  const here = new Set(presentRows().map((r) => r.flatNo));
  function paint() {
    const q = norm(s.q), hits = (C.flats || []).filter((f) => !q || norm(f.flatNo).includes(q)).slice(0, 40);
    list.replaceChildren(...(hits.length ? hits.map((f) => h("button", { class: "choice", style: "width:100%;text-align:left;min-height:60px", "data-test": "flat-" + f.flatNo, disabled: !f.eligible, onclick: () => pickFlat(f) },
      h("div", { style: "flex:1" }, h("b", { style: "font-size:18px" }, f.flatNo), h("span", { class: "d" }, `${t("Vote weight")}: ${f.weight}`)),
      f.eligible ? (here.has(f.flatNo) ? h("span", { class: "badge ok" }, t("Checked in")) : null) : h("span", { class: "badge warn" }, t("Not on the voting list")))) : [h("p", { class: "muted" }, t("No flat matches. Check the number."))]));
  }
  paint();
  const total = (m.attendance && m.attendance.total) || (C.flats || []).length;
  return [wwh(t("Attendance Monitor"), t("Check in the person at the door."), t("Find the flat, check the person, then press the buttons."), t("Only people checked in can vote, and the quorum counts them.")),
    h("div", { class: "card" }, h("div", { class: "eyebrow" }, `${t("Step")} 1 ${t("of")} ${needPhoto() ? 5 : 4}`), h("h2", { style: "margin:2px 0 10px" }, t("Which flat?")), input, h("p", { class: "small muted", style: "margin-top:6px" }, `${(m.attendance && m.attendance.present) || 0} ${t("of")} ${total} ${t("flats checked in")}.`), list),
    h("div", { class: "row", style: "margin-bottom:16px" },
      h("button", { class: "btn ghost", "data-test": "toggle-list", onclick: () => { s.showList = !s.showList; draw(); } }, s.showList ? t("Hide the checked-in list") : t("See who is checked in")),
      h("button", { class: "btn ghost", "data-test": "go-code", onclick: () => { s.code = null; go("code"); } }, t("Issue a voter code"))),
    s.showList ? checkedList() : null];
}
function checkedList() {
  const rows = presentRows();
  return h("div", { class: "card", "data-test": "checked-list" }, h("h3", null, t("Checked in so far")),
    rows.length ? h("div", { class: "tw" }, h("table", { class: "t" }, h("thead", null, h("tr", null, [t("Flat"), t("Person"), t("Marked by"), t("When")].map((x) => h("th", null, x)))),
      h("tbody", null, rows.map((r) => h("tr", null, h("td", null, r.flatNo), h("td", null, r.maskedName), h("td", null, `${r.byName || ""}${r.byRole ? " (" + r.byRole + ")" : ""}`), h("td", null, fmtTime(r.ts, C.ctx.model.timezone))))))) : h("p", { class: "muted" }, t("Nobody yet.")));
}
async function pickFlat(f) {
  const s = C.s; const prevFlat = s.flat;
  if (prevFlat !== f.flatNo) { const keep = blank(); Object.assign(s, keep); }
  s.flat = f.flatNo; s.verify = null; s.step = "check"; draw(); window.scrollTo({ top: 0 });
  await loadVerify();
}
async function loadVerify() {
  const s = C.s, slot = () => C.el.querySelector("[data-test=verify-slot]");
  try {
    s.verify = await C.ctx.call.get(`/verify/${encodeURIComponent(s.flat)}`);
    if (!s.attendee) { const hs = (s.verify.holders || []).filter((x) => !x.hidden && x.name); if (hs.length === 1) s.attendee = hs[0].name; }
    if (s.step === "check") draw();
  } catch (e) { const sl = slot(); if (sl) sl.replaceChildren(errorBox(e, loadVerify)); }
}

// ---- step 2: check the person
function tick(id, label, help, sync) {
  const s = C.s;
  const inp = h("input", { type: "checkbox", checked: s.checks[id] === true, style: "width:34px;height:34px", "data-test": "tick-" + id, onchange: () => { s.checks[id] = inp.checked; lab.classList.toggle("on", inp.checked); sync && sync(); } });
  const lab = h("label", { class: "choice" + (s.checks[id] ? " on" : ""), style: "min-height:64px;align-items:center" }, inp, h("div", null, h("b", null, label), help ? h("span", { class: "d" }, help) : null));
  return lab;
}
function workingBox() {
  const s = C.s, v = s.verify;
  if (!v) return h("div", { class: "working", "data-test": "working" }, h("div", { class: "lbl" }, t("Visible only while you check this person in")), h("p", { class: "muted" }, t("Loading…")), h("div", { "data-test": "verify-slot" }));
  const hs = (v.holders || []);
  return h("div", { class: "working", "data-test": "working" }, h("div", { class: "lbl" }, t("Visible only while you check this person in")),
    v.alreadyPresent ? msg("info", t("This flat is already checked in."), t("The details are hidden. You can still check in again if the first one was a mistake."), null) : null,
    hs.length ? hs.map((x) => h("p", { style: "margin:6px 0", "data-test": "holder" }, h("b", { style: "font-size:19px" }, x.name || ""), x.phone ? h("span", { class: "mono" }, "  " + x.phone) : null, x.hidden ? h("span", { class: "tiny muted" }, "  " + t("(hidden)")) : null))
      : h("p", { class: "muted" }, t("No name is on the list for this flat.")),
    h("p", { class: "tiny muted" }, `${t("Vote weight")}: ${v.weight}`), h("div", { "data-test": "verify-slot" }));
}
function screenCheck() {
  const s = C.s, photo = needPhoto();
  const name = h("input", { type: "text", value: s.attendee, maxlength: 80, autocomplete: "off", "data-test": "attendee-name", "aria-label": t("Name of the person in front of you"), style: "min-height:56px;font-size:18px", oninput: () => { s.attendee = name.value; sync(); } });
  const why = h("div", { class: "why-off", "data-test": "why-off" });
  const next = h("button", { class: "btn gold big", "data-test": "next", onclick: () => go(photo ? "photo" : "phone") }, t("Next"));
  const base = ["proof_seen", "name_matches", "flat_matches", ...(photo ? ["person_agrees"] : [])];
  function sync() {
    const miss = base.filter((id) => s.checks[id] !== true); const noName = s.attendee.trim().length < 2;
    next.disabled = !!miss.length || noName; next.classList.toggle("off", next.disabled);
    why.textContent = noName ? t("Still to do: type the person's name.") : miss.length ? `${t("Still to do")}: ${labelOf(miss[0])}` : "";
  }
  const ticks = base.map((id) => tick(id, labelOf(id), t(ALL_CHECKS.find((c) => c[0] === id)[2]), sync));
  const node = [stepTitle(2, `${t("Check the person for flat")} ${s.flat}`), workingBox(),
    h("div", { class: "card", style: "margin-top:14px" }, field(t("Name of the person in front of you"), name, t("As on the proof. It is kept private and shown hidden on the public page.")), h("div", { style: "margin-top:10px" }, ticks),
      h("button", { class: "btn wine", style: "margin-top:8px", "data-test": "name-wrong", onclick: () => { s.sent = false; go("wrong"); } }, t("The name is wrong: send a change to the Organizer or Host"))),
    why, bar(backBtn("pick"), next)];
  sync(); return node;
}

// ---- name is wrong: no editing here. The Monitor taps a reason and it goes to the Organizer and Host as a logged request (the screens live in desk-items.js)
function screenWrong() { return wrongNameScreen({ C, stepTitle, bar, backBtn, blank, draw }); }

// ---- step 3: photo
function resizeToJpeg(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("photo")); };
    img.onload = async () => {
      URL.revokeObjectURL(url);
      let max = 1280, q = 0.8;
      for (let i = 0; i < 8; i++) {
        const k = Math.min(1, max / Math.max(img.width, img.height)), cv = document.createElement("canvas");
        cv.width = Math.max(1, Math.round(img.width * k)); cv.height = Math.max(1, Math.round(img.height * k));
        cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
        const blob = await new Promise((r) => cv.toBlob(r, "image/jpeg", q));
        if (blob && blob.size <= 380 * 1024) return resolve(blob);
        if (q > 0.5) q -= 0.1; else max = Math.round(max * 0.75);
      }
      reject(new Error("photo_big"));
    };
    img.src = url;
  });
}
const toBase64 = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1] || ""); r.onerror = rej; r.readAsDataURL(blob); });
const getPlace = () => new Promise((res) => {
  if (!navigator.geolocation) return res({ geoError: "not_supported" });
  navigator.geolocation.getCurrentPosition((p) => res({ geo: { lat: p.coords.latitude, lon: p.coords.longitude, accuracyM: Math.round(p.coords.accuracy) } }), (e) => res({ geoError: (e && e.message ? e.message : "denied").slice(0, 80) }), { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
});
function screenPhoto() {
  const s = C.s, slot = h("div", { "data-test": "photo-slot" }), file = h("input", { type: "file", accept: "image/*", capture: "environment", class: "sr", id: "cam", "data-test": "photo-file", "aria-label": t("Take photo") });
  const saved = s.photo && s.photo.saved;
  const take = h("label", { for: "cam", class: "btn big", style: "width:100%;cursor:pointer", "data-test": "take-photo" }, saved ? t("Take it again") : t("Take photo"));
  file.addEventListener("change", async () => {
    const f = file.files && file.files[0]; if (!f) return;
    slot.replaceChildren(h("p", { class: "muted" }, h("span", { class: "spin" }), " ", t("Getting the place and saving the photo…")));
    C.busy = true;
    try {
      const [blob, place] = await Promise.all([resizeToJpeg(f), getPlace()]);
      const capturedAtMs = Date.now();
      const r = await C.ctx.call.post("/attendance/photo", { flatNo: s.flat, photoBase64: await toBase64(blob), consent: true, capturedAtMs, ...place, checks: { ...s.checks } });
      s.photo = { saved: true, flags: r.flags || [], atMs: capturedAtMs, place: place.geo || null, geoError: place.geoError || null };
      s.checks.photo_taken = true; C.busy = false; await C.ctx.refresh();
    } catch (e) {
      C.busy = false; slot.replaceChildren(e && e.code !== undefined ? errorBox(e) : errorBox({ code: "too_large", message: e && e.message === "photo_big" ? t("The photo is too big even after shrinking.") : t("The photo could not be read.") }));
    }
  });
  const flags = saved ? (s.photo.flags || []) : [];
  const next = h("button", { class: "btn gold big", "data-test": "next", disabled: !saved, onclick: () => go("phone") }, t("Next"));
  return [stepTitle(3, t("Take the photo")),
    h("div", { class: "card" }, h("p", null, t("The person agreed to the photo. Hold the phone steady, with their face in view. Switch the phone's location on: the place is saved with the photo.")),
      file, take, slot,
      saved ? h("div", { "data-test": "photo-saved" }, msg(flags.length === 1 && flags[0] === "ok" ? "ok" : "warn", t("Photo saved."), `${t("Time")}: ${fmtTime(s.photo.atMs, C.ctx.model.timezone)}. ${t("Place")}: ${s.photo.place ? `${s.photo.place.lat.toFixed(4)}, ${s.photo.place.lon.toFixed(4)} (${t("within")} ${s.photo.place.accuracyM} m)` : t("not shared by the phone")}.`, null),
        flags.filter((f) => f !== "ok").map((f) => msg("warn", t(FLAG_TEXT[f] || f), null, null))) : null),
    !saved ? h("div", { class: "why-off", "data-test": "why-off" }, t("Still to do: take the photo.")) : null,
    bar(backBtn("check"), next)];
}

// ---- step 4: the person's own phone (two 4-digit numbers, never both on one screen)
const photoStepNo = () => (needPhoto() ? 4 : 3);
function screenPhone() {
  const s = C.s;
  if (!s.method) {
    return [stepTitle(photoStepNo(), t("The person's own phone")),
      h("div", { class: "card" }, h("p", null, t("The person must look at their own name, flat and status on their own phone. Two screens, two people, one number each: this proves they are really here.")),
        h("button", { class: "btn big", style: "width:100%;margin-bottom:12px", "data-test": "method-exchange", onclick: () => { s.method = "exchange"; draw(); startHandshake(); } }, t("Exchange two 4-digit numbers (recommended)")),
        h("button", { class: "btn ghost", style: "width:100%", "data-test": "method-direct", onclick: () => { s.method = "direct"; draw(); } }, t("Check in without the phone exchange")),
        h("p", { class: "small muted", style: "margin-top:10px" }, t("Without the exchange the record says the phone check was not done together."))),
      bar(backBtn(needPhoto() ? "photo" : "check"), null)];
  }
  if (s.method === "direct") {
    const why = h("div", { class: "why-off", "data-test": "why-off" });
    const next = h("button", { class: "btn gold big", "data-test": "next", onclick: () => go("mark") }, t("Next"));
    const sync = () => { const off = s.checks.person_checked !== true; next.disabled = off; why.textContent = off ? `${t("Still to do")}: ${labelOf("person_checked")}` : ""; };
    const node = [stepTitle(photoStepNo(), t("The person's own phone")),
      h("div", { class: "card" }, tick("person_checked", labelOf("person_checked"), t(ALL_CHECKS[5][2]), sync)),
      why, bar(h("button", { class: "btn ghost", "data-test": "back", onclick: () => { s.method = null; draw(); } }, t("Back")), next)];
    sync(); return node;
  }
  return screenExchange();
}

async function startHandshake() {
  const s = C.s; s.hsMsg = null; s.hs = null;
  try {
    const r = await C.ctx.call.post("/handshakes", { flatNo: s.flat, attendeeName: s.attendee.trim() });
    s.hs = { id: r.handshakeId, code: r.monitorCode, link: location.origin + r.linkPath, expiresMs: r.expiresMs, complete: false }; s.hsStatus = null;
    if (s.step === "phone") draw(); startPolling();
  } catch (e) { s.hsMsg = e; if (s.step === "phone") draw(); }
}
function statusLine(st) {
  if (!st) return t("Waiting for the person to open the link.");
  if (st.complete) return t("Done. Both numbers matched.");
  if (st.voided) return t("This exchange was replaced by a newer one. Start again.");
  if (st.expired) return t("This exchange ran out of time. Start again.");
  if (!st.voterOpened) return t("Waiting for the person to open the link on their phone.");
  if (!st.voterConfirmed && !st.monitorConfirmed) return t("The person has the link open. Read your number to them. Then type the number on their phone below.");
  if (st.voterConfirmed && !st.monitorConfirmed) return t("The person typed your number. Now type the number shown on their phone.");
  if (!st.voterConfirmed && st.monitorConfirmed) return t("Your number was accepted. Waiting for the person to type yours.");
  return t("Almost done…");
}
function screenExchange() {
  const s = C.s, hs = s.hs;
  if (s.hsMsg) return [stepTitle(photoStepNo(), t("Number exchange")), errorBox(s.hsMsg, () => { s.hsMsg = null; draw(); startHandshake(); }), bar(h("button", { class: "btn ghost", onclick: () => { s.method = null; s.hsMsg = null; draw(); } }, t("Back")), null)];
  if (!hs) return [stepTitle(photoStepNo(), t("Number exchange")), h("p", { class: "center muted" }, h("span", { class: "spin" }), " ", t("Starting…")), bar(null, null)];
  const st = s.hsStatus, dead = st && (st.expired || st.voided);
  const entry = h("input", { type: "text", inputmode: "numeric", pattern: "[0-9]*", maxlength: 4, autocomplete: "off", "data-test": "voter-number", "aria-label": t("The 4-digit number on the person's phone"), style: "font:700 40px var(--mono);text-align:center;letter-spacing:.3em;min-height:72px" });
  const slot = h("div", { "data-test": "exchange-slot" });
  const send = h("button", { class: "btn big", style: "width:100%;margin-top:10px", "data-test": "confirm-number", onclick: async () => {
    slot.replaceChildren(); const v = entry.value.trim();
    if (!/^\d{4}$/.test(v)) { entry.classList.add("err"); slot.replaceChildren(msg("bad", t("Type the 4 digits shown on the person's phone."), null, null)); return; }
    entry.classList.remove("err");
    try { const r = await busy(send, () => C.ctx.call.post(`/handshakes/${hs.id}/confirm`, { code: v })); if (r.complete) await finishExchange(); else { s.hsStatus = { ...(s.hsStatus || {}), monitorConfirmed: true }; entry.value = ""; draw(); } }
    catch (e) { slot.replaceChildren(errorBox(e)); }
  } }, t("Check the number"));
  const nodes = [stepTitle(photoStepNo(), t("Number exchange")),
    h("div", { class: "card", style: "text-align:center" },
      h("div", { class: "eyebrow" }, t("Your number. Read it to the person.")),
      hs.code ? h("span", { class: "code", "data-test": "monitor-code" }, hs.code) : h("p", { class: "muted" }, t("Your number is hidden now.")),
      h("p", { class: "small" }, t("The person scans this with their phone camera, or you send them the link:")),
      h("div", { style: "display:flex;justify-content:center;margin:8px 0", "data-test": "hs-qr" }, qrSvg(hs.link, 220, t("Link for the person's phone"))),
      h("button", { class: "btn ghost", "data-test": "copy-link", onclick: () => copyText(hs.link) }, t("Copy link"))),
    h("div", { class: "msg " + (dead ? "warn" : "info"), role: "status", "data-test": "hs-status" }, h("div", null, statusLine(st))),
    dead ? h("button", { class: "btn big", style: "width:100%", "data-test": "hs-restart", onclick: () => { s.hs = null; s.hsStatus = null; draw(); startHandshake(); } }, t("Start again"))
      : h("div", { class: "card" }, h("div", { class: "eyebrow" }, t("The number on the person's phone")), entry, send, slot),
    bar(h("button", { class: "btn ghost", onclick: () => { stopPolling(); s.method = null; s.hs = null; s.hsStatus = null; draw(); } }, t("Back")), null)];
  return nodes;
}
async function finishExchange() {
  const s = C.s; stopPolling(); if (s.hs) { s.hs.complete = true; s.hs.code = null; }
  s.checks.person_checked = true; s.exchanged = true; toast(t("Both numbers matched.")); go("mark");
}
function startPolling() {
  stopPolling(); const s = C.s;
  if (!s.hs || s.hs.complete) return;
  C.poll = setInterval(async () => {
    if (!visible() || !C.s.hs || C.s.hs.complete || C.s.step !== "phone") return;
    try {
      const st = await C.ctx.call.get(`/handshakes/${C.s.hs.id}`);
      C.s.hsStatus = st; if (st.complete) return finishExchange();
      const box = C.el.querySelector("[data-test=hs-status]"); if (box) { box.className = "msg " + (st.expired || st.voided ? "warn" : "info"); box.firstChild.textContent = statusLine(st); if (st.expired || st.voided) draw(); }
    } catch { /* a bad moment on the network; the next tick tries again */ }
  }, 3000);
}
function stopPolling() { if (C.poll) clearInterval(C.poll); C.poll = null; }

// ---- step 5: mark present
function screenMark() {
  const s = C.s, req = required();
  const slot = h("div", { "data-test": "mark-slot" });
  const why = h("div", { class: "why-off", "data-test": "why-off" });
  const btn = h("button", { class: "btn gold big", style: "width:100%", "data-test": "mark-present", onclick: async () => {
    slot.replaceChildren();
    try {
      await busy(btn, () => C.ctx.call.post("/attendance", { flatNo: s.flat, attendeeName: s.attendee.trim(), mode: "physical", method: s.exchanged ? "mutual_code_exchange" : "officer_check", checks: { ...s.checks }, present: true }));
      const flat = s.flat; const keepStep = { ...blank(), step: "done", done: { flat, atMs: Date.now(), exchanged: !!s.exchanged } };
      Object.assign(s, keepStep); await C.ctx.refresh();
    } catch (e) { slot.replaceChildren(errorBox(e, () => btn.click())); }
  } }, t("Mark present"));
  const miss = missing(); btn.disabled = miss.length > 0; why.textContent = miss.length ? `${t("Still to do")}: ${labelOf(miss[0])}` : "";
  return [stepTitle(photoStepNo() + 1, `${t("Mark flat")} ${s.flat} ${t("present")}`),
    h("div", { class: "card" }, h("ul", { style: "list-style:none;padding:0;margin:0" }, req.map((id) => h("li", { style: "padding:7px 0" }, h("span", { class: "badge " + (s.checks[id] ? "ok" : "bad") }, s.checks[id] ? "✓" : "!"), " ", labelOf(id)))),
      s.exchanged ? h("p", { class: "small muted" }, t("The phone exchange is done: the person has already been counted as present. This saves your tick boxes with it.")) : null),
    btn, why, slot, bar(backBtn("phone"), null)];
}

// ---- done: only the hidden form from here on
function screenDone() {
  const d = C.s.done || {}, masked = maskedFor(d.flat);
  return [h("div", { class: "card center", "data-test": "done" }, h("div", { class: "badge ok", style: "font-size:16px" }, "✓"), h("h2", { style: "margin-top:8px" }, `${t("Flat")} ${d.flat} ${t("is checked in")}`),
    h("p", { class: "mono", "data-test": "masked-name" }, masked || "********"),
    h("p", { class: "small muted" }, t("The name is hidden on purpose. The full details are not kept on this screen.")),
    h("button", { class: "btn gold big", style: "width:100%", "data-test": "next-person", onclick: () => { Object.assign(C.s, blank()); draw(); } }, t("Next person")),
    h("button", { class: "btn ghost", style: "width:100%;margin-top:10px", "data-test": "issue-code-now", onclick: () => { C.s.codeFlat = d.flat; C.s.code = null; go("code"); } }, t("Give this flat a voter code"))),
    checkedList()];
}

// ---- voter code (shown once)
function screenCode() {
  const s = C.s, present = presentRows().map((r) => r.flatNo);
  if (s.code) {
    return [h("div", { class: "card center", "data-test": "voter-code-card", role: "status" }, h("div", { class: "eyebrow" }, `${t("Voter code for flat")} ${s.code.flatNo}`),
      h("span", { class: "code", style: "font-size:min(22vw,96px);margin:10px 0", "data-test": "voter-code" }, s.code.digits),
      h("p", { style: "font-weight:600" }, t("Read it out or send it. It will not be shown again.")),
      h("button", { class: "btn big", style: "width:100%", "data-test": "voter-code-done", onclick: () => { s.code = null; s.codeFlat = ""; go("pick"); } }, t("Done")))];
  }
  const sel = h("select", { "data-test": "code-flat", "aria-label": t("Flat"), style: "min-height:56px;font-size:18px" }, present.map((f) => h("option", { value: f, selected: f === s.codeFlat }, f)));
  const slot = h("div");
  const btn = h("button", { class: "btn gold big", "data-test": "issue-code", disabled: !present.length, onclick: async () => {
    slot.replaceChildren();
    try { const r = await busy(btn, () => C.ctx.call.post("/passcodes/voter", { flatNo: sel.value })); s.code = { flatNo: r.flatNo || sel.value, digits: r.code }; draw(); window.scrollTo({ top: 0 }); await C.ctx.refresh(); }
    catch (e) { slot.replaceChildren(errorBox(e)); }
  } }, t("Issue a voter code"));
  return [h("div", { class: "card" }, h("div", { class: "eyebrow" }, t("Voter code")), h("h2", { style: "margin:2px 0 10px" }, t("Which flat?")),
    h("p", { class: "muted" }, t("For a voter who cannot use the check-in link. The flat must be checked in first. A new code cancels the old one.")),
    present.length ? field(t("Flat"), sel) : msg("info", t("Nobody is checked in yet."), t("Check a flat in first."), null), slot),
    !present.length ? h("div", { class: "why-off" }, t("Grey because no flat is checked in yet.")) : null,
    bar(backBtn("pick"), btn)];
}

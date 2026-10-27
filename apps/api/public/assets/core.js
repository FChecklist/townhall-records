// Townhall shared browser code: API client, plain-words errors, page frame, small UI helpers. No framework, no build step, no external request.
// Every page does: import { ... } from "/assets/core.js";
export const VERSION_URL = "/release.json";

// ---------------------------------------------------------------- tiny DOM builder (text is always set as text, never as HTML)
export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v == null) continue;
    if (k === "class") el.className = v;
    else if (k === "html") throw new Error("html attribute is not allowed");
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "value") el.value = v;
    else if (k === "checked") el.checked = !!v;
    else if (k === "disabled") el.disabled = !!v;
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export function mount(el, ...kids) { el.replaceChildren(...kids.flat(Infinity).filter((k) => k != null && k !== false)); }

// ---------------------------------------------------------------- language: t("English text") looks the text up in /assets/ui-<lang>.json; English is the fallback
let LANG = "en", DICT = {};
export const lang = () => LANG;
export async function initLang() {
  try { LANG = localStorage.getItem("tw_lang") || (navigator.language || "en").slice(0, 2); } catch { LANG = "en"; }
  if (!["en", "hi", "mr", "bn", "ta", "te", "gu", "kn", "ml", "pa", "ur", "es", "fr", "pt", "ar", "zh"].includes(LANG)) LANG = "en";
  if (LANG !== "en") { try { const r = await fetch(`/assets/ui-${LANG}.json`); if (r.ok) DICT = await r.json(); } catch { DICT = {}; } }
  document.documentElement.lang = LANG; document.documentElement.dir = ["ar", "ur"].includes(LANG) ? "rtl" : "ltr";
}
export const t = (en) => DICT[en] || en;
export function setLang(l) { try { localStorage.setItem("tw_lang", l); } catch { /* private mode */ } location.reload(); }
export const LANGS = [["en", "English"], ["hi", "हिन्दी"], ["mr", "मराठी"], ["bn", "বাংলা"], ["ta", "தமிழ்"], ["te", "తెలుగు"], ["gu", "ગુજરાતી"], ["kn", "ಕನ್ನಡ"], ["ml", "മലയാളം"], ["pa", "ਪੰਜਾਬੀ"], ["ur", "اردو"], ["es", "Español"], ["fr", "Français"], ["pt", "Português"], ["ar", "العربية"], ["zh", "简体中文"]];

// ---------------------------------------------------------------- device id, sessions, config
export function deviceId() {
  let d = ""; try { d = localStorage.getItem("tw_device") || ""; } catch { /* */ }
  if (!/^[A-Za-z0-9]{16,64}$/.test(d)) { d = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now()).replace(/-/g, ""); try { localStorage.setItem("tw_device", d); } catch { /* */ } }
  return d;
}
export const store = {
  get(k) { try { return JSON.parse(sessionStorage.getItem("tw_" + k) || "null"); } catch { return null; } },
  set(k, v) { try { sessionStorage.setItem("tw_" + k, JSON.stringify(v)); } catch { /* */ } },
  del(k) { try { sessionStorage.removeItem("tw_" + k); } catch { /* */ } },
  // last event the team member worked on: remembered on this device only, never a password or code
  pref(k, v) { try { if (v === undefined) return JSON.parse(localStorage.getItem("tw_p_" + k) || "null"); localStorage.setItem("tw_p_" + k, JSON.stringify(v)); } catch { return null; } },
};
let CONFIG = null;
export async function config() {
  if (CONFIG) return CONFIG;
  try { CONFIG = await (await fetch("/config.json")).json(); } catch { CONFIG = {}; }
  return CONFIG;
}
export async function turnstileToken() { const c = await config(); return c.testMode ? "test-ok" : (window.__tsToken || ""); }

// ---------------------------------------------------------------- API client
export class TownError extends Error {
  constructor(status, code, message, extra) { super(message); this.status = status; this.code = code; this.extra = extra || {}; }
}
export async function api(method, path, body, token) {
  const headers = { "x-device-id": deviceId(), "x-browser-session": browserSession() };
  if (body !== undefined) headers["content-type"] = "application/json";
  if (token) headers.authorization = "Bearer " + token;
  let res;
  try { res = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }); }
  catch { throw new TownError(0, "offline", "We could not reach the server."); }
  const text = await res.text(); let data = null; try { data = JSON.parse(text); } catch { /* html or empty */ }
  if (!res.ok) throw new TownError(res.status, data?.error || "http_" + res.status, data?.message || "Something went wrong.", data || {});
  return data ?? text;
}
function browserSession() { let s = store.get("bs"); if (!s) { s = deviceId().slice(0, 24) + Math.random().toString(36).slice(2, 10); store.set("bs", s); } return s; }
export const get = (p, tok) => api("GET", p, undefined, tok);
export const post = (p, b, tok) => api("POST", p, b ?? {}, tok);
export const put = (p, b, tok) => api("PUT", p, b ?? {}, tok);

// ---------------------------------------------------------------- errors in plain words: what happened, how to fix. The server's own sentence is always shown.
export const FIX = {
  offline: ["No internet connection.", "Check your Wi-Fi or mobile data. Your work on this screen is kept. Press Try again when you are back online."],
  not_signed_in: ["You are not signed in, or your sign-in has ended.", "Sign in again with your e-mail. It takes under a minute."],
  invalid_code: ["That code is not right.", "Check the 6 digits (or ask for a new code) and try again. After 5 wrong tries the code is locked for 15 minutes."],
  turnstile: ["We could not confirm you are a person.", "Reload the page and try again."],
  rate_limited: ["Too many tries in a short time.", "Wait a few minutes and try again. This protects everyone's votes."],
  wrong_event: ["This sign-in belongs to a different event.", "Open the event from its own link, or sign in again."],
  wrong_device: ["This sign-in was made on another phone.", "Use the phone you started on, or ask the officer to check you in again."],
  terms_required: ["The terms box is not ticked.", "Tick \"I agree\" below the terms and press the button again."],
  device_required: ["Your browser did not send its device number.", "Reload the page. If it still fails, turn off private browsing and try again."],
  audit_unavailable: ["We could not record this action, so it was not done.", "Nothing was changed. Try again in a minute."],
  reason_required: ["A reason is needed for this change.", "Type a short reason (a few words) in the Reason box. It is shown on the public record."],
  contains_personal_data: ["The text has an e-mail address or a phone number.", "Delete it from the text. Private details are kept in the private fields, not in public text."],
  sheet_has_problems: ["The flat list has problems.", "Read the list of problems, fix them in the sheet, save it as PDF again, and upload it again."],
  not_pdf: ["That file is not a PDF.", "In Excel choose File, Save As, PDF. Then upload that PDF."],
  too_large: ["The file is too big.", "Use a smaller file (flat list under 6 MB, photo under 400 KB)."],
  role_limit: ["The team is already full for this role.", "Remove someone first, or ask the Organizer to change roles."],
  tick_all_boxes: ["Some check boxes are not ticked.", "Tick every box on the check-list, then press Mark present."],
  photo_first: ["The photo has not been taken yet.", "Take the photo first, then press Mark present."],
  already_voted: ["This flat has already voted on this question.", "Nothing more to do. Your vote is on record."],
  confirm_mismatch: ["That number is not right.", "Type the 4-digit number shown on the screen. Five wrong tries cancel the request."],
  data_erased: ["These private details have been erased.", "They cannot be shown any more. The public record is unchanged."],
  mail_quota_reached: ["We cannot send e-mail right now.", "Try again later today, or use the one-tap link if you already have it."],
  server_error: ["Something went wrong on our side.", "Nothing you typed is lost on this screen. Try again in a minute. If it keeps happening, tell the Grievance Officer (Help page)."],
  not_found: ["We could not find that.", "Check the event code or link, and try again."],
};
const STATUS_FIX = {
  400: "Check the fields marked in red and try again.",
  401: "Sign in again to continue.",
  403: "You do not have permission for this right now. The message above says why.",
  404: "Check the link or code you used.",
  409: "Someone else may have changed this. Reload the page to see the latest, then try again.",
  410: "This information has been erased.",
  413: "The file is too big. Use a smaller file.",
  422: "Fix the problems listed and try again.",
  429: "Wait a few minutes and try again.",
  500: "This is our fault. Wait a minute and try again.",
  503: "The service is busy. Wait a minute and try again.",
};
/** {title, fix} for any error; never empty. `title` = the server's own plain sentence when it has one. */
export function explain(e) {
  const code = e?.code || "server_error"; const f = FIX[code];
  const server = e?.message && e.message !== "Something went wrong." ? e.message : null;
  const title = server || (f ? f[0] : "Something went wrong.");
  const fix = f ? f[1] : (STATUS_FIX[e?.status] || "Try again. If it keeps happening, reload the page.");
  return { title, fix, code };
}
export function errorBox(e, retry) {
  const x = explain(e);
  return h("div", { class: "msg bad", role: "alert", "data-code": x.code }, h("div", null, h("span", { class: "ti" }, x.title), h("span", { class: "fix" }, t("How to fix: ") + t(x.fix)), retry ? h("button", { class: "btn ghost", style: "margin-top:10px;min-height:38px", onclick: retry }, t("Try again")) : null));
}
export function msg(kind, title, body, fix) {
  return h("div", { class: "msg " + kind, role: kind === "bad" ? "alert" : "status" }, h("div", null, h("span", { class: "ti" }, title), body ? h("span", null, body) : null, fix ? h("span", { class: "fix" }, fix) : null));
}

// ---------------------------------------------------------------- small widgets
export function toast(text, ms = 3500) { const el = h("div", { class: "toast", role: "status" }, text); document.body.append(el); setTimeout(() => el.remove(), ms); }
export function modal(content) {
  const veil = h("div", { class: "veil", role: "dialog", "aria-modal": "true" }, h("div", { class: "modal" }, content));
  document.body.append(veil); return { close: () => veil.remove(), el: veil };
}
export function confirmBox(title, text, yes = t("Yes"), no = t("No")) {
  return new Promise((res) => {
    const m = modal([h("h3", null, title), h("p", null, text), h("div", { class: "row", style: "justify-content:flex-end;margin-top:16px" }, h("button", { class: "btn ghost", onclick: () => { m.close(); res(false); } }, no), h("button", { class: "btn", onclick: () => { m.close(); res(true); } }, yes))]);
  });
}
/** "Who / What / How / Why" strip shown on every screen. */
export function wwh(who, what, how, why) {
  return h("div", { class: "wwh" }, [[t("Who"), who], [t("What"), what], [t("How"), how], [t("Why"), why]].map(([a, b]) => h("div", null, h("b", null, a), b)));
}
/** Radio group as big tiles: opts = [{value,label,desc,disabled,reason}] */
export function radios(name, opts, value, onchange) {
  const wrap = h("div", { role: "radiogroup" });
  for (const o of opts) {
    const inp = h("input", { type: "radio", name, value: o.value, checked: o.value === value, disabled: !!o.disabled, onchange: () => { sync(); onchange && onchange(o.value); } });
    wrap.append(h("label", { class: "choice" + (o.disabled ? " locked" : ""), "data-v": o.value }, inp, h("div", null, h("b", null, o.label), o.desc ? h("span", { class: "d" }, o.desc) : null, o.disabled && o.reason ? h("span", { class: "d", style: "color:var(--warn)" }, o.reason) : null)));
  }
  function sync() { for (const l of wrap.children) l.classList.toggle("on", l.querySelector("input").checked); } sync();
  wrap.value = () => (wrap.querySelector("input:checked") || {}).value;
  return wrap;
}
export function checks(name, opts, values, onchange) {
  const wrap = h("div");
  for (const o of opts) {
    const inp = h("input", { type: "checkbox", name, value: o.value, checked: (values || []).includes(o.value), disabled: !!o.disabled, onchange: () => { sync(); onchange && onchange(wrap.values()); } });
    wrap.append(h("label", { class: "choice" + (o.disabled ? " locked" : ""), "data-v": o.value }, inp, h("div", null, h("b", null, o.label), o.desc ? h("span", { class: "d" }, o.desc) : null, o.disabled && o.reason ? h("span", { class: "d", style: "color:var(--warn)" }, o.reason) : null)));
  }
  function sync() { for (const l of wrap.children) l.classList.toggle("on", l.querySelector("input").checked); } sync();
  wrap.values = () => [...wrap.querySelectorAll("input:checked")].map((i) => i.value);
  return wrap;
}
export function field(label, input, hint) { return h("div", null, h("label", { class: "f" }, label), hint ? h("div", { class: "hint" }, hint) : null, input); }
/** Numbered step bar. steps = [{title, state}] state: done|cur|todo */
export function stepBar(steps, onpick) {
  return h("ol", { class: "steps" }, steps.map((s, i) => h("li", { class: s.state || "todo", onclick: onpick ? () => onpick(i) : null, "aria-current": s.state === "cur" ? "step" : null }, h("span", { class: "n" }, s.state === "done" ? "✓" : i + 1), h("span", { class: "t" }, s.title))));
}
export const STAGES = ["rules", "attendance", "quorum", "vote", "count", "publish"];
export function stageBar(cur) {
  const i = STAGES.indexOf(cur);
  return h("div", { class: "stages" }, STAGES.map((s, k) => h("div", { class: k < i ? "done" : k === i ? "cur" : "" }, h("b", null, k + 1), t(s[0].toUpperCase() + s.slice(1)))));
}
export async function busy(btn, fn) {
  const old = btn.textContent; btn.disabled = true; btn.textContent = t("Please wait…");
  try { return await fn(); } finally { btn.disabled = false; btn.textContent = old; }
}

// ---------------------------------------------------------------- formatting
export function fmtTime(ms, tz) {
  if (!ms) return "";
  try { return new Intl.DateTimeFormat(lang() === "en" ? "en-IN" : lang(), { dateStyle: "medium", timeStyle: "short", timeZone: tz || undefined }).format(new Date(ms)); } catch { return new Date(ms).toISOString(); }
}
export function fmtMoney(minor, cur) { const v = (minor || 0) / 100; return (cur === "INR" ? "Rs " : cur === "USD" ? "USD " : (cur || "") + " ") + v.toLocaleString("en-IN", { minimumFractionDigits: v % 1 ? 2 : 0 }); }
export const qs = (k) => new URLSearchParams(location.search).get(k);
/** Event code is the last 32-hex part of the path or ?e= */
export function eventIdFromUrl() { const m = /\b([0-9a-f]{32})\b/.exec(location.pathname + " " + location.search); return m ? m[1] : null; }
export const shortCode = (eid) => eid.slice(0, 4) + "-" + eid.slice(4, 8) + "-" + eid.slice(8, 12);

// ---------------------------------------------------------------- page frame: header, language, footer with version. Each page calls frame({active, who}) and renders into #app.
const NAV = [["/", "Home"], ["/start/", "Start"], ["/verify/", "Verify a report"], ["/privacy/", "Privacy"], ["/help/", "Help"], ["/new/", "What's new"]];
export async function frame(opts = {}) {
  await initLang();
  const nav = h("nav", { "aria-label": "Main" }, NAV.map(([href, label]) => h("a", { href, class: opts.active === href ? "on" : "" }, t(label))));
  const sel = h("select", { "aria-label": "Language", onchange: (e) => setLang(e.target.value) }, LANGS.map(([c, n]) => h("option", { value: c, selected: c === lang() }, n)));
  const top = h("header", { class: "top" }, h("div", { class: "in" }, h("a", { class: "brand", href: "/" }, "Town", h("em", null, "hall")), opts.nav === false ? h("span", { class: "sp" }) : nav, opts.who ? h("span", { class: "who" }, opts.who) : null, sel));
  const foot = h("footer", { class: "foot" }, h("div", { class: "in" }, h("span", { id: "ver" }, "Townhall"), h("a", { href: "/privacy/" }, t("Privacy")), h("a", { href: "/terms/" }, t("Terms")), h("a", { href: "/new/" }, t("What's new")), h("a", { href: "/help/" }, t("Help")), h("span", { class: "sp" }), h("span", null, t("Pilot service. Records are tamper-evident and can be checked by anyone."))));
  document.body.prepend(top); document.body.append(foot);
  fetch(VERSION_URL).then((r) => r.json()).then((v) => { const el = $("#ver"); if (el) el.textContent = `Townhall ${v.version} · ${v.date}`; }).catch(() => {});
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  window.addEventListener("offline", () => toast(t("You are offline. What you typed stays on this screen.")));
}
export function app() { return document.getElementById("app"); }
export function loading(text) { return h("div", { class: "center muted", style: "padding:40px" }, h("span", { class: "spin" }), " ", text || t("Loading…")); }
export function copyText(text) { return navigator.clipboard ? navigator.clipboard.writeText(text).then(() => toast(t("Copied"))) : Promise.resolve(); }

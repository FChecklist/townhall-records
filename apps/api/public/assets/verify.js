// /verify/: check a sealed report (or its data) on your own device. Uses the engine's verifier, copied to /assets/verifier.js.
import { h, frame, app, mount, t, get, errorBox, msg, wwh, field, busy, qs, $ } from "/assets/core.js";

await frame({ active: "/verify/" });

// ---------------------------------------------------------------- load the engine verifier once
let verifierReady = null;
function loadVerifier() {
  if (globalThis.aoaVerify) return Promise.resolve();
  if (!verifierReady) verifierReady = new Promise((ok, bad) => {
    const s = document.createElement("script"); s.src = "/assets/verifier.js"; s.onload = ok; s.onerror = () => { verifierReady = null; bad(new Error("verifier")); };
    document.head.append(s);
  });
  return verifierReady;
}

// ---------------------------------------------------------------- plain words for the engine's problems
function plain(p) {
  let m;
  if (/report data block missing/.test(p)) return t("The file does not contain the report data. It may not be a Townhall report, or it was cut short.");
  if (/seal missing/.test(p)) return t("The file has no signature seal.");
  if (/seal markers damaged/.test(p)) return t("The seal inside the file is damaged.");
  if (/does not match its signed seal/.test(p)) return t("The file was changed after it was published. Its fingerprint no longer matches the signed seal.");
  if (/embedded public key differs/.test(p)) return t("The signing key inside the file is not the key this site publishes.");
  if ((m = /log chain fails at entry (\d+): (.*)/.exec(p))) return t("Entry number ") + m[1] + t(" of the record does not fit with the entries around it: ") + m[2];
  if (/displayed figures do not match/.test(p)) return t("The figures shown do not match what the signed record adds up to.");
  if ((m = /^replay: (.*)/.exec(p))) return t("Counting the record again found a problem: ") + m[1];
  if (/damaged or not a report/.test(p)) return t("The file is damaged or is not a Townhall report.");
  if (/file hash differs/.test(p)) return t("The file fingerprint differs from the one published earlier.");
  return p;
}
const fmtUtc = (ms) => (ms ? new Date(ms).toISOString().replace("T", " ").replace(/\.\d+Z$/, " UTC") : "-");

// ---------------------------------------------------------------- the check
async function checkText(text, name) {
  await loadVerifier();
  const V = globalThis.aoaVerify;
  const trimmed = text.trimStart();
  let data = null, verdict, sealChecked = false, fileSha = null;
  if (trimmed.startsWith("{")) {
    let j; try { j = JSON.parse(text); } catch { return bad([t("The file looks like data but it cannot be read.")], name); }
    data = j.model && j.log ? j : j.data && j.data.model ? j.data : null;
    if (!data) return bad([t("The file does not have the report data (a model and a log).")], name);
    verdict = await V.verifyEmbedded(data, undefined);
  } else {
    data = V.extractData(text);
    const r = await V.verifyReportHtml(text);
    verdict = { ok: r.ok, problems: r.problems, head: r.head };
    sealChecked = r.seal; fileSha = r.fileSha256;
    if (!data) return bad(r.problems.map(plain), name);
  }
  return finish(verdict, data, { name, sealChecked, fileSha, fromHtml: !trimmed.startsWith("{") });
}
function bad(problems, name) { return { ok: false, problems, name, facts: [] }; }
async function finish(verdict, data, ctx) {
  let pub = null; try { pub = await get("/api/pubkey"); } catch { /* offline: skip */ }
  const log = data.log || [];
  const facts = [
    [t("Entries in the record"), String(log.length)],
    [t("First entry"), fmtUtc(log[0] && log[0].entry.ts)],
    [t("Last entry"), fmtUtc(log[log.length - 1] && log[log.length - 1].entry.ts)],
    [t("Signing key id"), h("span", { class: "mono" }, data.kid || "-")],
    [t("Last entry fingerprint"), h("span", { class: "mono small", style: "word-break:break-all" }, verdict.head ? verdict.head.hash : "-")],
    [t("Every entry linked to the one before and every signature valid"), verdict.problems.some((p) => /log chain/.test(p)) ? t("No") : t("Yes")],
    [t("Results and figures recomputed from the record, and equal to those shown"), verdict.problems.some((p) => /replay|displayed figures/.test(p)) ? t("No") : t("Yes")],
    ctx.fromHtml ? [t("The file's own seal (nothing changed since publication)"), ctx.sealChecked ? t("Valid") : t("Not valid")] : [t("The file's own seal"), t("Not checked: only the data was given, not the sealed file")],
    ctx.fileSha ? [t("File fingerprint (SHA-256)"), h("span", { class: "mono small", style: "word-break:break-all" }, ctx.fileSha)] : null,
    pub ? [t("Signing key is the one this site publishes"), pub.publicKey === data.publicKey ? t("Yes") : t("No (it may be an older key; ask the Grievance Officer if unsure)")] : null,
  ].filter(Boolean);
  return { ok: verdict.ok, problems: verdict.problems.map(plain), raw: verdict.problems, facts, name: ctx.name, model: data.model };
}
async function checkCode(code) {
  const id = (/[0-9a-f]{32}/.exec(code.replace(/-/g, "").toLowerCase()) || [])[0];
  if (!id) throw Object.assign(new Error("x"), { code: "not_found", message: t("That does not look like an event code. It has 32 letters and digits, or paste the page link.") });
  await loadVerifier();
  const data = await get("/api/r/" + id + "/data");
  let html = null;
  try { const r = await fetch("/api/r/" + id); if (r.ok) { const txt = await r.text(); if (txt.includes('id="aoa-seal"')) html = txt; } } catch { /* data check still possible */ }
  if (html) { const out = await checkText(html, id); if (out.ok || out.problems.length) return out; }
  const verdict = await globalThis.aoaVerify.verifyEmbedded(data, undefined);
  return finish(verdict, data, { name: id, sealChecked: false, fileSha: null, fromHtml: false });
}

// ---------------------------------------------------------------- screen
const out = h("div", { "data-test": "verify-out", "aria-live": "polite" });
const codeIn = h("input", { type: "text", id: "ecode", "data-test": "verify-code", placeholder: t("Event code or page link"), "aria-label": t("Event code") });
const fileIn = h("input", { type: "file", id: "vfile", accept: ".html,.htm,.json,text/html,application/json", "data-test": "verify-file", "aria-label": t("Choose the sealed report file") });
const drop = h("div", { class: "card tint center", "data-test": "verify-drop", style: "border:2px dashed var(--gold);padding:30px" }, h("p", { style: "font-weight:600;margin:0 0 6px" }, t("Drop the downloaded report here")), h("p", { class: "muted small" }, t("The sealed report (.html) or its data (.json). It never leaves your device.")), fileIn);

function showWorking(label) { mount(out, h("div", { class: "card center" }, h("span", { class: "spin" }), " ", label || t("Checking… this can take a few seconds for a long record."))); }
function showResult(r) {
  const nodes = [];
  if (r.ok) {
    nodes.push(h("div", { class: "msg ok", role: "status", "data-test": "verdict-ok" }, h("div", null, h("span", { class: "ti", style: "font-size:24px" }, t("The record is intact")), h("span", null, t("Nothing in this record has been changed since it was signed. Here is what was checked.")))));
    nodes.push(h("div", { class: "card" }, h("h3", null, t("What was checked")), h("dl", { class: "kv", "data-test": "verify-facts" }, r.facts.flatMap(([a, b]) => [h("dt", null, a), h("dd", null, b)]))));
    if (r.model && r.model.live) nodes.push(msg("info", t("This event is still running."), t("The record was intact at this moment. More entries will be added until it is closed and sealed. Check again after it ends."), null));
  } else {
    nodes.push(h("div", { class: "msg bad", role: "alert", "data-test": "verdict-bad" }, h("div", null, h("span", { class: "ti", style: "font-size:24px" }, t("Something does not match")), h("span", null, t("This file or record is not exactly what was signed. Do not rely on it.")),
      h("span", { class: "fix" }, t("What it found:")), h("ul", { style: "margin:4px 0 0 18px" }, r.problems.map((p) => h("li", null, p))))));
    nodes.push(h("div", { class: "card" }, h("h3", null, t("What to do")), h("ol", null,
      h("li", null, t("Do not share or act on this copy.")),
      h("li", null, t("Download the report again from the event page and check that copy. A file can be damaged by a download, an e-mail program or a phone's file viewer.")),
      h("li", null, t("If the new copy also fails, write to the Grievance Officer. Give the event code and the lines above. You will find the contact on the Help page.")))
      , h("div", { class: "row" }, h("a", { class: "btn", href: "/help/", "data-test": "grievance-link" }, t("Contact the Grievance Officer")), h("a", { class: "btn ghost", href: "/privacy/" }, t("Privacy page"))),
      r.facts && r.facts.length ? h("details", { style: "margin-top:14px" }, h("summary", null, t("Facts the check could read")), h("dl", { class: "kv" }, r.facts.flatMap(([a, b]) => [h("dt", null, a), h("dd", null, b)]))) : null,
      r.raw ? h("details", { style: "margin-top:10px" }, h("summary", null, t("Technical detail")), h("pre", { class: "mono small", style: "white-space:pre-wrap" }, r.raw.join("\n"))) : null));
  }
  mount(out, nodes);
  out.scrollIntoView && out.scrollIntoView({ behavior: "smooth", block: "nearest" });
}
async function run(fn) {
  showWorking();
  try { showResult(await fn()); }
  catch (e) { mount(out, errorBox(e, null)); }
}
async function onFile(f) {
  if (!f) return;
  if (f.size > 40 * 1024 * 1024) { mount(out, msg("bad", t("That file is too big to be a report."), t("Choose the report you downloaded from the event page."), null)); return; }
  await run(async () => checkText(await f.text(), f.name));
}
fileIn.addEventListener("change", () => onFile(fileIn.files[0]));
for (const ev of ["dragenter", "dragover"]) drop.addEventListener(ev, (e) => { e.preventDefault(); drop.style.background = "var(--infobg)"; });
for (const ev of ["dragleave", "drop"]) drop.addEventListener(ev, (e) => { e.preventDefault(); drop.style.background = ""; });
drop.addEventListener("drop", (e) => onFile(e.dataTransfer && e.dataTransfer.files[0]));
// a file dropped outside the box must not make the browser open it
window.addEventListener("dragover", (e) => e.preventDefault()); window.addEventListener("drop", (e) => { if (!drop.contains(e.target)) e.preventDefault(); });
const goBtn = h("button", { class: "btn", "data-test": "verify-code-go", onclick: () => { const v = codeIn.value.trim(); if (!v) { codeIn.classList.add("err"); codeIn.focus(); return; } codeIn.classList.remove("err"); run(() => checkCode(v)); } }, t("Check this event"));
codeIn.addEventListener("keydown", (e) => { if (e.key === "Enter") goBtn.click(); });

mount(app(),
  h("h1", null, t("Verify a "), h("em", null, t("report"))),
  wwh(t("Anyone: a member, a committee, an officer or an outsider."), t("Check that a Townhall report was not changed after it was signed."), t("Choose the downloaded report, or type the event code."), t("So you do not have to trust anybody's word, including ours.")),
  card2(h("h3", null, t("What verifying means")), h("p", null, t("Verifying adds up the whole record again on your own device: it checks that every entry is joined to the one before it, that every signature is valid, and that the totals shown are what the entries really add up to.")),
    h("p", null, t("If the check passes, nobody has changed the record since it was signed, so what you read is what was recorded.")),
    h("p", null, t("It does not prove that what people said in the room was true, that the right people attended, or that the rules chosen are right in law; it checks the record, not the meeting."))),
  h("div", { class: "grid g2" },
    card2(h("h3", null, t("1. Choose a file")), drop),
    card2(h("h3", null, t("2. Or use the event code")), h("p", { class: "muted small" }, t("We fetch the public record and check it here. You can paste the page link too.")), field(t("Event code or link"), codeIn), h("div", { style: "margin-top:12px" }, goBtn))),
  out,
  h("p", { class: "tiny muted" }, t("For full certainty, also compare the file fingerprint shown above with the one printed on the event page.")));
function card2(...k) { return h("div", { class: "card" }, ...k); }

// arrive from the event page with ?e=<code>
const pre = qs("e");
if (pre && /[0-9a-f]{32}/i.test(pre)) { codeIn.value = pre; run(() => checkCode(pre)); }

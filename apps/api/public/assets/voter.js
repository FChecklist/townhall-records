// THE VOTER PAGE (phone first). Served for /v/<eventId> (flat + 6-digit code) and /h/<handshakeToken> (check-in link from the officer).
// One decision per screen. Nothing is queued silently: if the network drops the ticks stay on the screen and the voter presses Try again.
import { h, frame, app, mount, t, get, post, store, errorBox, msg, wwh, radios, checks, field, busy, confirmBox, copyText, turnstileToken, loading, explain, fmtTime } from "/assets/core.js";

await frame({ nav: false });
const root = app();
const SK = "voter";
const S = { tok: null, eid: null, flat: null, points: [], idx: 0, answers: {}, lockOff: false, terms: null, hs: null };
const save = () => store.set(SK, { tok: S.tok, eid: S.eid, flat: S.flat });

// ---------------------------------------------------------------- small helpers
let gen = 0, pollTimer = null;
/** Calls fn every `ms` while this screen is showing and the tab is visible. fn gets alive(): false once another screen replaced this one. */
function poll(fn, ms) {
  const mine = ++gen; const alive = () => mine === gen;
  const tick = async () => { if (!alive()) return; if (!document.hidden) { try { await fn(alive); } catch { /* the next tick tries again */ } } if (alive()) pollTimer = setTimeout(tick, ms); };
  pollTimer = setTimeout(tick, ms);
}
function stopPoll() { gen++; clearTimeout(pollTimer); pollTimer = null; }
/** w = [who, what, how, why, openByDefault] */
function show(w, ...kids) {
  stopPoll(); window.scrollTo(0, 0);
  const strip = h("details", { style: "margin-bottom:14px", open: !!w[4] }, h("summary", { class: "small muted", style: "cursor:pointer;min-height:40px;display:flex;align-items:center" }, t("Who, what, how, why")), wwh(t(w[0]), t(w[1]), t(w[2]), t(w[3])));
  mount(root, strip, ...kids);
  const hd = root.querySelector("h1,h2"); if (hd) { hd.setAttribute("tabindex", "-1"); hd.focus({ preventScroll: true }); }
}
const big = (label, onclick, attrs = {}) => h("button", { class: "btn big", style: "width:100%;margin-top:14px", onclick, ...attrs }, label);
const ghost = (label, onclick, attrs = {}) => h("button", { class: "btn ghost big", style: "width:100%;margin-top:10px", onclick, ...attrs }, label);
function tiles(wrap) { for (const l of wrap.querySelectorAll("label.choice")) { l.style.minHeight = "68px"; l.style.fontSize = "19px"; l.style.alignItems = "center"; } return wrap; }
const isSession = (e) => e?.status === 401 || e?.code === "wrong_device" || e?.code === "not_signed_in";
async function getTerms() { if (!S.terms) { try { S.terms = await get("/api/terms"); } catch { S.terms = null; } } return S.terms; }
function termsBlock(onchange) {
  const box = h("div", { style: "white-space:pre-wrap;max-height:34vh;overflow:auto;border:1px solid var(--line);border-radius:10px;padding:12px;background:#fff;font-size:14px", "data-test": "terms-text" }, t("Loading the terms…"));
  getTerms().then((tm) => { box.textContent = tm?.text || t("The terms could not be loaded. Reload the page and try again."); });
  const inp = h("input", { type: "checkbox", id: "agree", "data-test": "terms-agree", onchange: () => { lab.classList.toggle("on", inp.checked); onchange && onchange(); } });
  const lab = h("label", { class: "choice", style: "min-height:64px;align-items:center" }, inp, h("div", null, h("b", null, t("I agree to the terms"))));
  return { el: h("div", null, h("details", null, h("summary", { style: "cursor:pointer;min-height:44px;display:flex;align-items:center;font-weight:600" }, t("Read the terms")), box), lab), ticked: () => inp.checked };
}
const codeBlock = (text, attrs = {}) => h("code", { class: "code", ...attrs }, text);
const longCode = (text, attrs = {}) => h("code", { class: "code s", style: "font-size:15px;letter-spacing:0;word-break:break-all;user-select:all", ...attrs }, text);
function notSent(retry) {
  return h("div", { class: "msg warn", role: "alert", "data-test": "not-sent" }, h("div", null, h("span", { class: "ti" }, t("Not sent yet")), h("span", null, t("This did not reach the server. What you ticked or typed is still on this screen.")), h("span", { class: "fix" }, t("How to fix: ") + t("Check your Wi-Fi or mobile data, then press Try again.")), h("button", { class: "btn", style: "margin-top:10px", onclick: retry, "data-test": "try-again" }, t("Try again"))));
}
const isNet = (e) => e?.code === "offline" || e?.status === 0 || e?.status >= 500;

// ---------------------------------------------------------------- session ended / other phone
function sessionProblem(e, retry) {
  if (!isSession(e)) { show(["You", "See your questions", "Press Try again", "Your questions could not load"], h("h2", null, t("We could not load your questions")), isNet(e) ? notSent(retry) : errorBox(e, retry)); return; }
  store.del(SK); S.tok = null;
  const x = e.code === "wrong_device" ? explain(e) : { title: t("Your sign-in has ended."), fix: t("Open your check-in link again on this phone. It brings you back to where you were. If you have no link, ask the officer for a new 6-digit code.") };
  show(["Voter", "Sign in again", "Use the check-in link or a new code", "Your vote is only counted for your flat, on your phone", true],
    h("h2", null, t("Please sign in again")), h("div", { class: "msg bad", role: "alert", "data-code": e.code || "" }, h("div", null, h("span", { class: "ti" }, x.title), h("span", { class: "fix" }, t("How to fix: ") + x.fix))),
    resumeBox(), S.eid ? ghost(t("I have a new 6-digit code"), () => { location.href = "/v/" + S.eid; }, { "data-test": "to-login" }) : null);
}
/** 'Open my resume link': the same check-in link, opened again on the same phone, brings the voter back to the exact point. */
function resumeBox() {
  const inp = h("input", { type: "text", "data-test": "resume-link", placeholder: t("Paste your check-in link here"), "aria-label": t("Check-in link"), autocomplete: "off" }); const out = h("div");
  const go = () => { const m = /\/h\/([A-Za-z0-9_-]{8,128})/.exec(inp.value); if (!m) { mount(out, msg("bad", t("That does not look like a check-in link."), null, t("Copy the whole link from the message or screen the officer gave you."))); return; } location.href = "/h/" + m[1]; };
  return h("details", { style: "margin-top:16px", open: true }, h("summary", { style: "cursor:pointer;min-height:44px;display:flex;align-items:center;font-weight:600" }, t("I checked in with a link")), h("p", { class: "muted small" }, t("Open the same link again on the same phone. It brings you back to where you were.")), inp, h("button", { class: "btn", style: "margin-top:10px", onclick: go, "data-test": "resume-open" }, t("Open my resume link")), out);
}

// ---------------------------------------------------------------- A. check-in link /h/<token>
async function handshake(token) {
  show(["Voter", "Check in", "Wait a moment", "Opening your check-in"], loading());
  let d; try { d = await get("/api/h/" + token); } catch (e) { return hsProblem(e, () => handshake(token)); }
  if (d.resume) { S.tok = d.token; S.flat = d.flatNo; if (d.eventId) S.eid = d.eventId; save(); return ballot(); } // same link, same phone: back to the exact point
  if (d.eventId) S.eid = d.eventId;
  S.hs = { token, d, accepted: !d.termsRequired };
  if (d.termsRequired) return hsTerms();
  return d.voterConfirmed ? hsWait(false) : hsShow();
}
function hsProblem(e, retry) {
  if (e.code === "not_recognised" || e.code === "wrong_device") { show(["Voter", "Check in", "Ask the officer", "A link works on one phone only"], h("h2", null, t("This link was used on another phone")), msg("bad", e.message && e.message !== "Something went wrong." ? e.message : t("This link was used on another phone."), null, t("How to fix: ") + t("Ask the Attendance Officer to start a new check-in for you on this phone."))); return; }
  show(["Voter", "Check in", "Press Try again", "Your check-in could not open"], h("h2", null, t("We could not open your check-in")), isNet(e) ? notSent(retry) : errorBox(e, retry));
}
function hsTerms() {
  const d = S.hs.d; const why = h("div", { class: "why-off" });
  const tb = termsBlock(upd); const next = big(t("Next"), () => { S.hs.accepted = true; hsShow(); }, { "data-test": "terms-next" });
  function upd() { next.disabled = !tb.ticked(); why.textContent = tb.ticked() ? "" : t("Tick the box to agree to the terms first."); } upd();
  show(["Voter, flat " + d.flatNo, "Read and agree to the terms", "Tick the box, then press Next", "You agree once, before you vote", true],
    h("p", { class: "eyebrow" }, d.society || ""), h("h2", null, t("Before you start")), h("p", null, d.title || ""), tb.el, next, why);
}
function hsShow() {
  const d = S.hs.d;
  show(["Voter, flat " + d.flatNo, "Read your number to the officer", "Say the 4 digits aloud, then press the button", "Two people, two phones, one place: this proves you are really there", true],
    h("p", { class: "eyebrow" }, t("Step 1 of 2")), h("h2", null, t("Read this number to the officer")), codeBlock(d.voterCode, { "data-test": "my-code", "aria-label": t("Your number") }),
    h("p", { class: "muted center", style: "margin-top:10px" }, [d.society, d.title].filter(Boolean).join(" · ") + " · " + t("Flat") + " " + d.flatNo),
    big(t("I have told the officer"), hsType, { "data-test": "told-officer" }),
    d.smsLink ? h("p", { class: "center small", style: "margin-top:14px" }, t("Optional extra check: "), h("a", { href: d.smsLink, "data-test": "sms-link" }, t("send a short text message to the officer"))) : null);
}
function hsType() {
  const d = S.hs.d; const inp = h("input", { type: "text", inputmode: "numeric", pattern: "[0-9]*", maxlength: "4", autocomplete: "off", "data-test": "officer-code", "aria-label": t("The officer's 4-digit number"), style: "font-size:34px;text-align:center;letter-spacing:.3em;min-height:68px", placeholder: "----" });
  const slot = h("div"); const why = h("div", { class: "why-off" });
  const btn = big(t("Check me in"), send, { "data-test": "officer-send" });
  function upd() { const ok = /^\d{4}$/.test(inp.value.trim()); btn.disabled = !ok; why.textContent = ok ? "" : t("Type the 4 digits shown on the officer's screen."); } inp.addEventListener("input", upd); upd();
  async function send() {
    await busy(btn, async () => {
      try {
        const r = await post(`/api/h/${S.hs.token}/confirm`, { code: inp.value.trim(), ...(d.termsRequired ? { acceptTerms: true, termsVersion: d.termsVersion } : {}) });
        d.termsRequired = false; hsWait(!!r.complete);
      } catch (e) { mount(slot, isNet(e) ? notSent(send) : errorBox(e, send)); }
    }); upd();
  }
  show(["Voter, flat " + d.flatNo, "Type the officer's number", "Look at the officer's screen and type the 4 digits", "The officer's number only appears on their screen", true],
    h("p", { class: "eyebrow" }, t("Step 2 of 2")), h("h2", null, t("Type the officer's number")), h("p", { class: "muted" }, t("Ask the officer to show you the 4 digits on their screen.")),
    field(t("The officer's number"), inp), btn, why, slot, ghost(t("Show my number again"), hsShow, { "data-test": "show-mine" }));
}
function hsWait(complete) {
  const d = S.hs.d; const line = h("p", { class: "muted center small", "data-test": "hs-status" }, "");
  if (complete) show(["Voter, flat " + d.flatNo, "Wait", "This screen moves on by itself", "Finishing your check-in", true], h("h2", null, t("Almost there")), loading(t("Finishing your check-in…")), line);
  else show(["Voter, flat " + d.flatNo, "Keep reading your number to the officer", "The officer types it on their phone; this screen moves on by itself", "Both numbers must be typed before you are checked in", true],
    h("p", { class: "eyebrow" }, t("Waiting for the officer")), h("h2", null, t("Read this number to the officer")), codeBlock(d.voterCode, { "data-test": "my-code" }), h("p", { class: "muted center", style: "margin-top:10px" }, t("The officer is typing it now.")), line);
  const check = async (alive) => {
    let st; try { st = await get(`/api/h/${S.hs.token}/status`); line.textContent = ""; } catch (e) { if (!alive()) return; if (isNet(e)) { line.textContent = t("Connection lost. Trying again…"); return; } return hsProblem(e, () => handshake(S.hs.token)); }
    if (!alive()) return;
    if (st.state === "complete") { if (st.token) { S.tok = st.token; S.flat = st.flatNo; save(); return ballot(); } return handshake(S.hs.token); } // the token is handed over once; if this phone missed it, the link brings it back
    if (st.state === "waiting_for_you" && !complete) return hsType();
    if (["replaced", "expired", "dead"].includes(st.state)) return hsEnded(st.state);
  };
  check(() => true); poll(check, 3000);
}
function hsEnded(state) {
  const why = { replaced: t("A newer check-in was started for your flat."), expired: t("This check-in timed out after 10 minutes."), dead: t("Too many wrong numbers were typed, so this check-in was stopped for safety.") }[state];
  show(["Voter", "Start again", "Ask the officer", "A stopped check-in cannot be restarted"], h("h2", null, t("This check-in has ended")), msg("warn", why, null, t("How to fix: ") + t("Ask the Attendance Officer to start a new check-in, then open the new link.")));
}

// ---------------------------------------------------------------- B. direct sign-in /v/<eventId>
async function direct(eid) {
  show(["Voter", "Sign in", "Wait a moment", "Opening the event"], loading());
  let model; try { model = (await get("/api/events/" + eid)).model; } catch (e) { return show(["Voter", "Find the event", "Check the link", "The link may be wrong"], h("h2", null, t("We could not open this event")), isNet(e) ? notSent(() => direct(eid)) : errorBox(e, () => direct(eid))); }
  S.eid = eid;
  const sv = store.get(SK); if (sv?.tok && sv.eid === eid) { S.tok = sv.tok; S.flat = sv.flat; return ballot(); } // a reload comes back to the exact point
  if (model.status === "closed") return show(["Anyone", "See the result", "Open the public page", "This event is over"], h("h2", null, t("This event is over")), h("p", null, model.title), big(t("See the public record"), () => { location.href = "/e/" + eid; }, { "data-test": "to-record" }));
  login(model, eid);
}
function login(model, eid) {
  const flat = h("input", { type: "text", id: "flat", autocomplete: "off", autocapitalize: "characters", "data-test": "login-flat", placeholder: t("for example A-101"), style: "min-height:56px;font-size:20px" });
  const code = h("input", { type: "text", id: "code", inputmode: "numeric", pattern: "[0-9]*", maxlength: "6", autocomplete: "one-time-code", "data-test": "login-code", placeholder: "------", style: "min-height:56px;font-size:26px;letter-spacing:.3em;text-align:center" });
  const slot = h("div"), why = h("div", { class: "why-off" }); const tb = termsBlock(upd);
  const btn = big(t("Continue"), go, { "data-test": "login-go" });
  function upd() { const miss = !flat.value.trim() ? t("Type your flat number.") : !/^\d{6}$/.test(code.value.trim()) ? t("Type the 6-digit code the officer gave you.") : !tb.ticked() ? t("Tick the box to agree to the terms.") : ""; btn.disabled = !!miss; why.textContent = miss; }
  flat.addEventListener("input", upd); code.addEventListener("input", upd); upd();
  async function go() {
    await busy(btn, async () => {
      try {
        const tm = await getTerms(); const r = await post("/api/vote/login", { eventId: eid, flatNo: flat.value.trim(), code: code.value.trim(), acceptTerms: true, termsVersion: tm?.version, turnstile: await turnstileToken() });
        S.tok = r.token; S.flat = r.flatNo; S.eid = eid; save(); await ballot();
      } catch (e) { mount(slot, isNet(e) ? notSent(go) : errorBox(e, go)); }
    }); upd();
  }
  show(["Voter, a member or proxy", "Sign in with your flat number and the officer's code", "Type both, tick the terms, press Continue", "Only the flat on the list can vote, once per question", true],
    h("p", { class: "eyebrow" }, model.society?.name || ""), h("h2", null, model.title || t("Vote")), h("p", { class: "muted" }, t("The officer at the desk gives you a 6-digit code after checking you in.")),
    field(t("Your flat number"), flat), field(t("The 6-digit code from the officer"), code), tb.el, btn, why, slot, resumeBox());
}

// ---------------------------------------------------------------- C. the ballot
async function loadPoints() {
  const d = await get("/api/vote/points", S.tok);
  S.flat = d.flatNo; if (d.eventId) S.eid = d.eventId; S.points = d.points || []; save(); return d;
}
async function ballot() {
  show(["Voter", "Open your questions", "Wait a moment", "Loading your ballot"], loading());
  try { await loadPoints(); } catch (e) { return sessionProblem(e, ballot); }
  const todo = S.points.findIndex((p) => !p.voted);
  if (todo < 0) return idle();
  S.idx = todo; question();
}
async function afterVote() {
  show(["Voter", "Next question", "Wait a moment", "Loading"], loading());
  try { await loadPoints(); } catch (e) { return sessionProblem(e, afterVote); }
  const todo = S.points.findIndex((p) => !p.voted); if (todo < 0) return idle(); S.idx = todo; question();
}
const lbl = (p, id) => p.labels?.[id] || id;
const marksOf = (p, sel) => Object.fromEntries(p.options.map((id) => [id, sel.includes(id)]));
function problem(p, sel, multi) {
  const min = p.minChoices ?? 1, max = p.maxChoices || 1;
  if (sel.length > max) return t("You have ticked too many. You may tick at most ") + max + t(". Untick ") + (sel.length - max) + ".";
  if (sel.length < min) return multi ? t("Tick at least ") + min + "." : t("Choose one answer to continue.");
  return "";
}
function question(notice) {
  const n = S.points.length, i = S.idx, p = S.points[i]; const multi = p.kind === "election_post" || (p.maxChoices || 1) > 1;
  const min = p.minChoices ?? 1, max = p.maxChoices || 1;
  const cur = () => (S.answers[p.pointId] ||= []);
  const slot = h("div", { "data-test": "slot" }), why = h("div", { class: "why-off" }), counter = h("p", { class: "small", style: "font-weight:600", "data-test": "counter" });
  if (notice) mount(slot, notice);
  const kind = p.secret
    ? msg("info", t("Secret ballot"), t("Nobody can see how you vote. After you vote you get a receipt code to keep."))
    : msg("warn", t("Open vote"), t("Your choice is recorded with your flat number and shown in the public record."));
  kind.setAttribute("data-test", p.secret ? "kind-secret" : "kind-open");
  const head = [h("p", { class: "eyebrow" }, t("Question ") + (i + 1) + t(" of ") + n), h("div", { class: "bar", role: "progressbar", "aria-valuemin": 0, "aria-valuemax": n, "aria-valuenow": i + 1 }, h("i", { style: `width:${Math.round(((i + 1) / n) * 100)}%` })),
    h("h2", { style: "margin-top:14px" }, (p.number ? p.number + ". " : "") + p.title), p.body ? h("p", { style: "white-space:pre-wrap" }, p.body) : null, p.endsMs ? h("p", { class: "muted small" }, t("Voting closes at ") + fmtTime(p.endsMs)) : null, kind];
  const nav = h("div", { class: "nav sticky" }, h("button", { class: "btn ghost", disabled: i === 0, onclick: () => { S.idx--; question(); }, "data-test": "q-back" }, t("Back")), h("button", { class: "btn ghost", disabled: i === n - 1, onclick: () => { S.idx++; question(); }, "data-test": "q-next" }, t("Next")));
  const w = ["Voter, flat " + S.flat, "Answer this question", multi ? "Tick your choice, then press the vote button" : "Choose Yes, No or Abstain, then press the vote button", "Each flat votes once on each question"];
  if (p.voted) { show(w, ...head, msg("ok", t("Your vote is recorded."), t("It cannot be changed."), null), nav); return; }
  const opts = p.options.map((id) => ({ value: id, label: t(lbl(p, id)) }));
  const ctrl = tiles(multi ? checks("o" + i, opts, cur(), (vals) => { S.answers[p.pointId] = vals; upd(); }) : radios("o" + i, opts, cur()[0], (v) => { S.answers[p.pointId] = [v]; upd(); }));
  ctrl.setAttribute("data-test", "options");
  const btn = big(t("Check my choice and vote"), vote, { "data-test": "vote-go" });
  function upd() {
    const sel = cur(), pr = problem(p, sel, multi); btn.disabled = !!pr; why.textContent = pr;
    counter.textContent = multi ? t("Ticked: ") + sel.length + " · " + (min === max ? t("tick exactly ") + max : t("tick ") + min + t(" to ") + max) : "";
    counter.style.color = sel.length > max ? "var(--bad)" : "var(--ink2)";
  }
  async function vote() {
    const sel = [...cur()];
    if (!S.lockOff) { // ballot lock: review screen with a 4-digit number (only if the event switched it on)
      mount(slot, loading(t("Checking your choice…")));
      try { const r = await post("/api/vote/prepare", { pointId: p.pointId, marks: marksOf(p, sel) }, S.tok); return lockScreen(p, sel, r); }
      catch (e) { if (e.code === "lock_off") S.lockOff = true; else return voteError(e, p, vote, slot); }
      mount(slot);
    }
    const text = sel.length ? sel.map((id) => t(lbl(p, id))).join(", ") : t("nobody (you ticked nothing)");
    if (await confirmBox(t("Are you sure?"), t("You are voting: ") + text + ". " + t("You cannot change your vote afterwards."), t("Yes, cast my vote"), t("No, go back"))) await cast(p, sel, null, slot);
  }
  show(w, ...head, h("p", { class: "muted small" }, p.instruction || ""), ctrl, counter, btn, why, slot, nav); upd();
}
function lockScreen(p, sel, r) {
  const inp = h("input", { type: "text", inputmode: "numeric", pattern: "[0-9]*", maxlength: "4", autocomplete: "off", "data-test": "lock-input", "aria-label": t("Type the 4-digit number"), style: "font-size:34px;text-align:center;letter-spacing:.3em;min-height:68px", placeholder: "----" });
  const slot = h("div"), why = h("div", { class: "why-off" });
  const btn = big(t("Cast my vote"), send, { "data-test": "lock-cast" });
  function upd() { const ok = /^\d{4}$/.test(inp.value.trim()); btn.disabled = !ok; why.textContent = ok ? "" : t("Type the 4-digit number shown above."); } inp.addEventListener("input", upd); upd();
  async function send() {
    mount(slot, loading(t("Sending your vote…")));
    await cast(p, sel, inp.value.trim(), slot, (e) => { if (["lock_expired", "lock_required", "lock_too_many"].includes(e.code)) { question(errorBox(e)); return true; } return false; });
  }
  show(["Voter, flat " + S.flat, "Check your choice and lock it", "Read your choice, type the number, press Cast", "A last look stops a vote cast by mistake", true],
    h("p", { class: "eyebrow" }, p.title), h("h2", null, t("Is this your choice?")), h("div", { class: "card tint", "data-test": "review" }, (r.review || []).map((x) => h("p", { style: "font-size:20px;font-weight:700;margin:4px 0" }, t(x.label)))), r.review?.length ? null : h("p", { class: "muted" }, t("You ticked nothing.")),
    h("p", { class: "center", style: "margin:16px 0 4px" }, t("To lock your vote, type this number:")), codeBlock(r.lockCode, { "data-test": "lock-code" }), field(t("Type the number here"), inp), btn, why, slot,
    ghost(t("Change my choice"), () => question(), { "data-test": "lock-back" }));
}
function voteError(e, p, retry, slot) {
  if (isSession(e)) return sessionProblem(e, ballot);
  if (isNet(e)) return mount(slot, notSent(retry));
  if (e.code === "already_voted") { p.voted = true; return show(["Voter", "Next question", "Press Continue", "Each flat votes once"], h("h2", null, t("Your vote is already recorded")), msg("ok", t("This flat has already voted on this question."), t("Maybe your first try got through just as the connection dropped. If this was a secret ballot and you did not see a receipt, tell the officer."), null), big(t("Continue"), afterVote, { "data-test": "continue" })); }
  const stop = ["window_ended", "point_closed", "not_present", "frozen"].includes(e.code);
  mount(slot, errorBox(e, stop ? null : retry), stop ? ghost(t("Back to my questions"), ballot, { "data-test": "back-to-q" }) : null);
}
async function cast(p, sel, lockCode, slot, special) {
  const again = () => cast(p, sel, lockCode, slot, special);
  mount(slot, loading(t("Sending your vote…")));
  try {
    const r = await post("/api/vote/cast", { pointId: p.pointId, marks: marksOf(p, sel), ...(lockCode ? { lockCode } : {}) }, S.tok);
    p.voted = true; delete S.answers[p.pointId];
    if (r.receipt) receiptScreen(p, r); else recordedScreen(p);
  } catch (e) {
    if (special && special(e)) return;
    voteError(e, p, again, slot);
  }
}
function recordedScreen(p) {
  show(["Voter, flat " + S.flat, "Your vote is in", "Press Continue", "Your open vote is part of the public record", true], h("h2", null, t("Your vote is recorded")), msg("ok", p.title, t("Because this was an open vote, your choice is shown with your flat number in the public record."), null), big(t("Continue"), afterVote, { "data-test": "continue" }));
}
function receiptScreen(p, r) {
  const where = S.eid ? location.origin + "/e/" + S.eid : location.origin;
  const text = ["Townhall vote receipt", "Question: " + (p.number ? p.number + ". " : "") + p.title, "Receipt: " + r.receipt, "Secret number (nonce): " + r.nonce, "", "Keep this file. It proves your vote is in the sealed box without showing your choice.", "After voting closes, check the receipt at " + where].join("\n");
  const guard = (ev) => { ev.preventDefault(); ev.returnValue = ""; }; window.addEventListener("beforeunload", guard);
  const done = h("input", { type: "checkbox", "data-test": "saved-tick", onchange: () => { lab.classList.toggle("on", done.checked); go.disabled = !done.checked; why.textContent = done.checked ? "" : t("Tick the box when you have saved your receipt. It is shown only once."); } });
  const lab = h("label", { class: "choice", style: "min-height:64px;align-items:center" }, done, h("div", null, h("b", null, t("I have saved my receipt"))));
  const why = h("div", { class: "why-off" }, t("Tick the box when you have saved your receipt. It is shown only once."));
  const go = big(t("Continue"), () => { window.removeEventListener("beforeunload", guard); afterVote(); }, { disabled: true, "data-test": "continue" });
  const save = () => { const a = h("a", { href: URL.createObjectURL(new Blob([text], { type: "text/plain" })), download: "townhall-receipt-" + (p.number || "q") + ".txt" }); document.body.append(a); a.click(); a.remove(); };
  show(["Voter, flat " + S.flat, "Save your receipt", "Copy it or download it, then tick the box", "Your receipt lets you check later that your vote was counted, without showing what you chose", true],
    h("h2", null, t("Your vote is recorded")), msg("ok", t("Save this receipt now."), t("It is shown only once. Nobody, including us, can show it to you again."), null),
    h("p", { class: "small muted", style: "margin-bottom:4px" }, t("Receipt")), longCode(r.receipt, { "data-test": "receipt" }), h("p", { class: "small muted", style: "margin:12px 0 4px" }, t("Your secret number")), longCode(r.nonce, { "data-test": "nonce" }),
    h("div", { class: "row", style: "margin-top:14px" }, h("button", { class: "btn", onclick: () => copyText(text), "data-test": "receipt-copy" }, t("Copy")), h("button", { class: "btn", onclick: save, "data-test": "receipt-download" }, t("Save this receipt (.txt)"))), lab, go, why);
}
function receiptChecker(j) {
  if (!S.eid) return h("p", { class: "muted small" }, t("After voting closes, you can check your receipt on the event's public page. Open it from your society's link."));
  const voted = (j?.voted || []).filter(Boolean);
  const sel = h("select", { "aria-label": t("Which question"), "data-test": "rc-point" }, voted.map((v) => h("option", { value: v.pointId }, (v.number ? v.number + ". " : "") + v.title)));
  const inp = h("input", { type: "text", "data-test": "rc-input", placeholder: t("Paste your receipt"), autocomplete: "off", "aria-label": t("Your receipt") }); const out = h("div"); const b = h("button", { class: "btn", style: "margin-top:10px", "data-test": "rc-go" }, t("Check my receipt"));
  b.onclick = () => busy(b, async () => {
    if (!inp.value.trim()) { mount(out, msg("warn", t("Paste your receipt first."))); return; }
    try { const r = await get(`/api/events/${S.eid}/receipts/${sel.value}?check=${encodeURIComponent(inp.value.trim())}`); mount(out, r.found ? msg("ok", t("Found."), t("Your receipt is in the sealed box for this question.")) : msg("warn", t("Not found."), t("Check that you pasted the whole receipt, and picked the right question."))); }
    catch (e) { mount(out, e.code === "not_sealed" ? msg("info", e.message, t("Come back after voting on this question has closed.")) : isNet(e) ? notSent(() => b.onclick()) : errorBox(e)); }
  });
  return h("div", { class: "card" }, h("h3", null, t("Check my receipt")), h("p", { class: "muted small" }, t("Works after voting on the question has closed. The list of receipts becomes public then.")), voted.length > 1 ? field(t("Which question"), sel) : null, field(t("Your receipt"), inp), b, out);
}
async function idle() {
  let j = null;
  try { j = (await get("/api/vote/resume", S.tok)).journey; } catch (e) { if (isSession(e)) return sessionProblem(e, idle); }
  const finished = j?.step === "finished"; const slot = h("div", { "data-test": "new-q" });
  const rows = (j?.voted || []).map((v) => h("li", null, (v.number ? v.number + ". " : "") + v.title));
  show(["Voter, flat " + S.flat, finished ? "You are done" : "Wait for the next question", finished ? "Nothing more to do" : "This screen checks by itself every few seconds", "Each question opens and closes at a set time", true],
    h("h2", { "data-test": "idle-title" }, finished ? t("Thank you. Your votes are recorded.") : t("No question is open for you right now")),
    j?.message ? msg(finished ? "ok" : "info", j.message) : null, rows.length ? h("div", { class: "card tint" }, h("h3", null, t("You have voted on")), h("ul", { style: "margin:0;padding-left:20px" }, rows)) : null, slot,
    j?.voted?.length ? receiptChecker(j) : null, S.eid ? big(t("See the live record"), () => { location.href = "/e/" + S.eid; }, { "data-test": "to-record" }) : null,
    finished ? null : ghost(t("Check again"), ballot, { "data-test": "check-again" }));
  if (!finished) poll(async (alive) => { const d = await loadPoints(); if (!alive()) return; const k = d.points.findIndex((p) => !p.voted); if (k >= 0) { S.idx = k; question(); } }, 8000);
}

// ---------------------------------------------------------------- start
const hm = /^\/h\/([A-Za-z0-9_-]{8,128})/.exec(location.pathname), vm = /\b([0-9a-f]{32})\b/.exec(location.pathname);
if (hm) await handshake(hm[1]);
else if (vm) await direct(vm[1]);
else show(["Voter", "Open your voting link", "Use the link from your society or the officer", "The link tells us which event you are voting in", true], h("h2", null, t("Open your voting link")), h("p", { class: "muted" }, t("Use the link your society sent you, or the check-in link from the officer.")), resumeBox());

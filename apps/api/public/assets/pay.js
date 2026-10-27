// PAY PAGE: anyone with a payment link (a treasurer, a committee member, a member) can pay the event fee or the postponement fee. No sign-in.
// This page never has a card, UPI or bank-detail form. In TEST mode it has one clearly labelled test button; with real payments on, the payment happens at the payment service (IT Services by Rajat Agarwal).
import { h, frame, app, mount, t, get, post, field, stepBar, wwh, errorBox, msg, busy, loading, fmtMoney, fmtTime, copyText } from "/assets/core.js";

await frame({ nav: false });
const root = app();
const token = (/^\/pay\/([A-Za-z0-9_.-]{8,200})/.exec(location.pathname) || [])[1];
const S = { d: null, payer: null, step: 0, justPaid: false, seenMs: 0 };

const reasonWords = (d) => d.purpose === "reschedule" ? t("Postponement fee (moving the meeting again)") : (d.event?.kind === "election" ? t("Event fee for an election") : t("Event fee for a meeting"));
const maskMail = (e) => { const [a, b = ""] = String(e).split("@"); const [dom, ...rest] = b.split("."); return a.slice(0, 2) + "***@" + dom.slice(0, 1) + "***" + (rest.length ? "." + rest.join(".") : ""); };
const isNet = (e) => e?.code === "offline" || e?.status === 0 || e?.status >= 500;
let timer = null, alive = 0;

function summary(d) {
  return h("div", { class: "card", "data-test": "pay-summary" },
    h("p", { class: "eyebrow" }, d.event?.society || ""), h("h2", null, d.event?.title || t("Event")),
    h("dl", { class: "kv" }, h("dt", null, t("What you are paying for")), h("dd", { "data-test": "pay-reason" }, reasonWords(d)), h("dt", null, t("Amount")), h("dd", { "data-test": "pay-amount", style: "font-size:22px;font-weight:700" }, fmtMoney(d.amountMinor, d.currency)),
      h("dt", null, t("Status")), h("dd", null, d.paid ? h("span", { class: "badge ok" }, t("Paid")) : h("span", { class: "badge warn" }, t("Not paid yet")), " ", d.mode === "test" ? h("span", { class: "badge gold" }, t("Test mode - no real money")) : null)),
    d.note ? h("p", { class: "muted small", style: "margin-top:10px" }, t(d.note)) : null);
}
function frameOf(d, ...kids) {
  stopPoll();
  mount(root, wwh(t("Anyone with this link: a treasurer, a committee member or a member"), t("Pay the fee for this event"), t("Give your name and e-mail, then pay"), t("The event cannot go ahead until the fee is paid")), summary(d),
    d.paid ? null : stepBar([{ title: t("Your details"), state: S.step > 0 ? "done" : "cur" }, { title: t("Pay"), state: S.step > 0 ? "cur" : "todo" }, { title: t("Receipt"), state: "todo" }]), ...kids);
}
function stopPoll() { alive++; clearTimeout(timer); }
/** The page checks the payment by itself every 6 seconds while it is open and visible. */
function startPoll() {
  const mine = ++alive;
  const tick = async () => {
    if (mine !== alive) return;
    if (!document.hidden) { try { const d = await get("/api/pay/link/" + token); if (mine !== alive) return; if (d.paid) { S.d = d; S.justPaid = true; return receipt(); } } catch { /* try again */ } }
    timer = setTimeout(tick, 6000);
  };
  timer = setTimeout(tick, 6000);
}

async function load() {
  mount(root, loading());
  if (!token) return mount(root, msg("bad", t("This payment link is not complete."), null, t("How to fix: ") + t("Open the whole link you were sent, or ask for a new one.")));
  try { S.d = await get("/api/pay/link/" + token); } catch (e) { return mount(root, h("h2", null, t("We could not open this payment link")), isNet(e) ? msg("warn", t("Not reached yet"), t("Check your connection and try again."), null) : errorBox(e, load), isNet(e) ? h("button", { class: "btn", onclick: load, "data-test": "try-again" }, t("Try again")) : null); }
  await returnFromCheckout();
  if (S.d.paid) return receipt();
  S.step = 0; payerStep();
}
/** If the payment service sent the buyer back with the result in the part after #, we ask the server to check it. Nothing from card forms ever reaches this page. */
async function returnFromCheckout() {
  const q = new URLSearchParams(location.hash.slice(1)); const o = q.get("razorpay_order_id"), p = q.get("razorpay_payment_id"), s = q.get("razorpay_signature");
  if (!o || !p || !s) return;
  try { history.replaceState(null, "", location.pathname); } catch { /* old browser */ }
  try { const r = await post(`/api/pay/link/${token}/verify`, { razorpay_order_id: o, razorpay_payment_id: p, razorpay_signature: s }); S.d = await get("/api/pay/link/" + token); if (r.paid) S.justPaid = true; }
  catch (e) { S.verifyError = e; }
}

function payerStep() {
  const d = S.d; const name = h("input", { type: "text", id: "payer-name", autocomplete: "name", "data-test": "payer-name", value: S.payer?.name || "" });
  const mail = h("input", { type: "email", id: "payer-email", autocomplete: "email", "data-test": "payer-email", value: S.payer?.email || "" });
  const slot = h("div"); const btn = h("button", { class: "btn big", style: "width:100%;margin-top:14px", onclick: save, "data-test": "payer-save" }, t("Next: pay"));
  async function save() {
    for (const i of [name, mail]) i.classList.remove("err");
    const nm = name.value.trim(), em = mail.value.trim(); const bad = [];
    if (nm.length < 2) { name.classList.add("err"); bad.push(t("Type your name (at least 2 letters).")); }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em)) { mail.classList.add("err"); bad.push(t("Type your e-mail correctly, for example name@example.com.")); }
    if (bad.length) { mount(slot, msg("bad", bad[0], bad[1] || null, null)); return; }
    await busy(btn, async () => {
      try { await post(`/api/pay/link/${token}/payer`, { name: nm, email: em }); S.payer = { name: nm, email: em }; S.step = 1; payStep(); }
      catch (e) { mount(slot, isNet(e) ? msg("warn", t("Not sent yet"), t("Your name and e-mail are kept on this screen. Check your connection and press the button again."), null) : errorBox(e, save)); }
    });
  }
  frameOf(d, S.verifyError ? errorBox(S.verifyError) : null, h("div", { class: "card" }, h("h3", null, t("Step 1: who is paying?")),
    msg("info", t("Your name and e-mail are stored encrypted."), t("They are used only for your receipt. They are never shown on any public page."), null), field(t("Your name"), name), field(t("Your e-mail"), mail), btn, slot));
  startPoll();
}
function payStep() {
  const d = S.d; const slot = h("div");
  let body;
  if (d.mode === "test") {
    const btn = h("button", { class: "btn gold big", style: "width:100%", "data-test": "test-pay", onclick: () => busy(btn, async () => {
      try { await post(`/api/pay/link/${token}/test-pay`, {}); S.d = await get("/api/pay/link/" + token); S.justPaid = true; receipt(); }
      catch (e) { mount(slot, isNet(e) ? msg("warn", t("Not sent yet"), t("Check your connection and press the button again."), null) : errorBox(e, () => btn.click())); }
    }) }, t("Test payment - no real money"));
    body = h("div", null, msg("warn", t("This is a test."), t("No money moves. The button below only marks this fee as paid so you can see how the page works."), null), btn);
  } else if (typeof d.payUrl === "string" && /^https:\/\//.test(d.payUrl)) {
    body = h("div", null, h("p", null, t("You will pay on the secure page of our payment service, IT Services by Rajat Agarwal. Card and bank details are typed there, never on this page.")),
      h("a", { class: "btn gold big", style: "width:100%", href: d.payUrl, rel: "noopener", "data-test": "pay-go" }, t("Pay ") + fmtMoney(d.amountMinor, d.currency) + t(" securely")), h("p", { class: "muted small", style: "margin-top:10px" }, t("After you pay you come back to this page. It then shows your receipt.")));
  } else {
    body = h("div", null, msg("info", t("The secure payment page is not open yet for this link."), t("Card and bank details are never typed on this page. Ask the person who sent you this link to try again later, or keep this page open: it checks by itself and shows your receipt as soon as the payment is confirmed."), null),
      d.orderId ? h("dl", { class: "kv" }, h("dt", null, t("Payment reference")), h("dd", { class: "mono", "data-test": "pay-ref" }, d.orderId)) : null,
      d.txnId ? h("dl", { class: "kv" }, h("dt", null, t("Transaction")), h("dd", { class: "mono" }, d.txnId)) : null,
      d.checkoutOrigin ? h("p", { class: "muted small" }, t("Payment service: ") + d.checkoutOrigin.replace(/^https?:\/\//, "")) : null);
  }
  frameOf(d, h("div", { class: "card" }, h("h3", null, t("Step 2: pay")), h("p", { class: "muted small" }, t("Paying as ") + S.payer.name + " (" + maskMail(S.payer.email) + ")"), body, slot,
    h("div", { class: "nav" }, h("button", { class: "btn ghost", onclick: () => { S.step = 0; payerStep(); }, "data-test": "back" }, t("Back")), h("span", { class: "muted small" }, t("This page checks for your payment by itself.")))));
  startPoll();
}

function receipt() {
  stopPoll(); const d = S.d; const ref = String(token).split(".")[0];
  const test = d.mode === "test";
  mount(root, wwh(t("The person who paid, or anyone keeping the society's records"), t("Keep this receipt"), t("Print it or save it as PDF from the print screen"), t("It shows what was paid, for which event, and when you saw it")),
    S.justPaid ? msg("ok", t("Payment received. Thank you."), t("The event is now paid. You can close this page."), null) : null,
    h("div", { class: "card", id: "receipt", "data-test": "receipt" },
      h("p", { class: "eyebrow" }, test ? t("Test receipt - no real money was paid") : t("Payment receipt")), h("h2", null, d.event?.society || ""),
      h("dl", { class: "kv" }, h("dt", null, t("Event")), h("dd", null, d.event?.title || ""), h("dt", null, t("Paid for")), h("dd", null, reasonWords(d)), h("dt", null, t("Amount")), h("dd", { style: "font-weight:700", "data-test": "receipt-amount" }, fmtMoney(d.amountMinor, d.currency)),
        h("dt", null, t("Status")), h("dd", null, h("span", { class: "badge ok" }, t("Paid"))), S.payer ? [h("dt", null, t("Paid by")), h("dd", null, S.payer.name + " (" + maskMail(S.payer.email) + ")")] : null,
        h("dt", null, t("Receipt number")), h("dd", { class: "mono", "data-test": "receipt-no" }, ref), d.txnId ? [h("dt", null, t("Transaction")), h("dd", { class: "mono" }, d.txnId)] : null, h("dt", null, t("Shown on")), h("dd", null, fmtTime(Date.now()))),
      h("p", { class: "muted small" }, t("Personal details are partly hidden on this receipt. Records are tamper-evident and can be checked by anyone."))),
    h("div", { class: "row" }, h("button", { class: "btn big", onclick: () => window.print(), "data-test": "print" }, t("Print this receipt")), h("button", { class: "btn ghost big", onclick: () => copyText(location.origin + location.pathname), "data-test": "copy-link" }, t("Copy this page's link"))));
}

load();

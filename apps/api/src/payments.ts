// All money goes through IT SERVICES BY RAJAT AGARWAL (the central payment service, ledger B), exactly as Corporate Tambola's payments do. This product is "a website" of that service:
//   order  -> POST {central}/api/pay/order    (header x-site-key)  opens ONE Razorpay order tagged with our txn_id
//   verify -> POST {central}/api/pay/verify   checks the checkout signature AND asks Razorpay what really happened
//   hook   <- the central service forwards each Razorpay webhook here (raw body, X-Razorpay-Signature, X-Razorpay-Event-Id)
//   summary-> POST {central}/api/pay/site-summary  (ledger C -> ledger B monthly totals)
// Ledger C (this product) keeps one row per attempt, per refund and per delivery, with the same ids as A and B. Nothing here ever stores card data or a payer's full e-mail or mobile number.
import { maskEmail, maskPhone } from "../../../packages/engine/src";
import { err, type Ctx, type Env } from "./core";

/** Every payment of this product goes through the owner's central service, IT SERVICES BY RAJAT AGARWAL, unless a deployment points elsewhere. It needs this product's site key and its registered host name (PAY_SITE). */
export const CENTRAL_DEFAULT = "https://itservices-rajat-agarwal.pages.dev";
export const centralConfigured = (env: Env) => !!(env.PAY_SERVICE_KEY && env.PAY_SITE);
const base = (env: Env) => (env.PAY_SERVICE_URL ?? CENTRAL_DEFAULT).replace(/\/+$/, "");
const siteHeaders = (env: Env) => ({ "content-type": "application/json", "x-site-key": env.PAY_SERVICE_KEY ?? "" });
export const PRODUCT = "townhall";

export interface OrderInfo { orderId: string | null; keyId: string | null; txnId: string | null }
/** Opens the order at the central service. With the service configured a failure is an error (nobody pays into nothing); in TEST mode with no service a local test order is used. */
export async function centralOrder(c: Ctx, p: { paymentId: string; kind: string; purpose: "event" | "reschedule"; amountMinor: number; currency: string; eventId: string; label: string; userRef: string }): Promise<OrderInfo> {
  if (!centralConfigured(c.env)) { if (c.env.TEST_MODE === "1") return { orderId: null, keyId: null, txnId: null }; throw err(503, "pay_disabled", "Payments are not switched on yet."); }
  let r: Response;
  try {
    r = await fetch(`${base(c.env)}/api/pay/order`, { method: "POST", headers: siteHeaders(c.env), signal: AbortSignal.timeout(8000),
      body: JSON.stringify({ site: c.env.PAY_SITE, product: PRODUCT, plan: p.purpose === "event" ? p.kind : `reschedule_${p.kind}`, amount_minor: p.amountMinor, currency: p.currency, payment_ref: p.paymentId, user: p.userRef, label: p.label.slice(0, 80), extra_notes: { event: p.eventId.slice(0, 8), purpose: p.purpose } }) });
  } catch { throw err(502, "pay_unreachable", "The payment service could not be reached. Please try again in a minute."); }
  const d: any = await r.json().catch(() => ({}));
  if (!r.ok || !d.orderId) throw err(502, "pay_order_failed", "The payment could not be opened. Please try again in a minute.");
  return { orderId: String(d.orderId), keyId: d.keyId ? String(d.keyId) : null, txnId: d.txn_id ? String(d.txn_id) : null };
}

export interface AttemptIn {
  rzpPaymentId: string; rzpOrderId: string | null; paymentId: string; eventId: string; txnId: string | null; status: "created" | "authorized" | "paid" | "failed" | "refunded"; amountMinor: number; currency: string;
  method?: string | null; bank?: string | null; cardNetwork?: string | null; cardType?: string | null; cardLast4?: string | null; vpa?: string | null; rrn?: string | null;
  errorCode?: string | null; errorDescription?: string | null; errorReason?: string | null; feeMinor?: number | null; taxMinor?: number | null; international?: boolean | null; email?: string | null; contact?: string | null; atMs: number;
}
/** Files one attempt. A paid attempt is never turned back into anything else by a late failure event. */
export async function recordAttempt(c: Ctx, a: AttemptIn): Promise<void> {
  const vpa = a.vpa ? a.vpa.replace(/^(.{2}).*(@.*)$/, "$1***$2") : null;
  await c.db.prepare(`INSERT INTO payment_attempt(rzp_payment_id,rzp_order_id,payment_id,event_id,txn_id,status,amount_minor,currency,method,bank,card_network,card_type,card_last4,vpa_masked,rrn,error_code,error_description,error_reason,fee_minor,tax_minor,is_international,payer_email_masked,payer_phone_masked,created_ms,authorized_ms,paid_ms,failed_ms,updated_ms)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(rzp_payment_id) DO UPDATE SET
      status=CASE WHEN payment_attempt.status='paid' OR payment_attempt.status='refunded' THEN payment_attempt.status ELSE excluded.status END,
      method=COALESCE(excluded.method,payment_attempt.method), bank=COALESCE(excluded.bank,payment_attempt.bank), card_network=COALESCE(excluded.card_network,payment_attempt.card_network), card_type=COALESCE(excluded.card_type,payment_attempt.card_type),
      card_last4=COALESCE(excluded.card_last4,payment_attempt.card_last4), vpa_masked=COALESCE(excluded.vpa_masked,payment_attempt.vpa_masked), rrn=COALESCE(excluded.rrn,payment_attempt.rrn),
      error_code=COALESCE(excluded.error_code,payment_attempt.error_code), error_description=COALESCE(excluded.error_description,payment_attempt.error_description), error_reason=COALESCE(excluded.error_reason,payment_attempt.error_reason),
      fee_minor=COALESCE(excluded.fee_minor,payment_attempt.fee_minor), tax_minor=COALESCE(excluded.tax_minor,payment_attempt.tax_minor), txn_id=COALESCE(payment_attempt.txn_id,excluded.txn_id),
      authorized_ms=COALESCE(payment_attempt.authorized_ms,excluded.authorized_ms), paid_ms=COALESCE(payment_attempt.paid_ms,excluded.paid_ms), failed_ms=COALESCE(payment_attempt.failed_ms,excluded.failed_ms), updated_ms=excluded.updated_ms`)
    .bind(a.rzpPaymentId, a.rzpOrderId, a.paymentId, a.eventId, a.txnId, a.status, a.amountMinor, a.currency, a.method ?? null, a.bank ?? null, a.cardNetwork ?? null, a.cardType ?? null, a.cardLast4 ?? null, vpa, a.rrn ?? null,
      a.errorCode ?? null, a.errorDescription ?? null, a.errorReason ?? null, a.feeMinor ?? null, a.taxMinor ?? null, a.international === null || a.international === undefined ? null : a.international ? 1 : 0,
      a.email ? maskEmail(a.email) : null, a.contact ? maskPhone(a.contact) : null, a.atMs, a.status === "authorized" ? a.atMs : null, a.status === "paid" ? a.atMs : null, a.status === "failed" ? a.atMs : null, a.atMs).run();
}

/** Asks the central service to check what the buyer's checkout returned (signature + what Razorpay really holds). */
export async function centralVerify(c: Ctx, p: { orderId: string; paymentId: string; signature: string }): Promise<any> {
  if (!centralConfigured(c.env)) throw err(503, "pay_disabled", "Payments are not switched on yet.");
  let r: Response;
  try { r = await fetch(`${base(c.env)}/api/pay/verify`, { method: "POST", headers: siteHeaders(c.env), signal: AbortSignal.timeout(10000), body: JSON.stringify({ site: c.env.PAY_SITE, razorpay_order_id: p.orderId, razorpay_payment_id: p.paymentId, razorpay_signature: p.signature }) }); }
  catch { throw err(502, "pay_unreachable", "The payment service could not be reached. Your payment is safe; we check again automatically."); }
  const d: any = await r.json().catch(() => ({}));
  if (!r.ok) throw err(r.status === 409 ? 409 : 400, "pay_verify_failed", "The payment could not be confirmed (" + String(d.error ?? r.status).slice(0, 80) + ").");
  return d;
}

const hmacHex = async (secret: string, data: string) => { const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]); return Array.from(new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(data))), (x) => x.toString(16).padStart(2, "0")).join(""); };
const same = (a: string, b: string) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };
export { hmacHex, same };

export type PaidHook = (eventId: string, paymentId: string, via: string) => Promise<void>;
/** A delivery forwarded by the central service. Returns the answer text. Never throws for a delivery it understood (Razorpay would retry for ever); throws 401 for a bad signature. */
export async function handleRazorpayWebhook(c: Ctx, raw: string, markPaid: PaidHook): Promise<{ result: string }> {
  const secret = c.env.RAZORPAY_WEBHOOK_SECRET; const sig = c.req.headers.get("x-razorpay-signature") ?? ""; const evId = c.req.headers.get("x-razorpay-event-id");
  if (!secret) throw err(404, "not_found", "Not found.");
  if (!sig || !same(await hmacHex(secret, raw), sig)) { await logHook(c, evId ? "bad:" + evId : null, null, 0, "bad signature"); throw err(401, "bad_signature", "Bad signature."); }
  if (evId && (await c.db.prepare("SELECT 1 x FROM webhook_log WHERE rzp_event_id=?").bind(evId).first())) return { result: "duplicate" };
  let ev: any; try { ev = JSON.parse(raw); } catch { await logHook(c, evId, null, 1, "not json"); return { result: "ignored" }; }
  const name = String(ev?.event ?? ""); const pay = ev?.payload?.payment?.entity; const ref = ev?.payload?.refund?.entity; const at = (ev?.created_at ? Number(ev.created_at) * 1000 : c.now);
  let result = "ignored";
  if (pay && /^payment\.(authorized|captured|failed)$|^order\.paid$/.test(name)) {
    const ours = await ourPayment(c, pay);
    if (!ours) result = "not ours";
    else {
      const status = pay.status === "captured" ? "paid" : pay.status === "authorized" ? "authorized" : pay.status === "failed" ? "failed" : pay.status === "refunded" ? "refunded" : "created";
      await recordAttempt(c, attemptOf(pay, ours, status, at));
      if (status === "paid") { if (Number(pay.amount) === ours.amount_minor && String(pay.currency) === ours.currency) { await markPaid(ours.event_id, ours.payment_id, "webhook"); result = "paid"; } else result = "amount mismatch: not marked paid"; }
      else result = status;
    }
  } else if (ref && /^refund\.(created|processed|failed)$/.test(name)) {
    const ours = await c.db.prepare("SELECT payment_id, event_id, currency FROM payment_attempt WHERE rzp_payment_id=?").bind(String(ref.payment_id ?? "")).first<any>();
    await c.db.prepare(`INSERT INTO payment_refund(rzp_refund_id,rzp_payment_id,payment_id,event_id,amount_minor,currency,status,created_ms,processed_ms,updated_ms) VALUES(?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(rzp_refund_id) DO UPDATE SET status=excluded.status, processed_ms=COALESCE(excluded.processed_ms,payment_refund.processed_ms), updated_ms=excluded.updated_ms`)
      .bind(String(ref.id), String(ref.payment_id ?? ""), ours?.payment_id ?? null, ours?.event_id ?? null, Number(ref.amount ?? 0), ours?.currency ?? String(ref.currency ?? ""), String(ref.status ?? name.split(".")[1]), at, name === "refund.processed" ? at : null, c.now).run();
    result = "refund " + name.split(".")[1];
  }
  await logHook(c, evId, name, 1, result); return { result };
}
async function logHook(c: Ctx, evId: string | null, name: string | null, ok: number, result: string) {
  try { await c.db.prepare("INSERT OR IGNORE INTO webhook_log(rzp_event_id,event,signature_ok,result,at_ms) VALUES(?,?,?,?,?)").bind(evId, name, ok, result.slice(0, 120), c.now).run(); } catch { /* the log never blocks a delivery */ }
}
/** Which of OUR payments is this Razorpay payment? By the payment_ref we put in the order notes, and only if the order id matches too. */
async function ourPayment(c: Ctx, pay: any) {
  const ref = String(pay?.notes?.payment_ref ?? ""); if (!ref) return null;
  const row = await c.db.prepare("SELECT payment_id, event_id, order_id, txn_id, amount_minor, currency FROM payments WHERE payment_id=? AND state='created' ORDER BY id LIMIT 1").bind(ref).first<any>();
  if (!row || (row.order_id && String(pay.order_id) !== row.order_id)) return null; return row;
}
function attemptOf(p: any, ours: any, status: AttemptIn["status"], atMs: number): AttemptIn {
  return { rzpPaymentId: String(p.id), rzpOrderId: p.order_id ? String(p.order_id) : null, paymentId: ours.payment_id, eventId: ours.event_id, txnId: ours.txn_id ?? p?.notes?.txn_id ?? null, status, amountMinor: Number(p.amount), currency: String(p.currency ?? ours.currency),
    method: p.method ?? null, bank: p.bank ?? null, cardNetwork: p.card?.network ?? null, cardType: p.card?.type ?? null, cardLast4: p.card?.last4 ?? null, vpa: p.vpa ?? null, rrn: p.acquirer_data?.rrn ?? null,
    errorCode: p.error_code ?? null, errorDescription: p.error_description ?? null, errorReason: p.error_reason ?? null, feeMinor: typeof p.fee === "number" ? p.fee : null, taxMinor: typeof p.tax === "number" ? p.tax : null, international: typeof p.international === "boolean" ? p.international : null, email: p.email ?? null, contact: p.contact ?? null, atMs };
}
export { attemptOf, ourPayment };

/** Ledger C for the owner (Bearer OWNER_LEDGER_KEY): one line per payment with its attempts, refunds, fee, tax and net, optionally for one month (YYYY-MM, IST). */
export async function ownerLedger(c: Ctx, month: string | null) {
  const key = c.env.OWNER_LEDGER_KEY; if (!key || !same(c.req.headers.get("authorization") ?? "", "Bearer " + key)) throw err(404, "not_found", "Not found.");
  const IST = 19_800_000; let from = 0, to = 8.64e15; if (month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month)) { const [y, m] = month.split("-").map(Number); from = Date.UTC(y!, m! - 1, 1) - IST; to = Date.UTC(y!, m!, 1) - IST; }
  const pays = (await c.db.prepare("SELECT payment_id, event_id, txn_id, order_id rzp_order_id, amount_minor, currency, ref purpose, at_ms FROM payments WHERE state='created' AND at_ms>=? AND at_ms<? ORDER BY id").bind(from, to).all<any>()).results;
  const out = [];
  for (const p of pays) {
    const atts = (await c.db.prepare("SELECT rzp_payment_id, status, method, bank, card_network, card_last4, rrn, fee_minor, tax_minor, error_code, error_reason, payer_email_masked, payer_phone_masked, created_ms, paid_ms, failed_ms FROM payment_attempt WHERE payment_id=? ORDER BY created_ms").bind(p.payment_id).all<any>()).results;
    const refs = (await c.db.prepare("SELECT rzp_refund_id, amount_minor, status, processed_ms FROM payment_refund WHERE payment_id=? ORDER BY created_ms").bind(p.payment_id).all<any>()).results;
    const paid = atts.find((a: any) => a.status === "paid" || a.status === "refunded"); const refunded = refs.filter((r: any) => r.status === "processed").reduce((s: number, r: any) => s + r.amount_minor, 0);
    out.push({ ledgerPath: `razorpay / IT Services / ${c.env.PAY_SITE ?? "?"} / sales / ${p.purpose === "reschedule" ? "reschedule" : "event"}`, ...p, status: paid ? (refunded >= p.amount_minor ? "refunded" : "paid") : atts.some((a: any) => a.status === "failed") ? "failed_so_far" : "unpaid", attempts: atts, refunds: refs, refunded_minor: refunded, net_minor: paid ? p.amount_minor - (paid.fee_minor ?? 0) - (paid.tax_minor ?? 0) - refunded : 0 });
  }
  return out;
}

/** Ledger C -> ledger B: this month's and last month's totals, per currency, best effort (the owner report compares them with B). */
export async function pushSiteSummary(c: Ctx): Promise<number> {
  if (!centralConfigured(c.env)) return 0; const IST = 19_800_000; const d = new Date(c.now + IST); let sent = 0;
  for (const back of [0, 1]) {
    const y = d.getUTCFullYear(), m = d.getUTCMonth() - back; const start = Date.UTC(y, m, 1) - IST, end = Date.UTC(y, m + 1, 1) - IST; const key = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);
    for (const cur of ["INR", "USD"]) {
      const a = await c.db.prepare("SELECT SUM(CASE WHEN status IN ('paid','refunded') AND paid_ms>=? AND paid_ms<? THEN 1 ELSE 0 END) paid, SUM(CASE WHEN status='failed' AND failed_ms>=? AND failed_ms<? THEN 1 ELSE 0 END) failed, SUM(CASE WHEN status IN ('paid','refunded') AND paid_ms>=? AND paid_ms<? THEN amount_minor ELSE 0 END) revenue, SUM(CASE WHEN status IN ('paid','refunded') AND paid_ms>=? AND paid_ms<? THEN COALESCE(fee_minor,0) ELSE 0 END) fee, SUM(CASE WHEN status IN ('paid','refunded') AND paid_ms>=? AND paid_ms<? THEN COALESCE(tax_minor,0) ELSE 0 END) tax FROM payment_attempt WHERE currency=?")
        .bind(start, end, start, end, start, end, start, end, start, end, cur).first<any>();
      const rf = await c.db.prepare("SELECT COALESCE(SUM(amount_minor),0) r FROM payment_refund WHERE status='processed' AND processed_ms>=? AND processed_ms<? AND currency=?").bind(start, end, cur).first<{ r: number }>();
      if (!a || (!a.paid && !a.failed)) continue;
      try { const r = await fetch(`${base(c.env)}/api/pay/site-summary`, { method: "POST", headers: siteHeaders(c.env), signal: AbortSignal.timeout(8000), body: JSON.stringify({ site: c.env.PAY_SITE, period_key: key, currency: cur, paid_count: a.paid ?? 0, failed_count: a.failed ?? 0, revenue_minor: a.revenue ?? 0, fee_minor: a.fee ?? 0, tax_minor: a.tax ?? 0, refunded_minor: rf?.r ?? 0, commission_accrued_minor: 0, commission_paid_minor: 0 }) }); if (r.ok) sent++; } catch { /* next tick */ }
    }
  }
  return sent;
}

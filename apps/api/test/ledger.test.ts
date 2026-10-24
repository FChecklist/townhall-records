// Owner directive 2026-10-24: ALL payments go through IT SERVICES BY RAJAT AGARWAL (ledger B), like Corporate Tambola; Razorpay is ledger A; this product keeps ledger C with the same ids.
// The central service is replaced by a stub that follows its real contract (order, verify, forwarded webhook, site-summary).
import { afterEach, describe, expect, test } from "bun:test";
import { DAY, H, ORG, getLog, newEvent } from "./harness";
import { handle } from "../src/handler";
import { maskEmail } from "../../../packages/engine/src";

const SITE = "townhall.pages.dev", KEY = "site-key-123", HOOK = "whsec_test_secret";
interface Seen { orders: any[]; verifies: any[]; summaries: any[]; headers: Array<string | null> }
const realFetch = globalThis.fetch; afterEach(() => { globalThis.fetch = realFetch; });
function central(o: { orderFails?: boolean; verify?: (b: any) => any } = {}): Seen {
  const seen: Seen = { orders: [], verifies: [], summaries: [], headers: [] }; let n = 0;
  globalThis.fetch = (async (url: any, init: any) => {
    const u = String(url); const body = init?.body ? JSON.parse(init.body) : {}; seen.headers.push(new Headers(init?.headers).get("x-site-key"));
    if (u === "https://itservices-rajat-agarwal.pages.dev/api/pay/order") { seen.orders.push(body); if (o.orderFails) return new Response(JSON.stringify({ error: "x" }), { status: 502 }); n++; return new Response(JSON.stringify({ ok: true, txn_id: "TWN-" + body.payment_ref, keyId: "rzp_live_stub", orderId: "order_stub" + n, amount_minor: body.amount_minor, currency: body.currency })); }
    if (u.endsWith("/api/pay/verify")) { seen.verifies.push(body); { const v = o.verify ? o.verify(body) : { ok: true, paid: true, status: "captured", fee_minor: 1178, tax_minor: 180, method: "upi", payer_email: "buyer@example.org", txn_id: "TWN-x" }; return new Response(JSON.stringify(v), { status: v.error ? 409 : 200 }); } }
    if (u.endsWith("/api/pay/site-summary")) { seen.summaries.push(body); return new Response(JSON.stringify({ ok: true })); }
    return realFetch(url, init);
  }) as any; return seen;
}
const live = () => H.make({ PAY_SERVICE_KEY: KEY, PAY_SITE: SITE, RAZORPAY_WEBHOOK_SECRET: HOOK, OWNER_LEDGER_KEY: "owner-ledger-key" });
const hex = async (secret: string, data: string) => { const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]); return Array.from(new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(data))), (x) => x.toString(16).padStart(2, "0")).join(""); };
async function hook(h: H, ev: any, o: { evId?: string; secret?: string } = {}) {
  const raw = JSON.stringify(ev); const r = await handle(new Request("http://x/api/pay/webhook", { method: "POST", headers: { "content-type": "application/json", "x-razorpay-signature": await hex(o.secret ?? HOOK, raw), "x-razorpay-event-id": o.evId ?? "evt_" + Math.random().toString(16).slice(2), "x-device-id": "central-forwarder-0001" }, body: raw }), h.env, h.now);
  return { status: r.status, body: (await r.json().catch(() => ({}))) as any };
}
const payEntity = (o: any, over: any = {}) => ({ id: "pay_rzp1", order_id: o.orderId, amount: 49900, currency: "INR", status: "captured", method: "upi", vpa: "buyer@okbank", email: "buyer@example.org", contact: "+919812345678", fee: 1178, tax: 180, international: false, acquirer_data: { rrn: "123456789012" }, notes: { payment_ref: o.paymentId, txn_id: o.txnId }, ...over });
const ev = (event: string, entity: any, kind: "payment" | "refund" = "payment") => ({ event, created_at: Math.floor(Date.now() / 1000), payload: { [kind]: { entity } } });

describe("every payment goes through IT SERVICES BY RAJAT AGARWAL", () => {
  test("the order is opened at the central service with our site key, the ledger path fields and our payment id; the event is not paid until the central service confirms", async () => {
    const seen = central(); const h = await live(); const e = await newEvent(h);
    const r = await h.call("POST", `/api/events/${e.eid}/pay`, {}, e.org); expect(r.status).toBe(201); expect(r.body.mode).toBe("test"); // the test harness runs with the Turnstile/test switch on; the order still goes through the central service expect(r.body.orderId).toBe("order_stub1"); expect(r.body.txnId).toBe("TWN-" + r.body.paymentId); expect(r.body.keyId).toBe("rzp_live_stub");
    expect(seen.orders[0]).toMatchObject({ site: SITE, product: "townhall", plan: "meeting", amount_minor: 49900, currency: "INR", payment_ref: r.body.paymentId }); expect(seen.headers[0]).toBe(KEY);
    expect((await h.call("GET", `/api/events/${e.eid}`)).body.model.payments.some((p: any) => p.state === "paid")).toBe(false);
    expect(h.raw.query("SELECT txn_id, order_id, mode FROM payments WHERE state='created'").get()).toEqual({ txn_id: "TWN-" + r.body.paymentId, order_id: "order_stub1", mode: "test" });
    const logged = JSON.stringify((await getLog(h, e.eid)).entries); expect(logged).toContain("order_stub1"); expect(logged).not.toContain(KEY);
  });
  test("if the central service cannot open the order nothing is created and the Organizer is told to try again", async () => {
    central({ orderFails: true }); const h = await live(); const e = await newEvent(h);
    const r = await h.call("POST", `/api/events/${e.eid}/pay`, {}, e.org); expect(r.status).toBe(502); expect(r.body.error).toBe("pay_order_failed"); expect(h.count("SELECT COUNT(*) c FROM payments")).toBe(0);
  });
  test("a payment link: anyone pays; the checkout result is verified by the central service; the attempt lands in ledger C with fee, tax, method and a masked payer", async () => {
    const seen = central(); const h = await live(); const e = await newEvent(h);
    const link = await h.call("POST", `/api/events/${e.eid}/pay-link`, {}, e.org); const t = link.body.payPath.replace("/pay/", "");
    const view = await h.call("GET", `/api/pay/link/${t}`); expect(view.body).toMatchObject({ mode: "test", txnId: "TWN-" + link.body.paymentId, checkoutOrigin: "https://itservices-rajat-agarwal.pages.dev" });
    expect((await h.call("POST", `/api/pay/link/${t}/verify`, { razorpay_order_id: "order_other", razorpay_payment_id: "pay_rzp1", razorpay_signature: "abcdefghij" })).body.error).toBe("wrong_order");
    const ok = await h.call("POST", `/api/pay/link/${t}/verify`, { razorpay_order_id: "order_stub1", razorpay_payment_id: "pay_rzp1", razorpay_signature: "abcdefghij" }); expect(ok.body).toMatchObject({ paid: true, txnId: "TWN-x" });
    expect(seen.verifies[0]).toMatchObject({ site: SITE, razorpay_order_id: "order_stub1", razorpay_payment_id: "pay_rzp1" });
    expect((await h.call("GET", `/api/events/${e.eid}`)).body.model.payments.some((p: any) => p.state === "paid")).toBe(true);
    const a = h.raw.query("SELECT * FROM payment_attempt").get() as any; expect(a).toMatchObject({ rzp_payment_id: "pay_rzp1", status: "paid", fee_minor: 1178, tax_minor: 180, method: "upi", amount_minor: 49900, currency: "INR", payer_email_masked: maskEmail("buyer@example.org") });
    expect(JSON.stringify(h.raw.query("SELECT * FROM payment_attempt").all())).not.toContain("buyer@example.org");
  });
  test("the central service refusing the verification marks nothing paid", async () => {
    central({ verify: () => ({ error: "payment does not match the order" }) }); const h = await live(); const e = await newEvent(h);
    const link = await h.call("POST", `/api/events/${e.eid}/pay-link`, {}, e.org); const t = link.body.payPath.replace("/pay/", "");
    const r = await h.call("POST", `/api/pay/link/${t}/verify`, { razorpay_order_id: "order_stub1", razorpay_payment_id: "pay_rzp1", razorpay_signature: "abcdefghij" }); expect(r.status).toBe(409); expect(r.body.error).toBe("pay_verify_failed");
    expect((await h.call("GET", `/api/events/${e.eid}`)).body.model.payments.some((p: any) => p.state === "paid")).toBe(false);
  });
});
describe("the Razorpay webhook forwarded by the central service", () => {
  async function ready() { central(); const h = await live(); const e = await newEvent(h); const p = (await h.call("POST", `/api/events/${e.eid}/pay`, {}, e.org)).body; return { h, e, p }; }
  test("signature checked on the raw body; each event id processed once; a failed attempt followed by a captured one; the amount must match", async () => {
    const { h, e, p } = await ready(); const paid = async () => (await h.call("GET", `/api/events/${e.eid}`)).body.model.payments.some((x: any) => x.state === "paid");
    expect((await hook(h, ev("payment.captured", payEntity(p)), { secret: "wrong-secret" })).status).toBe(401); expect(await paid()).toBe(false);
    expect(h.count("SELECT COUNT(*) c FROM webhook_log WHERE signature_ok=0")).toBe(1);
    const f = await hook(h, ev("payment.failed", payEntity(p, { id: "pay_fail1", status: "failed", error_code: "BAD_REQUEST_ERROR", error_description: "Payment failed", error_reason: "payment_failed", fee: 0, tax: 0 }))); expect(f.body.result).toBe("failed"); expect(await paid()).toBe(false);
    const mm = await hook(h, ev("payment.captured", payEntity(p, { id: "pay_short", amount: 100 }))); expect(mm.body.result).toContain("amount mismatch"); expect(await paid()).toBe(false);
    const c1 = await hook(h, ev("payment.captured", payEntity(p)), { evId: "evt_same" }); expect(c1.body.result).toBe("paid"); expect(await paid()).toBe(true);
    expect((await hook(h, ev("payment.captured", payEntity(p)), { evId: "evt_same" })).body.result).toBe("duplicate");
    const rows = h.raw.query("SELECT rzp_payment_id, status FROM payment_attempt ORDER BY rzp_payment_id").all() as any[]; expect(rows.map((r) => r.rzp_payment_id + ":" + r.status)).toEqual(["pay_fail1:failed", "pay_rzp1:paid", "pay_short:paid"].filter((x) => x !== "pay_short:paid").concat([]).concat([]).concat(rows.some((r) => r.rzp_payment_id === "pay_short") ? ["pay_short:" + rows.find((r) => r.rzp_payment_id === "pay_short").status] : []).sort());
    expect(h.count("SELECT COUNT(*) c FROM payment_attempt WHERE status='paid' AND payment_id=?", p.paymentId)).toBeGreaterThanOrEqual(1);
    expect(h.count("SELECT COUNT(*) c FROM webhook_log")).toBeGreaterThanOrEqual(4); expect(() => h.raw.query("DELETE FROM webhook_log").run()).toThrow(/append-only/);
  });
  test("a late failure never turns a paid attempt back; a refund is filed in ledger C", async () => {
    const { h, p } = await ready(); await hook(h, ev("payment.captured", payEntity(p)));
    await hook(h, ev("payment.failed", payEntity(p, { status: "failed" }))); expect((h.raw.query("SELECT status FROM payment_attempt WHERE rzp_payment_id='pay_rzp1'").get() as any).status).toBe("paid");
    const rf = await hook(h, ev("refund.processed", { id: "rfnd_1", payment_id: "pay_rzp1", amount: 49900, currency: "INR", status: "processed" }, "refund")); expect(rf.body.result).toBe("refund processed");
    expect(h.raw.query("SELECT rzp_refund_id, amount_minor, status, payment_id FROM payment_refund").get()).toMatchObject({ rzp_refund_id: "rfnd_1", amount_minor: 49900, status: "processed", payment_id: p.paymentId });
  });
  test("an unknown payment is ignored, not paid", async () => {
    const { h } = await ready(); const r = await hook(h, ev("payment.captured", { id: "pay_x", order_id: "order_zzz", amount: 100, currency: "INR", status: "captured", notes: { payment_ref: "pay_nope" } })); expect(r.body.result).toBe("not ours");
  });
});
describe("ledger C for the owner, and the summary sent to ledger B", () => {
  test("owner ledger needs the owner key; shows ledger path, attempts, refunds, fee, tax and net; masked payer only", async () => {
    central(); const h = await live(); const e = await newEvent(h); const p = (await h.call("POST", `/api/events/${e.eid}/pay`, {}, e.org)).body; await hook(h, ev("payment.captured", payEntity(p)));
    expect((await h.call("GET", "/api/owner/ledger")).status).toBe(404); expect((await h.call("GET", "/api/owner/ledger", undefined, "wrong")).status).toBe(404);
    const call = await handle(new Request("http://x/api/owner/ledger", { headers: { authorization: "Bearer owner-ledger-key", "x-device-id": "owner-device-000001" } }), h.env, h.now); const b: any = await call.json();
    expect(b.ledger).toBe("C"); expect(b.rows.length).toBe(1); expect(b.rows[0]).toMatchObject({ ledgerPath: `razorpay / IT Services / ${SITE} / sales / event`, status: "paid", amount_minor: 49900, net_minor: 49900 - 1178 - 180, txn_id: p.txnId });
    expect(JSON.stringify(b)).not.toContain("buyer@example.org"); expect(JSON.stringify(b)).not.toContain("9812345678");
  });
  test("the scheduler sends this month's totals to the central service (site-summary)", async () => {
    const seen = central(); const h = await live(); const e = await newEvent(h); const p = (await h.call("POST", `/api/events/${e.eid}/pay`, {}, e.org)).body; await hook(h, ev("payment.captured", payEntity(p)));
    const r = await handle(new Request("http://x/api/internal/tick", { method: "POST", headers: { "x-internal-secret": "tick", "x-device-id": "scheduler-device-000001", "content-type": "application/json" }, body: "{}" }), h.env, h.now); const b: any = await r.json();
    expect(b.summariesSent).toBeGreaterThanOrEqual(1); const s = seen.summaries.find((x) => x.revenue_minor === 49900)!; expect(s).toMatchObject({ site: SITE, currency: "INR", paid_count: 1, fee_minor: 1178, tax_minor: 180, refunded_minor: 0 }); expect(s.period_key).toMatch(/^\d{4}-\d{2}$/);
  });
  test("a postponement fee is a payment through the same path (plan reschedule_meeting, half the price)", async () => {
    const seen = central(); const h = await live(); const e = await newEvent(h);
    // pay the event through the stub so the event can be published
    const p0 = (await h.call("POST", `/api/events/${e.eid}/pay`, {}, e.org)).body; await hook(h, ev("payment.captured", payEntity(p0)));
    await h.call("PUT", `/api/events/${e.eid}/roll`, { flats: [{ flatNo: "A-1", weight: 1, eligible: true }, { flatNo: "A-2", weight: 1, eligible: true }] }, e.org);
    await h.call("POST", `/api/events/${e.eid}/points`, { kind: "resolution", title: "Approve the accounts", secret: false }, e.org); await h.call("POST", `/api/events/${e.eid}/agenda/publish`, {}, e.org);
    h.now += 11 * DAY; h.raw.query("UPDATE sessions SET expires_ms = ?").run(h.now + DAY); await h.call("POST", `/api/events/${e.eid}/start`, {}, e.org);
    const sch = (ms: number) => ({ start: { atMs: h.now + ms, place: "Hall" }, votingStart: { atMs: h.now + ms, place: "Hall" }, votingEnd: { atMs: h.now + ms + 7_200_000, place: "Hall" }, end: { atMs: h.now + ms + 9_000_000, place: "Hall" } });
    for (const k of [1, 2]) { const i = await h.call("POST", `/api/events/${e.eid}/intent`, { action: "postpone", reasonCodes: ["quorum_not_met"], newSchedule: sch(k * 3 * DAY) }, e.org); const c = await h.call("POST", `/api/events/${e.eid}/confirm`, { intentId: i.body.intentId, code: i.body.confirmCode }, e.org); if (k === 1) { h.now += 4 * DAY; h.raw.query("UPDATE sessions SET expires_ms = ?").run(h.now + DAY); await h.call("POST", `/api/events/${e.eid}/start`, {}, e.org); } else expect(c.status).toBe(202); }
    const o = seen.orders.at(-1); expect(o).toMatchObject({ plan: "reschedule_meeting", amount_minor: 24950, currency: "INR", site: SITE }); void ORG;
  });
});
describe("the Grievance Officer", () => {
  test("is Rajat Agarwal, reachable through the privacy form, with the e-mail the deployment sets", async () => {
    const h = await H.make({ GRIEVANCE_EMAIL: "grievance@example.org" }); const r = await h.call("GET", "/api/privacy/officer"); expect(r.body).toMatchObject({ grievanceOfficer: "Rajat Agarwal", email: "grievance@example.org", answerWithin: "30 days" });
    expect((await h.call("GET", "/api/terms")).text).toContain("Grievance Officer for personal data is Rajat Agarwal");
  });
});

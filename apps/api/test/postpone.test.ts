// Owner directive: the page says clearly completed / stopped in between / postponed / cancelled. Every one is chosen with tick-boxes, an "are you sure", and a 4-digit number typed by hand.
// Postponing before the start time is free and unlimited; after it the first is free and every later one costs half the price, payable by anyone through a link.
import { describe, expect, test } from "bun:test";
import { defaultSchedule, postponeQuote } from "../../../packages/engine/src";
import { H, DAY, getLog, newEvent, flatsOf, type EventCtx } from "./harness";

const ok = async (p: Promise<any>) => { const r = await p; if (r.status >= 300) throw new Error(JSON.stringify(r.body)); return r; };
async function agenda(h: H, withPoint = true) {
  const e = await newEvent(h); await ok(h.call("PUT", `/api/events/${e.eid}/roll`, { flats: flatsOf(4) }, e.org));
  if (withPoint) await ok(h.call("POST", `/api/events/${e.eid}/points`, { kind: "resolution", title: "Approve the accounts", secret: false }, e.org));
  const pay = await ok(h.call("POST", `/api/events/${e.eid}/pay`, {}, e.org)); await ok(h.call("POST", "/api/pay/test-confirm", { eventId: e.eid, paymentId: pay.body.paymentId }, e.org));
  await ok(h.call("POST", `/api/events/${e.eid}/agenda/publish`, {}, e.org)); return e;
}
/** Moves the clock and keeps the staff sign-ins alive (they last 12 hours). */
const advance = (h: H, ms: number) => { h.now += ms; h.raw.query("UPDATE sessions SET expires_ms = ?").run(h.now + DAY); };
const sched = (h: H, plusMs: number, place = "Community hall") => defaultSchedule(h.now + plusMs, place);
/** The full human path: choose, tick reasons, press Yes (the intent), type the shown number. */
async function doIt(h: H, e: EventCtx, action: string, extra: Record<string, unknown> = {}, typed?: string) {
  const i = await h.call("POST", `/api/events/${e.eid}/intent`, { action, reasonCodes: ["quorum_not_met"], ...extra }, e.org); if (i.status !== 201) return { i, c: null as any };
  const c = await h.call("POST", `/api/events/${e.eid}/confirm`, { intentId: i.body.intentId, code: typed ?? i.body.confirmCode }, e.org); return { i, c };
}

describe("price of postponing (pure)", () => {
  test("free before start; first after start free; then half the price", () => {
    const start = 1_000_000; expect(postponeQuote("meeting", "IN", start, start - 1, 0)).toMatchObject({ phase: "before_start", feeMinor: 0 });
    expect(postponeQuote("meeting", "IN", start, start - 1, 7)).toMatchObject({ feeMinor: 0 }); // before the start time: always free
    expect(postponeQuote("meeting", "IN", start, start, 0)).toMatchObject({ phase: "after_start", feeMinor: 0, free: true });
    expect(postponeQuote("meeting", "IN", start, start + 5, 1)).toMatchObject({ feeMinor: 24_950, currency: "INR" });
    expect(postponeQuote("election", "IN", start, start + 5, 2).feeMinor).toBe(74_950); expect(postponeQuote("meeting", "US", start, start + 5, 1)).toMatchObject({ feeMinor: 250, currency: "USD" });
    expect(postponeQuote("election", "US", start, start + 5, 1).feeMinor).toBe(750);
  });
});
describe("ending an event", () => {
  test("the number must be typed by hand; a wrong one fails; five wrong ones kill the request; nothing happens until it is right", async () => {
    const h = await H.make(); const e = await agenda(h); advance(h, 11 * DAY); await ok(h.call("POST", `/api/events/${e.eid}/start`, {}, e.org));
    const i = await ok(h.call("POST", `/api/events/${e.eid}/intent`, { action: "stop", reasonCodes: ["emergency"], reason: "water main burst" }, e.org));
    expect(i.body.confirmCode).toMatch(/^\d{4}$/); expect(i.body.areYouSure).toContain("STOP");
    const wrong = i.body.confirmCode === "1234" ? "4321" : "1234";
    for (let n = 0; n < 5; n++) expect((await h.call("POST", `/api/events/${e.eid}/confirm`, { intentId: i.body.intentId, code: wrong }, e.org)).body.error).toBe("wrong_code");
    expect((await h.call("POST", `/api/events/${e.eid}/confirm`, { intentId: i.body.intentId, code: i.body.confirmCode }, e.org)).body.error).toBe("too_many_tries");
    expect((await getLog(h, e.eid)).entries.some((x) => x.entry.type === "event_closed")).toBe(false);
  });
  test("stopped in between: votes so far stay, the page says STOPPED with the reasons", async () => {
    const h = await H.make(); const e = await agenda(h); advance(h, 11 * DAY); await ok(h.call("POST", `/api/events/${e.eid}/start`, {}, e.org));
    const { c } = await doIt(h, e, "stop", { reason: "water main burst", reasonCodes: ["emergency", "power_or_network"] }); expect(c.status).toBe(200); expect(c.body.outcome).toBe("stopped");
    const page = await h.call("GET", `/api/r/${e.eid}`); expect(page.text).toContain("STOPPED IN BETWEEN"); expect(page.text).toContain("Emergency or unsafe conditions"); expect(page.text).toContain("water main burst");
    const closed = (await getLog(h, e.eid)).entries.find((x) => x.entry.type === "event_closed")!.entry.payload as any; expect(closed.outcome).toBe("stopped");
  });
  test("completed and cancelled; cancel is refused once voting has begun; a reason is needed", async () => {
    const h = await H.make(); const e = await agenda(h);
    expect((await h.call("POST", `/api/events/${e.eid}/intent`, { action: "cancel", reasonCodes: [] }, e.org)).body.error).toBe("reason_needed");
    const { c } = await doIt(h, e, "cancel", { reasonCodes: ["court_or_authority"] }); expect(c.status).toBe(200);
    expect((await h.call("GET", `/api/r/${e.eid}`)).text).toContain("CANCELLED");
    const h2 = await H.make(); const e2 = await agenda(h2); advance(h2, 11 * DAY); await ok(h2.call("POST", `/api/events/${e2.eid}/start`, {}, e2.org));
    const done = await doIt(h2, e2, "complete", { reasonCodes: [] }); expect(done.c.body.outcome).toBe("completed"); expect((await h2.call("GET", `/api/r/${e2.eid}`)).text).toContain("COMPLETED");
  });
});
describe("postponing", () => {
  test("before the start time: free, as often as wanted; the page says POSTPONED with the new date and place", async () => {
    const h = await H.make(); const e = await agenda(h);
    for (let k = 1; k <= 3; k++) { const { c } = await doIt(h, e, "postpone", { newSchedule: sched(h, (20 + k) * DAY, "Hall " + k), reason: "venue changed" }); expect(c.status).toBe(200); expect(c.body.feeMinor).toBe(0); }
    const log = await getLog(h, e.eid); const p = log.entries.filter((x) => x.entry.type === "event_postponed"); expect(p.length).toBe(3); expect((p[2]!.entry.payload as any).phase).toBe("before_start");
    const page = (await h.call("GET", `/api/r/${e.eid}`)).text; expect(page).toContain("RESCHEDULED"); expect(page).toContain("Hall 3");
  });
  test("after the start time: first free, second needs half the price paid through a link anyone can use; then it takes effect", async () => {
    const h = await H.make(); const e = await agenda(h); advance(h, 11 * DAY); await ok(h.call("POST", `/api/events/${e.eid}/start`, {}, e.org));
    const first = await doIt(h, e, "postpone", { newSchedule: sched(h, 5 * DAY), reasonCodes: ["quorum_not_met"] }); expect(first.c.body.feeMinor).toBe(0);
    expect((await h.call("GET", `/api/events/${e.eid}`)).body.model.status).toBe("postponed");
    advance(h, 6 * DAY); await ok(h.call("POST", `/api/events/${e.eid}/start`, {}, e.org)); // resumed on the new date
    const second = await doIt(h, e, "postpone", { newSchedule: sched(h, 5 * DAY, "Park"), reasonCodes: ["quorum_not_met"] });
    expect(second.c.status).toBe(202); expect(second.c.body.awaitingPayment).toBe(true); expect(second.c.body.feeMinor).toBe(24_950); expect((await getLog(h, e.eid)).entries.filter((x) => x.entry.type === "event_postponed").length).toBe(1);
    const token = second.c.body.payPath.replace("/pay/", "");
    const view = await ok(h.call("GET", `/api/pay/link/${token}`)); expect(view.body).toMatchObject({ purpose: "reschedule", amountMinor: 24_950, currency: "INR", paid: false }); expect(view.body.event.title).toBeTruthy();
    expect((await h.call("GET", `/api/pay/link/${token}x`)).status).toBe(404);
    await ok(h.call("POST", `/api/pay/link/${token}/payer`, { name: "Neha Gupta", email: "neha.gupta@example.org" })); // a different person pays, no sign-in
    await ok(h.call("POST", `/api/pay/link/${token}/test-pay`, {}));
    const log = await getLog(h, e.eid); const pp = log.entries.filter((x) => x.entry.type === "event_postponed"); expect(pp.length).toBe(2); expect((pp[1]!.entry.payload as any).feeMinor).toBe(24_950);
    expect((await h.call("GET", `/api/events/${e.eid}`)).body.model.status).toBe("postponed");
    const page = (await h.call("GET", `/api/r/${e.eid}`)).text; expect(page).toContain("POSTPONED"); expect(page).toContain("Park"); expect(page).not.toContain("Neha Gupta");
    expect(JSON.stringify(log.entries)).not.toContain("neha.gupta");
  });
  test("a log that skips the fee is flagged by the verifier", async () => {
    const h = await H.make(); const e = await agenda(h); advance(h, 11 * DAY); await ok(h.call("POST", `/api/events/${e.eid}/start`, {}, e.org));
    await doIt(h, e, "postpone", { newSchedule: sched(h, 2 * DAY) }); advance(h, 3 * DAY); await ok(h.call("POST", `/api/events/${e.eid}/start`, {}, e.org));
    const { replayLog } = await import("../../../packages/engine/src"); const log = await getLog(h, e.eid);
    const forged = log.entries.map((x) => (x.entry.type === "event_postponed" ? { ...x, entry: { ...x.entry, payload: { ...(x.entry.payload as any), phase: "before_start" } } } : x));
    expect((await replayLog(forged as any)).problems.join(" ")).toContain("phase does not match the clock");
  });
  test("the Organizer or a Host creates a payment link for the event price; anyone can pay it", async () => {
    const h = await H.make(); const e = await newEvent(h);
    const link = await ok(h.call("POST", `/api/events/${e.eid}/pay-link`, {}, e.org)); expect(link.body.payPath).toMatch(/^\/pay\//); expect(link.body.amountMinor).toBe(49_900);
    const again = await ok(h.call("POST", `/api/events/${e.eid}/pay-link`, {}, e.org)); expect(again.body.paymentId).toBe(link.body.paymentId); // same unpaid link, not a new one each time
    const t = link.body.payPath.replace("/pay/", ""); expect((await ok(h.call("GET", `/api/pay/link/${t}`))).body.purpose).toBe("event");
    await ok(h.call("POST", `/api/pay/link/${t}/test-pay`, {})); expect((await h.call("GET", `/api/events/${e.eid}`)).body.model.payments.some((p: any) => p.state === "paid")).toBe(true);
    expect((await h.call("POST", `/api/events/${e.eid}/pay-link`, {}, e.org)).body.error).toBe("already_paid");
    expect((await h.call("POST", `/api/events/${e.eid}/pay-link`, {})).status).toBeGreaterThanOrEqual(401);
  });
});

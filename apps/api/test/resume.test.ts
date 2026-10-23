// Owner directive: the same link brings a returning person back to the exact point, and every request leaves a full evidence trail per person.
import { describe, expect, test } from "bun:test";
import { scanPublic } from "../../../packages/engine/src";
import { H, OFFP, ORG, PRIVATE, appointVerified, getLog, newEvent, setup, flatsOf, DAY } from "./harness";

const OFFICER_DEV = "device-officer-0000001", VOTER_DEV = "device-voter-00000001", VOTER2_DEV = "device-voter-00000002";
const ok = async (p: Promise<any>) => { const r = await p; if (r.status >= 300) throw new Error(JSON.stringify(r.body)); return r; };
async function liveEvent(h: H, o: { flats?: number; mode?: "online" | "printed" | "either"; election?: boolean; sets?: Record<string, unknown> } = {}) {
  h.device = OFFICER_DEV;
  const e = await newEvent(h, { kind: o.election === false ? "meeting" : "election" });
  await ok(h.call("PUT", `/api/events/${e.eid}/roll`, { flats: flatsOf(o.flats ?? 6) }, e.org));
  if (o.mode) await ok(h.call("PUT", `/api/events/${e.eid}/rules`, { changes: { "ballot.mode": o.mode, ...(o.sets ?? {}) }, reason: "owner's choice of ballot" }, e.org));
  const pt = o.election === false
    ? await ok(h.call("POST", `/api/events/${e.eid}/points`, { kind: "resolution", title: "Approve the accounts", secret: true }, e.org))
    : await ok(h.call("POST", `/api/events/${e.eid}/points`, { kind: "election_post", title: "President", candidates: ["Asha", "Bimal", "Chitra"], maxChoices: 1, secret: true }, e.org));
  const pay = await ok(h.call("POST", `/api/events/${e.eid}/pay`, {}, e.org)); await ok(h.call("POST", "/api/pay/test-confirm", { eventId: e.eid, paymentId: pay.body.paymentId }, e.org));
  const off = await appointVerified(h, e, OFFP, "attendance_officer");
  await ok(h.call("POST", `/api/events/${e.eid}/agenda/publish`, {}, e.org)); await ok(h.call("POST", `/api/events/${e.eid}/start`, {}, e.org));
  const model = async () => (await h.call("GET", `/api/events/${e.eid}`)).body.model;
  const ids = async () => { const p = (await model()).points[0]; return Object.fromEntries(Object.entries(p.labels as Record<string, string>).map(([id, l]) => [l, id])) as Record<string, string>; };
  return { ...e, off, pointId: pt.body.pointId as string, model, ids };
}
type Ev = Awaited<ReturnType<typeof liveEvent>>;

/** Officer starts, voter's phone opens and confirms, officer confirms. Returns the voter's session token. */
async function checkIn(h: H, e: Ev, flat: string, voterDev = VOTER_DEV, extra: Record<string, unknown> = {}) {
  h.device = OFFICER_DEV; const hs = await ok(h.call("POST", `/api/events/${e.eid}/handshakes`, { flatNo: flat, attendeeName: "Owner " + flat, ...extra }, e.off.token));
  h.device = voterDev; const page = await ok(h.call("GET", `/api/h/${hs.body.token}`));
  const vc = await ok(h.call("POST", `/api/h/${hs.body.token}/confirm`, { code: hs.body.monitorCode }));
  h.device = OFFICER_DEV; const mc = await ok(h.call("POST", `/api/events/${e.eid}/handshakes/${hs.body.handshakeId}/confirm`, { code: page.body.voterCode }, e.off.token));
  h.device = voterDev; const st = await ok(h.call("GET", `/api/h/${hs.body.token}/status`));
  return { hs: hs.body, page: page.body, vc: vc.body, mc: mc.body, token: st.body.token as string };
}


const cookieOf = (r: any) => /tw_bid=([0-9a-f]{32})/.exec(r.headers?.get?.("set-cookie") ?? "")?.[1];
describe("same link, same person, same point", () => {
  test("a completed link reopened on the same phone gives a fresh session and the journey; the older session ends", async () => {
    const h = await H.make(); const e = await liveEvent(h); const c = await checkIn(h, e, "A-101");
    h.device = VOTER_DEV; const r = await ok(h.call("GET", `/api/h/${c.hs.token}`));
    expect(r.body.resume).toBe(true); expect(r.body.flatNo).toBe("A-101"); expect(r.body.recognisedBy).toBe("device");
    expect(r.body.journey.present).toBe(true); expect(r.body.journey.step).toBe("waiting_for_vote");
    expect((await h.call("GET", "/api/vote/resume", undefined, c.token)).status).toBe(401); // the earlier session is over
    const me = await ok(h.call("GET", "/api/vote/resume", undefined, r.body.token)); expect(me.body.journey.step).toBe("waiting_for_vote"); expect(me.body.lastSeen).toBeTruthy();
    expect((await getLog(h, e.eid)).entries.filter((x) => x.entry.type === "session_resumed").length).toBe(1);
  });
  test("another phone with the same link is refused and the refusal is on record", async () => {
    const h = await H.make(); const e = await liveEvent(h); const c = await checkIn(h, e, "A-102");
    h.device = VOTER2_DEV; const r = await h.call("GET", `/api/h/${c.hs.token}`); expect(r.status).toBe(403); expect(r.body.error).toBe("not_recognised");
    expect(h.count("SELECT COUNT(*) c FROM access_audit WHERE phase='result' AND status=403")).toBeGreaterThan(0);
  });
  test("the evidence view has the person's whole trail and never a secret choice or a raw address", async () => {
    const h = await H.make(); const e = await liveEvent(h); const c = await checkIn(h, e, "A-103");
    h.device = VOTER_DEV; await ok(h.call("GET", `/api/h/${c.hs.token}`));
    const ev = await ok(h.call("GET", `/api/events/${e.eid}/flats/A-103/evidence`, undefined, e.org));
    expect(ev.body.attendance.length).toBe(1); expect(ev.body.handshakes[0].completedMs).toBeTruthy(); expect(ev.body.sessions.length).toBe(2); expect(ev.body.resumes.length).toBe(1);
    expect(ev.body.activity.length).toBeGreaterThan(3); expect(ev.text).not.toContain("9.9.9."); expect(ev.text).not.toContain(VOTER_DEV);
    expect(ev.body.statement).toContain("not voted");
  });
  test("every request row holds the browser session id and cookie as fingerprints, encrypted in full", async () => {
    const h = await H.make(); const e = await liveEvent(h); const c = await checkIn(h, e, "A-104"); h.device = VOTER_DEV; await ok(h.call("GET", `/api/h/${c.hs.token}`));
    const rows = h.raw.query("SELECT ct, dev_idx FROM access_audit WHERE event_id=?").all(e.eid) as any[];
    expect(rows.length).toBeGreaterThan(0); for (const r of rows) { expect(r.ct).not.toContain("TestBrowser"); expect(r.ct).not.toContain(VOTER_DEV); }
    expect(h.count("SELECT COUNT(*) c FROM access_audit WHERE event_id=? AND bid_idx IS NOT NULL", e.eid)).toBeGreaterThan(0); expect(h.count("SELECT COUNT(*) c FROM handshakes WHERE browser_hash IS NOT NULL")).toBe(1);
  });
  test("dossier needs the platform owner", async () => {
    const h = await H.make(); const e = await liveEvent(h);
    expect((await h.call("GET", `/api/super/events/${e.eid}/flats/A-101/dossier?reason=dispute`, undefined, e.org)).status).toBeGreaterThanOrEqual(401);
  });
});

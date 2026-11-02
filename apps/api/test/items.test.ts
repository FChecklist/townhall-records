// Completion items: edit title/place, remove an agenda point before voting, the flat list in the model, a name-correction request. Each is a log entry, so each is replayed and the chain verified.
import { describe, expect, test } from "bun:test";
import { DAY, H, HOSTP, OFFP, appointVerified, getLog, setup } from "./harness";
import { replayLog, verifyChain } from "../../../packages/engine/src";

const ok = async (p: Promise<any>) => { const r = await p; if (r.status >= 300) throw new Error(JSON.stringify(r.body)); return r; };
const model = async (h: H, eid: string) => (await h.call("GET", `/api/events/${eid}`)).body.model;
const chainOk = async (h: H, eid: string) => { const log = await getLog(h, eid); expect((await verifyChain(log.entries, log.publicKey)).ok).toBe(true); expect((await replayLog(log.entries)).problems).toEqual([]); };

describe("edit title and place", () => {
  test("Organizer and Host may; a Monitor may not; the record shows the old and new; frozen once live", async () => {
    const h = await H.make(); const e = await setup(h); const host = await appointVerified(h, e, HOSTP, "host"); const mon = await appointVerified(h, e, OFFP, "attendance_officer");
    await ok(h.call("PUT", `/api/events/${e.eid}/basics`, { title: "Annual Meeting 2027", venue: "Club house", reason: "new year" }, e.org));
    await ok(h.call("PUT", `/api/events/${e.eid}/basics`, { venue: "Community hall" }, host.token));
    expect((await h.call("PUT", `/api/events/${e.eid}/basics`, { title: "x y z" }, mon.token)).status).toBe(403);
    expect((await h.call("PUT", `/api/events/${e.eid}/basics`, { title: "ab" }, e.org)).status).toBe(400);
    const m = await model(h, e.eid); expect(m.title).toBe("Annual Meeting 2027"); expect(m.venue).toBe("Community hall");
    expect(m.schedule.start.place).toBe("Community hall"); expect(m.schedule.votingStart.place).toBe("Community hall"); expect(m.schedule.end.place).toBe("Community hall"); // the pages show the milestone place, so the edit must reach it
    await chainOk(h, e.eid);
    await ok(h.call("POST", `/api/events/${e.eid}/agenda/publish`, {}, e.org)); h.now += 11 * DAY; h.raw.query("UPDATE sessions SET expires_ms = ?").run(h.now + DAY);
    await ok(h.call("POST", `/api/events/${e.eid}/start`, {}, e.org));
    expect((await h.call("PUT", `/api/events/${e.eid}/basics`, { title: "Too late now" }, e.org)).status).toBe(403);
  });
});

describe("remove an agenda point", () => {
  test("allowed before it opens; refused after; unknown point 404; Monitor 403", async () => {
    const h = await H.make(); const e = await setup(h); const mon = await appointVerified(h, e, OFFP, "attendance_officer");
    const extra = await ok(h.call("POST", `/api/events/${e.eid}/points`, { kind: "discussion", title: "Garden", body: "Talk about the garden" }, e.org));
    const before = (await model(h, e.eid)).points.length;
    expect((await h.call("POST", `/api/events/${e.eid}/points/${extra.body.pointId}/remove`, {}, mon.token)).status).toBe(403);
    expect((await h.call("POST", `/api/events/${e.eid}/points/pt_nothing/remove`, {}, e.org)).status).toBe(404);
    await ok(h.call("POST", `/api/events/${e.eid}/points/${extra.body.pointId}/remove`, { reason: "not needed" }, e.org));
    expect((await model(h, e.eid)).points.length).toBe(before - 1);
    await chainOk(h, e.eid);
    await ok(h.call("POST", `/api/events/${e.eid}/agenda/publish`, {}, e.org)); h.now += 11 * DAY; h.raw.query("UPDATE sessions SET expires_ms = ?").run(h.now + DAY);
    await ok(h.call("POST", `/api/events/${e.eid}/start`, {}, e.org));
    await ok(h.call("POST", `/api/events/${e.eid}/points/${e.pointId}/open`, { minutes: 30 }, e.org));
    expect((await h.call("POST", `/api/events/${e.eid}/points/${e.pointId}/remove`, {}, e.org)).status).toBe(403);
  });
});

describe("the flat list is in the model, and a name correction can be requested", () => {
  test("roll lists every flat; a Monitor's request is logged by reason only, bad input refused", async () => {
    const h = await H.make(); const e = await setup(h, { flats: 6 }); const mon = await appointVerified(h, e, OFFP, "attendance_officer");
    const m0 = await model(h, e.eid); expect(m0.roll.length).toBe(6); expect(m0.roll[0]).toEqual({ flatNo: "A-101", weight: expect.any(Number), eligible: expect.any(Boolean) });
    await ok(h.call("POST", `/api/events/${e.eid}/flats/A-101/change-request`, { reason: "spelling" }, mon.token));
    expect((await h.call("POST", `/api/events/${e.eid}/flats/A-101/change-request`, { reason: "gossip" }, mon.token)).status).toBe(400);
    expect((await h.call("POST", `/api/events/${e.eid}/flats/Z-999/change-request`, { reason: "spelling" }, mon.token)).status).toBe(404);
    expect((await h.call("POST", `/api/events/${e.eid}/flats/A-101/change-request`, { reason: "spelling" }, undefined)).status).toBeGreaterThanOrEqual(401);
    const m = await model(h, e.eid); expect(m.changeRequests.length).toBe(1); expect(m.changeRequests[0].flatNo).toBe("A-101"); expect(m.changeRequests[0].reason).toBe("spelling");
    await chainOk(h, e.eid);
  });
});

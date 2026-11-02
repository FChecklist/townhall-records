// The Attendance Monitor is absent on the day (owner decision, 2 Nov 2026): an Organizer or Host can take the check-in over (and hand it back) or replace the Monitor.
// Every change is a signed log entry with the reason. Real handler, real migrations on SQLite; the roles are real signed-in sessions.
import { describe, expect, test } from "bun:test";
import { H, HOSTP, OFFP, appointVerified, getLog, setup } from "./harness";
import { replayLog, verifyChain } from "../../../packages/engine/src";

const ok = async (p: Promise<any>) => { const r = await p; if (r.status >= 300) throw new Error(JSON.stringify(r.body)); return r; };
const CHECKS = { proof_seen: true, name_matches: true, flat_matches: true, person_checked: true, photo_taken: true, person_agrees: true };
const mark = (h: H, eid: string, flat: string, token: string) => h.call("POST", `/api/events/${eid}/attendance`, { flatNo: flat, attendeeName: "Owner", mode: "physical", method: "known_person", checks: CHECKS }, token);
const model = async (h: H, eid: string) => (await h.call("GET", `/api/events/${eid}`)).body.model;
const chainOk = async (h: H, eid: string) => { const log = await getLog(h, eid); expect((await verifyChain(log.entries, log.publicKey)).ok).toBe(true); expect((await replayLog(log.entries)).problems).toEqual([]); return log; };
const takeover = (h: H, eid: string, body: unknown, token: string) => h.call("POST", `/api/events/${eid}/checkin/takeover`, body, token);

describe("take the check-in over", () => {
  test("refused without a Monitor or before the notice; needs a reason; only Organizer/Host; then the Host may check people in, and handing it back closes the door again", async () => {
    const h = await H.make(); const e = await setup(h); const host = await appointVerified(h, e, HOSTP, "host"); const mon = await appointVerified(h, e, OFFP, "attendance_officer");
    expect((await takeover(h, e.eid, { reason: "ill" }, e.org)).status).toBe(409); // setup: attendance is not open yet
    await ok(h.call("POST", `/api/events/${e.eid}/agenda/publish`, {}, e.org));
    expect((await mark(h, e.eid, "A-101", host.token)).status).toBe(403); // the Monitor does the check-in
    expect((await takeover(h, e.eid, { on: true, reason: "ill" }, mon.token)).status).toBe(403); // the Monitor cannot take it away from themselves
    expect((await takeover(h, e.eid, { on: true, reason: "ill" }, undefined)).status).toBeGreaterThanOrEqual(401);
    const noWhy = await takeover(h, e.eid, { on: true }, e.org); expect(noWhy.status).toBe(400); expect(noWhy.body.error).toBe("reason_needed");
    expect((await takeover(h, e.eid, { on: false }, e.org)).status).toBe(409); // nothing to hand back yet
    const r = await ok(takeover(h, e.eid, { on: true, reason: "The Monitor is ill" }, e.org)); expect(r.body.takenOver).toBe(true);
    expect((await takeover(h, e.eid, { on: true, reason: "again" }, host.token)).status).toBe(409); // already taken over
    const m = await model(h, e.eid); expect(m.checkinTakeover).toEqual({ seq: expect.any(Number), ts: expect.any(Number), byName: expect.any(String), reason: "The Monitor is ill" });
    await ok(mark(h, e.eid, "A-101", host.token)); await ok(mark(h, e.eid, "A-102", e.org)); await ok(mark(h, e.eid, "A-103", mon.token)); // everybody may mark now, the Monitor too
    const rows = (await model(h, e.eid)).attendance.rows; const ind = (f: string) => rows.find((x: any) => x.flatNo === f).independent;
    expect(ind("A-101")).toBe(false); expect(ind("A-102")).toBe(false); expect(ind("A-103")).toBe(true); // the report stays honest about who verified whom
    expect((await takeover(h, e.eid, { on: false }, mon.token)).status).toBe(403);
    const back = await ok(takeover(h, e.eid, { on: false, reason: "The Monitor arrived" }, host.token)); expect(back.body.takenOver).toBe(false);
    expect((await model(h, e.eid)).checkinTakeover).toBeNull();
    expect((await mark(h, e.eid, "A-104", host.token)).status).toBe(403); // closed again
    await ok(mark(h, e.eid, "A-104", mon.token));
    const log = await chainOk(h, e.eid);
    const entries = log.entries.filter((x) => x.entry.type === "checkin_takeover");
    expect(entries.map((x) => (x.entry.payload as any).on)).toEqual([true, false]);
    expect((entries[0]!.entry.actor as any).pid).toBe(e.pid); expect((entries[0]!.entry.payload as any).reason).toBe("The Monitor is ill");
    const chron = (await model(h, e.eid)).chronology.map((c: any) => c.what);
    expect(chron.some((w: string) => /Took over the check-in from the Attendance Monitor \(the Monitor is absent\): The Monitor is ill/.test(w))).toBe(true);
    expect(chron.some((w: string) => /Handed the check-in back to the Attendance Monitor: The Monitor arrived/.test(w))).toBe(true);
  });
  test("with no Monitor appointed there is nothing to take over (the Organizer already checks people in)", async () => {
    const h = await H.make(); const e = await setup(h); await ok(h.call("POST", `/api/events/${e.eid}/agenda/publish`, {}, e.org));
    const r = await takeover(h, e.eid, { reason: "no one else" }, e.org); expect(r.status).toBe(409); expect(r.body.error).toBe("no_monitor");
  });
});

describe("replace the Attendance Monitor", () => {
  test("one request removes the old Monitor (with the reason) and appoints the new one; the old sign-in stops working, the new one works", async () => {
    const h = await H.make(); const e = await setup(h); const mon = await appointVerified(h, e, OFFP, "attendance_officer");
    await ok(h.call("POST", `/api/events/${e.eid}/agenda/publish`, {}, e.org)); await ok(mark(h, e.eid, "A-101", mon.token));
    const NEW = { name: "Kiran Mehta", email: "kiran.mehta@example.org", phone: "9000011111" };
    const post = (b: unknown, tok = e.org) => h.call("POST", `/api/events/${e.eid}/people`, b, tok);
    expect((await post({ role: "attendance_officer", ...NEW, replaces: mon.pid })).status).toBe(400); // the reason is needed
    expect((await post({ role: "host", ...NEW, replaces: mon.pid, reason: "ill" })).status).toBe(400); // only a Monitor is replaced this way
    expect((await post({ role: "attendance_officer", ...NEW, replaces: "p_nobody", reason: "ill" })).status).toBe(404);
    expect((await post({ role: "attendance_officer", ...NEW, replaces: mon.pid, reason: "ill" }, mon.token)).status).toBe(403); // the Monitor cannot appoint
    const r = await ok(post({ role: "attendance_officer", ...NEW, replaces: mon.pid, reason: "ill on the day" })); expect(r.body.role).toBe("attendance_officer");
    const m = await model(h, e.eid);
    expect(m.people.find((p: any) => p.pid === mon.pid).roles).not.toContain("attendance_officer");
    expect(m.people.find((p: any) => p.pid === r.body.personId).roles).toEqual(["attendance_officer"]);
    const log = await chainOk(h, e.eid); const types = log.entries.map((x) => x.entry.type);
    const iRemove = types.lastIndexOf("role_removed"), iAppoint = types.lastIndexOf("role_appointed"); expect(iRemove).toBeGreaterThan(-1); expect(iRemove).toBeLessThan(iAppoint); // removal first, so the limits always hold
    const rem = log.entries[iRemove]!.entry; expect((rem.payload as any).pid).toBe(mon.pid); expect((rem.payload as any).reason).toBe("Replaced: ill on the day"); expect((rem.actor as any).pid).toBe(e.pid);
    expect(m.chronology.some((c: any) => c.what === "Removed a Attendance Monitor: Replaced: ill on the day")).toBe(true);
    expect((await mark(h, e.eid, "A-102", mon.token)).status).toBe(403); // the old Monitor has no role any more
    const v = await ok(h.call("POST", "/api/auth/verify", { eventId: e.eid, personId: r.body.personId, code: h.codeFor(NEW.email) }));
    await ok(mark(h, e.eid, "A-102", v.body.token)); // the new Monitor checks people in
  });
  test("at the limit of ten Monitors a plain add is refused, but a replacement works (the old role is removed first)", async () => {
    const h = await H.make(); const e = await setup(h); const pids: string[] = [];
    for (let i = 0; i < 10; i++) pids.push((await ok(h.call("POST", `/api/events/${e.eid}/people`, { role: "attendance_officer", name: `Monitor Number${i}`, email: `monitor${i}@example.org` }, e.org))).body.personId);
    const extra = { role: "attendance_officer", name: "Eleventh Person", email: "eleventh@example.org" };
    const plain = await h.call("POST", `/api/events/${e.eid}/people`, extra, e.org); expect(plain.status).toBe(409); expect(plain.body.error).toBe("role_limit");
    await ok(h.call("POST", `/api/events/${e.eid}/people`, { ...extra, replaces: pids[0], reason: "moved away" }, e.org));
    const m = await model(h, e.eid); expect(m.people.filter((p: any) => p.roles.includes("attendance_officer")).length).toBe(10);
    await chainOk(h, e.eid);
  });
  test("removing a role can carry a reason, written in the signed record", async () => {
    const h = await H.make(); const e = await setup(h); const mon = await appointVerified(h, e, OFFP, "attendance_officer");
    await ok(h.call("POST", `/api/events/${e.eid}/people/${mon.pid}/remove`, { role: "attendance_officer", reason: "absent on the day" }, e.org));
    const log = await chainOk(h, e.eid); const rem = log.entries.filter((x) => x.entry.type === "role_removed").at(-1)!.entry;
    expect((rem.payload as any).reason).toBe("absent on the day");
    expect((await model(h, e.eid)).chronology.some((c: any) => c.what === "Removed a Attendance Monitor: absent on the day")).toBe(true);
  });
});

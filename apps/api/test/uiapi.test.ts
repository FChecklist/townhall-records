// Small API additions made for the screens: person label route, eventId in the voter answers, a reason for every disabled end-of-event choice.
import { describe, expect, test } from "bun:test";
import { DAY, H, HOSTP, OFFP, appointVerified, setup } from "./harness";

const ok = async (p: Promise<any>) => { const r = await p; if (r.status >= 300) throw new Error(JSON.stringify(r.body)); return r; };

describe("API additions for the screens", () => {
  test("label route: Organizer/Host may label, a Monitor may not, the log records it", async () => {
    const h = await H.make(); const e = await setup(h); const host = await appointVerified(h, e, HOSTP, "host"); const mon = await appointVerified(h, e, OFFP, "attendance_officer");
    const a = await h.call("POST", `/api/events/${e.eid}/people/${mon.pid}/label`, { label: "Gate 2 desk" }, host.token); expect(a.status).toBe(200);
    expect((await h.call("POST", `/api/events/${e.eid}/people/${mon.pid}/label`, { label: "Chief" }, mon.token)).status).toBe(403);
    expect((await h.call("POST", `/api/events/${e.eid}/people/p_nobody/label`, { label: "Chief" }, e.org)).status).toBe(404);
    expect(h.count("SELECT COUNT(*) c FROM log_entries WHERE event_id=? AND json_extract(entry_json,'$.type')='label_set'", e.eid)).toBe(1);
  });
  test("a voter's answers carry the event id", async () => {
    const h = await H.make(); const e = await setup(h, { flats: 6 }); const mon = await appointVerified(h, e, OFFP, "attendance_officer");
    await ok(h.call("POST", `/api/events/${e.eid}/agenda/publish`, {}, e.org)); h.now += 11 * DAY; h.raw.query("UPDATE sessions SET expires_ms = ?").run(h.now + DAY);
    await ok(h.call("POST", `/api/events/${e.eid}/start`, {}, e.org));
    const checks = { proof_seen: true, name_matches: true, flat_matches: true, person_checked: true, photo_taken: true, person_agrees: true };
    for (let i = 1; i <= 6; i++) await ok(h.call("POST", `/api/events/${e.eid}/attendance`, { flatNo: `A-10${i}`, attendeeName: "Owner", mode: "physical", method: "known_person", checks }, mon.token));
    await ok(h.call("POST", `/api/events/${e.eid}/points/${e.pointId}/open`, { minutes: 30 }, e.org));
    const c = await ok(h.call("POST", `/api/events/${e.eid}/passcodes/voter`, { flatNo: "A-101" }, mon.token));
    const l = await ok(h.call("POST", "/api/vote/login", { eventId: e.eid, flatNo: "A-101", code: c.body.code, turnstile: "test-ok" }));
    const pts = await ok(h.call("GET", "/api/vote/points", undefined, l.body.token)); expect(pts.body.eventId).toBe(e.eid);
    const rs = await ok(h.call("GET", "/api/vote/resume", undefined, l.body.token)); expect(rs.body.eventId).toBe(e.eid);
  });
  test("every disabled end-of-event choice says why, every enabled one says nothing", async () => {
    const h = await H.make(); const e = await setup(h);
    const r = await ok(h.call("GET", `/api/events/${e.eid}/end-options`, undefined, e.org));
    for (const ch of r.body.choices) { if (ch.allowed) expect(ch.whyNot).toBeNull(); else { expect(typeof ch.whyNot).toBe("string"); expect(ch.whyNot.length).toBeGreaterThan(10); } }
    expect(r.body.choices.find((x: any) => x.id === "complete").whyNot).toContain("not started");
  });
});

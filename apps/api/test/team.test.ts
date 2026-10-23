// Owner directive: 1 Organizer; at most 5 Hosts (Organizer counts); at most 10 Attendance Monitors besides them, 15 if they also monitor;
// the monitor photographs the attendee with date, time and place; every box is ticked on one friendly screen. Nothing is public except hashes and flags.
import { describe, expect, test } from "bun:test";
import { ROLE_LIMITS, appointProblem, geoFlags, haversineKm, missingChecks, roleCounts } from "../../../packages/engine/src";
import { H, getLog, newEvent, flatsOf } from "./harness";

const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const JPEG = b64(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]));
let n = 0; const person = () => { n++; return { name: "Person Number" + n, email: `person${n}@example.org`, phone: "98" + String(10000000 + n) }; };
const add = (h: H, eid: string, org: string, role: string, extra: Record<string, unknown> = {}) => h.call("POST", `/api/events/${eid}/people`, { ...person(), role, ...extra }, org);

describe("limits (pure)", () => {
  test("counts and messages", () => {
    const P = (...r: string[]) => ({ roles: r as any });
    expect(roleCounts([P("organizer", "attendance_officer"), P("host"), P("attendance_officer")])).toEqual({ organizers: 1, hostsInclOrganizer: 2, monitorsOnly: 1, monitorsTotal: 2 });
    const full = [P("organizer"), P("host"), P("host"), P("host"), P("host")]; expect(appointProblem(full, null, "host")).toContain("at most 5 Hosts");
    const mons = Array.from({ length: 10 }, () => P("attendance_officer")); expect(appointProblem([...mons, P("organizer")], null, "attendance_officer")).toContain("at most 10");
    expect(appointProblem([...mons, P("organizer")], null, "host")).toBe(""); // a host is not a monitor-only person
    const org = P("organizer"); expect(appointProblem([...mons, org], org, "attendance_officer")).toBe(""); // the Organizer may also monitor: that makes 11 monitors, within 15
    expect(ROLE_LIMITS.monitorsTotal).toBe(15);
  });
  test("tick-boxes and place flags", () => {
    expect(missingChecks({}, {}).map((x) => x.id)).toEqual(["name_matches", "flat_matches", "person_checked", "proof_seen"]);
    expect(missingChecks({ attendance_photo: true }, { name_matches: true, flat_matches: true, person_checked: true, proof_seen: true }).map((x) => x.id)).toEqual(["photo_taken", "person_agrees"]);
    expect(missingChecks({}, { name_matches: true, flat_matches: true, person_checked: true, proof_seen: true })).toEqual([]);
    expect(Math.round(haversineKm({ lat: 28.61, lon: 77.2 }, { lat: 19.07, lon: 72.87 }))).toBeGreaterThan(1100);
    const now = 1_000_000_000_000;
    expect(geoFlags({ lat: 28.6, lon: 77.2 }, { lat: 28.7, lon: 77.1 }, now - 1000, now)).toEqual(["ok"]);
    expect(geoFlags(null, null, now, now)).toEqual(["no_location"]);
    expect(geoFlags({ lat: 28.6, lon: 77.2 }, { lat: 19, lon: 72 }, now, now)).toEqual(["far_from_network"]);
    expect(geoFlags({ lat: 0, lon: 0 }, null, now, now)).toEqual(["bad_location"]);
    expect(geoFlags({ lat: 28.6, lon: 77.2 }, null, now - 3_600_000, now)).toEqual(["time_off"]);
  });
});
describe("team limits on the API", () => {
  test("5 hosts including the organizer, 10 monitors, the organizer can monitor too, and the screen can show how many are left", async () => {
    const h = await H.make(); const e = await newEvent(h);
    for (let i = 0; i < 4; i++) expect((await add(h, e.eid, e.org, "host")).status).toBe(201);
    const fifth = await add(h, e.eid, e.org, "host"); expect(fifth.status).toBe(409); expect(fifth.body.error).toBe("role_limit"); expect(fifth.body.message).toContain("at most 5 Hosts");
    for (let i = 0; i < 10; i++) expect((await add(h, e.eid, e.org, "attendance_officer")).status).toBe(201);
    const eleventh = await add(h, e.eid, e.org, "attendance_officer"); expect(eleventh.status).toBe(409); expect(eleventh.body.message).toContain("at most 10");
    const team = await h.call("GET", `/api/events/${e.eid}/team`, undefined, e.org); expect(team.body.counts).toMatchObject({ hostsInclOrganizer: 5, monitorsOnly: 10 }); expect(team.body.canAdd).toEqual({ host: false, attendance_officer: false });
    const me = await add(h, e.eid, e.org, "attendance_officer", { personId: e.pid }); expect(me.status).toBe(201); // the Organizer also monitors
    expect((await h.call("GET", `/api/events/${e.eid}/team`, undefined, e.org)).body.counts.monitorsTotal).toBe(11);
  });
});
describe("photo of the attendee", () => {
  async function ready(opts: Record<string, boolean> = { attendance_photo: true }) {
    const h = await H.make(); const e = await newEvent(h); await h.call("PUT", `/api/events/${e.eid}/roll`, { flats: flatsOf(4) }, e.org);
    expect((await h.call("PUT", `/api/events/${e.eid}/options`, { options: opts }, e.org)).status).toBe(200);
    const mon = await add(h, e.eid, e.org, "attendance_officer"); const v = await h.call("POST", "/api/auth/verify", { eventId: e.eid, personId: mon.body.personId, code: h.codeFor(`person${n}@example.org`) });
    await h.call("POST", `/api/events/${e.eid}/points`, { kind: "resolution", title: "Approve the accounts", secret: false }, e.org);
    const pay = await h.call("POST", `/api/events/${e.eid}/pay`, {}, e.org); await h.call("POST", "/api/pay/test-confirm", { eventId: e.eid, paymentId: pay.body.paymentId }, e.org);
    expect((await h.call("POST", `/api/events/${e.eid}/agenda/publish`, {}, e.org)).status).toBe(200);
    return { h, e, mon: v.body.token as string };
  }
  test("saved with time and place; photo is private and encrypted; the public log holds only hash, flags and the monitor", async () => {
    const { h, e, mon } = await ready(); const url = `/api/events/${e.eid}/attendance/photo`;
    const geo = { lat: 28.6139, lon: 77.209, accuracyM: 12 };
    expect((await h.call("POST", url, { flatNo: "A-101", photoBase64: JPEG, capturedAtMs: h.now, geo }, mon)).body.error).toBe("consent_needed");
    expect((await h.call("POST", url, { flatNo: "A-101", photoBase64: b64(new Uint8Array([1, 2, 3, 4, 5, 6])), consent: true, capturedAtMs: h.now, geo }, mon)).body.error).toBe("not_a_photo");
    const ok = await h.call("POST", url, { flatNo: "A-101", photoBase64: JPEG, consent: true, capturedAtMs: h.now - 2000, geo, checks: { photo_taken: true, person_agrees: true } }, mon); expect(ok.status).toBe(201); expect(ok.body.hasLocation).toBe(true);
    const bad = await h.call("POST", url, { flatNo: "A-102", photoBase64: JPEG, consent: true, capturedAtMs: h.now, geoError: "permission denied" }, mon); expect(bad.body.flags).toEqual(["no_location"]);
    const row = h.raw.query("SELECT ct, lat, lon, flags, consent, by_pid FROM attendance_evidence WHERE flat_no='A-101'").get() as any; expect(row.lat).toBeCloseTo(28.6139); expect(row.ct).not.toContain(JPEG.slice(8)); expect(row.consent).toBe(1);
    const log = await getLog(h, e.eid); const ent = log.entries.filter((x) => x.entry.type === "evidence_filed"); expect(ent.length).toBe(2); const text = JSON.stringify(ent); expect(text).not.toContain("28.6139"); expect(text).toContain(ok.body.sha256);
    const ev = await h.call("GET", `/api/events/${e.eid}/flats/A-101/evidence`, undefined, e.org); expect(ev.body.photos[0]).toMatchObject({ sha256: ok.body.sha256, flags: ["ok"], place: { lat: 28.6139 }, checks: { photo_taken: true } });
    const img = await h.call("GET", ev.body.photos[0].url, undefined, e.org); expect(img.status).toBe(200); expect((await h.call("GET", ev.body.photos[0].url, undefined, mon)).status).toBe(403); // only Organizer and Hosts view it
    expect(() => h.raw.query("DELETE FROM attendance_evidence").run()).toThrow(/append-only/);
  });
  test("off by default; a photo is refused until the Organizer ticks the option", async () => {
    const { h, e, mon } = await ready({}); expect((await h.call("POST", `/api/events/${e.eid}/attendance/photo`, { flatNo: "A-101", photoBase64: JPEG, consent: true }, mon)).body.error).toBe("evidence_off");
  });
  test("with the checklist option every box must be ticked, and the photo must exist, before someone is marked present", async () => {
    const { h, e, mon } = await ready({ attendance_photo: true, attendance_checklist: true }); const att = `/api/events/${e.eid}/attendance`;
    const all = { proof_seen: true, name_matches: true, flat_matches: true, person_checked: true, photo_taken: true, person_agrees: true };
    const none = await h.call("POST", att, { flatNo: "A-101", attendeeName: "Asha Rao" }, mon); expect(none.body.error).toBe("tick_all_boxes"); expect(none.body.message).toContain("name matches");
    expect((await h.call("POST", att, { flatNo: "A-101", attendeeName: "Asha Rao", checks: { ...all, person_agrees: false } }, mon)).body.error).toBe("tick_all_boxes");
    expect((await h.call("POST", att, { flatNo: "A-101", attendeeName: "Asha Rao", checks: all }, mon)).body.error).toBe("photo_first");
    await h.call("POST", `/api/events/${e.eid}/attendance/photo`, { flatNo: "A-101", photoBase64: JPEG, consent: true, capturedAtMs: h.now, geo: { lat: 28.6, lon: 77.2 } }, mon);
    expect((await h.call("POST", att, { flatNo: "A-101", attendeeName: "Asha Rao", checks: all }, mon)).status).toBe(200);
    const a = (await getLog(h, e.eid)).entries.find((x) => x.entry.type === "attendance_marked")!.entry.payload as any; expect(a.checks).toMatchObject({ proof_seen: true, photo_taken: true });
  });
});

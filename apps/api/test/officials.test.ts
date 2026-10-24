// Owner directive: optional placeholders for the Election/Meeting Conduct Committee, Returning Officer, Government Officer, observers and anything else.
// The Organizer types the names, designations and authority. Published before the start; their attendance is marked; signature lines are printed.
import { describe, expect, test } from "bun:test";
import { H, DAY, getLog, newEvent, flatsOf } from "./harness";

const ok = async (p: Promise<any>) => { const r = await p; if (r.status >= 300) throw new Error(JSON.stringify(r.body)); return r; };
async function ready(h: H) {
  const e = await newEvent(h); await ok(h.call("PUT", `/api/events/${e.eid}/roll`, { flats: flatsOf(3) }, e.org));
  await ok(h.call("POST", `/api/events/${e.eid}/points`, { kind: "resolution", title: "Approve the accounts", secret: false }, e.org));
  const pay = await ok(h.call("POST", `/api/events/${e.eid}/pay`, {}, e.org)); await ok(h.call("POST", "/api/pay/test-confirm", { eventId: e.eid, paymentId: pay.body.paymentId }, e.org)); return e;
}
describe("committee, officers and observers", () => {
  test("optional: an event with none works and shows none", async () => {
    const h = await H.make(); const e = await ready(h); await ok(h.call("POST", `/api/events/${e.eid}/agenda/publish`, {}, e.org));
    expect((await h.call("GET", `/api/events/${e.eid}`)).body.model.officials).toEqual([]); expect((await h.call("GET", `/api/r/${e.eid}`)).text).not.toContain("Committee, officers and observers");
    expect((await h.call("GET", "/api/officials/groups")).body.groups.length).toBe(5);
  });
  test("add, edit, remove; free-text designation and authority; shown on the page before the start", async () => {
    const h = await H.make(); const e = await ready(h); const url = `/api/events/${e.eid}/officials`;
    const a = await ok(h.call("POST", url, { group: "committee", groupLabel: "Election Conduct Committee 2026", name: "Meera Iyer", designation: "Chairperson of the Committee", authority: "Elected at the 2025 AGM, resolution 7" }, e.org));
    const b = await ok(h.call("POST", url, { group: "returning_officer", name: "Col. R. Sethi (Retd.)", designation: "Returning Officer", authority: "Appointed by the Managing Committee, 3 Oct" }, e.org));
    await ok(h.call("POST", url, { group: "government_officer", name: "Anil Kumar", designation: "Inspector, Co-operative Societies", authority: "Deputed by the Registrar, order 114/2026" }, e.org));
    await ok(h.call("POST", url, { group: "other", groupLabel: "Statutory auditor", name: "P. Rao & Co." }, e.org));
    expect((await h.call("POST", url, { group: "nonsense", name: "X Y" }, e.org)).status).toBe(400); expect((await h.call("POST", url, { group: "observer", name: "X" }, e.org)).status).toBe(400);
    await ok(h.call("POST", url, { id: a.body.id, group: "committee", groupLabel: "Election Conduct Committee 2026", name: "Meera Iyer", designation: "Convenor", authority: "Elected at the 2025 AGM, resolution 7" }, e.org));
    await ok(h.call("POST", url, { id: b.body.id, remove: true }, e.org));
    const model = (await h.call("GET", `/api/events/${e.eid}`)).body.model; expect(model.officials.map((o: any) => o.name)).toEqual(["Meera Iyer", "Anil Kumar", "P. Rao & Co."]); expect(model.officials[0].designation).toBe("Convenor"); expect(model.officials.every((o: any) => o.beforeStart)).toBe(true);
    const page = (await h.call("GET", `/api/r/${e.eid}`)).text; expect(page).toContain("Election Conduct Committee 2026"); expect(page).toContain("Deputed by the Registrar"); expect(page).toContain("Signature");
    expect((await h.call("POST", url, { group: "observer", name: "Late Entry" })).status).toBeGreaterThanOrEqual(401);
  });
  test("their attendance is marked by the monitor; it is cleared when the meeting is postponed; none can be added after the start", async () => {
    const h = await H.make(); const e = await ready(h); const url = `/api/events/${e.eid}/officials`;
    const o = await ok(h.call("POST", url, { group: "returning_officer", name: "Col. R. Sethi", designation: "Returning Officer" }, e.org));
    expect((await h.call("POST", `${url}/${o.body.id}/attendance`, { present: true }, e.org)).body.error).toBe("bad_state"); // before the agenda is published
    await ok(h.call("POST", `/api/events/${e.eid}/agenda/publish`, {}, e.org));
    await ok(h.call("POST", `${url}/${o.body.id}/attendance`, { present: true, mode: "physical" }, e.org));
    let m = (await h.call("GET", `/api/events/${e.eid}`)).body.model.officials[0]; expect(m.present).toBe(true); expect(m.mode).toBe("physical");
    expect((await h.call("POST", `${url}/nope/attendance`, { present: true }, e.org)).status).toBe(404);
    h.now += 11 * DAY; h.raw.query("UPDATE sessions SET expires_ms = ?").run(h.now + DAY); await ok(h.call("POST", `/api/events/${e.eid}/start`, {}, e.org));
    expect((await h.call("POST", url, { group: "observer", name: "Too Late" }, e.org)).body.error).toBe("frozen");
    const i = await ok(h.call("POST", `/api/events/${e.eid}/intent`, { action: "postpone", reasonCodes: ["quorum_not_met"], newSchedule: { start: { atMs: h.now + 3 * DAY, place: "Hall" }, votingStart: { atMs: h.now + 3 * DAY, place: "Hall" }, votingEnd: { atMs: h.now + 3 * DAY + 7_200_000, place: "Hall" }, end: { atMs: h.now + 3 * DAY + 9_000_000, place: "Hall" } } }, e.org));
    await ok(h.call("POST", `/api/events/${e.eid}/confirm`, { intentId: i.body.intentId, code: i.body.confirmCode }, e.org));
    m = (await h.call("GET", `/api/events/${e.eid}`)).body.model.officials[0]; expect(m.present).toBe(false); // new sitting: attendance is taken again
    expect((await getLog(h, e.eid)).entries.map((x) => x.entry.type)).toEqual(expect.arrayContaining(["official_set", "official_attendance", "event_postponed"]));
    await ok(h.call("POST", url, { group: "observer", name: "Allowed Now" }, e.org)); // between sittings the list may be amended
  });
  test("signature lines are printed on the page and in the PDF", async () => {
    const h = await H.make(); const e = await ready(h); await ok(h.call("POST", `/api/events/${e.eid}/officials`, { group: "government_officer", name: "Anil Kumar", designation: "Inspector", authority: "Order 114" }, e.org));
    await ok(h.call("POST", `/api/events/${e.eid}/agenda/publish`, {}, e.org)); h.now += 11 * DAY; h.raw.query("UPDATE sessions SET expires_ms = ?").run(h.now + DAY); await ok(h.call("POST", `/api/events/${e.eid}/start`, {}, e.org));
    const i = await ok(h.call("POST", `/api/events/${e.eid}/intent`, { action: "complete" }, e.org)); await ok(h.call("POST", `/api/events/${e.eid}/confirm`, { intentId: i.body.intentId, code: i.body.confirmCode }, e.org));
    const pdf = await h.call("GET", `/api/r/${e.eid}/pdf`); expect(pdf.status).toBe(200); expect(pdf.text).toContain("Anil Kumar"); expect(pdf.text).toContain("Government Officer"); expect(pdf.text).toContain("signature");
    expect(pdf.text).toContain(`MEETING ID ${e.eid}`); expect((pdf.text.match(/MEETING ID /g) ?? []).length).toBeGreaterThanOrEqual(2); // on every page
    const web = await h.call("GET", `/api/r/${e.eid}`); expect(web.text).toContain(`<div class="wm" aria-hidden="true">MEETING ID ${e.eid}</div>`);
  });
});

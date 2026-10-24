import { describe, expect, test } from "bun:test";
import { scanPublic, verifyReportHtml, buildReportModel, replayLog, extractData } from "../../../packages/engine/src";
import { H, HOSTP, OFFP, PRIVATE, STAFF_PUBLIC, appointVerified, chainOk, getLog, newEvent, setup, ORG } from "./harness";

describe("a whole event through the API", () => {
  test("open-vote meeting: setup -> pay -> publish -> check-in -> vote -> close -> sealed report that verifies", async () => {
    const h = await H.make();
    const e = await setup(h, { flats: 10 });
    const off = await appointVerified(h, e, OFFP, "attendance_officer");
    expect((await h.call("POST", `/api/events/${e.eid}/agenda/publish`, {}, e.org)).status).toBe(200);
    expect((await h.call("POST", `/api/events/${e.eid}/start`, {}, e.org)).status).toBe(200);
    for (let i = 0; i < 6; i++) {
      const flat = `A-${101 + i}`;
      const a = await h.call("POST", `/api/events/${e.eid}/attendance`, { flatNo: flat, attendeeName: "Owner " + flat, mode: "physical", method: "visual" }, off.token);
      expect(a.status).toBe(200); expect(a.body.independent).toBe(true);
    }
    expect((await h.call("POST", `/api/events/${e.eid}/points/${e.pointId}/open`, { minutes: 20 }, e.org)).status).toBe(200);
    const choices = ["yes", "yes", "yes", "yes", "no", "abstain"];
    for (let i = 0; i < 6; i++) {
      const flat = `A-${101 + i}`;
      const c = await h.call("POST", `/api/events/${e.eid}/passcodes/voter`, { flatNo: flat }, off.token);
      expect(c.status).toBe(201); expect(c.body.code).toMatch(/^\d{6}$/);
      const l = await h.call("POST", "/api/vote/login", { eventId: e.eid, flatNo: flat, code: c.body.code, turnstile: "test-ok" });
      expect(l.status).toBe(200);
      const v = await h.call("POST", "/api/vote/cast", { pointId: e.pointId, choices: [choices[i]] }, l.body.token);
      expect(v.status).toBe(201);
    }
    // live page mid-event
    const live = await h.call("GET", `/api/r/${e.eid}`); expect(live.text).toContain("LIVE");
    expect((await h.call("POST", `/api/events/${e.eid}/close`, {}, e.org)).status).toBe(200);
    const rep = await h.call("GET", `/api/r/${e.eid}`);
    expect(rep.text).toContain("FINAL REPORT");
    const k = await h.call("GET", "/api/pubkey");
    const v = await verifyReportHtml(rep.text, { publicKey: k.body.publicKey });
    expect(v).toMatchObject({ ok: true, seal: true, chain: true, model: true });
    expect((await chainOk(h, e.eid)).ok).toBe(true);
    const model = buildReportModel(await replayLog((await getLog(h, e.eid)).entries));
    expect(model.points[0]!.tally!.outcome).toBe("carried");
    expect(model.points[0]!.tally!.options.find((o) => o.option === "yes")!.count).toBe(4);
    expect(model.attendance.line).toContain("independently verified by 1");
    // the same page, public, with private details never in it
    expect(scanPublic(rep.text, { allow: ["REG/2020/118", ...STAFF_PUBLIC], forbidden: PRIVATE })).toEqual([]);
    expect(h.count("SELECT COUNT(*) c FROM reports")).toBe(1);
    void HOSTP; void newEvent; void ORG; void extractData;
  });
});

describe("schedule and count-down through the API", () => {
  const T = Date.UTC(2026, 10, 14, 10, 30, 0), HR = 3_600_000;
  const sc = (shift = 0, place = "Clubhouse") => ({ start: { atMs: T + shift, place }, votingStart: { atMs: T + shift + HR, place }, votingEnd: { atMs: T + shift + 3 * HR, place }, end: { atMs: T + shift + 4 * HR, place: "Clubhouse / online" } });
  test("create with four milestones (meeting and election); bad order is refused; the page shows day, date, time, place and timers", async () => {
    const h = await H.make(); h.now = T - 12 * 86_400_000;
    const bad = sc(); bad.votingEnd.atMs = T - HR;
    const r0 = await h.call("POST", "/api/events", { kind: "meeting", eventType: "agm", title: "AGM", venue: "Clubhouse", packId: "in-up-aoa", schedule: bad, timezone: "Asia/Kolkata", society: { name: "Green Park Apartments", address: "12 Park Road", registrationNo: "REG/2020/118", kind: "AOA" }, organizer: ORG, turnstile: "test-ok" });
    expect(r0.status).toBe(400); expect(r0.body.error).toBe("bad_schedule");
    for (const kind of ["meeting", "election"]) {
      const r = await h.call("POST", "/api/events", { kind, eventType: "agm", title: "Event " + kind, venue: "Clubhouse", packId: "in-up-aoa", schedule: sc(), timezone: "Asia/Kolkata", society: { name: "Green Park Apartments", address: "12 Park Road", registrationNo: "REG/2020/118", kind: "AOA" }, organizer: ORG, turnstile: "test-ok" });
      expect(r.status).toBe(201);
      const page = (await h.call("GET", `/api/r/${r.body.eventId}`)).text;
      const w = kind === "election" ? "Election" : "Meeting";
      for (const l of [`${w} starts`, "Voting starts", "Voting ends", `${w} ends`]) expect(page).toContain(`<b>${l}</b>`);
      expect(page).toContain("Saturday"); expect(page).toContain("14 November 2026"); expect(page).toContain("Clubhouse / online"); expect(page).toContain('id="tm-head"');
    }
  });
  test("the head endpoint gives the server clock so the page timers use server time", async () => {
    const h = await H.make(); const e = await newEvent(h); const r = await h.call("GET", `/api/r/${e.eid}/head`);
    expect(r.body.serverNow).toBe(h.now);
  });
  test("schedule can be changed (logged, with reason) before the event starts, never after", async () => {
    const h = await H.make(); h.now = T - 12 * 86_400_000; const e = await setup(h);
    const ch = await h.call("PUT", `/api/events/${e.eid}/schedule`, { schedule: sc(86_400_000), reason: "hall booked on Sunday" }, e.org); expect(ch.status).toBe(200);
    expect((await h.call("PUT", `/api/events/${e.eid}/schedule`, { schedule: { ...sc(), end: { atMs: 5, place: "x" } }, reason: "bad one" }, e.org)).status).toBe(400);
    expect((await h.call("PUT", `/api/events/${e.eid}/schedule`, { schedule: sc() }, e.org)).status).toBe(400); // reason is required
    const model = (await h.call("GET", `/api/events/${e.eid}`)).body.model; expect(model.schedule.start.atMs).toBe(T + 86_400_000); expect(model.scheduleChanges).toBe(1);
    const off = await appointVerified(h, e, OFFP, "attendance_officer"); void off;
    await h.call("POST", `/api/events/${e.eid}/agenda/publish`, {}, e.org); await h.call("POST", `/api/events/${e.eid}/start`, {}, e.org);
    const late = await h.call("PUT", `/api/events/${e.eid}/schedule`, { schedule: sc(), reason: "too late now" }, e.org);
    expect(late.status).toBe(403); expect(late.body.error).toBe("frozen");
  });
});

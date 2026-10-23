import { describe, expect, test } from "bun:test";
import { scanPublic, verifyReportHtml, buildReportModel, replayLog, extractData } from "../../../packages/engine/src";
import { H, HOSTP, OFFP, PRIVATE, appointVerified, chainOk, getLog, newEvent, setup, ORG } from "./harness";

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
    expect(scanPublic(rep.text, { allow: ["REG/2020/118"], forbidden: PRIVATE })).toEqual([]);
    expect(h.count("SELECT COUNT(*) c FROM reports")).toBe(1);
    void HOSTP; void newEvent; void ORG; void extractData;
  });
});

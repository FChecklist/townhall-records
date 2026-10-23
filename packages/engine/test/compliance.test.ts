import { describe, expect, test } from "bun:test";
import { complianceChecks } from "../src/compliance";
import { buildReportModel } from "../src/model";
import { renderReportHtml } from "../src/render";
import { Scenario, testKey } from "./helpers";

const DAY = 86_400_000, T0 = 1_790_000_000_000;
const sched = (days: number) => { const m = (d: number) => ({ atMs: T0 + d * DAY, place: "Hall" }); return { start: m(days), votingStart: m(days), votingEnd: m(days + 0.1), end: m(days + 0.2) }; };
const sched5 = () => { const H = 3_600_000; const b = T0 + 5 * DAY; const m = (o: number) => ({ atMs: b + o * H, place: "Hall" }); return { start: m(0), votingStart: m(1), votingEnd: m(3), end: m(4) }; };
const byId = (c: ReturnType<typeof complianceChecks>, id: string) => c.checks.find((x) => x.id === id)!;

describe("checked against the rules", () => {
  test("a clean meeting passes every check, and the pack name, confidence and the lawyer flag are shown", async () => {
    const s = await Scenario.fullMeeting(false, { schedule: sched5() });
    const c = complianceChecks(await s.state());
    expect(c.checks.filter((x) => x.status === "fail")).toEqual([]);
    expect(c.packName).toContain("Uttar Pradesh"); expect(c.packConfidence).toBe("medium"); expect(c.needsLawyer).toBe(true);
    expect(byId(c, "notice")).toMatchObject({ status: "pass" }); expect(byId(c, "proxy").status).toBe("pass"); expect(byId(c, "eligibility").status).toBe("pass"); expect(byId(c, "terms").status).toBe("pass"); expect(byId(c, "log").status).toBe("pass");
    expect(c.checks.find((x) => x.id.startsWith("quorum:"))!.status).toBe("pass");
    expect(c.disclaimer).toContain("not legal advice");
  });
  test("NOTICE too long or too short is a visible FAIL", async () => {
    const s = await Scenario.fullMeeting(); // default schedule is 10 days ahead; the UP pack allows 2 to 7
    expect(byId(complianceChecks(await s.state()), "notice")).toMatchObject({ status: "fail" });
    const short = await Scenario.fullMeeting(false, { schedule: sched(1) });
    expect(byId(complianceChecks(await short.state()), "notice").status).toBe("fail");
  });
  test("QUORUM not met when voting opened is a FAIL", async () => {
    const s = await Scenario.create({ schedule: sched5() }); await s.addPoint("pt_1", "1"); await s.pay(); await s.publish(); await s.start(); await s.attend("A-101");
    await s.open("pt_1"); // written straight to the log, bypassing the machine, as a dishonest writer could
    const q = complianceChecks(await s.state()).checks.find((x) => x.id.startsWith("quorum:"))!;
    expect(q.status).toBe("fail"); expect(q.detail).toContain("1 present, 3 needed");
  });
  test("PROXY ballots while proxy voting is off are a FAIL (Maharashtra-style rule)", async () => {
    const s = await Scenario.create({ schedule: sched5(), pack: "in-mh-coop-society", flats: 6 });
    await s.addPoint("pt_1", "1"); await s.pay(); await s.publish(); await s.start(); for (let i = 0; i < 6; i++) await s.attend(`A-${101 + i}`);
    await s.open("pt_1"); await s.voteOpen("A-101", "pt_1", ["yes"], "proxy");
    expect(byId(complianceChecks(await s.state()), "proxy")).toMatchObject({ status: "fail", detail: expect.stringContaining("proxy voting was off") });
  });
  test("a secret ballot that the rules require, but an election post that was not secret, is a FAIL", async () => {
    const s = await Scenario.create({ schedule: sched5(), pack: "us-ca", kind: "election", flats: 5 });
    await s.addPoint("pt_1", "1", { kind: "election_post", options: ["a", "b"], secret: false });
    expect(byId(complianceChecks(await s.state()), "secret")).toMatchObject({ status: "fail" });
    const ok = await Scenario.create({ schedule: sched5(), pack: "us-ca", kind: "election", flats: 5 }); await ok.addPoint("pt_1", "1", { kind: "election_post", options: ["a", "b"], secret: true });
    expect(byId(complianceChecks(await ok.state()), "secret").status).toBe("pass");
  });
  test("a vote from a flat that is not on the voting list is a FAIL", async () => {
    const s = await Scenario.create({ schedule: sched5() });
    await s.add("roll_set", s.org, { rev: 2, flats: [{ flatNo: "A-101", weight: 1, eligible: false }, ...Array.from({ length: 9 }, (_, i) => ({ flatNo: `A-${102 + i}`, weight: 1, eligible: true }))] });
    await s.addPoint("pt_1", "1"); await s.pay(); await s.publish(); await s.start(); for (let i = 0; i < 5; i++) await s.attend(`A-${101 + i}`);
    await s.open("pt_1"); await s.voteOpen("A-101", "pt_1", ["yes"]);
    expect(byId(complianceChecks(await s.state()), "eligibility").status).toBe("fail");
  });
  test("a double vote, a rule change after opening and an unticked-terms action each show as a FAIL", async () => {
    const s = await Scenario.create({ schedule: sched5() }); await s.addPoint("pt_1", "1"); await s.pay(); await s.publish(); await s.start();
    for (let i = 0; i < 4; i++) await s.attend(`A-${101 + i}`);
    await s.open("pt_1"); await s.voteOpen("A-101", "pt_1", ["yes"]); await s.voteOpen("A-101", "pt_1", ["no"]);
    await s.add("rule_changed", s.org, { scope: "pt_1", param: "tie.break", old: "none", new: "lots", reason: "x" });
    await s.add("point_closed", { pid: "p_ghost000000001", role: "host" }, { pointId: "pt_1", by: "p_ghost000000001" });
    const c = complianceChecks(await s.state());
    expect(byId(c, "one_vote").status).toBe("fail"); expect(byId(c, "rules_frozen").status).toBe("fail"); expect(byId(c, "terms").status).toBe("fail"); expect(c.failed).toBeGreaterThanOrEqual(4);
  });
  test("the public page prints the section, with FAIL rows visible and the disclaimer", async () => {
    const s = await Scenario.fullMeeting(); const k = await testKey();
    const html = renderReportHtml(buildReportModel(await s.state()), s.entries, k.publicKeyRaw, k.kid);
    expect(html).toContain("Checked against the rules"); expect(html).toContain("✘ FAIL"); expect(html).toContain("not legal advice"); expect(html).toContain("confirm these values against its own bye-laws");
    expect(html).toContain("Access trail and terms");
  });
});

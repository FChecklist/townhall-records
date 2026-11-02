// The Attendance Monitor is absent on the day: an Organizer or Host takes the check-in over (a signed entry with a reason) and can hand it back.
// The rule lives in canDo (machine.ts); the entry is replayed (replay.ts), shown in the model, the chronology and "who did what".
import { describe, expect, test } from "bun:test";
import { buildReportModel } from "../src/model";
import { canDo } from "../src/machine";
import { Scenario, HOST, OFFICER, ORG } from "./helpers";

/** Organizer + Host + one Attendance Monitor, notice published. */
async function world() {
  const s = await Scenario.create(); await s.addPoint("pt_1", "1"); await s.pay();
  await s.appoint(HOST, "host", ORG.pid); await s.appoint(OFFICER, "attendance_officer", ORG.pid);
  await s.publish();
  return { s, host: { pid: HOST.pid, role: "host" }, mon: { pid: OFFICER.pid, role: "attendance_officer" } };
}

describe("check-in take-over", () => {
  test("with a Monitor appointed the Organizer and Host are refused; a take-over lets them in; handing it back closes the door again; the Monitor is never locked out", async () => {
    const { s } = await world();
    for (const who of [ORG.pid, HOST.pid]) for (const a of ["mark_attendance", "issue_voter_code"] as const) {
      const d = canDo(await s.state(), who, a); expect(d.ok).toBe(false); if (!d.ok) { expect(d.code).toBe("not_allowed"); expect(d.message).toContain("take the check-in over"); }
    }
    expect(canDo(await s.state(), OFFICER.pid, "mark_attendance").ok).toBe(true);
    await s.add("checkin_takeover", { pid: HOST.pid, role: "host" }, { on: true, reason: "The Monitor is ill", by: HOST.pid });
    const st = await s.state(); expect(st.problems).toEqual([]);
    for (const who of [ORG.pid, HOST.pid, OFFICER.pid]) for (const a of ["mark_attendance", "issue_voter_code"] as const) expect(canDo(st, who, a).ok, `${who} ${a}`).toBe(true);
    // it opens only the check-in work, nothing else of the Monitor's, and nothing for people without a role
    expect(canDo(st, ORG.pid, "edit_setup").ok).toBe(true);
    await s.add("checkin_takeover", { pid: HOST.pid, role: "host" }, { on: false, by: HOST.pid });
    const back = await s.state(); expect(back.problems).toEqual([]); expect(back.checkinTakeover).toBeNull();
    expect(canDo(back, HOST.pid, "mark_attendance").ok).toBe(false); expect(canDo(back, OFFICER.pid, "mark_attendance").ok).toBe(true);
  });
  test("the model, the chronology and 'who did what' show who took it over, why and when", async () => {
    const { s } = await world();
    const e = await s.add("checkin_takeover", { pid: HOST.pid, role: "host" }, { on: true, reason: "The Monitor is ill", by: HOST.pid });
    const m = buildReportModel(await s.state());
    expect(m.checkinTakeover).toEqual({ seq: e.entry.seq, ts: e.entry.ts, byName: expect.any(String), reason: "The Monitor is ill" });
    expect(m.checkinTakeover!.byName).not.toContain("Neha Gupta"); expect(m.checkinTakeover!.byName.length).toBeGreaterThan(3); // the hidden form, never the full name
    expect(m.chronology.some((c) => /Took over the check-in from the Attendance Monitor \(the Monitor is absent\): The Monitor is ill/.test(c.what))).toBe(true);
    expect(m.accountability.some((a) => a.role === "Host" && /Took over the check-in/.test(a.what))).toBe(true);
    await s.add("checkin_takeover", { pid: HOST.pid, role: "host" }, { on: false, by: HOST.pid, reason: "The Monitor arrived" });
    const m2 = buildReportModel(await s.state()); expect(m2.checkinTakeover).toBeNull();
    expect(m2.chronology.some((c) => /Handed the check-in back to the Attendance Monitor: The Monitor arrived/.test(c.what))).toBe(true);
  });
  test("flagged by the replay: no reason, handed back although never taken, taken before the notice is published", async () => {
    const { s } = await world();
    await s.add("checkin_takeover", { pid: HOST.pid, role: "host" }, { on: true, reason: " ", by: HOST.pid });
    expect((await s.state()).problems.join(" ")).toContain("taken over without a reason");
    await s.add("checkin_takeover", { pid: HOST.pid, role: "host" }, { on: false, by: HOST.pid });
    await s.add("checkin_takeover", { pid: HOST.pid, role: "host" }, { on: false, by: HOST.pid });
    expect((await s.state()).problems.join(" ")).toContain("handed back although nobody had taken it over");
    const early = await Scenario.create(); await early.appoint(OFFICER, "attendance_officer", ORG.pid);
    await early.add("checkin_takeover", early.org, { on: true, reason: "too early", by: ORG.pid });
    expect((await early.state()).problems.join(" ")).toContain("while attendance is not open");
  });
  test("a role_removed with a reason says so in the record (the Monitor was replaced)", async () => {
    const { s } = await world();
    await s.add("role_removed", s.org, { pid: OFFICER.pid, role: "attendance_officer", removedBy: ORG.pid, reason: "Replaced: ill on the day" });
    const m = buildReportModel(await s.state());
    expect(m.chronology.some((c) => c.what === "Removed a Attendance Monitor: Replaced: ill on the day")).toBe(true);
  });
});

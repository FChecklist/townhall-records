import { describe, expect, test } from "bun:test";
import { canAmendPoint, canChangeRoll, canChangeRule, canDo, canVote } from "../src/machine";
import { HOST, OFFICER, ORG, Scenario } from "./helpers";
import { buildReportModel } from "../src/model";

const NOW = 1_790_000_000_000;

describe("roles and e-mail verification (A1, A3)", () => {
  test("ORGANIZER CANNOT BE THE ONLY UNVERIFIED PERSON ACTING: an unverified lone organizer cannot do anything, not even pay", async () => {
    const s = await Scenario.create(); s.entries.splice(3); // created, rules, organizer appointed — e-mail NOT verified
    const st = await s.state();
    for (const a of ["edit_setup", "pay", "publish_agenda", "start", "mark_attendance", "issue_voter_code", "close_event"] as const) {
      const d = canDo(st, ORG.pid, a, { pointId: "pt_1" });
      expect(d).toMatchObject({ ok: false, code: "email_not_verified" });
    }
  });
  test("an unverified appointee (Host or Officer) cannot act either, until their own e-mail is verified", async () => {
    const s = await Scenario.create(); await s.appoint(HOST, "host", ORG.pid, false);
    expect(canDo(await s.state(), HOST.pid, "edit_setup")).toMatchObject({ ok: false, code: "email_not_verified" });
    await s.add("email_verified", { pid: HOST.pid, role: "host" }, { pid: HOST.pid });
    expect(canDo(await s.state(), HOST.pid, "edit_setup").ok).toBe(true);
  });
  test("ONE PERSON HOLDING HOST + ATTENDANCE OFFICER WORKS (and Organizer = Host rights)", async () => {
    const s = await Scenario.create();
    await s.appoint(HOST, "host", ORG.pid);
    await s.add("role_appointed", s.org, { pid: HOST.pid, role: "attendance_officer", appointedBy: ORG.pid, maskedName: "N**** G****", maskedEmail: "ne****@e****.org" });
    const st = await s.state();
    expect(st.people.get(HOST.pid)!.roles.sort()).toEqual(["attendance_officer", "host"]);
    expect(canDo(st, HOST.pid, "edit_setup").ok).toBe(true);
    expect(canDo(st, HOST.pid, "mark_attendance")).toMatchObject({ ok: false, code: "bad_state" }); // before the agenda is published
    await s.addPoint("pt_1", "1"); await s.pay(); await s.publish();
    const st2 = await s.state();
    expect(canDo(st2, HOST.pid, "mark_attendance").ok).toBe(true);
    expect(canDo(st2, HOST.pid, "issue_voter_code").ok).toBe(true);
    expect(canDo(st2, HOST.pid, "publish_agenda")).toMatchObject({ ok: false, code: "bad_state" });
    // the Organizer may NOT mark attendance once an officer exists
    expect(canDo(st2, ORG.pid, "mark_attendance")).toMatchObject({ ok: false, code: "not_allowed" });
  });
  test("ZERO attendance officers: Organizer/Host may mark attendance, and the report says it was not independently verified", async () => {
    const s = await Scenario.create(); await s.addPoint("pt_1", "1"); await s.pay(); await s.publish();
    const st = await s.state();
    expect(canDo(st, ORG.pid, "mark_attendance").ok).toBe(true);
    await s.attend("A-101");
    expect(buildReportModel(await s.state()).attendance.line).toContain("not independently verified");
  });
  test("an Attendance Officer cannot change rules, pay or open points", async () => {
    const s = await Scenario.create(); await s.appoint(OFFICER, "attendance_officer", ORG.pid);
    await s.addPoint("pt_1", "1"); await s.pay(); await s.publish(); await s.start();
    const st = await s.state();
    for (const a of ["edit_setup", "pay", "open_point", "close_event", "change_rules", "read_contacts"] as const) expect(canDo(st, OFFICER.pid, a, { pointId: "pt_1" }).ok).toBe(false);
  });
  test("strangers and people with no role are refused", async () => {
    const s = await Scenario.create();
    expect(canDo(await s.state(), "p_nobody", "edit_setup")).toMatchObject({ ok: false, code: "unknown_person" });
    await s.add("role_appointed", s.org, { pid: HOST.pid, role: "host", appointedBy: ORG.pid, maskedName: "N**** G****", maskedEmail: "ne****@e****.org" });
    await s.add("email_verified", { pid: HOST.pid, role: "host" }, { pid: HOST.pid });
    await s.add("role_removed", s.org, { pid: HOST.pid, role: "host", removedBy: ORG.pid });
    expect(canDo(await s.state(), HOST.pid, "edit_setup")).toMatchObject({ ok: false, code: "no_role" });
  });
});

describe("event life cycle gates", () => {
  test("cannot publish without payment, rules, flats and an agenda point", async () => {
    const s = await Scenario.create();
    expect(canDo(await s.state(), ORG.pid, "publish_agenda")).toMatchObject({ code: "not_paid" });
    await s.pay(); expect(canDo(await s.state(), ORG.pid, "publish_agenda")).toMatchObject({ code: "no_points" });
    await s.addPoint("pt_1", "1"); expect(canDo(await s.state(), ORG.pid, "publish_agenda").ok).toBe(true);
  });
  test("REFUSE TO START with an unset required rule (worldwide pack with no values)", async () => {
    const s = await Scenario.create({ pack: "custom-world" });
    await s.addPoint("pt_1", "1"); await s.pay();
    const d = canDo(await s.state(), ORG.pid, "publish_agenda");
    expect(d).toMatchObject({ ok: false, code: "rules_unset" });
    expect((d as any).message).toContain("notice.minDays");
  });
  test("quorum blocks opening a resolution; a discussion point opens regardless; adjourned meeting may proceed", async () => {
    const s = await Scenario.create();
    await s.addPoint("pt_1", "1"); await s.addPoint("pt_2", "2", { kind: "discussion", options: [], maxChoices: 1 });
    await s.pay(); await s.publish(); await s.start(); await s.attend("A-101");
    const st = await s.state();
    expect(canDo(st, ORG.pid, "open_point", { pointId: "pt_1" })).toMatchObject({ code: "quorum_not_met" });
    expect(canDo(st, ORG.pid, "open_point", { pointId: "pt_2" }).ok).toBe(true);
    expect(canDo(st, ORG.pid, "open_point", { pointId: "pt_1", adjourned: true })).toMatchObject({ code: "quorum_not_met" }); // UP needs 2 flats even when adjourned
    await s.attend("A-102"); await s.attend("A-103");
    expect(canDo(await s.state(), ORG.pid, "open_point", { pointId: "pt_1" }).ok).toBe(true);
  });
  test("one point open at a time; extensions limited and off by default", async () => {
    const s = await Scenario.create(); await s.addPoint("pt_1", "1"); await s.addPoint("pt_2", "2");
    await s.pay(); await s.publish(); await s.start(); for (let i = 0; i < 4; i++) await s.attend(`A-${101 + i}`);
    await s.open("pt_1");
    const st = await s.state();
    expect(canDo(st, ORG.pid, "open_point", { pointId: "pt_2" })).toMatchObject({ code: "another_open" });
    expect(canDo(st, ORG.pid, "extend_point", { pointId: "pt_1" })).toMatchObject({ code: "extensions_off" });
  });
  test("a closed or suspended event allows nothing", async () => {
    const s = await Scenario.fullMeeting();
    expect(canDo(await s.state(), ORG.pid, "edit_setup")).toMatchObject({ code: "event_closed" });
    const z = await Scenario.create(); await z.add("event_suspended", { system: true }, { reason: "abuse report" });
    expect(canDo(await z.state(), ORG.pid, "edit_setup")).toMatchObject({ code: "suspended" });
  });
});

describe("voting gates (V4, V5, V6) and frozen rules (O1, O3)", () => {
  async function live() {
    const s = await Scenario.create(); await s.addPoint("pt_1", "1"); await s.addPoint("pt_2", "2");
    await s.pay(); await s.publish(); await s.start(); await s.attend("A-101"); await s.attend("A-102"); await s.attend("A-103");
    await s.open("pt_1", 10); return s;
  }
  test("VOTE BEFORE MARKED PRESENT is refused", async () => {
    const s = await live();
    expect(canVote(await s.state(), "A-109", "pt_1", s.t + 1000)).toMatchObject({ ok: false, code: "not_present" });
    expect(canVote(await s.state(), "A-101", "pt_1", s.t + 1000).ok).toBe(true);
  });
  test("VOTE TWICE is refused", async () => {
    const s = await live(); await s.voteOpen("A-101", "pt_1", ["yes"]);
    expect(canVote(await s.state(), "A-101", "pt_1", s.t + 1000)).toMatchObject({ ok: false, code: "already_voted" });
    expect(canVote(await s.state(), "A-101", "pt_2", s.t + 1000)).toMatchObject({ code: "point_not_open" }); // a different point is its own question
  });
  test("VOTE AFTER CLOSE (point closed, or the server clock passed the window) is refused", async () => {
    const s = await live();
    expect(canVote(await s.state(), "A-102", "pt_1", s.t + 11 * 60_000)).toMatchObject({ ok: false, code: "window_ended" });
    await s.close("pt_1");
    expect(canVote(await s.state(), "A-102", "pt_1", s.t + 1000)).toMatchObject({ ok: false, code: "point_closed" });
  });
  test("ineligible flats and unknown points are refused", async () => {
    const s = await live();
    expect(canVote(await s.state(), "Z-1", "pt_1", s.t)).toMatchObject({ code: "not_eligible" });
    expect(canVote(await s.state(), "A-101", "nope", s.t)).toMatchObject({ code: "unknown_point" });
  });
  test("CHANGE A RULE AFTER VOTING OPENED on that point: refused; before: allowed; the roll and the point text freeze too", async () => {
    const s = await live();
    expect(canChangeRule(await s.state(), "pt_1")).toMatchObject({ ok: false, code: "frozen" });
    expect(canChangeRule(await s.state(), "pt_2").ok).toBe(true);
    expect(canAmendPoint(await s.state(), "pt_1")).toMatchObject({ code: "frozen" });
    expect(canAmendPoint(await s.state(), "pt_2").ok).toBe(true);
    expect(canChangeRoll(await s.state())).toMatchObject({ code: "frozen" });
  });
});

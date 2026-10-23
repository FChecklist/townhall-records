import { describe, expect, test } from "bun:test";
import { countdowns, dayParts, defaultSchedule, formatRemaining, milestoneLabel, validateSchedule, type Schedule } from "../src/schedule";
import { buildReportModel } from "../src/model";
import { renderReportHtml } from "../src/render";
import { VERIFIER_JS } from "../src/verifier.generated";
import { Scenario, testKey } from "./helpers";

const H = 3_600_000;
const T = Date.UTC(2026, 10, 14, 10, 30, 0); // Saturday 14 Nov 2026, 10:30 UTC = 16:00 in India
const sched = (): Schedule => ({ start: { atMs: T, place: "Clubhouse" }, votingStart: { atMs: T + H, place: "Clubhouse" }, votingEnd: { atMs: T + 3 * H, place: "Clubhouse" }, end: { atMs: T + 4 * H, place: "Clubhouse / online link" } });

describe("schedule", () => {
  test("four milestones in order; every one needs a time and a place", () => {
    expect(validateSchedule(sched())).toBeNull();
    const bad = sched(); bad.votingStart.atMs = T - H; expect(validateSchedule(bad)).toContain("cannot be earlier");
    const noPlace = sched(); noPlace.end.place = ""; expect(validateSchedule(noPlace)).toContain("place");
    const noTime = sched(); (noTime.start as any).atMs = 0; expect(validateSchedule(noTime)).toContain("date and time");
    expect(validateSchedule(null)).toContain("missing");
    const equalOk = sched(); equalOk.votingStart.atMs = T; expect(validateSchedule(equalOk)).toBeNull(); // may start together
  });
  test("labels differ for a meeting and an election (owner wording)", () => {
    expect(["start", "votingStart", "votingEnd", "end"].map((k) => milestoneLabel("meeting", k as any))).toEqual(["Meeting starts", "Voting starts", "Voting ends", "Meeting ends"]);
    expect(["start", "votingStart", "votingEnd", "end"].map((k) => milestoneLabel("election", k as any))).toEqual(["Election starts", "Voting starts", "Voting ends", "Election ends"]);
  });
  test("day, date and time in the event's own time zone (India, a crossing of midnight, an unknown zone)", () => {
    expect(dayParts(T, "Asia/Kolkata")).toEqual({ day: "Saturday", date: "14 November 2026", time: "16:00", zone: "Asia/Kolkata" });
    expect(dayParts(Date.UTC(2026, 10, 14, 20, 0), "Asia/Kolkata")).toMatchObject({ day: "Sunday", date: "15 November 2026", time: "01:30" });
    expect(dayParts(Date.UTC(2026, 10, 14, 23, 5), "UTC").time).toBe("23:05");
    expect(dayParts(Date.UTC(2026, 10, 15, 0, 5), "UTC")).toMatchObject({ day: "Sunday", time: "00:05" });
    expect(dayParts(T, "Not/AZone")).toMatchObject({ zone: "UTC", time: "10:30" });
    expect(dayParts(T, "America/Chicago")).toMatchObject({ day: "Saturday", time: "04:30" }); // any country works
  });
  test("a single start time gets sensible defaults", () => {
    const d = defaultSchedule(T, "Hall"); expect(validateSchedule(d)).toBeNull(); expect(d.end.atMs - d.start.atMs).toBe(3 * H);
  });
});

describe("count-down timers (running backwards)", () => {
  test("formatting", () => {
    expect(formatRemaining(0)).toBe("0:00:00"); expect(formatRemaining(-5)).toBe("0:00:00");
    expect(formatRemaining(65_000)).toBe("0:01:05"); expect(formatRemaining(26 * H + 3 * 60_000 + 4000)).toBe("1d 2:03:04");
  });
  test("before the meeting: 'Meeting opens in ...' counts down to the start; all four milestones listed", () => {
    const c = countdowns(sched(), "meeting", T - 2 * H - 5000);
    expect(c.headline).toEqual({ label: "Meeting opens in", remainingMs: 2 * H + 5000, text: "2:00:05" });
    expect(c.all.map((x) => [x.label, x.state])).toEqual([["Meeting opens in", "upcoming"], ["Voting opens in", "upcoming"], ["Voting closes in", "upcoming"], ["Meeting closes in", "upcoming"]]);
  });
  test("an ELECTION says Election, and the timer moves on to the next step as each one passes", () => {
    expect(countdowns(sched(), "election", T - 1000).headline!.label).toBe("Election opens in");
    expect(countdowns(sched(), "election", T + 1000).headline).toMatchObject({ label: "Voting opens in", remainingMs: H - 1000 });
    expect(countdowns(sched(), "election", T + H + 1000).headline).toMatchObject({ label: "Voting closes in", remainingMs: 2 * H - 1000 });
    expect(countdowns(sched(), "election", T + 3 * H + 1000).headline).toMatchObject({ label: "Election closes in", remainingMs: H - 1000 });
    expect(countdowns(sched(), "election", T + 5 * H).headline).toBeNull();
  });
  test("while a vote is open the timer follows the REAL end of that window (extensions count), not the plan", () => {
    const realEnd = T + 2 * H; // the Host opened voting for one hour only
    expect(countdowns(sched(), "meeting", T + H + 600_000, realEnd).headline).toMatchObject({ label: "Voting closes in", remainingMs: realEnd - (T + H + 600_000) });
    expect(countdowns(sched(), "meeting", T + H + 600_000, realEnd).all.find((x) => x.key === "votingEnd")!.atMs).toBe(realEnd); // the list agrees with the headline
    const extended = realEnd + 30 * 60_000;
    expect(countdowns(sched(), "meeting", T + 2 * H + 60_000, extended).headline!.remainingMs).toBe(extended - (T + 2 * H + 60_000));
  });
  test("the timer never goes negative", () => { for (const x of countdowns(sched(), "meeting", T + 9 * H).all) { expect(x.remainingMs).toBe(0); expect(x.state).toBe("passed"); } });
});

describe("schedule on the log and the public page", () => {
  test("the page shows all four milestones with day, date, time and place, for a meeting and for an election", async () => {
    for (const kind of ["meeting", "election"] as const) {
      const s = await Scenario.create({ kind, schedule: sched() });
      const k = await testKey(); const st = await s.state(); const model = buildReportModel(st);
      const html = renderReportHtml(model, s.entries, k.publicKeyRaw, k.kid);
      const what = kind === "election" ? "Election" : "Meeting";
      for (const l of [`${what} starts`, "Voting starts", "Voting ends", `${what} ends`]) expect(html).toContain(`<b>${l}</b>`);
      expect(html).toContain("Saturday"); expect(html).toContain("14 November 2026"); expect(html).toContain("<td>16:00</td>"); expect(html).toContain("Clubhouse / online link");
      expect(html).toContain('id="tm-head"'); expect(html).toContain("Time (Asia/Kolkata)");
      expect(model.schedule.end.place).toBe("Clubhouse / online link");
    }
  });
  test("a closed event shows 'ended' instead of timers", async () => {
    const s = await Scenario.fullMeeting(); const k = await testKey();
    const html = renderReportHtml(buildReportModel(await s.state()), s.entries, k.publicKeyRaw, k.kid);
    expect(html).toContain("This event has ended."); expect(html).not.toContain('id="tm-head"');
  });
  test("changing the schedule is a logged entry with old and new values; after the event starts it is flagged", async () => {
    const s = await Scenario.create({ schedule: sched() });
    const moved = sched(); moved.start.atMs = T + 24 * H; moved.votingStart.atMs = T + 25 * H; moved.votingEnd.atMs = T + 27 * H; moved.end.atMs = T + 28 * H;
    await s.add("schedule_set", s.org, { schedule: moved as any, reason: "venue clash", old: sched() as any });
    let st = await s.state(); expect(st.created!.schedule.start.atMs).toBe(T + 24 * H); expect(st.problems).toEqual([]); expect(buildReportModel(st).scheduleChanges).toBe(1);
    await s.addPoint("pt_1", "1"); await s.pay(); await s.publish(); await s.start();
    await s.add("schedule_set", s.org, { schedule: sched() as any, reason: "late change", old: moved as any });
    st = await s.state(); expect(st.problems.join()).toContain("schedule changed after the event started");
    await s.add("schedule_set", s.org, { schedule: { ...sched(), end: { atMs: 1, place: "x" } } as any, reason: "bad", old: moved as any });
    expect((await s.state()).problems.join()).toContain("invalid schedule");
  });
  test("the in-page bundle carries the same timer code (runs in a bare JS context)", () => {
    const g: any = { crypto: globalThis.crypto };
    new Function("globalThis", "crypto", "TextEncoder", "TextDecoder", "atob", "btoa", VERIFIER_JS)(g, g.crypto, TextEncoder, TextDecoder, atob, btoa);
    expect(g.aoaTimers.countdowns(sched(), "election", T - 1000).headline.label).toBe("Election opens in");
  });
});

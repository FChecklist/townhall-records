// Team Desk rights table (public/assets/desk-rights.js): who may work on which section, as a pure function, and a check that it agrees with the real server.
// The page greys out what a role may not work on; the server still decides every action, so these tests pin the two together.
// Run: bun test --isolate --timeout 120000 apps/api/test/desk-rights.test.ts
import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { H, HOSTP, OFFP, appointVerified, setup } from "./harness";

const R: any = await import(join(import.meta.dir, "../public/assets/desk-rights.js"));
const { rightsOf, landingTab, ORDER, SECTIONS, ROLE_WORD } = R;
const team = (...roles: string[][]) => ({ people: roles.map((r) => ({ roles: r })) });
const open = (roles: string[], model: unknown): string[] => ORDER.filter((k: string) => rightsOf(roles, model)[k].ok);
const without = (...gone: string[]) => ORDER.filter((k: string) => !gone.includes(k));
const ok = async (p: Promise<any>) => { const r = await p; if (r.status >= 300) throw new Error(JSON.stringify(r.body)); return r; };

describe("rights table", () => {
  test("Organizer with no Attendance Monitor appointed: every part is open (the Organizer checks people in)", () => {
    expect(open(["organizer"], team(["organizer"]))).toEqual(ORDER);
  });
  test("Host / Co-host once a Monitor is appointed: Check-in is greyed out, with the reason", () => {
    const m = team(["organizer"], ["host"], ["attendance_officer"]);
    expect(open(["host"], m)).toEqual(without("checkin"));
    expect(rightsOf(["host"], m).checkin.why).toContain("Attendance Monitor");
  });
  test("a Host with no Monitor appointed keeps Check-in", () => { expect(open(["host"], team(["organizer"], ["host"]))).toEqual(ORDER); });
  test("an Organizer who is also the Attendance Monitor keeps Check-in", () => { expect(open(["organizer", "attendance_officer"], team(["organizer", "attendance_officer"]))).toEqual(ORDER); });
  test("Attendance Monitor: Home, Check-in and Record are open; Setup, Voting day, Team and End or move are greyed out", () => {
    const m = team(["organizer"], ["attendance_officer"]);
    expect(open(["attendance_officer"], m)).toEqual(["home", "checkin", "record"]);
    for (const k of ["setup", "day", "team", "end"]) expect(rightsOf(["attendance_officer"], m)[k].why).toContain("Organizer or a Host");
  });
  test("a person with no role gets only Home and Record, and bad input does not throw", () => {
    expect(open([], team(["organizer"]))).toEqual(["home", "record"]);
    expect(open(undefined as any, undefined)).toEqual(["home", "record"]);
  });
  test("ORDER and SECTIONS agree, every section is fully described, Co-host is shown next to Host", () => {
    expect(Object.keys(SECTIONS).sort()).toEqual([...ORDER].sort());
    for (const k of ORDER) { const s = SECTIONS[k]; for (const f of ["label", "who", "what", "open"]) expect(typeof s[f], `${k}.${f}`).toBe("string"); expect(Array.isArray(s.items)).toBe(true); if (k !== "home") expect(s.items.length, k).toBeGreaterThan(2); }
    expect(ROLE_WORD.host).toContain("Co-host");
  });
  test("no text the UI grid rejects (undefined, NaN, [object, null) is in the table", () => {
    const text = JSON.stringify({ SECTIONS, ROLE_WORD }) + JSON.stringify(rightsOf(["attendance_officer"], team(["organizer"]))) + JSON.stringify(rightsOf(["host"], team(["attendance_officer"])));
    expect(text).not.toMatch(/\bundefined\b|\bNaN\b|\[object |\bnull\b/);
  });
});

describe("the rights table agrees with the server", () => {
  // two published events: one with no Attendance Monitor, one with one; the page's answer and the server's answer must match in both
  const published = async (withMonitor: boolean) => {
    const h = await H.make(); const e = await setup(h); const host = await appointVerified(h, e, HOSTP, "host"); const mon = withMonitor ? await appointVerified(h, e, OFFP, "attendance_officer") : null;
    await ok(h.call("POST", `/api/events/${e.eid}/agenda/publish`, {}, e.org));
    return { h, e, host, mon, model: async () => (await h.call("GET", `/api/events/${e.eid}`)).body.model, verify: (token: string) => h.call("GET", `/api/events/${e.eid}/verify/A-101`, undefined, token) };
  };
  test("Check-in with no Attendance Monitor appointed: the page opens it for a Host, and the server lets the Host in", async () => {
    const w = await published(false);
    expect(rightsOf(["host"], await w.model()).checkin.ok).toBe(true);
    expect((await w.verify(w.host.token)).status).toBe(200);
  });
  test("Check-in with an Attendance Monitor appointed: the page greys it out for a Host, and the server refuses the Host; the Monitor is let in", async () => {
    const w = await published(true);
    expect(rightsOf(["host"], await w.model()).checkin.ok).toBe(false);
    expect((await w.verify(w.host.token)).status).toBe(403);
    expect(rightsOf(["attendance_officer"], await w.model()).checkin.ok).toBe(true);
    expect((await w.verify(w.mon!.token)).status).toBe(200);
  });
  test("Setup: the Organizer and a Host are allowed, a Monitor is refused, exactly as the page shows it", async () => {
    const h = await H.make(); const e = await setup(h); const host = await appointVerified(h, e, HOSTP, "host"); const mon = await appointVerified(h, e, OFFP, "attendance_officer");
    const m = (await h.call("GET", `/api/events/${e.eid}`)).body.model;
    expect(rightsOf(["organizer"], m).setup.ok).toBe(true); expect(rightsOf(["host"], m).setup.ok).toBe(true); expect(rightsOf(["attendance_officer"], m).setup.ok).toBe(false);
    await ok(h.call("PUT", `/api/events/${e.eid}/basics`, { venue: "Club house" }, e.org));
    await ok(h.call("PUT", `/api/events/${e.eid}/basics`, { venue: "Community hall" }, host.token));
    expect((await h.call("PUT", `/api/events/${e.eid}/basics`, { venue: "Garden" }, mon.token)).status).toBe(403);
  });
});

describe("where a person lands after signing in", () => {
  const live = (...r: string[][]) => ({ status: "agenda_published", people: r.map((x) => ({ roles: x })) });
  test("an Attendance Monitor lands on Check-in once attendance is open (the door job: one tap less)", () => {
    for (const status of ["agenda_published", "live", "postponed"]) expect(landingTab(["attendance_officer"], { ...live(["organizer"], ["attendance_officer"]), status }, null)).toBe("checkin");
  });
  test("before the notice (nothing to check in yet) and after the end, a Monitor lands on Home", () => {
    for (const status of ["setup", "closed", "suspended"]) expect(landingTab(["attendance_officer"], { ...live(["organizer"], ["attendance_officer"]), status }, null)).toBe("home");
  });
  test("Organizer, Host, an Organizer who is also the Monitor, and a person with no role all land on Home", () => {
    const m = live(["organizer", "attendance_officer"], ["host"]);
    expect(landingTab(["organizer"], m, null)).toBe("home"); expect(landingTab(["host"], m, null)).toBe("home");
    expect(landingTab(["organizer", "attendance_officer"], m, null)).toBe("home"); expect(landingTab([], m, null)).toBe("home"); expect(landingTab(undefined, undefined, null)).toBe("home");
  });
  test("the tab the person was last on wins while their role may still work on it; otherwise the rule above applies", () => {
    const m = live(["organizer"], ["attendance_officer"]);
    expect(landingTab(["attendance_officer"], m, "record")).toBe("record"); expect(landingTab(["attendance_officer"], m, "home")).toBe("home");
    expect(landingTab(["attendance_officer"], m, "setup")).toBe("checkin"); // greyed for a Monitor: ignored
    expect(landingTab(["host"], live(["organizer"], ["host"], ["attendance_officer"]), "checkin")).toBe("home"); // greyed for a Host while a Monitor does it
    expect(landingTab(["attendance_officer"], m, "nonsense")).toBe("checkin");
  });
});

describe("a take-over opens Check-in for the Organizer and Host, on the page and on the server", () => {
  test("rightsOf: greyed while the Monitor does it, open once taken over, greyed again after the hand-back; the Monitor is never affected", () => {
    const base = { people: [{ roles: ["organizer"] }, { roles: ["host"] }, { roles: ["attendance_officer"] }] };
    expect(rightsOf(["host"], base).checkin.ok).toBe(false); expect(rightsOf(["host"], base).checkin.why).toContain("take it over or replace them in Team");
    const taken = { ...base, checkinTakeover: { seq: 9, ts: 1, byName: "N*", reason: "ill" } };
    expect(rightsOf(["host"], taken).checkin.ok).toBe(true); expect(rightsOf(["organizer"], taken).checkin.ok).toBe(true); expect(rightsOf(["attendance_officer"], taken).checkin.ok).toBe(true);
    expect(rightsOf(["host"], { ...base, checkinTakeover: null }).checkin.ok).toBe(false);
    expect(rightsOf([], taken).checkin.ok).toBe(false); // a person with no role gets nothing from it
  });
  test("the page's answer matches the server before, during and after a take-over", async () => {
    const h = await H.make(); const e = await setup(h); const host = await appointVerified(h, e, HOSTP, "host"); await appointVerified(h, e, OFFP, "attendance_officer");
    await ok(h.call("POST", `/api/events/${e.eid}/agenda/publish`, {}, e.org));
    const model = async () => (await h.call("GET", `/api/events/${e.eid}`)).body.model; const verify = () => h.call("GET", `/api/events/${e.eid}/verify/A-101`, undefined, host.token);
    expect(rightsOf(["host"], await model()).checkin.ok).toBe(false); expect((await verify()).status).toBe(403);
    await ok(h.call("POST", `/api/events/${e.eid}/checkin/takeover`, { on: true, reason: "ill" }, e.org));
    expect(rightsOf(["host"], await model()).checkin.ok).toBe(true); expect((await verify()).status).toBe(200);
    await ok(h.call("POST", `/api/events/${e.eid}/checkin/takeover`, { on: false }, host.token));
    expect(rightsOf(["host"], await model()).checkin.ok).toBe(false); expect((await verify()).status).toBe(403);
  });
});

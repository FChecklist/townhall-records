// Team Desk on a phone and the new desk screens, in a fake browser (happy-dom) wired to the REAL handler and migrations (same harness as ui.test.ts): every module runs exactly as shipped.
// Covers: the seven sections collapse into one menu; the reason a section is greyed is VISIBLE TEXT; an Attendance Monitor lands on Check-in; the "Monitor absent" card (take over / hand back / replace);
// the Withdraw dialog after the notice. (Colours and real layout are checked on a real phone: see docs/OWNER-DECISIONS-2026-11-02.md.)
// Run: bun test --isolate --timeout 120000 apps/api/test/desk-phone.test.ts
import { describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
import { handle } from "../src/handler";
import { H } from "./harness";
import { build, type State } from "./states";

const PUB = join(import.meta.dir, "../public");
Bun.plugin({ name: "assets", setup(b) { b.onResolve({ filter: /^\/assets\// }, (a) => ({ path: join(PUB, a.path) })); } });

const errors: string[] = [];
process.on("unhandledRejection", (e: any) => { errors.push("unhandled: " + String(e?.message ?? e)); });
let inflight = 0, counter = 0;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const REWRITES: Array<[RegExp, string]> = [[/^\/e\//, "/e/index.html"], [/^\/v\//, "/v/index.html"], [/^\/pay\//, "/pay/index.html"], [/^\/hall\//, "/hall/index.html"], [/^\/h\//, "/v/index.html"]];

interface Page { win: Window; text: () => string; q: (s: string) => any; qa: (s: string) => any[]; settle: () => Promise<void>; consoleErrors: string[]; done: () => void }
async function open(h: H, path: string, opts: { session?: Record<string, unknown>; lang?: string; mobile?: boolean } = {}): Promise<Page> {
  const win = new Window({ url: "http://localhost" + path, width: opts.mobile ? 375 : 1200, height: opts.mobile ? 812 : 800, settings: { disableJavaScriptFileLoading: true, disableJavaScriptEvaluation: true, disableCSSFileLoading: true } });
  const doc = win.document;
  { let f = path.split("?")[0]!.split("#")[0]!; for (const [re, to] of REWRITES) if (re.test(f)) { f = to; break; } let file = join(PUB, f); if (existsSync(file) && !extname(file)) file = join(file, "index.html"); if (!existsSync(file)) file = join(PUB, "404.html"); doc.documentElement.innerHTML = readFileSync(file, "utf8"); } Object.defineProperty(doc, "hidden", { value: true, configurable: true });
  const consoleErrors: string[] = [];
  const g: any = globalThis;
  const set = (k: string, v: unknown) => Object.defineProperty(g, k, { value: v, configurable: true, writable: true });
  for (const k of ["window", "document", "location", "localStorage", "sessionStorage", "history", "Node", "Element", "HTMLElement", "Event", "DOMParser", "getComputedStyle"]) set(k, (win as any)[k]);
  set("navigator", win.navigator); set("self", win);
  win.localStorage.setItem("tw_device", "uidevice" + String(++counter).padStart(8, "0")); win.localStorage.setItem("tw_lang", opts.lang ?? "en");
  for (const [k, v] of Object.entries(opts.session ?? {})) win.sessionStorage.setItem("tw_" + k, JSON.stringify(v));
  g.console = { ...console, error: (...a: any[]) => { consoleErrors.push(a.map(String).join(" ")); }, warn: () => {} };
  let ipn = counter;
  g.fetch = async (input: any, init: any = {}) => {
    const url = typeof input === "string" ? input : input.url; const p = url.replace(/^https?:\/\/[^/]+/, "");
    if (p.startsWith("/api/")) {
      inflight++;
      try {
        const hd = new Headers(init.headers || {}); hd.set("cf-connecting-ip", "10.1." + (ipn % 250) + "." + (++ipn % 250));
        if (!hd.get("x-device-id")) hd.set("x-device-id", "uidevice" + String(counter).padStart(8, "0"));
        return await handle(new Request("http://x" + p, { method: init.method || "GET", headers: hd, body: init.body }), h.env, h.now);
      } finally { inflight--; }
    }
    let f = p.split("?")[0]!; for (const [re, to] of REWRITES) if (re.test(f)) { f = to; break; }
    let file = join(PUB, f); if (existsSync(file) && !extname(file)) file = join(file, "index.html");
    if (!existsSync(file)) return new Response("not found", { status: 404 });
    return new Response(readFileSync(file));
  };
  const q = (s: string) => doc.querySelector(s), qa = (s: string) => [...doc.querySelectorAll(s)];
  const settle = async () => { for (let i = 0; i < 150; i++) { await wait(15); if (inflight === 0 && !doc.querySelector(".spin")) { await wait(30); if (inflight === 0 && !doc.querySelector(".spin")) return; } } };
  return { win, text: () => doc.body.textContent ?? "", q, qa, settle, consoleErrors, done: () => { try { win.happyDOM.abort(); win.close(); } catch { /* closed */ } } };
}
const load = async (page: Page, module: string, htmlPath?: string) => { void htmlPath; await import(join(PUB, "assets", module) + "?s=" + (++counter)); await page.settle(); };
const BAD_TEXT = /\bundefined\b|\bNaN\b|\[object |\bnull\b(?! )/;

// ---------------------------------------------------------------------------------------------------------------- the tests
type World = Awaited<ReturnType<typeof build>>;
const session = (w: World, role: "organizer" | "host" | "monitor") => ({ desk: { eid: w.ctx.eid, pid: w.pids[role], token: w.tokens[role], roles: role === "monitor" ? ["attendance_officer"] : [role] } });
const worldOf = async (state: State, withMonitor = true) => build(await H.make(), state, "meeting", withMonitor);
const tabBtn = (pg: Page, label: string) => pg.qa("[data-test=tabs] button").find((b) => (b.textContent ?? "").trim() === label);
const go = async (pg: Page, label: string) => { tabBtn(pg, label).click(); await pg.settle(); await wait(80); await pg.settle(); };
const modelOf = async (w: World) => (await w.h.call("GET", `/api/events/${w.ctx.eid}`)).body.model;
const clean = (s: string) => s.split("IT Services by Rajat Agarwal").join("");
const after = async (pg: Page) => { await wait(150); await pg.settle(); await wait(80); await pg.settle(); };

describe("phone: the seven sections behind one menu", () => {
  test("a menu button names the current section; it opens the list of seven and picking one closes it again", async () => {
    const w = await worldOf("published"); const pg = await open(w.h, "/desk/", { mobile: true, session: session(w, "organizer") }); errors.length = 0; await load(pg, "desk.js");
    const btn = () => pg.q("[data-test=tabs-menu]"), bar = () => pg.q("#desk-tabs");
    expect(btn()).toBeTruthy(); expect(btn().getAttribute("aria-expanded")).toBe("false"); expect(btn().getAttribute("aria-controls")).toBe("desk-tabs"); expect(btn().textContent).toContain("Section: Home");
    expect(bar().classList.contains("open")).toBe(false);
    btn().click(); expect(btn().getAttribute("aria-expanded")).toBe("true"); expect(bar().classList.contains("open")).toBe(true);
    expect(pg.qa("[data-test=tabs] button").map((b) => (b.textContent ?? "").trim())).toEqual(["Home", "Setup", "Voting day", "Team", "Check-in", "End or move", "Record"]);
    btn().click(); expect(bar().classList.contains("open")).toBe(false); btn().click(); expect(bar().classList.contains("open")).toBe(true); // it toggles
    await go(pg, "Team"); expect(btn().textContent).toContain("Section: Team"); expect(bar().classList.contains("open")).toBe(false); expect(btn().getAttribute("aria-expanded")).toBe("false");
    expect(pg.consoleErrors).toEqual([]); expect(errors).toEqual([]); pg.done();
  });
});

describe("the reason a section is grey is visible text", () => {
  test("Organizer or Host while a Monitor does the check-in: the reason is under the grey section and in the note under the bar", async () => {
    const w = await worldOf("published");
    for (const role of ["organizer", "host"] as const) {
      const pg = await open(w.h, "/desk/", { mobile: true, session: session(w, role) }); errors.length = 0; await load(pg, "desk.js");
      const why = pg.q("[data-test=why-tab-checkin]"); expect(why, role).toBeTruthy(); expect(why.textContent).toContain("An Attendance Monitor does the check-in for this event");
      expect(why.id).toBe("why-tab-checkin"); expect(tabBtn(pg, "Check-in").getAttribute("aria-describedby")).toBe("why-tab-checkin"); expect(tabBtn(pg, "Check-in").getAttribute("aria-disabled")).toBe("true");
      expect(clean(pg.q("[data-test=tab-hint]").textContent ?? "")).toContain("Check-in: An Attendance Monitor does the check-in");
      expect(pg.qa("[data-test^=why-tab-]").length).toBe(1); expect(tabBtn(pg, "Setup").getAttribute("aria-describedby")).toBeNull(); // only the grey section carries a reason
      expect((tabBtn(pg, "Check-in").textContent ?? "").trim()).toBe("Check-in"); // the button keeps its plain name
      pg.done();
    }
  });
  test("Attendance Monitor: four grey sections, one grouped line with the shared reason", async () => {
    const w = await worldOf("published"); const pg = await open(w.h, "/desk/", { mobile: true, session: session(w, "monitor") }); errors.length = 0; await load(pg, "desk.js");
    expect(pg.qa("[data-test^=why-tab-]").map((x) => x.getAttribute("data-test"))).toEqual(["why-tab-setup", "why-tab-day", "why-tab-team", "why-tab-end"]);
    const hint = clean(pg.q("[data-test=tab-hint]").textContent ?? ""); expect(hint).toContain("Setup, Voting day, Team, End or move: This part belongs to the Organizer or a Host.");
    expect(pg.qa("[data-test=tab-hint] p").length).toBe(1);
    pg.done();
  });
  test("a person with every section open has no grey note at all (the Organizer of an event with no Monitor)", async () => {
    const w = await worldOf("published", false); const pg = await open(w.h, "/desk/", { mobile: true, session: session(w, "organizer") }); await load(pg, "desk.js");
    expect(pg.q("[data-test=tab-hint]")).toBeNull(); expect(pg.qa("[data-test^=why-tab-]").length).toBe(0); pg.done();
  });
});

describe("an Attendance Monitor lands on Check-in", () => {
  test("published and live: Check-in is the section that is open; Organizer and Host land on Home; before the notice a Monitor lands on Home", async () => {
    for (const [state, role, want] of [["published", "monitor", "Check-in"], ["live", "monitor", "Check-in"], ["setup", "monitor", "Home"], ["published", "organizer", "Home"], ["published", "host", "Home"]] as const) {
      const w = await worldOf(state); const pg = await open(w.h, "/desk/", { mobile: true, session: session(w, role) }); errors.length = 0; await load(pg, "desk.js");
      expect((pg.q("[data-test=tabs] button.on")?.textContent ?? "").trim(), `${state}/${role}`).toBe(want);
      if (want === "Check-in") expect(clean(pg.q("[data-test=tabs-menu]").textContent ?? "")).toContain("Section: Check-in");
      pg.done();
    }
  });
});

describe("the Attendance Monitor is absent: take over, hand back, replace", () => {
  test("Organizer: an empty reason is refused on the page; with a reason the check-in opens, the Check-in section shows the banner, and the banner hands it back", async () => {
    const w = await worldOf("published"); const pg = await open(w.h, "/desk/", { session: session(w, "organizer") }); errors.length = 0; await load(pg, "desk.js");
    expect(tabBtn(pg, "Check-in").classList.contains("locked")).toBe(true);
    await go(pg, "Team"); expect(pg.q("[data-test=absent-card]")).toBeTruthy(); expect(pg.q("[data-test=absent-why]")).toBeNull(); // attendance is open, so no "not open yet" note
    pg.q("[data-test=takeover-go]").click(); await wait(80); await pg.settle();
    expect(clean(pg.q("[data-test=absent-result]").textContent ?? "")).toContain("Please say why"); expect((await modelOf(w)).checkinTakeover).toBeNull();
    pg.q("[data-test=absent-reason]").value = "The Monitor is ill and cannot come";
    pg.q("[data-test=takeover-go]").click(); await after(pg);
    const tk = (await modelOf(w)).checkinTakeover; expect(tk && tk.reason).toBe("The Monitor is ill and cannot come");
    expect(tabBtn(pg, "Check-in").classList.contains("locked")).toBe(false); // the page re-drew: Check-in is open for the Organizer now
    expect(pg.q("[data-test=takeover-handback]")).toBeTruthy(); expect(clean(pg.q("[data-test=absent-card]").textContent ?? "")).toContain("The check-in is taken over.");
    await go(pg, "Check-in"); const banner = pg.q("[data-test=takeover-banner]"); expect(banner).toBeTruthy(); expect(clean(banner.textContent ?? "")).toContain("The Monitor is ill and cannot come"); expect(pg.q("[data-test=locked-panel]")).toBeNull();
    pg.q("[data-test=takeover-handback-banner]").click(); await after(pg);
    expect((await modelOf(w)).checkinTakeover).toBeNull(); expect(tabBtn(pg, "Check-in").classList.contains("locked")).toBe(true);
    expect(pg.consoleErrors).toEqual([]); expect(errors).toEqual([]); pg.done();
  });
  test("a Host on the grey Check-in section is pointed to Team; the Monitor never sees the absent card or the pointer", async () => {
    const w = await worldOf("published"); const host = await open(w.h, "/desk/", { session: session(w, "host") }); await load(host, "desk.js");
    await go(host, "Check-in"); expect(host.q("[data-test=locked-panel]")).toBeTruthy(); expect(host.q("[data-test=monitor-absent]")).toBeTruthy();
    host.q("[data-test=go-absent]").click(); await host.settle(); await wait(80); await host.settle(); expect(host.q("[data-test=absent-card]")).toBeTruthy(); host.done();
    const mon = await open(w.h, "/desk/", { session: session(w, "monitor") }); await load(mon, "desk.js"); await go(mon, "Team");
    expect(mon.q("[data-test=absent-card]")).toBeNull(); expect(mon.q("[data-test=monitor-absent]")).toBeNull(); mon.done();
  });
  test("before the notice the 'I will do it myself' button is off, and the reason is written out", async () => {
    const w = await worldOf("setup"); const pg = await open(w.h, "/desk/", { session: session(w, "organizer") }); await load(pg, "desk.js"); await go(pg, "Team");
    expect(pg.q("[data-test=takeover-go]").hasAttribute("disabled")).toBe(true); expect(clean(pg.q("[data-test=absent-why]").textContent ?? "")).toContain("Check-in opens once the notice is published."); pg.done();
  });
  test("Replace the Monitor: the form needs a reason, a name and an e-mail; then the old Monitor loses the role and the new one is on the team", async () => {
    const w = await worldOf("live"); const pg = await open(w.h, "/desk/", { session: session(w, "organizer") }); errors.length = 0; await load(pg, "desk.js"); await go(pg, "Team");
    pg.q("[data-test=replace-open]").click(); await wait(40); expect(pg.q("[data-test=replace-form]")).toBeNull(); expect(clean(pg.q("[data-test=absent-result]").textContent ?? "")).toContain("Please say why");
    pg.q("[data-test=absent-reason]").value = "Moved away on short notice"; pg.q("[data-test=replace-open]").click(); await wait(40);
    expect(pg.q("[data-test=replace-form]")).toBeTruthy(); pg.q("[data-test=replace-go]").click(); await wait(40); expect(clean(pg.q("[data-test=replace-form]").textContent ?? "")).toContain("Please type the new person's name and a correct e-mail.");
    pg.q("[data-test=replace-name]").value = "Kiran Mehta"; pg.q("[data-test=replace-email]").value = "kiran.mehta@example.org";
    pg.q("[data-test=replace-go]").click(); await wait(100); await after(pg);
    const m = await modelOf(w); const mons = m.people.filter((p: any) => p.roles.includes("attendance_officer"));
    expect(mons.length).toBe(1); expect(mons[0].pid).not.toBe(w.pids.monitor); const old = m.people.find((p: any) => p.pid === w.pids.monitor); expect(old ? old.roles : []).not.toContain("attendance_officer"); // a person left with no role is no longer listed
    expect(m.chronology.some((c: any) => c.what === "Removed a Attendance Monitor: Replaced: Moved away on short notice")).toBe(true);
    expect(pg.consoleErrors).toEqual([]); expect(errors).toEqual([]); pg.done();
  });
});

describe("withdraw an agenda point after the notice (Setup, step 4)", () => {
  test("the dialog says the point is kept, requires a reason, and sends it; before the notice it is a plain remove", async () => {
    const w = await worldOf("published"); const pg = await open(w.h, "/desk/", { session: session(w, "organizer") }); await load(pg, "desk.js");
    const items: any = await import(join(PUB, "assets", "desk-items.js") + "?s=" + (++counter));
    for (const [status, word] of [["agenda_published", "Withdrawn"], ["setup", "leaves the agenda"]] as const) {
      const calls: Array<[string, any]> = []; const ctx = { model: { status }, call: { post: async (p: string, b: any) => { calls.push([p, b]); return { ok: true }; } }, refresh: async () => {} };
      const done = items.removePointDialog(ctx, { pointId: "pt_x", number: "2", title: "Parking" }); await wait(30);
      expect(clean(pg.q("[data-test=point-remove-text]").textContent ?? ""), status).toContain(word);
      expect(pg.q("[data-test=point-remove-yes]").textContent).toContain(status === "setup" ? "Yes, remove it" : "Yes, withdraw it");
      pg.q("[data-test=point-remove-yes]").click(); await wait(60);
      if (status === "setup") { await done; expect(calls).toEqual([["/points/pt_x/remove", { reason: "" }]]); continue; } // a plain remove needs no reason
      expect(calls.length).toBe(0); expect(pg.text()).toContain("Please say why");
      pg.q("[data-test=point-remove-reason]").value = "Dealt with at the last meeting"; pg.q("[data-test=point-remove-yes]").click(); expect(await done).toBe(true);
      expect(calls).toEqual([["/points/pt_x/remove", { reason: "Dealt with at the last meeting" }]]);
    }
    pg.done();
  });
  test("the withdrawn points are listed (with reason and time) only when there are some", async () => {
    const w = await worldOf("published"); const pg = await open(w.h, "/desk/", { session: session(w, "organizer") }); await load(pg, "desk.js");
    const items: any = await import(join(PUB, "assets", "desk-items.js") + "?s=" + (++counter));
    expect(items.withdrawnCard({ model: { withdrawn: [] } })).toBeNull();
    const card = items.withdrawnCard({ model: { timezone: "Asia/Kolkata", withdrawn: [{ number: "2", title: "Parking", reason: "Dealt with at the last meeting", ts: Date.UTC(2026, 10, 3, 9, 0) }] } });
    const text = clean(card.textContent ?? ""); expect(text).toContain("Withdrawn"); expect(text).toContain("Parking"); expect(text).toContain("Dealt with at the last meeting"); expect(text).not.toMatch(BAD_TEXT); pg.done();
  });
});

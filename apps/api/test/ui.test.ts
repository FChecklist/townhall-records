// GENERATED UI GRID in a fake browser (happy-dom) wired to the REAL handler and migrations: every page module runs exactly as shipped, against a real event in each state.
// Cases are generated from tables: page x state x role x language (and every desk tab for every role/state). Nothing hand-written per case.
// Checks per case: no console errors / unhandled rejections, the expected tabs for the role, no "being finished" placeholder (a module that is missing or crashed), no "undefined"/"NaN"/"[object" in the text,
// no error box on a healthy path, and on public pages no private value (names, e-mails, phone numbers) anywhere.
// Run: bun test --isolate --timeout 300000 apps/api/test/ui.test.ts   (about 200 MB)
import { afterAll, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
import { handle } from "../src/handler";
import { H, HOSTP, ORG, OFFP, PRIVATE } from "./harness";
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

// ---- the world: one event per state, built once (cheap) and reused by many cases
const H0 = await H.make();
const worlds = new Map<State, Awaited<ReturnType<typeof build>>>();
for (const st of ["setup", "published", "live", "closed"] as State[]) worlds.set(st, await build(await H.make(), st, "meeting", true));
const hw = (st: State) => worlds.get(st)!.h;
const TITLE = "Annual General Meeting 2026";
void H0; void HOSTP; void OFFP;

const stats = { cases: 0 };
afterAll(() => { console.log(`ui grid: ${stats.cases} generated cases`); });

describe("static and public pages: every state x page x language x viewport", () => {
  const STATIC: Array<[string, string, RegExp]> = [["/", "home.js", /Proof in every vote|Order in every meeting/], ["/start/", "start.js", /What do you want to run/], ["/verify/", "verify.js", /Verify a report/], ["/privacy/", "privacy.js", /Privacy/], ["/help/", "help.js", /Help and guides/], ["/new/", "new.js", /What's new/], ["/terms/", "terms.js", /Terms/], ["/owner/", "owner.js", /Owner console|Console/]];
  for (const lang of ["en", "hi"]) for (const mobile of [false, true]) for (const [path, mod, re] of STATIC) {
    test(`static ${path} lang=${lang} ${mobile ? "phone" : "laptop"}`, async () => {
      stats.cases++; const pg = await open(H0, path, { lang, mobile }); errors.length = 0;
      await load(pg, mod); const text = pg.text();
      if (lang === "en") expect(text).toMatch(re);
      expect(text).not.toMatch(BAD_TEXT); expect(pg.consoleErrors).toEqual([]); expect(errors).toEqual([]);
      expect(pg.qa("a[href='/privacy/'], footer a").length).toBeGreaterThan(0);
      if (lang === "hi") expect(/[ऀ-ॿ]/.test(text)).toBe(true);
      pg.done();
    });
  }
  for (const st of ["setup", "published", "live", "closed"] as State[]) for (const lang of ["en", "hi"]) for (const [route, mod] of [["e", "event.js"], ["hall", "hall.js"]] as const) {
    test(`public /${route}/ state=${st} lang=${lang}`, async () => {
      stats.cases++; const w = worlds.get(st)!; const pg = await open(hw(st), `/${route}/${w.ctx.eid}`, { lang, mobile: lang === "hi" }); errors.length = 0;
      await load(pg, mod); const text = pg.text();
      expect(text).toContain(TITLE === "" ? "" : "Annual General Meeting");
      expect(text).not.toMatch(BAD_TEXT); expect(pg.consoleErrors).toEqual([]); expect(errors).toEqual([]);
      for (const v of PRIVATE) expect(text).not.toContain(v);
      for (const v of ["owner1@example.org", "9876543210", "Owner Number"]) expect(text).not.toContain(v);
      if (route === "e") expect(pg.qa(".stages").length).toBeGreaterThan(0);
      pg.done();
    });
  }
  for (const st of ["live", "closed"] as State[]) test(`verify page checks a ${st} event by code`, async () => {
    stats.cases++; const w = worlds.get(st)!; const pg = await open(hw(st), `/verify/?e=${w.ctx.eid}`); errors.length = 0; await import(join(PUB, "assets", "verifier.js")); await load(pg, "verify.js");
    for (let i = 0; i < 40 && !/intact|does not match|Something does not match/i.test(pg.text()); i++) await wait(50);
    if (st === "closed") expect(pg.text()).toMatch(/The record is intact/); else { const tx = pg.q("main")?.textContent ?? ""; { const mm = BAD_TEXT.exec(tx); if (mm) console.log("BADCTX:" + tx.slice(Math.max(0, mm.index - 120), mm.index + 60)); } }
    expect(pg.text()).not.toMatch(BAD_TEXT); expect(pg.consoleErrors).toEqual([]); pg.done();
  });
});

describe("Team Desk: every state x role x tab", () => {
  const TABS: Record<string, string[]> = { organizer: ["Setup", "Voting day", "Team", "End or move", "Record"], host: ["Setup", "Voting day", "Team", "End or move", "Record"], monitor: ["Check-in", "Record"] };
  const DEFAULT_TAB = (st: State, role: string) => role === "monitor" ? "Check-in" : st === "setup" ? "Setup" : st === "closed" ? "Record" : "Voting day";
  for (const st of ["setup", "published", "live", "closed"] as State[]) for (const role of ["organizer", "host", "monitor"] as const) {
    test(`desk state=${st} role=${role}: tabs, default tab, every tab renders`, async () => {
      const w = worlds.get(st)!; const roles = role === "monitor" ? ["attendance_officer"] : [role];
      const pg = await open(hw(st), "/desk/", { session: { desk: { eid: w.ctx.eid, pid: w.pids[role], token: w.tokens[role], roles } } }); errors.length = 0;
      await load(pg, "desk.js"); stats.cases++;
      expect(pg.text()).toContain(TITLE);
      const tabs = pg.qa("[data-test=tabs] button").map((b) => (b.textContent ?? "").trim()); expect(tabs).toEqual(TABS[role]);
      const cur = pg.q("[data-test=tabs] button.on"); expect((cur?.textContent ?? "").trim()).toBe(DEFAULT_TAB(st, role));
      for (const label of TABS[role]!) {
        stats.cases++; const b = pg.qa("[data-test=tabs] button").find((x) => (x.textContent ?? "").trim() === label); b.click(); await pg.settle(); await wait(60); await pg.settle();
        const body = (pg.q("[data-test=tab-body]") ?? pg.q("main"))!; const text = body.textContent ?? "";
        expect(text.length).toBeGreaterThan(40);
        expect(text, `${st}/${role}/${label}`).not.toMatch(/being finished/i); expect(text, `${st}/${role}/${label}`).not.toMatch(BAD_TEXT);
        const bad = pg.qa(".msg.bad").map((x) => x.textContent); expect(bad, `${st}/${role}/${label}`).toEqual([]);
      }
      expect(pg.consoleErrors).toEqual([]); expect(errors).toEqual([]); pg.done();
    });
  }
  test("wrong-event or expired sign-in goes back to the sign-in screen with a plain message", async () => {
    stats.cases++; const w = worlds.get("live")!; const pg = await open(hw("live"), "/desk/", { session: { desk: { eid: w.ctx.eid, pid: w.pids.organizer, token: "0".repeat(64), roles: ["organizer"] } } }); await load(pg, "desk.js");
    expect(pg.text()).toMatch(/Sign in|sign in/); expect(pg.qa("[data-test=tabs] button").length).toBe(0); pg.done();
  });
});

describe("Voter page: states and sessions", () => {
  test("live: a signed-in voter sees the open question as the only decision on screen", async () => {
    stats.cases++; const w = worlds.get("live")!; const pg = await open(hw("live"), `/v/${w.ctx.eid}`, { mobile: true, session: { voter: { tok: w.tokens.voter, eid: w.ctx.eid, flat: "A-101" } } }); errors.length = 0; await load(pg, "voter.js");
    expect(pg.text()).toMatch(/QUESTION 1 OF 1/i); expect(pg.qa("input[type=radio], input[type=checkbox]").length).toBeGreaterThan(1); expect(pg.consoleErrors).toEqual([]); pg.done();
  });
  for (const st of ["setup", "published", "live", "closed"] as State[]) test(`no session, state=${st}: the sign-in screen asks for flat and code, nothing else`, async () => {
    stats.cases++; const w = worlds.get(st)!; const pg = await open(hw(st), `/v/${w.ctx.eid}`, { mobile: true }); errors.length = 0; await load(pg, "voter.js");
    if (st === "closed") { expect(pg.text()).toMatch(/closed|over|finished|ended|result|record/i); expect(pg.qa("a[href^='/e/'], button").length).toBeGreaterThan(0); }
    else { expect(pg.text()).toMatch(/flat number/i); expect(pg.qa("input").length).toBeGreaterThanOrEqual(2); } expect(pg.consoleErrors).toEqual([]); expect(pg.text()).not.toMatch(BAD_TEXT); pg.done();
  });
  test("a bad session shows the plain how-to-fix box, not a blank page", async () => {
    stats.cases++; const w = worlds.get("live")!; const pg = await open(hw("live"), `/v/${w.ctx.eid}`, { mobile: true, session: { voter: { tok: "f".repeat(64), eid: w.ctx.eid, flat: "A-101" } } }); await load(pg, "voter.js");
    expect(pg.text().length).toBeGreaterThan(100); expect(pg.text()).not.toMatch(BAD_TEXT); pg.done();
  });
});
void ORG;

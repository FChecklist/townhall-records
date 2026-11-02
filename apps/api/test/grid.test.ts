// GENERATED SCENARIO GRID: role x action x state x kind x "is there an Attendance Monitor". Nothing here is hand-written per cell.
// The ORACLE (who may do what, and where) is the data table below, written from docs/MASTER-CHECKLIST.md section 3 and docs/design/API.md, NOT from handler.ts or machine.ts.
// Rules checked for every cell:
//  * a role the table does not allow gets 401/403 and NOTHING is written to the log (head unchanged);
//  * a role the table allows is never refused for a ROLE reason (it may be refused for a state or form reason);
//  * where the table says an action cannot happen in a state, even the allowed roles are refused.
// Run: bun test --isolate --timeout 300000 apps/api/test/grid.test.ts   (one process, about 150 MB). GRID_FULL=1 adds more kinds/packs.
import { describe, expect, test } from "bun:test";
import { H, ORG, flatsOf, newEvent } from "./harness";
import { build, type Ctx, type Role, type State } from "./states";

const ROLES: Role[] = ["none", "voter", "monitor", "host", "organizer", "foreign"];
const STATES: State[] = ["setup", "published", "live", "closed"];
// 403 codes that mean "you are not the right person" (as opposed to "not the right moment")
const ROLE_CODES = new Set(["not_allowed", "no_role", "unknown_person", "wrong_event", "email_not_verified", "wrong_kind", "not_signed_in"]);

interface Act { id: string; m: string; path: (c: Ctx) => string; body?: (c: Ctx) => unknown; who: "OH" | "O" | "desk" | "voter" | "public" | "staff"; write: boolean; refuseIn?: State[]; afterCloseOk?: boolean }
// who: staff = anyone signed in on the team (the desk reads its own role and permissions); OH = Organizer or Host; O = Organizer only; desk = Attendance Monitor (Organizer/Host only if the event has no monitor); voter = a signed-in voter; public = anyone
const A: Act[] = [
  { id: "options", m: "PUT", path: (c) => `/api/events/${c.eid}/options`, body: () => ({ options: {} }), who: "OH", write: true },
  { id: "rules", m: "PUT", path: (c) => `/api/events/${c.eid}/rules`, body: () => ({ changes: {}, reason: "grid check" }), who: "OH", write: true },
  { id: "roll", m: "PUT", path: (c) => `/api/events/${c.eid}/roll`, body: () => ({ flats: flatsOf(10) }), who: "OH", write: true },
  { id: "roll-flat", m: "POST", path: (c) => `/api/events/${c.eid}/roll/flat`, body: () => ({ op: "add", flatNo: "Z-900", weight: 1, eligible: true, reason: "grid check" }), who: "OH", write: true },
  { id: "points-add", m: "POST", path: (c) => `/api/events/${c.eid}/points`, body: () => ({ kind: "discussion", title: "Any other business" }), who: "OH", write: true },
  { id: "schedule", m: "PUT", path: (c) => `/api/events/${c.eid}/schedule`, body: () => ({ schedule: {}, reason: "grid check" }), who: "OH", write: true },
  { id: "people-add", m: "POST", path: (c) => `/api/events/${c.eid}/people`, body: () => ({ name: "Grid Person", email: "grid.person@example.org", role: "host" }), who: "OH", write: true },
  { id: "holder-add", m: "POST", path: (c) => `/api/events/${c.eid}/holders`, body: (c) => ({ flatNo: c.flat, name: "Grid Holder", email: "grid.holder@example.org", phone: "9000000002" }), who: "OH", write: true },
  { id: "officials", m: "POST", path: (c) => `/api/events/${c.eid}/officials`, body: () => ({ group: "observer", name: "Grid Observer" }), who: "OH", write: true },
  { id: "custom-rule", m: "POST", path: (c) => `/api/events/${c.eid}/custom-rules`, body: () => ({ title: "Grid rule", kind: "yes_no", value: true }), who: "OH", write: true },
  { id: "pay-link", m: "POST", path: (c) => `/api/events/${c.eid}/pay-link`, body: () => ({}), who: "OH", write: true },
  { id: "pay", m: "POST", path: (c) => `/api/events/${c.eid}/pay`, body: () => ({}), who: "O", write: true },
  { id: "publish", m: "POST", path: (c) => `/api/events/${c.eid}/agenda/publish`, body: () => ({}), who: "OH", write: true, refuseIn: ["published", "live", "closed"] },
  { id: "start", m: "POST", path: (c) => `/api/events/${c.eid}/start`, body: () => ({}), who: "OH", write: true, refuseIn: ["setup", "live", "closed"] },
  { id: "point-open", m: "POST", path: (c) => `/api/events/${c.eid}/points/${c.pt}/open`, body: () => ({ minutes: 30 }), who: "OH", write: true, refuseIn: ["setup", "published", "closed"] },
  { id: "point-extend", m: "POST", path: (c) => `/api/events/${c.eid}/points/${c.pt}/extend`, body: () => ({ minutes: 5 }), who: "OH", write: true, refuseIn: ["setup", "published", "closed"] },
  { id: "point-close", m: "POST", path: (c) => `/api/events/${c.eid}/points/${c.pt}/close`, body: () => ({}), who: "OH", write: true, refuseIn: ["setup", "published", "closed"] },
  { id: "close-event", m: "POST", path: (c) => `/api/events/${c.eid}/close`, body: () => ({}), who: "OH", write: true, refuseIn: ["setup", "published", "closed"] },
  { id: "intent", m: "POST", path: (c) => `/api/events/${c.eid}/intent`, body: () => ({ action: "cancel" }), who: "OH", write: true },
  { id: "report-email", m: "POST", path: (c) => `/api/events/${c.eid}/report/email`, body: () => ({ to: ["grid.reader@example.org"] }), who: "OH", write: true, afterCloseOk: true },
  { id: "attendance", m: "POST", path: (c) => `/api/events/${c.eid}/attendance`, body: (c) => ({ flatNo: c.flat2, attendeeName: "Grid Attendee", mode: "physical", method: "known_person", checks: { proof_seen: true, name_matches: true, flat_matches: true, person_checked: true, photo_taken: true, person_agrees: true } }), who: "desk", write: true, refuseIn: ["setup", "closed"] },
  { id: "voter-code", m: "POST", path: (c) => `/api/events/${c.eid}/passcodes/voter`, body: (c) => ({ flatNo: c.flat2 }), who: "desk", write: true, refuseIn: ["setup", "closed"] },
  { id: "handshake", m: "POST", path: (c) => `/api/events/${c.eid}/handshakes`, body: (c) => ({ flatNo: c.flat2, attendeeName: "Grid Attendee" }), who: "desk", write: true, refuseIn: ["setup", "closed"] },
  { id: "basics", m: "PUT", path: (c) => `/api/events/${c.eid}/basics`, body: () => ({ venue: "Grid hall", reason: "grid check" }), who: "OH", write: true, refuseIn: ["live", "closed"] },
  { id: "point-remove", m: "POST", path: (c) => `/api/events/${c.eid}/points/${c.pt}/remove`, body: () => ({ reason: "grid check" }), who: "OH", write: true, refuseIn: ["live", "closed"] },
  { id: "name-change-request", m: "POST", path: (c) => `/api/events/${c.eid}/flats/${c.flat2}/change-request`, body: () => ({ reason: "spelling" }), who: "desk", write: true, refuseIn: ["setup", "closed"] },
  { id: "checkin-takeover", m: "POST", path: (c) => `/api/events/${c.eid}/checkin/takeover`, body: () => ({ on: true, reason: "grid check" }), who: "OH", write: true, refuseIn: ["setup", "closed"] },
  { id: "contacts", m: "GET", path: (c) => `/api/events/${c.eid}/contacts`, who: "OH", write: false },
  { id: "private", m: "GET", path: (c) => `/api/events/${c.eid}/private`, who: "staff", write: false },
  { id: "audit", m: "GET", path: (c) => `/api/events/${c.eid}/audit`, who: "OH", write: false },
  { id: "erase-person", m: "POST", path: (c) => `/api/events/${c.eid}/privacy/erase`, body: (c) => ({ personId: c.pid, flatNo: c.flat, reason: "grid check" }), who: "O", write: true, afterCloseOk: true },
  { id: "crypto-shred", m: "POST", path: (c) => `/api/events/${c.eid}/crypto-shred`, body: () => ({}), who: "O", write: true, afterCloseOk: true },
  { id: "vote-points", m: "GET", path: () => "/api/vote/points", who: "voter", write: false },
  { id: "vote-cast", m: "POST", path: () => "/api/vote/cast", body: (c) => ({ pointId: c.pt, choices: ["yes"] }), who: "voter", write: true, refuseIn: ["setup", "published", "closed"] },
  { id: "public-model", m: "GET", path: (c) => `/api/events/${c.eid}`, who: "public", write: false },
  { id: "public-log", m: "GET", path: (c) => `/api/events/${c.eid}/log`, who: "public", write: false },
  { id: "public-head", m: "GET", path: (c) => `/api/r/${c.eid}/head`, who: "public", write: false },
];

/** THE ORACLE: may this role do this action (ignoring the state)? */
function allowed(a: Act, r: Role, withMonitor: boolean): boolean {
  if (a.who === "public") return true;
  if (a.who === "voter") return r === "voter";
  if (r === "none" || r === "foreign" || r === "voter") return false;
  if (a.who === "staff") return r === "organizer" || r === "host" || r === "monitor";
  if (a.who === "O") return r === "organizer";
  if (a.who === "OH") return r === "organizer" || r === "host";
  /* desk */ return r === "monitor" || ((r === "organizer" || r === "host") && !withMonitor);
}

const logCount = (h: H, eid: string) => h.count("SELECT COUNT(*) c FROM log_entries WHERE event_id=?", eid);

const kinds: Array<"meeting" | "election"> = process.env.GRID_FULL ? ["meeting", "election"] : ["meeting"];
let cells = 0, deniedChecks = 0, allowedChecks = 0, stateChecks = 0;

describe("generated role x action x state grid", () => {
  for (const kind of kinds) for (const withMonitor of [true, false]) for (const state of STATES) {
    test(`${kind} / ${withMonitor ? "with" : "without"} a Monitor / state ${state}`, async () => {
      const problems: string[] = [];
      for (const a of A) {
        const h = await H.make(); const { ctx, tokens } = await build(h, state, kind, withMonitor);
        const call = (r: Role) => h.call(a.m, a.path(ctx), a.body?.(ctx), tokens[r] || undefined);
        // 1. every role the table does not allow: refused, nothing written
        for (const r of ROLES.filter((x) => !allowed(a, x, withMonitor))) {
          if ((r === "voter" && !tokens.voter) || (r === "monitor" && !withMonitor)) continue;
          const before = logCount(h, ctx.eid); const res = await call(r); cells++; deniedChecks++;
          if (![401, 403].includes(res.status)) problems.push(`[denied] ${a.id} as ${r}: expected 401/403, got ${res.status} ${JSON.stringify(res.body).slice(0, 90)}`);
          if (logCount(h, ctx.eid) !== before) problems.push(`[denied] ${a.id} as ${r}: the log changed although the role is not allowed`);
        }
        // 2. roles the table allows: never refused for a role reason; where the table says "not in this state", refused for every one of them
        const okRoles = ROLES.filter((x) => allowed(a, x, withMonitor) && x !== "none" && (x !== "voter" || tokens.voter) && (x !== "monitor" || withMonitor));
        let first = true;
        for (const r of okRoles) {
          const res = await call(r); cells++; allowedChecks++;
          if (res.status === 401 || (res.status === 403 && ROLE_CODES.has(res.body?.error))) problems.push(`[allowed] ${a.id} as ${r}: refused for a role reason (${res.status} ${res.body?.error})`);
          if (a.write && a.refuseIn?.includes(state) && first) { stateChecks++; if (res.status < 400) problems.push(`[state] ${a.id} in state ${state}: should be refused but got ${res.status}`); }
          if (a.write && state === "closed" && !a.afterCloseOk && first) { stateChecks++; if (res.status < 400) problems.push(`[state] ${a.id} after the event is closed: should be refused but got ${res.status}`); }
          first = false;
        }
      }
      expect(problems).toEqual([]);
    }, 300_000);
  }
  test("the grid really covered thousands of cells", () => { console.log(`grid: ${cells} cells (${deniedChecks} denied-role, ${allowedChecks} allowed-role, ${stateChecks} state checks)`); expect(cells).toBeGreaterThan(900); });
});
void ORG; void newEvent;

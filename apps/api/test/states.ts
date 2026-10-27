// Shared scenario builder: drives a real event (real handler, real migrations on SQLite) to a given state and returns every role's token. Used by the permission grid and the UI grid.
import { DAY, H, HOSTP, OFFP, setup } from "./harness";
import { appointVerified } from "./harness";

export type Role = "none" | "voter" | "monitor" | "host" | "organizer" | "foreign";
export type State = "setup" | "published" | "live" | "closed";
export interface Ctx { eid: string; pt: string; flat: string; flat2: string; pid: string }

export const ok = async (p: Promise<any>) => { const r = await p; if (r.status >= 300) throw new Error(JSON.stringify(r.body)); return r; };
export const advance = (h: H, ms: number) => { h.now += ms; h.raw.query("UPDATE sessions SET expires_ms = ?").run(h.now + DAY); };

export async function build(h: H, state: State, kind: "meeting" | "election", withMonitor: boolean) {
  const e = await setup(h, { flats: 10, kind }); const host = await appointVerified(h, e, HOSTP, "host");
  const mon = withMonitor ? await appointVerified(h, e, OFFP, "attendance_officer") : null;
  const tokens: Record<Role, string> = { none: "", voter: "", monitor: mon?.token ?? "", host: host.token, organizer: e.org, foreign: "" };
  const ctx: Ctx = { eid: e.eid, pt: e.pointId, flat: "A-101", flat2: "A-110", pid: host.pid };
  const pids = { organizer: e.pid, host: host.pid, monitor: mon?.pid ?? "" };
  if (state !== "setup") await ok(h.call("POST", `/api/events/${e.eid}/agenda/publish`, {}, e.org));
  if (state === "live" || state === "closed") {
    advance(h, 11 * DAY); await ok(h.call("POST", `/api/events/${e.eid}/start`, {}, e.org));
    const desk = mon?.token ?? e.org; const checks = { proof_seen: true, name_matches: true, flat_matches: true, person_checked: true, photo_taken: true, person_agrees: true };
    for (let i = 1; i <= 9; i++) await ok(h.call("POST", `/api/events/${e.eid}/attendance`, { flatNo: `A-10${i}`, attendeeName: "Owner", mode: "physical", method: "known_person", checks }, desk));
    await ok(h.call("POST", `/api/events/${e.eid}/points/${e.pointId}/open`, { minutes: 30 }, e.org));
    const c = await ok(h.call("POST", `/api/events/${e.eid}/passcodes/voter`, { flatNo: "A-101" }, desk));
    const l = await ok(h.call("POST", "/api/vote/login", { eventId: e.eid, flatNo: "A-101", code: c.body.code, turnstile: "test-ok" })); tokens.voter = l.body.token;
  }
  if (state === "closed") { await ok(h.call("POST", `/api/events/${e.eid}/points/${e.pointId}/close`, {}, e.org)); await ok(h.call("POST", `/api/events/${e.eid}/close`, {}, e.org)); }
  // a second event whose Organizer is a "foreign" role here
  const other = await h.call("POST", "/api/events", { kind: "meeting", eventType: "agm", title: "Another society", venue: "Hall", scheduledMs: h.now + 10 * DAY, packId: "in-up-aoa", country: "IN", useRecommended: true, society: { name: "Blue Park", address: "1 Road", registrationNo: "R/1", kind: "AOA" }, organizer: { name: "Other Organizer", email: "other.org@example.org", phone: "9000000009" }, turnstile: "test-ok" });
  const ov = await h.call("POST", "/api/auth/verify", { eventId: other.body.eventId, personId: other.body.personId, code: h.codeFor("other.org@example.org") }); tokens.foreign = ov.body.token;
  return { ctx, tokens, pids, h };
}

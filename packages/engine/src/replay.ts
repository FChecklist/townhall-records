// Replays a verified log into the event state. EVERYTHING public (report, live page, progress, results) is a pure function of this state.
// Replay also re-checks the semantics (one vote per flat, no vote after close, frozen rules, results match) and records every violation in `problems`.
import { canonical, type Json } from "./canonical";
import { sha256Hex } from "./crypto";
import type { SignedEntry } from "./log";
import { effectiveForPoint, type RuleSet } from "./rules";
import { defaultSchedule, validateSchedule, type Schedule } from "./schedule";
import { aggregate, computeQuorum, effectiveWeight, tallyAgg, type Aggregate, type Flat, type PointDef, type PointTally, type QuorumResult } from "./tally";

export type EventStatus = "setup" | "agenda_published" | "live" | "closed" | "suspended";
export type Role = "organizer" | "host" | "attendance_officer";

export interface PersonState { pid: string; maskedName: string; maskedEmail: string; flatNo: string | null; verified: boolean; roles: Role[]; label: string | null; appointedBy: Partial<Record<Role, string | null>>; appointedSeq: Partial<Record<Role, number>> }
export interface PointFull extends PointDef { number: string; title: string; body: string; rev: number }
export interface PointRun {
  def: PointFull; state: "pending" | "open" | "closed"; endsMs: number | null; extensions: number; openedSeq: number | null; closedSeq: number | null;
  frozen: RuleSet | null; presentWeightAtClose: number | null; totalWeightAtClose: number | null; quorumAtOpen: QuorumResult | null;
}
export interface Presence { flatNo: string; maskedName: string; mode: string; method: string; docType: string | null; docLast4: string | null; by: string; independent: boolean; evidenceHash: string | null; seq: number; ts: number }
export interface Seal { n: number; receipts: string[]; counts: Record<string, { weight: number; count: number }>; castWeight: number; digest: string; split: Aggregate["split"] }
export interface RuleChange { seq: number; ts: number; scope: string; param: string; old: Json | null; new: Json | null; reason: string; by: string | null }

export interface EventState {
  eid: string; seqCount: number; head: { seq: number; hash: string } | null; firstTs: number | null; lastTs: number | null;
  created: null | { kind: "meeting" | "election"; eventType: string; title: string; venue: string; scheduledMs: number; schedule: Schedule; packId: string; timezone: string; society: { name: string; address: string; registrationNo: string; kind: string }; createdFrom: string | null };
  rules: RuleSet | null; initialRules: RuleSet | null; ruleHistory: RuleChange[]; rejectedChanges: RuleChange[];
  status: EventStatus; paid: boolean; payments: Array<{ paymentId: string; state: string; amountMinor: number; mode: string; seq: number }>;
  people: Map<string, PersonState>; roleLog: Array<{ seq: number; ts: number; action: "appoint" | "remove"; pid: string; role: Role; by: string | null }>;
  roll: Flat[]; rollRev: number;
  points: Map<string, PointRun>; pointOrder: string[];
  attendance: Map<string, Presence>; attendanceLog: Presence[];
  ledger: Map<string, Map<string, { kind: "official" | "proxy"; choices: string[] | null; seq: number }>>;
  seals: Map<string, Seal>; results: Map<string, PointTally>;
  agenda: null | { seq: number; ts: number; givenDays: number; minDays: number | null; maxDays: number | null; met: boolean | null };
  startedTs: number | null; closedInfo: null | { seq: number; ts: number };
  clones: Array<{ direction: string; eventId: string }>; platformActions: Array<{ seq: number; action: string; reason: string }>;
  contactsReads: number; anchors: Array<{ headSeq: number; headHash: string }>;
  scheduleChanges: Array<{ seq: number; ts: number; reason: string }>;
  problems: string[];
}

const rs0 = (): RuleSet => ({ packId: "", params: {}, options: {}, locked: {} });
export function emptyState(eid: string): EventState {
  return {
    eid, seqCount: 0, head: null, firstTs: null, lastTs: null, created: null, rules: null, initialRules: null, ruleHistory: [], rejectedChanges: [], status: "setup", paid: false, payments: [],
    people: new Map(), roleLog: [], roll: [], rollRev: 0, points: new Map(), pointOrder: [], attendance: new Map(), attendanceLog: [], ledger: new Map(),
    seals: new Map(), results: new Map(), agenda: null, startedTs: null, closedInfo: null, clones: [], platformActions: [], contactsReads: 0, anchors: [], scheduleChanges: [], problems: [],
  };
}

const copyRules = (r: RuleSet): RuleSet => ({ packId: r.packId, params: { ...r.params }, options: { ...r.options }, locked: { ...r.locked } });
export const presentFlatNos = (s: EventState): string[] => [...s.attendance.values()].map((p) => p.flatNo);
export const weightedOn = (rs: RuleSet | null) => !!rs?.options.weightage;
const flatWeight = (s: EventState, rs: RuleSet, flatNo: string): number => { const f = s.roll.find((x) => x.flatNo === flatNo); return f ? effectiveWeight(f, weightedOn(rs)) : 0; };
export function weightsNow(s: EventState, rs: RuleSet): { present: number; total: number } {
  const w = weightedOn(rs); const vf = s.roll.filter((f) => f.eligible); const here = new Set(presentFlatNos(s));
  return { total: vf.reduce((a, f) => a + effectiveWeight(f, w), 0), present: vf.filter((f) => here.has(f.flatNo)).reduce((a, f) => a + effectiveWeight(f, w), 0) };
}

export function aggregateFor(s: EventState, pr: PointRun): Aggregate {
  const rules = pr.frozen ?? s.rules ?? rs0();
  const seal = s.seals.get(pr.def.pointId);
  if (pr.def.secret) {
    if (!seal) return { n: 0, castWeight: 0, perOption: Object.fromEntries(pr.def.options.map((o) => [o, { weight: 0, count: 0 }])), split: null };
    return { n: seal.n, castWeight: seal.castWeight, perOption: seal.counts, split: seal.split };
  }
  const led = s.ledger.get(pr.def.pointId) ?? new Map();
  const rows = [...led.entries()].map(([flatNo, v]) => ({ choices: v.choices ?? [], weight: flatWeight(s, rules, flatNo), kind: v.kind }));
  return aggregate(pr.def, rows, rules);
}
export function tallyFor(s: EventState, pr: PointRun): PointTally {
  const rules = pr.frozen ?? s.rules ?? rs0();
  const present = pr.presentWeightAtClose ?? weightsNow(s, rules).present;
  const total = pr.totalWeightAtClose ?? weightsNow(s, rules).total;
  return tallyAgg(pr.def, aggregateFor(s, pr), rules, present, total);
}

export async function rulesDigest(rs: RuleSet, p: { majorityClass: string; secret: boolean; maxChoices: number }): Promise<string> {
  return sha256Hex(canonical(effectiveForPoint(rs, p)));
}

const asStr = (v: unknown) => (typeof v === "string" ? v : "");
export async function replayLog(entries: SignedEntry[]): Promise<EventState> {
  const s = emptyState(entries[0]?.entry.eid ?? "");
  const bad = (seq: number, m: string) => s.problems.push(`#${seq}: ${m}`);
  for (const se of entries) {
    const e = se.entry, p = e.payload as any, seq = e.seq;
    s.seqCount = seq; s.head = { seq, hash: se.hash }; s.firstTs ??= e.ts; s.lastTs = e.ts;
    const actorPid = "pid" in e.actor ? e.actor.pid : null;
    switch (e.type) {
      case "event_created": s.created = { kind: p.kind, eventType: p.eventType, title: p.title, venue: p.venue, scheduledMs: p.scheduledMs, schedule: p.schedule ?? defaultSchedule(p.scheduledMs, p.venue), packId: p.packId, timezone: p.timezone ?? "UTC", society: p.society, createdFrom: p.createdFrom ?? null }; break;
      case "schedule_set": {
        if (!s.created) { bad(seq, "schedule set before the event existed"); break; }
        if (s.status === "live" || s.status === "closed") bad(seq, "schedule changed after the event started");
        const why = validateSchedule(p.schedule); if (why) bad(seq, "invalid schedule: " + why);
        s.created.schedule = p.schedule; s.created.scheduledMs = p.schedule.start.atMs; s.scheduleChanges.push({ seq, ts: e.ts, reason: asStr(p.reason) }); break;
      }
      case "rules_initialized": s.rules = { packId: p.packId, params: { ...p.params }, options: { ...p.options }, locked: { ...p.locked } }; s.initialRules = copyRules(s.rules); break;
      case "role_appointed": {
        const role = p.role as Role;
        const ex = s.people.get(p.pid) ?? { pid: p.pid, maskedName: p.maskedName ?? "", maskedEmail: p.maskedEmail ?? "", flatNo: p.flatNo ?? null, verified: false, roles: [], label: null, appointedBy: {}, appointedSeq: {} };
        if (!ex.roles.includes(role)) ex.roles.push(role);
        ex.appointedBy[role] = p.appointedBy ?? null; ex.appointedSeq[role] = seq;
        if (p.maskedName) ex.maskedName = p.maskedName;
        if (p.maskedEmail) ex.maskedEmail = p.maskedEmail;
        s.people.set(p.pid, ex); s.roleLog.push({ seq, ts: e.ts, action: "appoint", pid: p.pid, role, by: p.appointedBy ?? null }); break;
      }
      case "role_removed": { const pr = s.people.get(p.pid); if (pr) pr.roles = pr.roles.filter((r) => r !== p.role); s.roleLog.push({ seq, ts: e.ts, action: "remove", pid: p.pid, role: p.role, by: p.removedBy ?? null }); break; }
      case "email_verified": { const pr = s.people.get(p.pid); if (pr) pr.verified = true; else bad(seq, "email_verified for unknown person"); break; }
      case "label_set": { const pr = s.people.get(p.pid); if (pr) pr.label = asStr(p.label) || null; break; }
      case "options_set": if (s.rules) for (const [k, v] of Object.entries(p.options as Record<string, boolean>)) { const l = s.rules.locked[k]; if (l && l.value !== v) bad(seq, `locked option ${k} changed`); s.rules.options[k] = v; } break;
      case "rule_changed": {
        const ch: RuleChange = { seq, ts: e.ts, scope: p.scope, param: p.param, old: p.old ?? null, new: p.new ?? null, reason: asStr(p.reason), by: actorPid };
        if (p.scope !== "event") { const pt = s.points.get(p.scope); if (!pt) bad(seq, "rule change for unknown point"); else if (pt.state !== "pending") bad(seq, `rule changed after point ${pt.def.number} opened`); }
        if (s.rules) s.rules.params[p.param] = p.new ?? null;
        s.ruleHistory.push(ch); break;
      }
      case "rule_change_rejected": s.rejectedChanges.push({ seq, ts: e.ts, scope: p.scope, param: p.param, old: null, new: null, reason: asStr(p.reason), by: actorPid }); break;
      case "roll_set": {
        if (s.status === "live" || [...s.points.values()].some((x) => x.state !== "pending")) bad(seq, "roll changed after voting started");
        s.roll = (p.flats as Flat[]).map((f) => ({ flatNo: f.flatNo, weight: f.weight, eligible: f.eligible })); s.rollRev = p.rev; break;
      }
      case "point_added": case "point_amended": {
        const def: PointFull = { pointId: p.pointId, number: p.number, title: p.title, body: p.body, kind: p.kind, options: p.options, maxChoices: p.maxChoices, majorityClass: p.majorityClass, secret: !!p.secret, rev: p.rev };
        const ex = s.points.get(p.pointId);
        if (ex && ex.state !== "pending") bad(seq, `point ${ex.def.number} amended after it opened`);
        if (ex) ex.def = def; else { s.points.set(p.pointId, { def, state: "pending", endsMs: null, extensions: 0, openedSeq: null, closedSeq: null, frozen: null, presentWeightAtClose: null, totalWeightAtClose: null, quorumAtOpen: null }); s.pointOrder.push(p.pointId); }
        break;
      }
      case "agenda_published": s.status = "agenda_published"; s.agenda = { seq, ts: e.ts, givenDays: p.givenDays, minDays: p.minDays ?? null, maxDays: p.maxDays ?? null, met: p.met ?? null }; break;
      case "payment_state": s.payments.push({ paymentId: p.paymentId, state: p.state, amountMinor: p.amountMinor, mode: p.mode, seq }); if (p.state === "paid") s.paid = true; break;
      case "attendance_marked": {
        const pr: Presence = { flatNo: p.flatNo, maskedName: p.maskedName ?? "", mode: p.mode, method: p.method, docType: p.docType ?? null, docLast4: p.docLast4 ?? null, by: p.by, independent: !!p.independent, evidenceHash: p.evidenceHash ?? null, seq, ts: e.ts };
        s.attendanceLog.push(pr);
        if (p.present === false) s.attendance.delete(p.flatNo); else s.attendance.set(p.flatNo, pr);
        break;
      }
      case "event_started": s.status = "live"; s.startedTs = e.ts; break;
      case "point_opened": {
        const pt = s.points.get(p.pointId); if (!pt) { bad(seq, "opened unknown point"); break; }
        if (s.status !== "live") bad(seq, "point opened while event not live");
        if (pt.state !== "pending") bad(seq, "point opened twice");
        pt.state = "open"; pt.openedSeq = seq; pt.endsMs = p.endsMs; pt.frozen = copyRules(s.rules ?? rs0());
        const q = s.rules && s.rules.options.quorum_check ? computeQuorum(s.rules, s.roll, presentFlatNos(s)) : null; pt.quorumAtOpen = q;
        if (s.rules && p.rulesDigest !== (await rulesDigest(s.rules, pt.def))) bad(seq, "frozen rules digest mismatch");
        break;
      }
      case "point_extended": { const pt = s.points.get(p.pointId); if (pt && pt.state === "open") { pt.endsMs = p.endsMs; pt.extensions += 1; } else bad(seq, "extension of a point that is not open"); break; }
      case "point_closed": {
        const pt = s.points.get(p.pointId); if (!pt || pt.state !== "open") { bad(seq, "closed a point that was not open"); break; }
        pt.state = "closed"; pt.closedSeq = seq;
        const w = weightsNow(s, pt.frozen ?? s.rules ?? rs0()); pt.presentWeightAtClose = w.present; pt.totalWeightAtClose = w.total; break;
      }
      case "vote_recorded": case "vote_cast_open": {
        const pt = s.points.get(p.pointId); const open = e.type === "vote_cast_open";
        if (!pt) { bad(seq, "vote for unknown point"); break; }
        if (pt.state !== "open") bad(seq, `vote on point ${pt.def.number} while it was ${pt.state}`);
        if (!s.attendance.has(p.flatNo)) bad(seq, `flat ${p.flatNo} voted without being marked present`);
        if (open === pt.def.secret) bad(seq, `vote entry type does not match the secrecy of point ${pt.def.number}`);
        const led = s.ledger.get(p.pointId) ?? new Map(); s.ledger.set(p.pointId, led);
        if (led.has(p.flatNo)) bad(seq, `flat ${p.flatNo} voted twice on point ${pt.def.number}`);
        led.set(p.flatNo, { kind: p.kind, choices: open ? p.choices : null, seq });
        break;
      }
      case "ballot_box_sealed": {
        const pt = s.points.get(p.pointId); if (!pt || pt.state !== "closed") { bad(seq, "box sealed before the point closed"); break; }
        const led = s.ledger.get(p.pointId) ?? new Map();
        const rules = pt.frozen ?? s.rules ?? rs0();
        const wsum = [...led.keys()].reduce((a, f) => a + flatWeight(s, rules, f), 0);
        if (p.n !== led.size) bad(seq, `ballot box holds ${p.n} ballots but ${led.size} flats voted`);
        if (p.castWeight !== wsum) bad(seq, "ballot box weight does not match the flats that voted");
        if ((p.receipts as string[]).length !== p.n) bad(seq, "receipt list length does not match");
        s.seals.set(p.pointId, { n: p.n, receipts: p.receipts, counts: p.counts, castWeight: p.castWeight, digest: p.digest, split: p.split ?? null }); break;
      }
      case "result_computed": {
        const pt = s.points.get(p.pointId); if (!pt) { bad(seq, "result for unknown point"); break; }
        const calc = tallyFor(s, pt);
        if (canonical(calc as unknown as Json) !== canonical(p.tally)) bad(seq, `result of point ${pt.def.number} does not match the recomputed tally`);
        s.results.set(p.pointId, p.tally as PointTally); break;
      }
      case "event_closed": s.status = "closed"; s.closedInfo = { seq, ts: e.ts }; for (const pt of s.points.values()) if (pt.state === "open") bad(seq, "event closed with a point still open"); break;
      case "event_suspended": s.status = "suspended"; break;
      case "platform_action": s.platformActions.push({ seq, action: p.action, reason: asStr(p.reason) }); break;
      case "contacts_read": s.contactsReads += 1; break;
      case "clone_linked": s.clones.push({ direction: p.direction, eventId: p.eventId }); break;
      case "anchor": s.anchors.push({ headSeq: p.headSeq, headHash: p.headHash }); break;
      default: break; // passcode_*, notice_checked, quorum_checked: informational
    }
  }
  return s;
}

// ---- views derived from state ----
export function currentRoles(s: EventState): PersonState[] { return [...s.people.values()].filter((p) => p.roles.length); }
export const hasRole = (s: EventState, pid: string, role: Role) => !!s.people.get(pid)?.roles.includes(role);
export const officerCount = (s: EventState) => currentRoles(s).filter((p) => p.roles.includes("attendance_officer") && p.verified).length;
export const attendanceIndependent = (s: EventState) => officerCount(s) > 0 && [...s.attendance.values()].length > 0 && [...s.attendance.values()].every((a) => a.independent);

export interface ProvNode { pid: string; maskedName: string; roles: Role[]; label: string | null; children: ProvNode[] }
/** "Who appointed whom": organizer at the root; each person hangs under the person who first appointed them. */
export function provenanceTree(s: EventState): ProvNode[] {
  const nodes = new Map<string, ProvNode>();
  for (const p of s.people.values()) if (p.roles.length || s.roleLog.some((r) => r.pid === p.pid)) nodes.set(p.pid, { pid: p.pid, maskedName: p.maskedName, roles: p.roles, label: p.label, children: [] });
  const roots: ProvNode[] = [];
  for (const p of s.people.values()) {
    const node = nodes.get(p.pid); if (!node) continue;
    const firstSeq = Math.min(...Object.values(p.appointedSeq).filter((x): x is number => typeof x === "number"));
    const first = (Object.entries(p.appointedSeq) as Array<[Role, number]>).find(([, q]) => q === firstSeq)?.[0];
    const by = first ? p.appointedBy[first] ?? null : null;
    const parent = by && by !== p.pid ? nodes.get(by) : undefined;
    if (parent) parent.children.push(node); else roots.push(node);
  }
  return roots;
}

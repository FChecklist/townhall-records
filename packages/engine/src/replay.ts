// Replays a verified log into the event state. EVERYTHING public (report, live page, progress, results) is a pure function of this state.
// Replay also re-checks the semantics (one vote per flat, no vote after close, frozen rules, results match) and records every violation in `problems`.
import { canonical, type Json } from "./canonical";
import { sha256Hex } from "./crypto";
import type { SignedEntry } from "./log";
import { effectiveForPoint, type RuleSet } from "./rules";
import { defaultBallotDesign, normalizeBallotDesign } from "./ballot";
import { roleCounts, roleLimitProblem } from "./attendance";
import { describeAction, OFFICIAL_GROUP_IDS, REASON_IDS, postponeQuote, type Outcome, type PostponePhase } from "./lifecycle";
import { defaultSchedule, validateSchedule, type Schedule } from "./schedule";
import { aggregate, computeQuorum, effectiveWeight, tallyAgg, type Aggregate, type Flat, type PointDef, type PointTally, type QuorumResult } from "./tally";

export type EventStatus = "setup" | "agenda_published" | "live" | "postponed" | "closed" | "suspended";
export type Role = "organizer" | "host" | "attendance_officer";

export interface PersonState { pid: string; maskedName: string; maskedEmail: string; flatNo: string | null; verified: boolean; roles: Role[]; label: string | null; appointedBy: Partial<Record<Role, string | null>>; appointedSeq: Partial<Record<Role, number>> }
export interface PointFull extends PointDef { number: string; title: string; body: string; rev: number }
export interface PointRun {
  def: PointFull; state: "pending" | "open" | "closed"; endsMs: number | null; extensions: number; openedSeq: number | null; closedSeq: number | null;
  frozen: RuleSet | null; presentWeightAtClose: number | null; totalWeightAtClose: number | null; quorumAtOpen: QuorumResult | null;
}
export interface Presence { flatNo: string; maskedName: string; mode: string; method: string; docType: string | null; docLast4: string | null; by: string; independent: boolean; evidenceHash: string | null; idChecked: boolean; idVerifiedBy: string | null; seq: number; ts: number }
export interface PaperStats { serials: number; counted: number; invalid: number; voided: number; uncounted: number; imagesDigest: string }
export interface BoxSeal { n: number; receipts: string[]; counts: Record<string, { weight: number; count: number }>; castWeight: number; digest: string; split: Aggregate["split"]; paper: PaperStats | null }
export interface RuleChange { seq: number; ts: number; scope: string; param: string; old: Json | null; new: Json | null; reason: string; by: string | null }

export interface EventState {
  eid: string; seqCount: number; head: { seq: number; hash: string } | null; firstTs: number | null; lastTs: number | null;
  created: null | { kind: "meeting" | "election"; eventType: string; title: string; venue: string; scheduledMs: number; schedule: Schedule; country: string; packId: string; timezone: string; society: { name: string; address: string; registrationNo: string; kind: string }; createdFrom: string | null };
  rules: RuleSet | null; initialRules: RuleSet | null; ruleHistory: RuleChange[]; rejectedChanges: RuleChange[];
  status: EventStatus; paid: boolean; payments: Array<{ paymentId: string; state: string; amountMinor: number; currency: string; mode: string; seq: number; purpose: string }>;
  people: Map<string, PersonState>; roleLog: Array<{ seq: number; ts: number; action: "appoint" | "remove"; pid: string; role: Role; by: string | null }>;
  roll: Flat[]; rollRev: number;
  points: Map<string, PointRun>; pointOrder: string[];
  attendance: Map<string, Presence>; attendanceLog: Presence[];
  ledger: Map<string, Map<string, { kind: "official" | "proxy"; choices: string[] | null; seq: number; channel: "online" | "paper" }>>;
  devices: Array<{ seq: number; flatNo: string; replaced: boolean }>; handshakes: number;
  seals: Map<string, BoxSeal>; results: Map<string, PointTally>;
  agenda: null | { seq: number; ts: number; givenDays: number; minDays: number | null; maxDays: number | null; met: boolean | null };
  startedTs: number | null; closedInfo: null | { seq: number; ts: number; outcome: Outcome; reasonCodes: string[]; reason: string };
  outcome: Outcome | null; sitting: number;
  changeRequests: Array<{ seq: number; ts: number; flatNo: string; reason: string }>;
  /** agenda points taken off AFTER the notice went out: never deleted, kept here with the reason and the time (see the point_withdrawn entry) */
  withdrawn: Array<{ seq: number; ts: number; pointId: string; number: string; title: string; reason: string; by: string | null }>;
  /** set while an Organizer or Host does the check-in although an Attendance Monitor is appointed (the Monitor is absent); cleared when they hand it back */
  checkinTakeover: null | { seq: number; ts: number; by: string | null; reason: string };
  officials: Map<string, { id: string; seq: number; ts: number; group: string; groupLabel: string; name: string; designation: string; authority: string; note: string }>;
  officialPresence: Map<string, { seq: number; ts: number; mode: string; by: string | null }>;
  /** who did what and when: every action of a named person (Organizer, Host, Attendance Monitor), in order */
  actions: Array<{ seq: number; ts: number; pid: string; type: string; detail: string }>;
  /** every entry in order, with a plain description: the chronology */
  timeline: Array<{ seq: number; ts: number; type: string; pid: string | null; flat: string | null; hash: string; detail: string }>;
  overrides: Array<{ seq: number; ts: number; key: string; value: boolean; declaration: string; lawReason: string }>;
  customRules: Map<string, { seq: number; ts: number; title: string; kind: "text" | "number" | "yes_no"; value: string | number | boolean; note: string }>;
  postponements: Array<{ seq: number; ts: number; phase: PostponePhase; sitting: number; reasonCodes: string[]; reason: string; feeMinor: number; paymentId: string | null; fromStartMs: number; to: Schedule }>;
  clones: Array<{ direction: string; eventId: string }>; platformActions: Array<{ seq: number; action: string; reason: string }>;
  contactsReads: number; anchors: Array<{ headSeq: number; headHash: string }>;
  scheduleChanges: Array<{ seq: number; ts: number; reason: string }>;
  terms: Set<string>; accEntries: number; packInfo: { name: string; confidence: string; needsLawyer: boolean };
  problems: string[];
}

const TERMS_EXEMPT = new Set(["event_created", "terms_accepted", "email_verified", "passcode_issued", "passcode_locked"]);
const rs0 = (): RuleSet => ({ packId: "", params: {}, options: {}, locked: {} });
export function emptyState(eid: string): EventState {
  return {
    eid, seqCount: 0, head: null, firstTs: null, lastTs: null, created: null, rules: null, initialRules: null, ruleHistory: [], rejectedChanges: [], status: "setup", paid: false, payments: [],
    people: new Map(), roleLog: [], roll: [], rollRev: 0, points: new Map(), pointOrder: [], attendance: new Map(), attendanceLog: [], ledger: new Map(),
    seals: new Map(), results: new Map(), devices: [], handshakes: 0, agenda: null, startedTs: null, closedInfo: null, outcome: null, sitting: 1, postponements: [], overrides: [], actions: [], timeline: [], customRules: new Map(), officials: new Map(), changeRequests: [], withdrawn: [], checkinTakeover: null, officialPresence: new Map(), clones: [], platformActions: [], contactsReads: 0, anchors: [], scheduleChanges: [], terms: new Set(), accEntries: 0, packInfo: { name: "", confidence: "", needsLawyer: true }, problems: [],
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
    { const act = e.actor as any; s.timeline.push({ seq, ts: e.ts, type: e.type, pid: typeof act?.pid === "string" ? act.pid : null, flat: typeof act?.flat === "string" ? act.flat : null, hash: se.hash.slice(0, 12), detail: describeAction(e.type, p) });
      const prevTs = s.timeline.length > 1 ? s.timeline[s.timeline.length - 2]!.ts : 0; if (e.ts < prevTs - 5000) bad(seq, "the time goes backwards by more than 5 seconds"); }
    { const ap = (e.actor as any)?.pid; if (typeof ap === "string" && !["terms_accepted", "email_verified", "passcode_issued", "passcode_locked"].includes(e.type)) s.actions.push({ seq, ts: e.ts, pid: ap, type: e.type, detail: describeAction(e.type, p) }); }
    s.seqCount = seq; s.head = { seq, hash: se.hash }; s.firstTs ??= e.ts; s.lastTs = e.ts;
    const actorPid = "pid" in e.actor ? e.actor.pid : null;
    if (e.type === "terms_accepted") s.terms.add(`${p.subject === "flat" ? "flat" : "pid"}:${p.ref}`);
    else if (actorPid && !TERMS_EXEMPT.has(e.type) && !s.terms.has("pid:" + actorPid)) bad(seq, `${actorPid} acted (${e.type}) without accepting the terms`);
    else if ("flat" in e.actor && (e.type === "vote_recorded" || e.type === "vote_cast_open") && !s.terms.has("flat:" + e.actor.flat)) bad(seq, `flat ${e.actor.flat} voted without accepting the terms`);
    if (typeof p.acc === "string") s.accEntries += 1;
    switch (e.type) {
      case "event_created": s.created = { kind: p.kind, eventType: p.eventType, title: p.title, venue: p.venue, scheduledMs: p.scheduledMs, schedule: p.schedule ?? defaultSchedule(p.scheduledMs, p.venue), country: p.country ?? "IN", packId: p.packId, timezone: p.timezone ?? "UTC", society: p.society, createdFrom: p.createdFrom ?? null }; break;
      case "schedule_set": {
        if (!s.created) { bad(seq, "schedule set before the event existed"); break; }
        if (s.status === "live" || s.status === "closed") bad(seq, "schedule changed after the event started");
        const why = validateSchedule(p.schedule); if (why) bad(seq, "invalid schedule: " + why);
        s.created.schedule = p.schedule; s.created.scheduledMs = p.schedule.start.atMs; s.scheduleChanges.push({ seq, ts: e.ts, reason: asStr(p.reason) }); break;
      }
      case "rules_initialized": s.rules = { packId: p.packId, params: { ...p.params }, options: { ...p.options }, locked: { ...p.locked } }; s.packInfo = { name: asStr(p.packName), confidence: asStr(p.packConfidence), needsLawyer: p.packNeedsLawyer !== false }; s.initialRules = copyRules(s.rules); break;
      case "role_appointed": {
        const role = p.role as Role;
        const ex: PersonState = s.people.get(p.pid) ?? { pid: p.pid, maskedName: p.maskedName ?? "", maskedEmail: p.maskedEmail ?? "", flatNo: p.flatNo ?? null, verified: false, roles: [], label: null, appointedBy: {}, appointedSeq: {} };
        if (!ex.roles.includes(role)) ex.roles.push(role);
        ex.appointedBy[role] = p.appointedBy ?? null; ex.appointedSeq[role] = seq;
        if (p.maskedName) ex.maskedName = p.maskedName;
        if (p.maskedEmail) ex.maskedEmail = p.maskedEmail;
        s.people.set(p.pid, ex); { const why = roleLimitProblem(roleCounts(s.people.values())); if (why) bad(seq, why); }
        s.roleLog.push({ seq, ts: e.ts, action: "appoint", pid: p.pid, role, by: p.appointedBy ?? null }); break;
      }
      case "role_removed": { const pr = s.people.get(p.pid); if (pr) pr.roles = pr.roles.filter((r) => r !== p.role); s.roleLog.push({ seq, ts: e.ts, action: "remove", pid: p.pid, role: p.role, by: p.removedBy ?? null }); break; }
      case "email_verified": { const pr = s.people.get(p.pid); if (pr) pr.verified = true; else bad(seq, "email_verified for unknown person"); break; }
      case "label_set": { const pr = s.people.get(p.pid); if (pr) pr.label = asStr(p.label) || null; break; }
      case "options_set": if (s.rules) for (const [k, v] of Object.entries(p.options as Record<string, boolean>)) { const l = s.rules.locked[k]; if (l && l.value !== v) bad(seq, `locked option ${k} changed`); s.rules.options[k] = v; } break;
      case "official_set": {
        const id = asStr(p.id); const name = asStr(p.name).trim(); const group = asStr(p.group);
        if (!/^of_[0-9a-f]{6,16}$/.test(id) || name.length < 2 || name.length > 120 || !OFFICIAL_GROUP_IDS.has(group)) { bad(seq, "invalid official entry"); break; }
        if (s.status === "live" || s.status === "closed") bad(seq, "officials changed after the event started");
        const f = (k: string, n: number) => { const v = asStr(p[k]); if (v.length > n) bad(seq, `official ${k} too long`); return v.slice(0, n); };
        const prev = s.officials.get(id);
        s.officials.set(id, { id, seq: prev?.seq ?? seq, ts: prev?.ts ?? e.ts, group, groupLabel: f("groupLabel", 100), name, designation: f("designation", 160), authority: f("authority", 200), note: f("note", 300) }); break;
      }
      case "basics_set": { if (s.status === "live" || s.status === "closed") bad(seq, "title or place changed after the event started"); if (s.created) { if (typeof p.title === "string") s.created.title = p.title; if (typeof p.venue === "string") { const old = s.created.venue, sc = s.created.schedule, re = (m: { atMs: number; place: string }) => (m.place === old ? { ...m, place: p.venue as string } : m); s.created.schedule = { start: re(sc.start), votingStart: re(sc.votingStart), votingEnd: re(sc.votingEnd), end: re(sc.end) }; s.created.venue = p.venue; } } break; }
      case "point_removed": { const ex = s.points.get(p.pointId); if (!ex) { bad(seq, "removed an unknown agenda point"); break; } if (ex.state !== "pending") bad(seq, `point ${ex.def.number} removed after it opened`); if (s.status !== "setup") bad(seq, `point ${ex.def.number} deleted after the notice went out (it must be withdrawn so it stays on the record)`); s.points.delete(p.pointId); s.pointOrder = s.pointOrder.filter((x) => x !== p.pointId); break; }
      case "point_withdrawn": {
        const ex = s.points.get(p.pointId); if (!ex) { bad(seq, "withdrew an unknown agenda point"); break; }
        if (ex.state !== "pending") bad(seq, `point ${ex.def.number} withdrawn after it opened`);
        const reason = asStr(p.reason).trim(); if (reason.length < 3) bad(seq, `point ${ex.def.number} withdrawn without a reason`);
        s.withdrawn.push({ seq, ts: e.ts, pointId: p.pointId, number: ex.def.number, title: ex.def.title, reason: reason.slice(0, 200), by: actorPid });
        s.points.delete(p.pointId); s.pointOrder = s.pointOrder.filter((x) => x !== p.pointId); break;
      }
      case "checkin_takeover": {
        if (p.on === false) { if (!s.checkinTakeover) bad(seq, "check-in handed back although nobody had taken it over"); s.checkinTakeover = null; break; }
        if (s.status !== "agenda_published" && s.status !== "live" && s.status !== "postponed") bad(seq, "check-in taken over while attendance is not open");
        const reason = asStr(p.reason).trim(); if (reason.length < 3) bad(seq, "check-in taken over without a reason");
        s.checkinTakeover = { seq, ts: e.ts, by: actorPid, reason: reason.slice(0, 200) }; break;
      }
      case "name_change_requested": s.changeRequests.push({ seq, ts: e.ts, flatNo: asStr(p.flatNo), reason: asStr(p.reason) }); break;
      case "official_removed": { if (s.status === "live" || s.status === "closed") bad(seq, "officials changed after the event started"); s.officials.delete(asStr(p.id)); s.officialPresence.delete(asStr(p.id)); break; }
      case "official_attendance": {
        const id = asStr(p.id); if (!s.officials.has(id)) { bad(seq, "attendance for an unknown official"); break; }
        if (p.present === false) s.officialPresence.delete(id); else s.officialPresence.set(id, { seq, ts: e.ts, mode: asStr(p.mode) || "physical", by: (e.actor as any).pid ?? null }); break;
      }
      case "option_overridden": {
        const k = asStr(p.key); const lock = s.rules?.locked[k];
        if (!s.rules || !lock) { bad(seq, `override of option ${k} that the law pack does not lock`); break; }
        if ([...s.points.values()].some((x) => x.state !== "pending") || s.status === "live" || s.status === "closed") bad(seq, "option overridden after the event started");
        const decl = asStr(p.declaration); if (decl.trim().length < 10) bad(seq, "override without a declaration");
        s.overrides.push({ seq, ts: e.ts, key: k, value: !!p.value, declaration: decl, lawReason: lock.reason }); s.rules.options[k] = !!p.value; delete s.rules.locked[k]; break;
      }
      case "custom_rule_set": {
        const title = asStr(p.title).trim(); if (title.length < 2 || title.length > 80) { bad(seq, "custom rule title"); break; }
        if (s.status === "live" || s.status === "closed" || [...s.points.values()].some((x) => x.state !== "pending")) bad(seq, "custom rule changed after the event started");
        if (p.value === null) { s.customRules.delete(title); break; }
        const kind = p.kind as "text" | "number" | "yes_no"; const okv = (kind === "text" && typeof p.value === "string" && p.value.length <= 1000) || (kind === "number" && typeof p.value === "number" && Number.isFinite(p.value)) || (kind === "yes_no" && typeof p.value === "boolean");
        if (!okv) { bad(seq, "custom rule value does not match its kind"); break; }
        s.customRules.set(title, { seq, ts: e.ts, title, kind, value: p.value as string | number | boolean, note: asStr(p.note) }); break;
      }
      case "rule_changed": {
        const ch: RuleChange = { seq, ts: e.ts, scope: p.scope, param: p.param, old: p.old ?? null, new: p.new ?? null, reason: asStr(p.reason), by: actorPid };
        if (p.scope !== "event") { const pt = s.points.get(p.scope); if (!pt) bad(seq, "rule change for unknown point"); else if (pt.state !== "pending") bad(seq, `rule changed after point ${pt.def.number} opened`); }
        if (s.rules) s.rules.params[p.param] = p.new ?? null;
        s.ruleHistory.push(ch); break;
      }
      case "rule_change_rejected": s.rejectedChanges.push({ seq, ts: e.ts, scope: p.scope, param: p.param, old: null, new: null, reason: asStr(p.reason), by: actorPid }); break;
      case "roll_set": {
        if (s.status === "live" || s.status === "postponed" || [...s.points.values()].some((x) => x.state !== "pending")) bad(seq, "roll changed after voting started");
        s.roll = (p.flats as Flat[]).map((f) => ({ flatNo: f.flatNo, weight: f.weight, eligible: f.eligible })); s.rollRev = p.rev; break;
      }
      case "point_added": case "point_amended": {
        let design = defaultBallotDesign(); try { design = normalizeBallotDesign(p.design); } catch { bad(seq, "invalid ballot design"); }
        const def: PointFull = {
          pointId: p.pointId, number: p.number, title: p.title, body: p.body, kind: p.kind, options: p.options, maxChoices: p.maxChoices, majorityClass: p.majorityClass, secret: !!p.secret, rev: p.rev,
          labels: p.labels ?? Object.fromEntries((p.options as string[]).map((o) => [o, o])), minChoices: p.minChoices ?? 1,
          format: p.format ?? (p.kind === "election_post" ? "single_post" : undefined), seats: p.seats ?? [], topN: p.topN ?? null, design,
        };
        if (new Set((p.options as string[])).size !== (p.options as string[]).length) bad(seq, `point ${p.number} has a repeated option id`);
        for (const other of s.points.values()) if (other.def.pointId !== p.pointId) for (const o of def.options) if (other.def.kind === "election_post" && def.kind === "election_post" && other.def.options.includes(o)) bad(seq, `option id ${o} is used on two points`);
        const ex = s.points.get(p.pointId);
        if (ex && ex.state !== "pending") bad(seq, `point ${ex.def.number} amended after it opened`);
        if (ex) ex.def = def; else { s.points.set(p.pointId, { def, state: "pending", endsMs: null, extensions: 0, openedSeq: null, closedSeq: null, frozen: null, presentWeightAtClose: null, totalWeightAtClose: null, quorumAtOpen: null }); s.pointOrder.push(p.pointId); }
        break;
      }
      case "agenda_published": s.status = "agenda_published"; s.agenda = { seq, ts: e.ts, givenDays: p.givenDays, minDays: p.minDays ?? null, maxDays: p.maxDays ?? null, met: p.met ?? null }; break;
      case "payment_state": { const purpose = p.purpose === "reschedule" ? "reschedule" : "event"; s.payments.push({ paymentId: p.paymentId, state: p.state, amountMinor: p.amountMinor, currency: p.currency ?? "INR", mode: p.mode, seq, purpose }); if (p.state === "paid" && purpose === "event") s.paid = true; break; }
      case "attendance_marked": {
        const pr: Presence = { flatNo: p.flatNo, maskedName: p.maskedName ?? "", mode: p.mode, method: p.method, docType: p.docType ?? null, docLast4: p.docLast4 ?? null, by: p.by, independent: !!p.independent, evidenceHash: p.evidenceHash ?? null, idChecked: !!p.idChecked || !!p.docType, idVerifiedBy: typeof p.idVerifiedBy === "string" ? p.idVerifiedBy : (p.docType ? p.by : null), seq, ts: e.ts };
        s.attendanceLog.push(pr);
        if (p.present === false) s.attendance.delete(p.flatNo); else s.attendance.set(p.flatNo, pr);
        break;
      }
      case "event_started": if (s.status === "postponed") s.sitting += 1; s.status = "live"; if (s.startedTs === null) s.startedTs = e.ts; break;
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
        led.set(p.flatNo, { kind: p.kind, choices: open ? p.choices : null, seq, channel: "online" });
        break;
      }
      case "paper_issued": {
        const pt = s.points.get(p.pointId);
        if (!pt) { bad(seq, "paper ballot for unknown point"); break; }
        if (pt.state !== "open") bad(seq, `paper ballot given on point ${pt.def.number} while it was ${pt.state}`);
        if (!s.attendance.has(p.flatNo)) bad(seq, `flat ${p.flatNo} was given a paper ballot without being marked present`);
        if (!pt.def.secret && false) bad(seq, "unreachable");
        const led = s.ledger.get(p.pointId) ?? new Map(); s.ledger.set(p.pointId, led);
        if (led.has(p.flatNo)) bad(seq, `flat ${p.flatNo} voted twice on point ${pt.def.number}`);
        led.set(p.flatNo, { kind: p.kind, choices: null, seq, channel: "paper" });
        break;
      }
      case "paper_voided": { const pt = s.points.get(p.pointId); if (!pt) bad(seq, "void for unknown point"); else if (!s.ledger.get(p.pointId)?.has(p.flatNo)) bad(seq, `paper voided for flat ${p.flatNo} that was never given one`); break; }
      case "handshake_started": s.handshakes += 1; break;
      case "device_bound": s.devices.push({ seq, flatNo: p.flatNo, replaced: !!p.replaced }); break;
      case "ballot_box_sealed": {
        const pt = s.points.get(p.pointId); if (!pt || pt.state !== "closed") { bad(seq, "box sealed before the point closed"); break; }
        const led = s.ledger.get(p.pointId) ?? new Map();
        const rules = pt.frozen ?? s.rules ?? rs0();
        const wsum = [...led.keys()].reduce((a, f) => a + flatWeight(s, rules, f), 0);
        const paper: PaperStats | null = p.paper ?? null; const online = [...led.values()].filter((v) => v.channel === "online").length;
        if (!paper && p.n !== led.size) bad(seq, `ballot box holds ${p.n} ballots but ${led.size} flats voted`);
        if (paper) {
          if (p.n !== online + paper.counted) bad(seq, `ballot box holds ${p.n} ballots but ${online} online votes and ${paper.counted} counted papers were recorded`);
          if (paper.serials !== paper.counted + paper.invalid + paper.voided + paper.uncounted) bad(seq, "paper ballot accounts do not add up");
          if (p.castWeight > wsum) bad(seq, "ballot box weight is more than the flats that voted can have");
        } else if (p.castWeight !== wsum) bad(seq, "ballot box weight does not match the flats that voted");
        if ((p.receipts as string[]).length !== p.n) bad(seq, "receipt list length does not match");
        s.seals.set(p.pointId, { n: p.n, receipts: p.receipts, counts: p.counts, castWeight: p.castWeight, digest: p.digest, split: p.split ?? null, paper }); break;
      }
      case "result_computed": {
        const pt = s.points.get(p.pointId); if (!pt) { bad(seq, "result for unknown point"); break; }
        const calc = tallyFor(s, pt);
        if (canonical(calc as unknown as Json) !== canonical(p.tally)) bad(seq, `result of point ${pt.def.number} does not match the recomputed tally`);
        s.results.set(p.pointId, p.tally as PointTally); break;
      }
      case "event_closed": {
        const oc = (p.outcome ?? "completed") as Outcome; if (!["completed", "stopped", "cancelled"].includes(oc)) bad(seq, "unknown outcome " + String(p.outcome));
        const codes = Array.isArray(p.reasonCodes) ? (p.reasonCodes as unknown[]).filter((x): x is string => typeof x === "string") : []; if (codes.some((x) => !REASON_IDS.has(x))) bad(seq, "unknown reason code");
        if (oc !== "completed" && !asStr(p.reason) && !codes.length) bad(seq, "stopping or cancelling needs a reason");
        s.outcome = oc; s.status = "closed"; s.closedInfo = { seq, ts: e.ts, outcome: oc, reasonCodes: codes, reason: asStr(p.reason) }; for (const pt of s.points.values()) if (pt.state === "open") bad(seq, "event closed with a point still open"); break;
      }
      case "event_postponed": {
        if (!s.created) { bad(seq, "postponed before the event existed"); break; }
        if (s.status === "closed" || s.status === "suspended" || s.status === "setup") { bad(seq, "postponed in a state where that is not possible: " + s.status); break; }
        if ([...s.points.values()].some((x) => x.state === "open")) bad(seq, "postponed with a point still open");
        const why = validateSchedule(p.newSchedule); if (why) bad(seq, "invalid new schedule: " + why);
        const codes = Array.isArray(p.reasonCodes) ? (p.reasonCodes as unknown[]).filter((x): x is string => typeof x === "string") : []; if (codes.some((x) => !REASON_IDS.has(x))) bad(seq, "unknown reason code");
        if (!asStr(p.reason) && !codes.length) bad(seq, "postponing needs a reason");
        const startMs = s.created.schedule.start.atMs; const prior = s.postponements.filter((x) => x.phase === "after_start").length;
        const q = postponeQuote(s.created.kind, s.created.country, startMs, e.ts, prior);
        if (p.phase !== q.phase) bad(seq, "postponement phase does not match the clock"); if (p.feeMinor !== q.feeMinor) bad(seq, `postponement fee ${String(p.feeMinor)} should be ${q.feeMinor}`);
        if (q.feeMinor > 0 && !s.payments.some((x) => x.paymentId === p.paymentId && x.state === "paid" && x.purpose === "reschedule" && x.amountMinor >= q.feeMinor)) bad(seq, "postponement fee not paid");
        s.postponements.push({ seq, ts: e.ts, phase: q.phase, sitting: s.sitting, reasonCodes: codes, reason: asStr(p.reason), feeMinor: q.feeMinor, paymentId: (p.paymentId as string) ?? null, fromStartMs: startMs, to: p.newSchedule as Schedule });
        if (!why) { s.created.schedule = p.newSchedule as Schedule; s.created.scheduledMs = (p.newSchedule as Schedule).start.atMs; }
        s.scheduleChanges.push({ seq, ts: e.ts, reason: "postponed: " + (asStr(p.reason) || codes.join(", ")) });
        if (s.status === "live") { s.status = "postponed"; s.attendance.clear(); s.officialPresence.clear(); } else if (s.status === "postponed") { s.attendance.clear(); s.officialPresence.clear(); }
        break;
      }
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

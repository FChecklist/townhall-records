// The report/live-page model: a deterministic function of the replayed log. Integers and strings only (so it can be canonicalised and compared).
import { canonical, type Json } from "./canonical";
import { sha256Hex, verifyMessage } from "./crypto";
import { verifyChain, type SignedEntry } from "./log";
import { currentRoles, officerCount, presentFlatNos, provenanceTree, replayLog, tallyFor, weightsNow, type EventState, type ProvNode } from "./replay";
import { OPTIONS } from "./rules";
import { computeQuorum, type PointTally } from "./tally";
import { progressOf } from "./progress";
import { complianceChecks, type Compliance } from "./compliance";
import { ballotInstruction, type BallotDesign, type EventFormat } from "./ballot";
import { defaultSchedule, type Schedule } from "./schedule";

export const NOT_PUBLISHED: Array<{ item: string; why: string }> = [
  { item: "Passcodes", why: "They are secrets. Only a keyed hash exists on the server and it is never shown." },
  { item: "Photos and ID images", why: "Sensitive personal data. If used they are encrypted on the device and never public." },
  { item: "ID document details beyond type and last 4 characters", why: "Full ID numbers (including Aadhaar) are never stored." },
  { item: "Full e-mail addresses, phone numbers and names", why: "Shown only partly hidden with * to protect privacy." },
  { item: "IP addresses and device identifiers", why: "They are recorded for every action but kept privately and encrypted. This page shows only a coded fingerprint per entry. Office-bearers see a shortened form; the full details are released only on a lawful request, and each release is recorded here." },
  { item: "How each flat voted in a secret ballot", why: "Secret ballots publish totals and receipt codes only." },
];

export interface PointView {
  pointId: string; number: string; title: string; body: string; kind: string; options: string[]; maxChoices: number; majorityClass: string; secret: boolean;
  state: string; endsMs: number | null; extensions: number; voted: string[]; openVotes: Array<{ flatNo: string; kind: string; choices: string[] }> | null;
  receipts: string[] | null; tally: PointTally | null; countsHidden: boolean;
  paper: { serials: number; counted: number; invalid: number; voided: number; uncounted: number; imagesDigest: string } | null;
  labels: Record<string, string>; minChoices: number; format: EventFormat | null; seats: string[]; topN: number | null; design: BallotDesign; instruction: string;
}
export interface ReportModel {
  v: 1; eid: string; live: boolean; phase: string; percent: number;
  title: string; kind: string; eventType: string; venue: string; scheduledMs: number; schedule: Schedule; scheduleChanges: number; timezone: string; country: string; closedMs: number | null; packId: string;
  society: { name: string; address: string; registrationNo: string; kind: string }; createdFrom: string | null;
  head: { seq: number; hash: string } | null; status: string;
  people: Array<{ pid: string; maskedName: string; maskedEmail: string; roles: string[]; label: string | null; verified: boolean }>;
  tree: ProvNode[];
  options: Array<{ key: string; label: string; value: boolean | null; locked: boolean; reason: string | null }>;
  rules: Array<{ param: string; value: Json | null }>;
  ruleHistory: Array<{ seq: number; ts: number; scope: string; param: string; old: Json | null; new: Json | null; reason: string; by: string | null }>;
  rejected: Array<{ seq: number; scope: string; param: string; reason: string }>;
  notice: { givenDays: number; minDays: number | null; maxDays: number | null; met: boolean | null } | null;
  attendance: { line: string; officers: number; present: number; total: number; presentWeight: number; totalWeight: number; rows: Array<{ flatNo: string; maskedName: string; mode: string; method: string; docType: string | null; docLast4: string | null; by: string; independent: boolean }> };
  quorum: { enabled: boolean; basis: string | null; total: number; present: number; required: number; met: boolean } | null;
  points: PointView[];
  payments: Array<{ state: string; amountMinor: number; currency: string; mode: string }>;
  platformActions: Array<{ seq: number; action: string; reason: string }>;
  clones: Array<{ direction: string; eventId: string }>; anchors: Array<{ headSeq: number; headHash: string }>;
  problems: string[]; contactsReads: number;
  compliance: Compliance; access: { termsAccepted: number; entriesWithAccessFingerprint: number; entries: number };
}

export function buildReportModel(s: EventState): ReportModel {
  const c = s.created;
  const rules = s.rules;
  const officers = officerCount(s);
  const rows = [...s.attendance.values()].sort((a, b) => (a.flatNo < b.flatNo ? -1 : 1));
  const allInd = rows.length > 0 && rows.every((r) => r.independent);
  const line = officers > 0 && allInd ? `Attendance was independently verified by ${officers} Attendance Officer${officers > 1 ? "s" : ""}.`
    : officers > 0 && rows.some((r) => r.independent) ? "Attendance was only partly independently verified." : "Attendance was not independently verified.";
  let quorum: ReportModel["quorum"] = null;
  if (rules && rules.options.quorum_check) { try { const q = computeQuorum(rules, s.roll, presentFlatNos(s)); quorum = { enabled: q.enabled, basis: q.basis, total: q.total, present: q.present, required: q.required, met: q.met }; } catch { quorum = null; } }
  const w = rules ? weightsNow(s, rules) : { present: 0, total: 0 };
  const points: PointView[] = s.pointOrder.map((id) => {
    const pt = s.points.get(id)!;
    const led = s.ledger.get(id) ?? new Map();
    const secret = pt.def.secret;
    const sealed = s.seals.has(id);
    const finished = pt.state === "closed";
    const showTally = secret ? finished && sealed : pt.state !== "pending";
    let tally: PointTally | null = null;
    if (showTally) tally = s.results.get(id) ?? tallyFor(s, pt);
    return {
      pointId: id, number: pt.def.number, title: pt.def.title, body: pt.def.body, kind: pt.def.kind, options: pt.def.options, maxChoices: pt.def.maxChoices, majorityClass: pt.def.majorityClass, secret,
      state: pt.state, endsMs: pt.endsMs, extensions: pt.extensions, voted: [...led.keys()].sort(),
      openVotes: secret ? null : [...led.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([flatNo, v]) => ({ flatNo, kind: v.kind, choices: v.choices ?? [] })),
      receipts: secret && sealed ? s.seals.get(id)!.receipts : null, tally, countsHidden: secret && !(finished && sealed),
      paper: s.seals.get(id)?.paper ?? null,
      labels: pt.def.labels ?? {}, minChoices: pt.def.minChoices ?? 1, format: (pt.def.format ?? null) as EventFormat | null, seats: pt.def.seats ?? [], topN: pt.def.topN ?? null, design: pt.def.design!, instruction: pt.def.kind === "discussion" ? "" : ballotInstruction(pt.def.minChoices ?? 1, pt.def.maxChoices),
    };
  });
  const prog = progressOf(s);
  return {
    v: 1, eid: s.eid, live: s.status !== "closed", phase: prog.phase, percent: prog.percent,
    title: c?.title ?? "", kind: c?.kind ?? "", eventType: c?.eventType ?? "", venue: c?.venue ?? "", scheduledMs: c?.scheduledMs ?? 0, schedule: c?.schedule ?? defaultSchedule(0, ""), scheduleChanges: s.scheduleChanges.length, country: c?.country ?? "IN", closedMs: s.closedInfo?.ts ?? null, timezone: c?.timezone ?? "UTC", packId: c?.packId ?? "",
    society: c?.society ?? { name: "", address: "", registrationNo: "", kind: "" }, createdFrom: c?.createdFrom ?? null,
    head: s.head, status: s.status,
    people: currentRoles(s).map((p) => ({ pid: p.pid, maskedName: p.maskedName, maskedEmail: p.maskedEmail, roles: [...p.roles], label: p.label, verified: p.verified })),
    tree: provenanceTree(s),
    options: OPTIONS.map((o) => ({ key: o.key, label: o.label, value: rules?.options[o.key] ?? null, locked: !!rules?.locked[o.key], reason: rules?.locked[o.key]?.reason ?? null })),
    rules: Object.entries(rules?.params ?? {}).sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([param, value]) => ({ param, value })),
    ruleHistory: s.ruleHistory.map((r) => ({ seq: r.seq, ts: r.ts, scope: r.scope, param: r.param, old: r.old, new: r.new, reason: r.reason, by: r.by })),
    rejected: s.rejectedChanges.map((r) => ({ seq: r.seq, scope: r.scope, param: r.param, reason: r.reason })),
    notice: s.agenda ? { givenDays: s.agenda.givenDays, minDays: s.agenda.minDays, maxDays: s.agenda.maxDays, met: s.agenda.met } : null,
    attendance: { line, officers, present: s.attendance.size, total: s.roll.filter((f) => f.eligible).length, presentWeight: w.present, totalWeight: w.total, rows: rows.map((r) => ({ flatNo: r.flatNo, maskedName: r.maskedName, mode: r.mode, method: r.method, docType: r.docType, docLast4: r.docLast4, by: r.by, independent: r.independent })) },
    quorum, points,
    payments: s.payments.map((p) => ({ state: p.state, amountMinor: p.amountMinor, currency: p.currency, mode: p.mode })),
    platformActions: s.platformActions, clones: s.clones, anchors: s.anchors, problems: s.problems, contactsReads: s.contactsReads,
    compliance: complianceChecks(s), access: { termsAccepted: s.terms.size, entriesWithAccessFingerprint: s.accEntries, entries: s.seqCount },
  };
}

// ------------------------------------------------------------------------------------------------------------------
// Seal + verification of a whole report file (REPORT-SPEC section 2). Pure string functions; also bundled into the page.
// ------------------------------------------------------------------------------------------------------------------
export const SEAL_OPEN = "<!--SEAL-->", SEAL_CLOSE = "<!--/SEAL-->";
export const reportMessage = (eid: string, fileSha256: string) => `aoa-rwa/report/v1\n${eid}\n${fileSha256}`;
export function stripSeal(html: string): string {
  const a = html.indexOf(SEAL_OPEN), b = html.indexOf(SEAL_CLOSE);
  if (a < 0 || b < a) throw new Error("no seal markers");
  return html.slice(0, a + SEAL_OPEN.length) + html.slice(b);
}
export const fileDigest = (html: string) => sha256Hex(stripSeal(html));

export interface Seal { fileSha256: string; sig: string; kid: string; headSeq: number; headHash: string }
export interface EmbeddedData { model: ReportModel; log: SignedEntry[]; publicKey: string; kid: string }

function between(html: string, open: string, close: string): string | null { const a = html.indexOf(open); if (a < 0) return null; const b = html.indexOf(close, a + open.length); return b < 0 ? null : html.slice(a + open.length, b); }
export function extractData(html: string): EmbeddedData | null {
  const t = between(html, '<script type="application/json" id="aoa-data">', "</script>");
  try { return t ? (JSON.parse(t) as EmbeddedData) : null; } catch { return null; }
}
export function extractSeal(html: string): Seal | null {
  const t = between(html, SEAL_OPEN + '<script type="application/json" id="aoa-seal">', "</script>" + SEAL_CLOSE);
  try { return t ? (JSON.parse(t) as Seal) : null; } catch { return null; }
}

export interface ReportVerdict {
  ok: boolean; problems: string[];
  seal: boolean; chain: boolean; model: boolean; keyMatches: boolean | null; digestMatches: boolean | null;
  head: { seq: number; hash: string } | null; fileSha256: string | null; resultsMatch: boolean;
}
/** Verifies a saved report file. `publicKey` / `expectedFileSha256` (from /api/pubkey or the anchor) are optional extra anchors. */
export async function verifyReportHtml(html: string, opts: { publicKey?: string; expectedFileSha256?: string } = {}): Promise<ReportVerdict> {
  try { return await verifyReportHtmlUnsafe(html, opts); } catch (e) { // a damaged file must produce a verdict, never an exception
    return { ok: false, problems: ["the file is damaged or not a report: " + String((e as Error)?.message ?? e).slice(0, 120)], seal: false, chain: false, model: false, keyMatches: null, digestMatches: null, head: null, fileSha256: null, resultsMatch: false };
  }
}
async function verifyReportHtmlUnsafe(html: string, opts: { publicKey?: string; expectedFileSha256?: string } = {}): Promise<ReportVerdict> {
  const problems: string[] = [];
  const v: ReportVerdict = { ok: false, problems, seal: false, chain: false, model: false, keyMatches: null, digestMatches: null, head: null, fileSha256: null, resultsMatch: false };
  const data = extractData(html); const seal = extractSeal(html);
  if (!data) { problems.push("report data block missing or damaged"); return v; }
  if (!seal) problems.push("seal missing");
  v.keyMatches = opts.publicKey ? opts.publicKey === data.publicKey : null;
  if (v.keyMatches === false) problems.push("embedded public key differs from the published key");
  if (seal) {
    let dig = ""; try { dig = await fileDigest(html); } catch { problems.push("seal markers damaged"); }
    v.fileSha256 = dig;
    const sigOk = !!dig && dig === seal.fileSha256 && (await verifyMessage(opts.publicKey ?? data.publicKey, reportMessage(data.model.eid, seal.fileSha256), seal.sig));
    v.seal = sigOk; if (!sigOk) problems.push("the file does not match its signed seal: it was changed after publication");
    if (opts.expectedFileSha256) { v.digestMatches = dig === opts.expectedFileSha256; if (!v.digestMatches) problems.push("file hash differs from the anchored hash"); }
  }
  const chain = await verifyChain(data.log, opts.publicKey ?? data.publicKey, seal ? { seq: seal.headSeq, hash: seal.headHash } : undefined);
  v.chain = chain.ok; v.head = chain.head;
  if (!chain.ok) problems.push(`log chain fails at entry ${chain.problems[0]?.seq}: ${chain.problems[0]?.reason}`);
  if (chain.ok) {
    const st = await replayLog(data.log);
    v.resultsMatch = st.problems.length === 0;
    for (const p of st.problems) problems.push("replay: " + p);
    const rebuilt = buildReportModel(st);
    v.model = canonical(rebuilt as unknown as Json) === canonical(data.model as unknown as Json);
    if (!v.model) problems.push("displayed figures do not match the log");
  }
  v.ok = problems.length === 0 && v.seal && v.chain && v.model && v.resultsMatch;
  return v;
}

/** Live pages are not sealed, but chain + replay + model can still be verified. */
export async function verifyEmbedded(data: EmbeddedData, expectedHead?: { seq: number; hash: string }): Promise<{ ok: boolean; problems: string[]; head: { seq: number; hash: string } | null }> {
  try { return await verifyEmbeddedUnsafe(data, expectedHead); } catch (e) { return { ok: false, problems: ["the data is damaged: " + String((e as Error)?.message ?? e).slice(0, 120)], head: null }; }
}
async function verifyEmbeddedUnsafe(data: EmbeddedData, expectedHead?: { seq: number; hash: string }): Promise<{ ok: boolean; problems: string[]; head: { seq: number; hash: string } | null }> {
  const problems: string[] = [];
  const chain = await verifyChain(data.log, data.publicKey, expectedHead);
  if (!chain.ok) problems.push(`log chain fails at entry ${chain.problems[0]?.seq}: ${chain.problems[0]?.reason}`);
  else {
    const st = await replayLog(data.log);
    for (const p of st.problems) problems.push("replay: " + p);
    if (canonical(buildReportModel(st) as unknown as Json) !== canonical(data.model as unknown as Json)) problems.push("displayed figures do not match the log");
  }
  return { ok: problems.length === 0, problems, head: chain.head };
}

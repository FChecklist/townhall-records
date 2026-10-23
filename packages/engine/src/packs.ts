// Rule-pack loader and validator. Input = docs/research/rule-packs.json (research data: every leaf {value,note,source,confidence,needsLawyer}).
// The research packs are mostly prose, so each pack is DERIVED into engine parameters by an explicit, reviewable table (DERIVED below).
// Anything the research could not verify stays null = "unset": the engine refuses to start an event until the Organizer sets it.
import type { Json } from "./canonical";
import { OPTIONS, type LockedOption, type Options, type RuleSet, setOption, setParam } from "./rules";

export class PackError extends Error {}

export interface Leaf { value: unknown; note: string; source: string; confidence: string; needsLawyer: boolean }
const isLeaf = (o: any): o is Leaf => o && typeof o === "object" && "value" in o && "source" in o && "confidence" in o;

export interface ResearchPack { id: string; name: string; jurisdiction: string; meetingTypes: Array<Record<string, any>>; [k: string]: any }
export interface ResearchFile { _schemaVersion: number; packs: ResearchPack[] }

const REQUIRED_TOP = ["id", "name", "jurisdiction", "instruments", "meetingTypes", "quorum", "adjournedQuorum", "majorities", "weightageModels", "proxy", "votingMethods", "electronicVoting", "minutesDeadlineDays", "recordRetentionYears", "electionRoles", "eligibility"];

/** Validates the shape of rules-packs.json and returns the packs. Throws PackError with a precise path. */
export function loadResearchPacks(json: unknown): ResearchPack[] {
  const f = json as ResearchFile;
  if (!f || typeof f !== "object" || f._schemaVersion !== 1) throw new PackError("rule-packs: unsupported _schemaVersion");
  if (!Array.isArray(f.packs) || f.packs.length === 0) throw new PackError("rule-packs: no packs");
  const ids = new Set<string>();
  for (const p of f.packs) {
    for (const k of REQUIRED_TOP) if (!(k in p)) throw new PackError(`pack ${p?.id ?? "?"}: missing ${k}`);
    if (ids.has(p.id)) throw new PackError(`duplicate pack id ${p.id}`);
    ids.add(p.id);
    if (!Array.isArray(p.meetingTypes) || !p.meetingTypes.length) throw new PackError(`pack ${p.id}: no meetingTypes`);
    for (const k of ["quorum", "adjournedQuorum", "proxy", "electronicVoting", "minutesDeadlineDays", "recordRetentionYears"]) {
      if (!isLeaf(p[k])) throw new PackError(`pack ${p.id}: ${k} is not a {value,source,confidence} leaf`);
      if (typeof p[k].confidence !== "string") throw new PackError(`pack ${p.id}: ${k}.confidence`);
    }
    for (const m of p.meetingTypes) if (typeof m.type !== "string") throw new PackError(`pack ${p.id}: meeting type without name`);
  }
  return f.packs;
}

export type EventTypeId = "agm" | "sgm" | "monthly" | "committee" | "custom";
export interface EnginePack {
  id: string; name: string; jurisdiction: string;
  params: Record<string, Json | null>;
  options: Options;
  locked: Record<string, LockedOption>;
  /** notice days per event type from the research (null = research could not verify) */
  notice: Partial<Record<EventTypeId, { min: number | null; max: number | null }>>;
  confidence: "high" | "medium" | "low";
  needsLawyer: boolean;
  recommended: string[];
}

interface Derivation { params: Record<string, Json | null>; options: Options; locked: Record<string, LockedOption>; confidence: "high" | "medium" | "low"; recommended: string[] }
const SECRET_ELECTION = (src: string): LockedOption => ({ value: true, reason: src });

// Hand-derived from the research packs (docs/research/rule-packs.json). Values the research marks null/unclear are left null on purpose.
const DERIVED: Record<string, Derivation> = {
  "in-up-aoa": {
    confidence: "medium",
    params: { "quorum.basis": "weight", "quorum.percentBp": 3000, "adjourned.minHoursLater": 48, "adjourned.minFlats": 2, "majority.simple.basis": "cast", "majority.special.basis": "present" },
    options: { proxy_voting: null, weightage: true, quorum_check: true, secret_ballot: false },
    locked: {}, recommended: ["Quorum 30% of owners in person (model bye-law 12)", "Notice 2 to 7 days (bye-law 15)"],
  },
  "in-generic-rwa-societies-act-1860": {
    confidence: "low",
    params: {}, options: { proxy_voting: null, quorum_check: true }, locked: {},
    recommended: ["This pack has no default quorum, notice (AGM) or voting rule: enter your society's bye-law values"],
  },
  "in-mh-coop-society": {
    confidence: "medium",
    params: { "quorum.basis": "flats", "quorum.percentBp": 6666, "quorum.capFlats": 20, "adjourned.noQuorum": true, "majority.simple.basis": "cast", "tie.break": "chair_casting_vote", "minutes.deadlineDays": 90 },
    options: { proxy_voting: false, weightage: false, quorum_check: true, secret_ballot: false },
    locked: {
      proxy_voting: { value: false, reason: "Maharashtra Election Rules r.33 and bye-law 105: no proxy may vote" },
      weightage: { value: false, reason: "One member, one vote regardless of flat size (bye-law 107)" },
    },
    recommended: ["Two-thirds of members or 20, whichever is less (bye-law 102)", "AGM notice 14 days, SGM 5 days"],
  },
  "us-hoa-generic": {
    confidence: "low",
    params: { "quorum.basis": "weight", "quorum.percentBp": 2000, "quorum.strict": true },
    options: { proxy_voting: null, weightage: true, quorum_check: true }, locked: {},
    recommended: ["Defaults only: your governing documents and state law override"],
  },
  "us-ca": {
    confidence: "medium",
    params: { "minutes.deadlineDays": 30, "retention.years": 1 },
    options: { proxy_voting: null, quorum_check: true },
    locked: { secret_ballot: SECRET_ELECTION("California Civil Code 5100: secret ballot for director elections") },
    recommended: ["Quorum only if your documents say so (default one-third of voting power)"],
  },
  "us-fl": {
    confidence: "medium",
    params: { "quorum.basis": "weight", "quorum.percentBp": 3000 },
    options: { proxy_voting: true, quorum_check: true }, locked: {},
    recommended: ["Quorum 30% of voting interests unless the bylaws set lower", "Proxy dated, valid for that meeting, expires after 90 days"],
  },
  "us-tx": {
    confidence: "medium",
    params: {},
    options: { proxy_voting: true, quorum_check: true }, locked: {},
    recommended: ["Quorum is set by your documents: enter it"],
  },
};

const TYPE_WORDS: Array<[EventTypeId, RegExp]> = [
  ["agm", /annual|\bagm\b/i], ["sgm", /special|extraordinary|\bsgm\b/i], ["committee", /board|committee/i],
];
function noticeOf(mt: Record<string, any>): { min: number | null; max: number | null } {
  const v = mt.noticeDays && isLeaf(mt.noticeDays) ? mt.noticeDays.value : null;
  if (typeof v === "number") return { min: v, max: null };
  if (v && typeof v === "object" && typeof (v as any).min === "number") return { min: (v as any).min, max: typeof (v as any).max === "number" ? (v as any).max : null };
  return { min: null, max: null };
}

export function derivePack(r: ResearchPack): EnginePack {
  const d = DERIVED[r.id];
  if (!d) throw new PackError(`no derivation for pack ${r.id}`);
  const notice: EnginePack["notice"] = {};
  for (const mt of r.meetingTypes) {
    if (/redevelopment|first|registrar|newly/i.test(mt.type)) continue;
    const hit = TYPE_WORDS.find(([, re]) => re.test(mt.type));
    if (hit && !notice[hit[0]]) notice[hit[0]] = noticeOf(mt);
  }
  if (notice.committee && !notice.monthly) notice.monthly = notice.committee;
  const options: Options = {};
  for (const o of OPTIONS) options[o.key] = o.key in d.options ? (d.options[o.key] as boolean | null) : o.default;
  for (const [k, l] of Object.entries(d.locked)) options[k] = l.value;
  const leaves = [r.quorum, r.proxy, r.electronicVoting].filter(isLeaf);
  return {
    id: r.id, name: r.name, jurisdiction: r.jurisdiction, params: d.params, options, locked: d.locked, notice,
    confidence: d.confidence, needsLawyer: leaves.some((l) => l.needsLawyer) || d.confidence !== "high", recommended: d.recommended,
  };
}

export function loadEnginePacks(json: unknown): Map<string, EnginePack> {
  const m = new Map<string, EnginePack>();
  for (const r of loadResearchPacks(json)) m.set(r.id, derivePack(r));
  return m;
}

/** Builds the RuleSet for a new event: pack defaults; election kinds get a secret ballot by default (A8). */
export function newRuleSet(pack: EnginePack, kind: "meeting" | "election", eventType: EventTypeId): RuleSet {
  let rs: RuleSet = { packId: pack.id, params: { ...pack.params }, options: { ...pack.options }, locked: { ...pack.locked } };
  const n = pack.notice[eventType] ?? (kind === "election" ? pack.notice.sgm : undefined);
  rs = setParamRaw(rs, "notice.minDays", n?.min ?? null);
  rs = setParamRaw(rs, "notice.maxDays", n?.max ?? null);
  if (kind === "election" && !pack.locked.secret_ballot) rs = { ...rs, options: { ...rs.options, secret_ballot: true } };
  if (kind === "election") rs = { ...rs, options: { ...rs.options, open_vote_by_flat: false } };
  return rs;
}
const setParamRaw = (rs: RuleSet, id: string, v: Json | null): RuleSet => (v === null ? { ...rs, params: { ...rs.params, [id]: null } } : setParam(rs, id, v));

/** "Use recommended settings": every undecided option takes the safe default (no proxy); required numbers stay unset if the law pack has none. */
export function applyRecommended(rs: RuleSet): RuleSet {
  let out = rs;
  for (const o of OPTIONS) if (out.options[o.key] === null || out.options[o.key] === undefined) out = setOption(out, o.key, o.default ?? false);
  return out;
}

/** Days between notice date and meeting date (whole days, UTC calendar days) and whether the pack's minimum is met. */
export function checkNotice(rs: RuleSet, noticeMs: number, meetingMs: number): { givenDays: number; minDays: number | null; maxDays: number | null; met: boolean | null } {
  const day = 86_400_000;
  const given = Math.floor(meetingMs / day) - Math.floor(noticeMs / day);
  const min = (rs.params["notice.minDays"] as number | null) ?? null, max = (rs.params["notice.maxDays"] as number | null) ?? null;
  if (min === null) return { givenDays: given, minDays: null, maxDays: max, met: null };
  return { givenDays: given, minDays: min, maxDays: max, met: given >= min && (max === null || given <= max) };
}

// ---------------------------------------------------------------------------------------------------------------------
// Worldwide use: any society, any country. A pack is just data. The built-in "custom-world" pack has NO legal defaults:
// the society enters the values of its own bye-laws / governing documents, and the engine refuses to start until required ones are set.
// Further packs (a country, a state, one society's own bye-laws) can be supplied as JSON and validated with parseCustomPack().
// ---------------------------------------------------------------------------------------------------------------------
export interface CustomPackDef {
  id: string; name: string; jurisdiction: string;
  params?: Record<string, Json | null>; options?: Record<string, boolean | null>;
  locked?: Record<string, LockedOption>;
  notice?: EnginePack["notice"]; recommended?: string[];
}
const ID_RE = /^[a-z0-9][a-z0-9-]{2,60}$/;
export function parseCustomPack(def: CustomPackDef): EnginePack {
  if (!def || !ID_RE.test(def.id ?? "")) throw new PackError("custom pack: id must be lower-case letters, digits and hyphens");
  if (!def.name || !def.jurisdiction) throw new PackError("custom pack: name and jurisdiction are required");
  const optionKeys = new Set(OPTIONS.map((o) => o.key));
  const options: Options = {};
  for (const o of OPTIONS) options[o.key] = o.default;
  for (const [k, v] of Object.entries(def.options ?? {})) { if (!optionKeys.has(k)) throw new PackError(`custom pack: unknown option ${k}`); options[k] = v; }
  const locked = def.locked ?? {};
  for (const [k, l] of Object.entries(locked)) { if (!optionKeys.has(k)) throw new PackError(`custom pack: unknown locked option ${k}`); if (!l.reason) throw new PackError(`custom pack: locked ${k} needs a reason`); options[k] = l.value; }
  // parameters are validated through the same rule used when an Organizer sets them
  let rs: RuleSet = { packId: def.id, params: {}, options: {}, locked: {} };
  for (const [k, v] of Object.entries(def.params ?? {})) rs = setParamRaw(rs, k, v);
  return { id: def.id, name: def.name, jurisdiction: def.jurisdiction, params: rs.params, options, locked, notice: def.notice ?? {}, confidence: "low", needsLawyer: true, recommended: def.recommended ?? [] };
}

export const CUSTOM_WORLD_PACK: EnginePack = parseCustomPack({
  id: "custom-world", name: "Any country: enter your own bye-law values", jurisdiction: "ANY",
  options: { proxy_voting: null, quorum_check: true },
  recommended: ["Open your bye-laws and copy the notice period, quorum and majority rules into the steps that follow"],
});

/** Research-derived packs plus the worldwide custom pack, plus any extra packs supplied by the deployer. */
export function loadAllPacks(researchJson: unknown, extra: CustomPackDef[] = []): Map<string, EnginePack> {
  const m = loadEnginePacks(researchJson);
  m.set(CUSTOM_WORLD_PACK.id, CUSTOM_WORLD_PACK);
  for (const d of extra) { const p = parseCustomPack(d); if (m.has(p.id)) throw new PackError(`duplicate pack id ${p.id}`); m.set(p.id, p); }
  return m;
}

// Quorum, majority, weightage, ballot validation, tallies. Integer arithmetic only: weights are integers, percentages are basis points.
import type { RuleSet } from "./rules";
import type { BallotDesign, EventFormat } from "./ballot";

export interface Flat { flatNo: string; weight: number; eligible: boolean }
export type MajorityClass = "simple" | "two_thirds" | "three_quarters" | { num: number; den: number; strict?: boolean };

export function fractionOf(c: MajorityClass): { num: number; den: number; strict: boolean } {
  if (c === "simple") return { num: 1, den: 2, strict: true };
  if (c === "two_thirds") return { num: 2, den: 3, strict: false };
  if (c === "three_quarters") return { num: 3, den: 4, strict: false };
  if (!Number.isInteger(c.num) || !Number.isInteger(c.den) || c.den <= 0 || c.num <= 0 || c.num > c.den) throw new Error("bad custom majority");
  return { num: c.num, den: c.den, strict: !!c.strict };
}
export const parseMajority = (s: string): MajorityClass => {
  if (s === "simple" || s === "two_thirds" || s === "three_quarters") return s;
  const m = /^(\d+)\/(\d+)(s?)$/.exec(s); // custom e.g. "3/5" or "1/2s"
  if (!m) throw new Error("bad majority class " + s);
  return { num: +m[1]!, den: +m[2]!, strict: m[3] === "s" };
};

/** Voting weight of a flat under the chosen weightage: without the weightage option every flat counts 1. */
export const effectiveWeight = (f: Flat, weighted: boolean): number => (weighted ? f.weight : 1);
export const votingFlats = (flats: Flat[]) => flats.filter((f) => f.eligible);

/** basis-point share a/b, rounded down. */
export const bp = (a: number, b: number): number => (b <= 0 ? 0 : Math.floor((a * 10000) / b));
export const percentText = (bpv: number): string => `${Math.floor(bpv / 100)}.${String(bpv % 100).padStart(2, "0")}%`;

export interface QuorumResult { enabled: boolean; basis: "weight" | "flats" | null; total: number; present: number; required: number; met: boolean; presentFlats: number; totalFlats: number }
export function computeQuorum(rs: RuleSet, flats: Flat[], presentFlatNos: Iterable<string>): QuorumResult {
  const weighted = !!rs.options.weightage;
  const vf = votingFlats(flats);
  const present = new Set(presentFlatNos);
  const here = vf.filter((f) => present.has(f.flatNo));
  const totalFlats = vf.length, presentFlats = here.length;
  if (!rs.options.quorum_check) return { enabled: false, basis: null, total: 0, present: 0, required: 0, met: true, presentFlats, totalFlats };
  const basis = rs.params["quorum.basis"] as "weight" | "flats" | null, pct = rs.params["quorum.percentBp"] as number | null;
  if (!basis || !pct) throw new Error("quorum rule is not set");
  const total = basis === "flats" ? totalFlats : vf.reduce((s, f) => s + effectiveWeight(f, weighted), 0);
  const got = basis === "flats" ? presentFlats : here.reduce((s, f) => s + effectiveWeight(f, weighted), 0);
  let required = Math.ceil((total * pct) / 10000);
  const strict = rs.params["quorum.strict"] === true;
  if (strict && required * 10000 === total * pct) required += 1; // "more than"
  const cap = rs.params["quorum.capFlats"] as number | null;
  if (basis === "flats" && cap) required = Math.min(required, cap);
  return { enabled: true, basis, total, present: got, required, met: got >= required, presentFlats, totalFlats };
}

/** Adjourned meeting: no quorum, or a minimum number of flats. */
export function adjournedQuorumMet(rs: RuleSet, presentFlats: number): boolean {
  if (rs.params["adjourned.noQuorum"] === true) return true;
  const min = rs.params["adjourned.minFlats"] as number | null;
  return min === null || min === undefined ? false : presentFlats >= min;
}

// ---- ballots ----
export interface PointDef {
  pointId: string; kind: "discussion" | "resolution" | "election_post"; options: string[]; maxChoices: number; majorityClass: string; secret: boolean;
  /** option id -> text shown on the ballot (candidate names, "Yes", ...). Ids are unique; labels may repeat only by mistake. */
  labels?: Record<string, string>;
  /** least number of ticks a ballot must have (0 = a blank ballot is allowed). Default 1. */
  minChoices?: number;
  format?: EventFormat; seats?: string[]; topN?: number | null; design?: BallotDesign;
}
export type BallotCheck = { ok: true; choices: string[] } | { ok: false; reason: "not_votable" | "no_choice" | "too_few" | "too_many" | "duplicate" | "unknown_option" | "bad_shape" };
export function validateBallot(p: PointDef, choices: unknown): BallotCheck {
  if (p.kind === "discussion") return { ok: false, reason: "not_votable" };
  if (!Array.isArray(choices) || choices.some((c) => typeof c !== "string")) return { ok: false, reason: "bad_shape" };
  const c = choices as string[];
  const min = p.minChoices ?? 1;
  if (c.length === 0 && min >= 1) return { ok: false, reason: "no_choice" };
  if (c.length < min) return { ok: false, reason: "too_few" };
  if (new Set(c).size !== c.length) return { ok: false, reason: "duplicate" };
  if (c.length > p.maxChoices) return { ok: false, reason: "too_many" };
  if (c.some((x) => !p.options.includes(x))) return { ok: false, reason: "unknown_option" };
  return { ok: true, choices: c.slice().sort() };
}

export interface BallotRow { choices: string[]; weight: number; kind?: "official" | "proxy" }
export interface OptionTally { option: string; weight: number; count: number; percentBp: number; /** ballots on which this box was NOT ticked ("no") */ notSelected: number }
export interface RankRow { option: string; weight: number; count: number; rank: number; tied: boolean }
export interface Assignment {
  format: "ranked_posts" | "top_n";
  seats: Array<{ seat: string; option: string | null; weight: number; tied: boolean }> | null;
  selected: string[] | null; tieAtCutoff: boolean; needsReturningOfficer: boolean;
}
/** Aggregated ballots: all that is ever published for a secret point (no per-ballot weights, so a unique weight cannot reveal a flat). */
export interface Aggregate { n: number; castWeight: number; perOption: Record<string, { weight: number; count: number }>; split: { official: Record<string, number>; proxy: Record<string, number> } | null }
export interface PointTally {
  pointId: string; kind: PointDef["kind"]; ballots: number; castWeight: number; presentWeight: number; totalWeight: number;
  options: OptionTally[]; turnoutBp: number;
  outcome: "carried" | "not_carried" | "tie" | "counted";
  majority: { num: number; den: number; strict: boolean; basis: string; base: number } | null;
  leaders: string[] | null;
  ranking: RankRow[] | null; assignment: Assignment | null;
  split: { official: Record<string, number>; proxy: Record<string, number> } | null;
}

export function aggregate(p: PointDef, ballots: BallotRow[], rs: RuleSet): Aggregate {
  const per: Aggregate["perOption"] = {};
  for (const o of p.options) per[o] = { weight: 0, count: 0 };
  let cast = 0;
  for (const b of ballots) { cast += b.weight; for (const c of b.choices) { const e = (per[c] ??= { weight: 0, count: 0 }); e.weight += b.weight; e.count += 1; } }
  // small-cell rule: official/proxy split only when each side meets the threshold
  const thr = (rs.params["smallCell.threshold"] as number) ?? 5;
  let split: Aggregate["split"] = null;
  const proxies = ballots.filter((b) => b.kind === "proxy");
  if (proxies.length && proxies.length >= thr && ballots.length - proxies.length >= thr) {
    const official: Record<string, number> = {}, proxy: Record<string, number> = {};
    for (const b of ballots) for (const c of b.choices) { const t = b.kind === "proxy" ? proxy : official; t[c] = (t[c] ?? 0) + b.weight; }
    split = { official, proxy };
  }
  return { n: ballots.length, castWeight: cast, perOption: per, split };
}

/** Tallies one point from aggregates. Elections never name a winner unless the pack parameter says so. */
export function tallyAgg(p: PointDef, agg: Aggregate, rs: RuleSet, presentWeight: number, totalWeight: number): PointTally {
  const options = p.options.map((o) => ({ option: o, weight: agg.perOption[o]?.weight ?? 0, count: agg.perOption[o]?.count ?? 0, percentBp: bp(agg.perOption[o]?.weight ?? 0, agg.castWeight), notSelected: agg.n - (agg.perOption[o]?.count ?? 0) }));
  const base = { pointId: p.pointId, kind: p.kind, ballots: agg.n, castWeight: agg.castWeight, presentWeight, totalWeight, options, turnoutBp: bp(agg.castWeight, presentWeight || totalWeight) };
  const split = agg.split;
  if (p.kind === "election_post") {
    const cand = options.filter((o) => o.option !== "abstain").slice().sort((a, b) => b.weight - a.weight || (a.option < b.option ? -1 : 1));
    const ranking: RankRow[] = cand.map((o, i) => {
      const same = (j: number) => j >= 0 && j < cand.length && cand[j]!.weight === o.weight;
      return { option: o.option, weight: o.weight, count: o.count, rank: i > 0 && same(i - 1) ? cand.slice(0, i).filter((x) => x.weight > o.weight).length + 1 : i + 1, tied: same(i - 1) || same(i + 1) };
    });
    let assignment: Assignment | null = null;
    if (agg.castWeight > 0 && p.format === "ranked_posts" && p.seats?.length) {
      const seats = p.seats.map((seat, i) => ({ seat, option: ranking[i]?.option ?? null, weight: ranking[i]?.weight ?? 0, tied: ranking[i]?.tied ?? false }));
      assignment = { format: "ranked_posts", seats, selected: null, tieAtCutoff: false, needsReturningOfficer: seats.some((x) => x.tied) };
    } else if (agg.castWeight > 0 && p.format === "top_n" && p.topN) {
      const n = p.topN, tieAtCutoff = ranking.length > n && ranking[n - 1]!.weight === ranking[n]!.weight;
      assignment = { format: "top_n", seats: null, selected: ranking.slice(0, n).map((r) => r.option), tieAtCutoff, needsReturningOfficer: tieAtCutoff };
    }
    let leaders: string[] | null = null;
    if (rs.params["election.declareWinner"] === true) {
      const ranked = options.filter((o) => o.option !== "abstain").sort((a, b) => b.weight - a.weight || (a.option < b.option ? -1 : 1));
      leaders = ranked.slice(0, p.maxChoices).map((o) => o.option);
    }
    return { ...base, outcome: "counted", majority: null, leaders, ranking, assignment, split };
  }
  if (p.kind === "discussion") return { ...base, outcome: "counted", majority: null, leaders: null, ranking: null, assignment: null, split };
  const f = fractionOf(parseMajority(p.majorityClass));
  const yes = agg.perOption["yes"]?.weight ?? 0, no = agg.perOption["no"]?.weight ?? 0, abs = agg.perOption["abstain"]?.weight ?? 0;
  const basisName = ((p.majorityClass === "simple" ? rs.params["majority.simple.basis"] : rs.params["majority.special.basis"]) as string | null) ?? "cast";
  const absIn = rs.params["abstain.inBase"] === true;
  const baseW = basisName === "total" ? totalWeight : basisName === "present" ? presentWeight : yes + no + (absIn ? abs : 0);
  const lhs = yes * f.den, rhs = baseW * f.num;
  let outcome: PointTally["outcome"];
  if (f.den === 2 && f.num === 1 && yes === no && baseW > 0 && basisName === "cast") outcome = rs.params["tie.break"] && rs.params["tie.break"] !== "none" ? "tie" : "not_carried";
  else outcome = (f.strict ? lhs > rhs : lhs >= rhs) && yes > 0 ? "carried" : "not_carried";
  return { ...base, outcome, majority: { num: f.num, den: f.den, strict: f.strict, basis: basisName, base: baseW }, leaders: null, ranking: null, assignment: null, split };
}
export const tallyPoint = (p: PointDef, ballots: BallotRow[], rs: RuleSet, presentWeight: number, totalWeight: number): PointTally =>
  tallyAgg(p, aggregate(p, ballots, rs), rs, presentWeight, totalWeight);

/** Weights that appear only once among eligible flats identify one flat: a weighted secret ballot is not anonymous for those flats. */
export function anonymitySets(flats: Flat[]): { weight: number; flats: number }[] {
  const m = new Map<number, number>();
  for (const f of votingFlats(flats)) m.set(f.weight, (m.get(f.weight) ?? 0) + 1);
  return [...m.entries()].map(([weight, n]) => ({ weight, flats: n })).sort((a, b) => a.flats - b.flats || a.weight - b.weight);
}
export const smallestAnonymitySet = (flats: Flat[]): number => anonymitySets(flats)[0]?.flats ?? 0;

/** Proxy rule check: allowed at all, and the holder's limit. */
export function proxyAllowed(rs: RuleSet, holderExistingProxies: number): { ok: boolean; reason?: "proxy_off" | "holder_limit" } {
  if (rs.options.proxy_voting !== true) return { ok: false, reason: "proxy_off" };
  const max = (rs.params["proxy.maxPerHolder"] as number) ?? 1;
  return holderExistingProxies >= max ? { ok: false, reason: "holder_limit" } : { ok: true };
}

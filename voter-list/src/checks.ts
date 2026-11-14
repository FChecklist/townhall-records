// The checks: the whole rule book in one pure function. Errors stop a publish; warnings do not (they need one tick).
// Also computes who may vote, weights and shares, and the fingerprint of a list. No I/O here, so it is tested exhaustively.
import { canonical } from "./vendor/canonical";
import { sha256Hex } from "./vendor/crypto";
import { maskPhone } from "./vendor/masking";
import { EQUAL_WEIGHT, ruleOf, type ListRow, type Settings } from "./model";
import { cleanEmail, cleanMobile, editDistance, nameKey } from "./text";

export type Severity = "error" | "warning";
export interface Issue {
  key: string;
  code: string;
  severity: Severity;
  unit: string;
  rowIds: number[];
  message: string;
  hint?: string;
  /** an action the application can offer as one button */
  fix?: { type: "remove_rows"; rowIds: number[] } | { type: "set_voter"; rowId: number };
}

export interface UnitResult {
  unit: string;
  unitKey: string;
  rows: ListRow[];
  voter: ListRow | null;
  weightMilli: number;
  canAttend: boolean;
  canVote: boolean;
  why: string[];
  duesClear: boolean;
}

export interface Summary {
  rows: number;
  units: number;
  voters: number; // units with exactly one voter named
  canVote: number; // units whose voter may vote under the rule, dues check and unit settings
  cannotVote: number;
  totalWeightMilli: number; // of the units that may vote
  allWeightMilli: number; // of every unit
  duesPending: number;
}
export interface CheckReport { issues: Issue[]; errors: number; warnings: number; byCode: Record<string, number>; summary: Summary; units: UnitResult[]; canPublish: boolean }

const MAX_PER_CODE = 400; // a 6000-row sheet with one wrong column must not produce 6000 lines of text

function dupKey(r: ListRow): string { return `${r.unitKey}|${nameKey(r.name)}|${r.mobile}|${r.email}`; }

export function runChecks(rows: ListRow[], s: Settings): CheckReport {
  const issues: Issue[] = []; const per: Record<string, number> = {};
  const add = (i: Omit<Issue, "key">) => { per[i.code] = (per[i.code] ?? 0) + 1; if (per[i.code]! <= MAX_PER_CODE) issues.push({ ...i, key: `${i.code}:${i.rowIds[0] ?? i.unit}` }); };
  const rule = ruleOf(s.ruleCode);
  const nonEmpty = rows.filter((r) => r.unitKey);

  if (!rows.length) add({ code: "E_EMPTY_LIST", severity: "error", unit: "", rowIds: [], message: "The list has no people yet. Share the voter link, or upload a list, and approve at least one record first." });
  if (s.duesEnabled && !s.duesCutoff) add({ code: "E_DUES_CUTOFF_MISSING", severity: "error", unit: "", rowIds: [], message: "The dues check is on but no cut-off date is chosen.", hint: "Pick the cut-off date, or switch the dues check off." });

  // ---- row level
  const seenDup = new Map<string, number>();
  for (const r of rows) {
    const here = r.unit ? `Unit ${r.unit}` : `Row ${r.rowNo}`;
    if (!r.unitKey) { add({ code: "E_EMPTY_UNIT", severity: "error", unit: "", rowIds: [r.id], message: `Row ${r.rowNo}${r.name ? " (" + shortName(r.name) + ")" : ""} has no Flat / House / Member ID.`, hint: "Type the ID, or delete the row." }); continue; }
    if (!r.name.trim()) add({ code: "E_NAME_MISSING", severity: "error", unit: r.unit, rowIds: [r.id], message: `${here}: the name is missing.` });
    const m = cleanMobile(r.mobile, s.country);
    if (!r.mobile.trim()) add({ code: "E_MOBILE_MISSING", severity: "error", unit: r.unit, rowIds: [r.id], message: `${here}: the mobile number is missing.` });
    else if (!m.ok) add({ code: "E_MOBILE_BAD", severity: "error", unit: r.unit, rowIds: [r.id], message: `${here}: the mobile number does not look right.`, hint: m.problem });
    const e = cleanEmail(r.email);
    if (!r.email.trim()) add({ code: "E_EMAIL_MISSING", severity: "error", unit: r.unit, rowIds: [r.id], message: `${here}: the e-mail ID is missing.` });
    else if (!e.ok) add({ code: "E_EMAIL_BAD", severity: "error", unit: r.unit, rowIds: [r.id], message: `${here}: the e-mail ID does not look right.`, hint: e.problem });
    if (!r.capacity) add({ code: "E_CAPACITY_BAD", severity: "error", unit: r.unit, rowIds: [r.id], message: `${here}: the capacity is blank. Choose Owner, Co-owner, Tenant or Member.`, hint: "The voting rule needs to know who this person is." });
    const dk = dupKey(r);
    if (seenDup.has(dk)) add({ code: "E_DUP_ROW", severity: "error", unit: r.unit, rowIds: [r.id], message: `${here}: this line repeats row ${seenDup.get(dk)} exactly.`, hint: "Delete the repeated line.", fix: { type: "remove_rows", rowIds: [r.id] } });
    else seenDup.set(dk, r.rowNo);
  }

  // ---- unit level
  const byUnit = new Map<string, ListRow[]>();
  for (const r of nonEmpty) { const a = byUnit.get(r.unitKey); if (a) a.push(r); else byUnit.set(r.unitKey, [r]); }
  const units: UnitResult[] = [];
  for (const [key, rs] of byUnit) {
    const unit = rs[0]!.unit;
    const marked = rs.filter((r) => r.isVoter === true);
    let voter: ListRow | null = null;
    if (rs.length === 1) { voter = rs[0]!.isVoter === false ? null : rs[0]!; if (!voter) add({ code: "E_NO_VOTER", severity: "error", unit, rowIds: [rs[0]!.id], message: `Unit ${unit}: its only person is marked as not the voter, so the unit has no voter.`, hint: "Mark the person as the voter.", fix: { type: "set_voter", rowId: rs[0]!.id } }); }
    else if (marked.length === 1) voter = marked[0]!;
    else if (marked.length === 0) add({ code: "E_NO_VOTER", severity: "error", unit, rowIds: rs.map((r) => r.id), message: `Unit ${unit} has ${rs.length} people and none is marked as the voter.`, hint: "Choose the one voter for this unit." });
    else add({ code: "E_TWO_VOTERS", severity: "error", unit, rowIds: marked.map((r) => r.id), message: `Unit ${unit} has ${marked.length} people marked as the voter. A unit has one voter.`, hint: "Keep Yes for one person only." });

    // weight of the unit
    let weight = EQUAL_WEIGHT;
    const given = [...new Set(rs.map((r) => r.weightMilli).filter((x): x is number => x !== null))];
    if (s.weightMode === "unequal") {
      if (given.length > 1) add({ code: "E_WEIGHT_CONFLICT", severity: "error", unit, rowIds: rs.map((r) => r.id), message: `Unit ${unit}: its lines carry different weights (${given.map(fmtMilli).join(", ")}). A unit has one weight.` });
      else if (given.length === 1) weight = given[0]!;
      else add({ code: "W_WEIGHT_DEFAULTED", severity: "warning", unit, rowIds: [rs[0]!.id], message: `Unit ${unit}: no weight was given, so it counts as 1.` });
    } else if (given.some((w) => w !== EQUAL_WEIGHT)) add({ code: "W_WEIGHT_IGNORED", severity: "warning", unit, rowIds: rs.map((r) => r.id), message: `Unit ${unit} carries a weight other than 1, but the society chose equal weight, so it counts as 1.`, hint: "Choose 'Unequal' in Weightage if the weights should count." });

    // rights
    const why: string[] = [];
    let canVote = true, canAttend = true, duesClear = true;
    if (!voter) { canVote = false; why.push("no voter"); }
    else {
      canAttend = voter.canAttend;
      if (!voter.canVote) { canVote = false; why.push("set to not vote"); }
      if (voter.capacity && !rule.capacities.includes(voter.capacity)) {
        if (voter.canVote) {
          const alt = rs.find((r) => r.id !== voter!.id && r.capacity && rule.capacities.includes(r.capacity));
          add({ code: "E_VOTER_INELIGIBLE", severity: "error", unit, rowIds: [voter.id], message: `Unit ${unit}: the voter is a ${voter.capacity.toLowerCase()}, and the rule "${rule.name}" does not allow that.`,
            hint: alt ? `Make ${shortName(alt.name)} (${alt.capacity!.toLowerCase()}) the voter, or set "Allowed to vote" to No for this unit.` : `Set "Allowed to vote" to No for this unit, or change the rule.`, ...(alt ? { fix: { type: "set_voter" as const, rowId: alt.id } } : {}) });
        }
        canVote = false; why.push("rule");
      }
      if (s.duesEnabled && s.duesCutoff) {
        const date = voter.duesPaidOn ?? rs.map((r) => r.duesPaidOn).filter(Boolean).sort().pop() ?? null;
        duesClear = !!date && date <= s.duesCutoff;
        if (!duesClear) { canVote = false; why.push("dues"); }
      }
    }
    units.push({ unit, unitKey: key, rows: rs, voter, weightMilli: weight, canAttend: canAttend && !!voter, canVote, why, duesClear });
  }

  // ---- across units (warnings)
  const mobileUnits = new Map<string, Set<string>>();
  for (const u of units) if (u.voter && cleanMobile(u.voter.mobile, s.country).ok) { const k = u.voter.mobile; const a = mobileUnits.get(k) ?? new Set<string>(); a.add(u.unit); mobileUnits.set(k, a); }
  for (const [mob, us] of mobileUnits) if (us.size > 1) add({ code: "W_SAME_MOBILE", severity: "warning", unit: [...us][0]!, rowIds: units.filter((u) => us.has(u.unit)).map((u) => u.voter!.id), message: `The mobile number ending ${maskPhone(mob).slice(-4)} is the voter for ${us.size} units (${[...us].slice(0, 6).join(", ")}): one person would hold ${us.size} votes.`, hint: "Please confirm this is right." });
  const nameUnits = new Map<string, Set<string>>();
  for (const u of units) if (u.voter && u.voter.name.trim()) { const k = nameKey(u.voter.name); const a = nameUnits.get(k) ?? new Set<string>(); a.add(u.unit); nameUnits.set(k, a); }
  for (const [, us] of nameUnits) if (us.size > 1) add({ code: "W_DUP_NAME", severity: "warning", unit: [...us][0]!, rowIds: units.filter((u) => us.has(u.unit)).map((u) => u.voter!.id), message: `The same voter name appears for ${us.size} units (${[...us].slice(0, 6).join(", ")}). Different people can share a name; please glance at it.` });
  for (const u of units) {
    const rs = u.rows; if (rs.length < 2) continue;
    outer: for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
      const a = nameKey(rs[i]!.name), b = nameKey(rs[j]!.name);
      if (a && b && editDistance(a, b, 2) <= 1 && dupKey(rs[i]!) !== dupKey(rs[j]!)) {
        add({ code: "W_NEAR_DUP", severity: "warning", unit: u.unit, rowIds: [rs[i]!.id, rs[j]!.id], message: `Unit ${u.unit}: two lines look like the same person (${shortName(rs[i]!.name)} and ${shortName(rs[j]!.name)}).` }); break outer;
      }
    }
  }

  const duesPending = s.duesEnabled ? units.filter((u) => !u.duesClear).length : 0;
  const summary: Summary = {
    rows: rows.length, units: units.length, voters: units.filter((u) => u.voter).length,
    canVote: units.filter((u) => u.canVote).length, cannotVote: units.filter((u) => !u.canVote).length,
    totalWeightMilli: units.filter((u) => u.canVote).reduce((a, u) => a + u.weightMilli, 0), allWeightMilli: units.reduce((a, u) => a + u.weightMilli, 0), duesPending,
  };
  const errors = Object.entries(per).filter(([c]) => c.startsWith("E_")).reduce((a, [, n]) => a + n, 0);
  const warnings = Object.entries(per).filter(([c]) => c.startsWith("W_")).reduce((a, [, n]) => a + n, 0);
  issues.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "error" ? -1 : 1) || a.code.localeCompare(b.code));
  return { issues, errors, warnings, byCode: per, summary, units, canPublish: errors === 0 && rows.length > 0 };
}

export const shortName = (n: string) => (n.length > 24 ? n.slice(0, 22) + "..." : n);
export const fmtMilli = (m: number) => { const s = (m / 1000).toFixed(3).replace(/\.?0+$/, ""); return s; };

/** Percent shares of the units' weights, to three decimals, summing within rounding. */
export function shares(weights: number[]): { total: number; pct: number[] } {
  const total = weights.reduce((a, b) => a + b, 0);
  return { total, pct: weights.map((w) => (total ? Math.round((w / total) * 100000) / 1000 : 0)) };
}

/** What the list says, in one fixed shape. Two lists with the same fingerprint are the same list. */
export async function fingerprint(rows: ListRow[], s: Settings): Promise<string> {
  const body = [...rows].sort((a, b) => a.rowNo - b.rowNo).map((r) => [r.unit, r.name, r.capacity ?? "", r.mobile, r.email, r.isVoter === null ? -1 : r.isVoter ? 1 : 0, r.weightMilli ?? 0, r.canAttend ? 1 : 0, r.canVote ? 1 : 0, r.duesPaidOn ?? ""]);
  return sha256Hex("voter-list/fingerprint/v1\n" + canonical({ rule: s.ruleCode, weights: s.weightMode, dues: s.duesEnabled ? s.duesCutoff ?? "" : "", rows: body as never }));
}
export const shortFingerprint = (h: string) => h.slice(0, 16).toUpperCase().replace(/(.{4})/g, "$1-").replace(/-$/, "");

/** A person-friendly diff between two row sets (by unit). */
export interface RowDiff { added: string[]; removed: string[]; changed: Array<{ unit: string; fields: string[] }>; same: number }
export function diffLists(before: ListRow[], after: ListRow[]): RowDiff {
  const sig = (r: ListRow) => ({ name: r.name, capacity: r.capacity ?? "", mobile: r.mobile, email: r.email, voter: r.isVoter ? "yes" : "no", weight: String(r.weightMilli ?? ""), vote: r.canVote ? "yes" : "no", attend: r.canAttend ? "yes" : "no" });
  const group = (rows: ListRow[]) => { const m = new Map<string, ListRow[]>(); for (const r of rows) { const a = m.get(r.unitKey) ?? []; a.push(r); m.set(r.unitKey, a); } return m; };
  const A = group(before), B = group(after); const d: RowDiff = { added: [], removed: [], changed: [], same: 0 };
  for (const [k, rs] of B) {
    const old = A.get(k); if (!old) { d.added.push(rs[0]!.unit); continue; }
    const fields = new Set<string>();
    const key = (r: ListRow) => nameKey(r.name) + "|" + r.mobile;
    const oldBy = new Map(old.map((r) => [key(r), r])), newBy = new Map(rs.map((r) => [key(r), r]));
    for (const [kk, r] of newBy) { const o = oldBy.get(kk); if (!o) { fields.add("people"); continue; } const a = sig(o), b = sig(r); for (const f of Object.keys(a) as (keyof typeof a)[]) if (a[f] !== b[f]) fields.add(f); }
    for (const kk of oldBy.keys()) if (!newBy.has(kk)) fields.add("people");
    if (fields.size) d.changed.push({ unit: rs[0]!.unit, fields: [...fields] }); else d.same++;
  }
  for (const [k, rs] of A) if (!B.has(k)) d.removed.push(rs[0]!.unit);
  return d;
}

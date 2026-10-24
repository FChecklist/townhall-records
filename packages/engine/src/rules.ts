// Rule parameters and option checkboxes (Amendment A2). A "RuleSet" is the resolved rules of one event: pack defaults <- organizer choices,
// with options the law locks (ticked/unticked and locked with a one-line reason) that nobody can change.
import type { Json } from "./canonical";

export type ParamType = "int" | "bool" | "enum";
export interface ParamDef {
  id: string; label: string; type: ParamType; help: string;
  min?: number; max?: number; enumValues?: string[];
  /** true = an event cannot start while this is unset (null) — but only when `requiredWhen` is satisfied. */
  required?: boolean; requiredWhen?: (o: Options) => boolean;
  default: Json | null;
}
export type Options = Record<string, boolean | null>;

export const PARAMS: ParamDef[] = [
  { id: "notice.minDays", label: "Minimum notice (days)", type: "int", min: 0, max: 365, required: true, default: null, help: "Days of notice the rules require before the meeting." },
  { id: "notice.maxDays", label: "Maximum notice (days)", type: "int", min: 0, max: 365, default: null, help: "Some rules cap how early notice may go out." },
  { id: "quorum.basis", label: "Quorum counted by", type: "enum", enumValues: ["weight", "flats"], required: true, requiredWhen: (o) => o.quorum_check === true, default: null, help: "Share of voting weight present, or number of flats present." },
  { id: "quorum.percentBp", label: "Quorum (basis points of total)", type: "int", min: 1, max: 10000, required: true, requiredWhen: (o) => o.quorum_check === true, default: null, help: "3000 = 30%." },
  { id: "quorum.strict", label: "Quorum must be MORE than the share", type: "bool", default: false, help: "Tick when the rule says 'more than'." },
  { id: "quorum.capFlats", label: "Quorum never needs more than (flats)", type: "int", min: 1, max: 100000, default: null, help: "For rules such as 'two-thirds or 20, whichever is less'." },
  { id: "adjourned.noQuorum", label: "Adjourned meeting needs no quorum", type: "bool", default: false, help: "" },
  { id: "adjourned.minFlats", label: "Adjourned meeting minimum flats", type: "int", min: 0, max: 100000, default: null, help: "" },
  { id: "adjourned.minHoursLater", label: "Adjourned meeting not earlier than (hours)", type: "int", min: 0, max: 24 * 60, default: null, help: "" },
  { id: "majority.simple.basis", label: "Simple majority counted on", type: "enum", enumValues: ["cast", "present", "total"], default: "cast", help: "cast = Yes+No; present = all present weight; total = all weight." },
  { id: "majority.special.basis", label: "Special majority counted on", type: "enum", enumValues: ["cast", "present", "total"], default: "cast", help: "" },
  { id: "tie.break", label: "Tie", type: "enum", enumValues: ["none", "chair_casting_vote", "lots"], default: "none", help: "none = not carried; otherwise the chair/lots settles it and is recorded." },
  { id: "abstain.inBase", label: "Abstentions count in the majority base", type: "bool", default: false, help: "" },
  { id: "window.maxExtensions", label: "Maximum voting-window extensions", type: "int", min: 0, max: 20, default: 2, help: "" },
  { id: "window.extensionMinutes", label: "Extension length (minutes)", type: "int", min: 5, max: 240, default: 30, help: "" },
  { id: "proxy.maxPerHolder", label: "Proxies one person may hold", type: "int", min: 1, max: 20, default: 1, help: "" },
  { id: "election.declareWinner", label: "Report names the leader(s) (pack permits)", type: "bool", default: false, help: "Default: numbers only. The returning officer / chair declares the result." },
  { id: "smallCell.threshold", label: "Hide official/proxy split below (votes)", type: "int", min: 0, max: 50, default: 5, help: "" },
  { id: "ballot.mode", label: "How ballots are issued", type: "enum", enumValues: ["online", "printed", "either"], default: "online", help: "online = on the voter's phone; printed = paper with its own QR code, photographed and counted by the system; either = the officer chooses per voter." },
  { id: "quorum.countProxies", label: "Proxies count towards the quorum", type: "bool", default: true, help: "Some rules count only members present in person." },
  { id: "nomination.days", label: "Nomination period (days)", type: "int", min: 0, max: 365, default: null, help: "Information shown on the report." },
  { id: "nomination.withdrawalDays", label: "Withdrawal of nomination (days before the vote)", type: "int", min: 0, max: 365, default: null, help: "Information shown on the report." },
  { id: "term.years", label: "Term of office (years)", type: "int", min: 0, max: 20, default: null, help: "Information shown on the report." },
  { id: "term.maxConsecutive", label: "Most consecutive terms one person may serve", type: "int", min: 0, max: 20, default: null, help: "Information shown on the report." },
  { id: "requisition.percentBp", label: "Share of members who can demand a special meeting (basis points)", type: "int", min: 0, max: 10000, default: null, help: "Information shown on the report." },
  { id: "notice.delivery", label: "How notice must be delivered", type: "enum", enumValues: ["any", "post", "email", "posting"], default: "any", help: "Information shown on the report." },
  { id: "reserved.seats", label: "Seats reserved by law (for example for women)", type: "int", min: 0, max: 100, default: null, help: "Information shown on the report." },
  { id: "minutes.deadlineDays", label: "Minutes deadline (days)", type: "int", min: 0, max: 365, default: null, help: "Information only." },
  { id: "retention.years", label: "Retention (years)", type: "int", min: 0, max: 100, default: null, help: "Information only." },
];
export const PARAM_BY_ID = new Map(PARAMS.map((p) => [p.id, p]));

export interface OptionDef { key: string; label: string; default: boolean | null; /** true = the pack may leave it undecided (null) and then the organizer MUST choose. */ forceDecision?: boolean }
export const OPTIONS: OptionDef[] = [
  { key: "proxy_voting", label: "Proxy voting", default: null, forceDecision: true },
  { key: "weightage", label: "Weighted votes (otherwise one flat, one vote)", default: false },
  { key: "quorum_check", label: "Check quorum before voting", default: true },
  { key: "secret_ballot", label: "Secret ballot", default: false },
  { key: "open_vote_by_flat", label: "Record votes openly by flat", default: false },
  { key: "attendance_photo", label: "Photo of the attendee", default: false },
  { key: "id_check", label: "ID document check", default: false },
  { key: "vote_lock_code", label: "Voter must LOCK the ballot with a 4-digit number shown on the screen", default: false },
  { key: "attendance_checklist", label: "Attendance Monitor must tick every box before marking someone present", default: false },
  { key: "absentee_voting", label: "Absentee voting", default: false },
  { key: "extensions", label: "Allow extending the voting window", default: false },
  { key: "minutes", label: "Minutes", default: true },
  { key: "designation_labels", label: "Designation labels on the report", default: true },
  { key: "notices", label: "Notice period check", default: true },
  { key: "auto_publish", label: "Close the event and publish the report automatically at the scheduled end", default: true },
];
export const OPTION_KEYS = new Set(OPTIONS.map((o) => o.key));

export interface LockedOption { value: boolean; reason: string }
export interface RuleSet {
  packId: string;
  params: Record<string, Json | null>;
  options: Options;
  locked: Record<string, LockedOption>;
}

export class RuleError extends Error { constructor(public code: string, msg: string) { super(msg); } }

export function validateParam(id: string, value: Json | null): void {
  const d = PARAM_BY_ID.get(id);
  if (!d) throw new RuleError("unknown_param", `unknown rule ${id}`);
  if (value === null) return; // unset is allowed to be stored; start-check refuses if required
  if (d.type === "bool" && typeof value !== "boolean") throw new RuleError("bad_value", `${id} must be yes/no`);
  if (d.type === "int") {
    if (typeof value !== "number" || !Number.isInteger(value)) throw new RuleError("bad_value", `${id} must be a whole number`);
    if (d.min !== undefined && value < d.min) throw new RuleError("bad_value", `${id} must be at least ${d.min}`);
    if (d.max !== undefined && value > d.max) throw new RuleError("bad_value", `${id} must be at most ${d.max}`);
  }
  if (d.type === "enum" && !(typeof value === "string" && d.enumValues!.includes(value))) throw new RuleError("bad_value", `${id} must be one of ${d.enumValues!.join(", ")}`);
}

/** Set a rule parameter. Locked-by-law parameters do not exist as params (only options are lockable). */
export function setParam(rs: RuleSet, id: string, value: Json | null): RuleSet {
  validateParam(id, value);
  return { ...rs, params: { ...rs.params, [id]: value } };
}
/** Tick/untick an option. A locked option refuses with the law's reason. */
export function setOption(rs: RuleSet, key: string, value: boolean): RuleSet {
  if (!OPTION_KEYS.has(key)) throw new RuleError("unknown_option", `unknown option ${key}`);
  const l = rs.locked[key];
  if (l && l.value !== value) throw new RuleError("locked_by_law", `${key} is fixed by the rules of this pack: ${l.reason}`);
  return { ...rs, options: { ...rs.options, [key]: value } };
}

/** What still blocks starting this event. Empty list = may start. */
export function missingRequired(rs: RuleSet): string[] {
  const out: string[] = [];
  for (const d of PARAMS) {
    if (!d.required) continue;
    if (d.requiredWhen && !d.requiredWhen(rs.options)) continue;
    const v = rs.params[d.id];
    if (v === null || v === undefined) out.push(d.id);
  }
  for (const o of OPTIONS) if (o.forceDecision && (rs.options[o.key] === null || rs.options[o.key] === undefined)) out.push("option:" + o.key);
  return out;
}

/** Stable digest input for a point's frozen rules. */
export function effectiveForPoint(rs: RuleSet, p: { majorityClass: string; secret: boolean; maxChoices: number }): Record<string, Json> {
  const keep = ["ballot.mode", "quorum.basis", "quorum.percentBp", "quorum.strict", "quorum.capFlats", "majority.simple.basis", "majority.special.basis", "tie.break", "abstain.inBase", "election.declareWinner", "smallCell.threshold"];
  const o: Record<string, Json> = { majorityClass: p.majorityClass, secret: p.secret, maxChoices: p.maxChoices, weightage: !!rs.options.weightage, open_vote_by_flat: !!rs.options.open_vote_by_flat, quorum_check: !!rs.options.quorum_check };
  for (const k of keep) o[k] = rs.params[k] ?? null;
  return o;
}

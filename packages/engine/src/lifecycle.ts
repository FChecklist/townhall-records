// How an event can end or be moved, in plain words: the four outcomes shown on the page, the tick-box reasons, and the price of postponing.
// Postponing BEFORE the scheduled start is always free. AFTER the scheduled start the first postponement is free; every later one costs 50% of the event's price.
import { priceFor, type EventKind } from "./pricing";

export type Outcome = "completed" | "stopped" | "postponed" | "cancelled";
export const OUTCOMES: Array<{ id: Outcome; label: string; plain: string; final: boolean }> = [
  { id: "completed", label: "Completed", plain: "Every agenda point was taken up and the meeting or election finished.", final: true },
  { id: "stopped", label: "Stopped in between", plain: "It began but was stopped before every point was taken up. What was voted stays on record; the rest is shown as not taken up.", final: true },
  { id: "postponed", label: "Postponed", plain: "It will continue on a new date, time and place. The record so far stays; attendance is taken again.", final: false },
  { id: "cancelled", label: "Cancelled", plain: "It will not take place. The reason is on the page.", final: true },
];
export const outcomeLabel = (o: string | null | undefined) => OUTCOMES.find((x) => x.id === o)?.label ?? "In progress";

/** Tick-boxes shown with the choice. More than one may be ticked. */
export const REASON_CODES: Array<{ id: string; label: string }> = [
  { id: "quorum_not_met", label: "Quorum was not complete" },
  { id: "venue_unavailable", label: "Venue not available" },
  { id: "emergency", label: "Emergency or unsafe conditions" },
  { id: "power_or_network", label: "Power, network or equipment problem" },
  { id: "dispute", label: "Dispute or disturbance in the meeting" },
  { id: "notice_defect", label: "Notice was not proper" },
  { id: "court_or_authority", label: "Order of a court or authority" },
  { id: "members_request", label: "Members asked for it" },
  { id: "key_person_absent", label: "Chair or key person absent" },
  { id: "other", label: "Another reason (written below)" },
];
export const REASON_IDS = new Set(REASON_CODES.map((r) => r.id));

export type PostponePhase = "before_start" | "after_start";
export interface PostponeQuote { phase: PostponePhase; priorAfterStart: number; feeMinor: number; currency: string; free: boolean; why: string }

/** The price of moving the event now. `nowMs` against the CURRENT scheduled start decides the phase; `priorAfterStart` = earlier postponements made after a start time. */
export function postponeQuote(kind: EventKind, country: string, startMs: number, nowMs: number, priorAfterStart: number): PostponeQuote {
  const price = priceFor(kind, country); const phase: PostponePhase = nowMs < startMs ? "before_start" : "after_start";
  if (phase === "before_start") return { phase, priorAfterStart, feeMinor: 0, currency: price.currency, free: true, why: "Moving it before the start time is free, as many times as you need." };
  if (priorAfterStart === 0) return { phase, priorAfterStart, feeMinor: 0, currency: price.currency, free: true, why: "The first postponement after the start time is free." };
  const fee = Math.ceil(price.amountMinor / 2);
  return { phase, priorAfterStart, feeMinor: fee, currency: price.currency, free: false, why: "Every postponement after the start time, after the first, costs half the event price." };
}

/** Optional people who are not voters or staff: the Organizer types whatever fits this society and law. Everything here is a free-text placeholder. */
export const OFFICIAL_GROUPS: Array<{ id: string; label: string; example: string }> = [
  { id: "committee", label: "Election Conduct Committee / Meeting Conduct Committee", example: "Election Conduct Committee 2026" },
  { id: "returning_officer", label: "Returning Officer", example: "Returning Officer" },
  { id: "government_officer", label: "Government Officer", example: "Registrar of Co-operative Societies' nominee" },
  { id: "observer", label: "Observer", example: "Observer appointed by the court" },
  { id: "chair", label: "Chairperson / Presiding Officer", example: "Chairman" },
  { id: "president", label: "President / Vice President", example: "President" },
  { id: "general_secretary", label: "General Secretary / Secretary", example: "General Secretary" },
  { id: "treasurer", label: "Treasurer", example: "Treasurer" },
  { id: "committee_member", label: "Committee Member / Trustee / Director", example: "Executive Committee Member" },
  { id: "auditor", label: "Auditor / Scrutineer", example: "Statutory Auditor" },
  { id: "other", label: "Other (write the title yourself)", example: "Auditor" },
];
export const OFFICIAL_GROUP_IDS = new Set(OFFICIAL_GROUPS.map((g) => g.id));
export const officialGroupLabel = (id: string) => OFFICIAL_GROUPS.find((g) => g.id === id)?.label ?? id;

/** The text laid diagonally behind every page of the PDF and the web report, so a printed or saved copy always shows which event it belongs to. */
export const watermarkText = (kind: string, eid: string) => `${kind === "election" ? "ELECTION" : "MEETING"} ID ${eid}`;

/** One plain line for the public "who did what, and when" register. Only entries whose actor is a named person (Organizer, Host, Attendance Monitor) get a line. */
export function describeAction(type: string, p: any): string {
  const n = (v: unknown) => (typeof v === "string" ? v : "");
  const role = (r: string) => (r === "attendance_officer" ? "Attendance Monitor" : r === "host" ? "Host" : r === "organizer" ? "Organizer" : r);
  const t = (() => {
    switch (type) {
      case "event_created": return "Created the " + n(p.kind) + " " + n(p.title);
      case "role_appointed": return `Appointed ${n(p.maskedName)} as ${role(n(p.role))}`;
      case "role_removed": return `Removed a ${role(n(p.role))}`;
      case "terms_accepted": return "Accepted the terms";
      case "email_verified": return "Confirmed their e-mail address";
      case "roll_set": return `Set the flat list (revision ${p.rev}, ${Array.isArray(p.flats) ? p.flats.length : "?"} flats${p.source ? ", by " + n(p.source) : ""})${n(p.reason) ? ": " + n(p.reason) : ""}`;
      case "holder_added": return `Added the holder of flat ${n(p.flatNo)} (${n(p.maskedName)})`;
      case "rule_changed": return `Changed rule ${n(p.param)}: ${JSON.stringify(p.old)} to ${JSON.stringify(p.new)} (${n(p.reason)})`;
      case "rule_change_rejected": return `Tried to change rule ${n(p.param)} (refused: ${n(p.reason)})`;
      case "options_set": return "Changed options: " + Object.entries(p.options ?? {}).map(([k, v]) => `${k}=${v ? "yes" : "no"}`).join(", ");
      case "option_overridden": return `Overrode the locked option ${n(p.key)}: ${n(p.declaration)}`;
      case "custom_rule_set": return p.value === null ? `Withdrew the extra rule "${n(p.title)}"` : `Set the extra rule "${n(p.title)}"`;
      case "official_set": return `Listed ${n(p.name)} (${n(p.designation) || n(p.group)})`;
      case "official_removed": return "Removed an entry from the committee / officers list";
      case "official_attendance": return `Marked an official ${p.present === false ? "not present" : "present"}`;
      case "point_added": return `Added agenda point ${n(p.number)}: ${n(p.title)}`;
      case "point_amended": return `Changed agenda point ${n(p.number)}`;
      case "schedule_set": return "Changed the schedule: " + n(p.reason);
      case "agenda_published": return "Published the agenda and notice";
      case "event_started": return "Started the event";
      case "point_opened": return "Opened a point for voting";
      case "point_closed": return "Closed a point";
      case "point_extended": return "Extended the voting time";
      case "attendance_marked": return `Marked flat ${n(p.flatNo)} ${p.present === false ? "NOT present" : "present"}${p.docType ? ", ID checked (" + n(p.docType) + ")" : ""}`;
      case "evidence_filed": return `Took the attendance photo of flat ${n(p.flatNo)}`;
      case "payment_state": return `Payment ${n(p.state)}`;
      case "event_postponed": return `Postponed the event (${p.phase === "before_start" ? "before" : "after"} the start time, fee ${p.feeMinor || 0})`;
      case "event_closed": return `Ended the event as ${n(p.outcome) || "completed"}`;
      case "report_emailed": return "E-mailed the report";
      case "contacts_read": return "Viewed the private contact details";
      case "subject_access": return "Opened a person's stored data (access request)";
      case "person_erased": return "Erased a person's private details";
      case "key_destroyed": return "Erased all private details of the event";
      case "privacy_resolved": return `Answered a privacy request (${n(p.action)})`;
      case "basics_set": return "Changed the title or place of the event";
      case "point_removed": return `Removed agenda point ${n(p.number)} before voting`;
      case "point_withdrawn": return `Withdrew agenda point ${n(p.number)} after the notice went out (it stays on the record): ${n(p.reason)}`;
      case "name_change_requested": return `Asked for a name correction for flat ${n(p.flatNo)} (${n(p.reason)})`;
      case "label_set": return `Gave a designation: ${n(p.label)}`;
      case "rules_initialized": return `Rules set from the pack ${n(p.packName)}`;
      case "anchor": return "Integrity checkpoint signed (a fingerprint of the whole record so far)";
      case "ballot_box_sealed": return "Sealed the ballot box of a point (the receipts were fixed)";
      case "result_computed": return "Counted a point and fixed its result";
      case "vote_recorded": return `Flat ${n(p.flatNo)} voted (secret ballot: the choice is not recorded with the flat)`;
      case "vote_cast_open": return `Flat ${n(p.flatNo)} voted (open vote)`;
      case "vote_rejected": return `A vote was refused: ${n(p.code) || n(p.reason) || "not allowed"}`;
      case "device_bound": return `The phone of flat ${n(p.flatNo)} was linked to its vote`;
      case "session_resumed": return `Flat ${n(p.flatNo)} opened its link again and was taken back to where it was`;
      case "handshake_started": return `Check-in of flat ${n(p.flatNo)} started (two 4-digit numbers)`;
      case "mobile_confirmed": return `Mobile number of flat ${n(p.flatNo)} confirmed by the text-message check`;
      case "passcode_issued": return `A code was issued (${n(p.purpose)})`;
      case "passcode_locked": return "A code was locked after too many wrong tries";
      case "paper_issued": return "A printed ballot paper was issued";
      case "paper_reissued": return "A printed ballot paper was issued again";
      case "paper_voided": return "A printed ballot paper was voided";
      case "event_suspended": return "The platform suspended the event";
      case "clone_linked": return p.direction === "from" ? "Made as a copy of an earlier event" : "An earlier event was copied into a new one";
      case "platform_action": return `Platform action: ${n(p.action)}`;
      case "privacy_request": return `A privacy request was received (${n(p.type)})`;
      default: return type.replace(/_/g, " ");
    }
  })();
  return t.length > 220 ? t.slice(0, 217) + "..." : t;
}

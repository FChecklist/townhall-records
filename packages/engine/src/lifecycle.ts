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
  { id: "other", label: "Other (write the title yourself)", example: "Auditor" },
];
export const OFFICIAL_GROUP_IDS = new Set(OFFICIAL_GROUPS.map((g) => g.id));
export const officialGroupLabel = (id: string) => OFFICIAL_GROUPS.find((g) => g.id === id)?.label ?? id;

/** The text laid diagonally behind every page of the PDF and the web report, so a printed or saved copy always shows which event it belongs to. */
export const watermarkText = (kind: string, eid: string) => `${kind === "election" ? "ELECTION" : "MEETING"} ID ${eid}`;

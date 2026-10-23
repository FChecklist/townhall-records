// Clone-from-event (Amendment A5). Whitelist copy: only fields named here ever leave the source event.
// Copied: society name/address/registration number, pack and chosen options/rules, flat list with weights, agenda structure, designation labels.
// NEVER copied: e-mail addresses, phone numbers, names, passcodes, images, votes, attendance, payments, dates, the people/roles themselves.
import type { Json } from "./canonical";
import type { EventState } from "./replay";

export interface CloneTemplate {
  createdFrom: string;
  kind: "meeting" | "election"; eventType: string; timezone: string; packId: string; title: string;
  society: { name: string; address: string; registrationNo: string; kind: string };
  options: Record<string, boolean | null>;
  params: Record<string, Json | null>;
  flats: Array<{ flatNo: string; weight: number; eligible: boolean }>;
  points: Array<{ number: string; title: string; body: string; kind: string; options: string[]; maxChoices: number; majorityClass: string; secret: boolean }>;
  labels: string[];
  /** true only when the cloner is the verified Organizer of the source and asked for it; the API then copies the PRIVATE roll with a notice. */
  includePrivateRoll: boolean;
}

export function cloneTemplate(s: EventState, opts: { cloneIsVerifiedOrganizerOfSource: boolean; wantPrivateRoll?: boolean }): CloneTemplate {
  if (!s.created || !s.rules) throw new Error("clone: source event has no profile");
  const c = s.created;
  const labels = [...new Set([...s.people.values()].map((p) => p.label).filter((x): x is string => !!x))];
  return {
    createdFrom: s.eid, kind: c.kind, eventType: c.eventType, timezone: c.timezone, packId: c.packId, title: c.title,
    society: { name: c.society.name, address: c.society.address, registrationNo: c.society.registrationNo, kind: c.society.kind },
    options: { ...s.rules.options }, params: { ...s.rules.params },
    flats: s.roll.map((f) => ({ flatNo: f.flatNo, weight: f.weight, eligible: f.eligible })),
    points: s.pointOrder.map((id) => { const d = s.points.get(id)!.def; return { number: d.number, title: d.title, body: d.body, kind: d.kind, options: [...d.options], maxChoices: d.maxChoices, majorityClass: d.majorityClass, secret: d.secret }; }),
    labels,
    includePrivateRoll: !!(opts.cloneIsVerifiedOrganizerOfSource && opts.wantPrivateRoll),
  };
}

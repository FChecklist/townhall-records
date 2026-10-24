// Clone-from-event (Amendment A5). Whitelist copy: only fields named here ever leave the source event.
// Copied: society name/address/registration number, pack and chosen options/rules, flat list with weights, agenda structure, designation labels.
// Also copied (owner directive 2026-10-24, "recreate from old data"): candidate names and ballot design of each point, the optional committee / officer entries, the society's own rules and the declarations for overridden options.
// NEVER copied: e-mail addresses, phone numbers, names (unless the verified Organizer or a Host asks for the private roll), passcodes, images, votes, attendance, payments, dates, the people/roles themselves.
import type { Json } from "./canonical";
import type { EventState } from "./replay";

export interface CloneTemplate {
  createdFrom: string;
  kind: "meeting" | "election"; eventType: string; timezone: string; packId: string; title: string;
  society: { name: string; address: string; registrationNo: string; kind: string };
  options: Record<string, boolean | null>;
  params: Record<string, Json | null>;
  flats: Array<{ flatNo: string; weight: number; eligible: boolean }>;
  points: Array<{ number: string; title: string; body: string; kind: string; options: string[]; maxChoices: number; majorityClass: string; secret: boolean; labels: Record<string, string>; minChoices: number; format: string | null; seats: string[]; topN: number | null; design: unknown }>;
  officials: Array<{ group: string; groupLabel: string; name: string; designation: string; authority: string; note: string }>;
  customRules: Array<{ title: string; kind: "text" | "number" | "yes_no"; value: string | number | boolean; note: string }>;
  overrides: Array<{ key: string; value: boolean; declaration: string }>;
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
    points: s.pointOrder.map((id) => { const d = s.points.get(id)!.def; return { number: d.number, title: d.title, body: d.body, kind: d.kind, options: [...d.options], maxChoices: d.maxChoices, majorityClass: d.majorityClass, secret: d.secret, labels: { ...(d.labels ?? {}) }, minChoices: d.minChoices ?? 1, format: (d.format ?? null) as string | null, seats: [...(d.seats ?? [])], topN: d.topN ?? null, design: d.design ?? null }; }),
    officials: [...s.officials.values()].sort((a, b) => a.seq - b.seq).map((o) => ({ group: o.group, groupLabel: o.groupLabel, name: o.name, designation: o.designation, authority: o.authority, note: o.note })),
    customRules: [...s.customRules.values()].sort((a, b) => a.seq - b.seq).map((r) => ({ title: r.title, kind: r.kind, value: r.value, note: r.note })),
    overrides: s.overrides.map((o) => ({ key: o.key, value: o.value, declaration: o.declaration })),
    labels,
    includePrivateRoll: !!(opts.cloneIsVerifiedOrganizerOfSource && opts.wantPrivateRoll),
  };
}

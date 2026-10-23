// Who may be appointed (how many Organizers, Hosts and Attendance Monitors), what the monitor must tick before marking someone present, and how the photo's place is cross-checked.
// Pure functions: the API and the replay both use them, so a log that breaks the limits is flagged by the verifier too.
import type { Role } from "./replay";

/** 1 Organizer; at most 5 Hosts INCLUDING the Organizer; at most 10 Attendance Monitors who are not Organizer/Host; Organizer and Hosts may also be monitors, so 15 monitors at most. */
export const ROLE_LIMITS = { organizers: 1, hostsInclOrganizer: 5, monitorsOnly: 10, monitorsTotal: 15 } as const;

export interface RoleCounts { organizers: number; hostsInclOrganizer: number; monitorsOnly: number; monitorsTotal: number }
type PersonLike = { roles: Role[] };
export function roleCounts(people: Iterable<PersonLike>): RoleCounts {
  const c: RoleCounts = { organizers: 0, hostsInclOrganizer: 0, monitorsOnly: 0, monitorsTotal: 0 };
  for (const p of people) {
    const org = p.roles.includes("organizer"), host = p.roles.includes("host"), mon = p.roles.includes("attendance_officer");
    if (org) c.organizers++; if (org || host) c.hostsInclOrganizer++; if (mon) { c.monitorsTotal++; if (!org && !host) c.monitorsOnly++; }
  }
  return c;
}
/** Said in plain words, as a sentence for the screen. Empty string = within the limits. */
export function roleLimitProblem(c: RoleCounts): string {
  if (c.organizers > ROLE_LIMITS.organizers) return "There can be only 1 Organizer.";
  if (c.hostsInclOrganizer > ROLE_LIMITS.hostsInclOrganizer) return `There can be at most ${ROLE_LIMITS.hostsInclOrganizer} Hosts including the Organizer.`;
  if (c.monitorsOnly > ROLE_LIMITS.monitorsOnly) return `There can be at most ${ROLE_LIMITS.monitorsOnly} Attendance Monitors besides the Organizer and Hosts.`;
  if (c.monitorsTotal > ROLE_LIMITS.monitorsTotal) return `There can be at most ${ROLE_LIMITS.monitorsTotal} Attendance Monitors in all.`;
  return "";
}
/** Would giving `role` to `target` (a person already in the event, or null for a brand-new person) stay within the limits? */
export function appointProblem(people: PersonLike[], target: PersonLike | null, role: Role): string {
  const copy = people.map((p) => ({ roles: p === target && !p.roles.includes(role) ? [...p.roles, role] : [...p.roles] }));
  if (!target) copy.push({ roles: [role] });
  return roleLimitProblem(roleCounts(copy));
}

// ---- the monitor's tick-boxes (one screen, plain words) ----
export interface CheckItem { id: string; label: string; help: string }
export const ATTENDANCE_CHECKS: CheckItem[] = [
  { id: "proof_seen", label: "I have seen the person's proof (ID or a known face)", help: "Look at the proof. Do not photograph it unless the Organizer has asked for ID photos." },
  { id: "name_matches", label: "The name matches the flat in the list", help: "If it does not match, stop and send the change to the Organizer or a Host." },
  { id: "flat_matches", label: "This person lives in, or holds the vote for, this flat", help: "For a proxy, tick the proxy box on the next screen." },
  { id: "photo_taken", label: "Photo taken (with the place switched on)", help: "Ask the person first. They must agree." },
  { id: "person_agrees", label: "The person agreed to the photo and to the record", help: "Without a Yes, do not take a photo; use the Organizer's alternative." },
  { id: "person_checked", label: "The person has checked their name, flat and status on their own phone", help: "They then enter the 4-digit number; you enter yours." },
];
export function requiredChecks(opts: { attendance_photo?: boolean; id_check?: boolean }): string[] {
  const r = ["name_matches", "flat_matches", "person_checked"]; r.push("proof_seen"); if (opts.attendance_photo) r.push("photo_taken", "person_agrees"); return r;
}
export function missingChecks(opts: { attendance_photo?: boolean; id_check?: boolean }, ticked: Record<string, unknown> | null | undefined): CheckItem[] {
  const t = ticked ?? {}; return requiredChecks(opts).filter((id) => t[id] !== true).map((id) => ATTENDANCE_CHECKS.find((c) => c.id === id)!);
}

// ---- place of a photo ----
export function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371, rad = (d: number) => (d * Math.PI) / 180; const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2; return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
export type GeoFlag = "ok" | "no_location" | "far_from_network" | "bad_location" | "time_off";
/** Honest cross-check, not proof: the phone's own place against where the network says it is, and the phone's clock against ours. Flags are for a human to look at. */
export function geoFlags(client: { lat: number; lon: number; accuracyM?: number } | null, network: { lat: number; lon: number } | null, capturedMs: number | null, serverMs: number): GeoFlag[] {
  const f: GeoFlag[] = [];
  if (!client) f.push("no_location");
  else if (!(Math.abs(client.lat) <= 90 && Math.abs(client.lon) <= 180) || (client.lat === 0 && client.lon === 0)) f.push("bad_location");
  else if (network && haversineKm(client, network) > 150) f.push("far_from_network");
  if (capturedMs === null || Math.abs(serverMs - capturedMs) > 10 * 60_000) f.push("time_off");
  return f.length ? f : ["ok"];
}

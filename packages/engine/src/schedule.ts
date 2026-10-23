// Event schedule: four milestones for a meeting AND for an election, each with date, time, day of week and place.
//   Meeting:  Meeting starts · Voting starts · Voting ends · Meeting ends
//   Election: Election starts · Voting starts · Voting ends · Election ends
// Plus the count-down timers shown on the public page. Times are UTC milliseconds; display uses the event's IANA time zone.
export interface Milestone { atMs: number; place: string }
export interface Schedule { start: Milestone; votingStart: Milestone; votingEnd: Milestone; end: Milestone }
export const MILESTONE_KEYS = ["start", "votingStart", "votingEnd", "end"] as const;
export type MilestoneKey = (typeof MILESTONE_KEYS)[number];

export const milestoneLabel = (kind: string, key: MilestoneKey): string => {
  const what = kind === "election" ? "Election" : "Meeting";
  return key === "start" ? `${what} starts` : key === "votingStart" ? "Voting starts" : key === "votingEnd" ? "Voting ends" : `${what} ends`;
};
export const countdownLabel = (kind: string, key: MilestoneKey): string => {
  const what = kind === "election" ? "Election" : "Meeting";
  return key === "start" ? `${what} opens in` : key === "votingStart" ? "Voting opens in" : key === "votingEnd" ? "Voting closes in" : `${what} closes in`;
};

/** null when valid, otherwise a plain-words reason. Order must be start <= voting start <= voting end <= end. */
export function validateSchedule(s: unknown): string | null {
  const x = s as Schedule;
  if (!x || typeof x !== "object") return "The schedule is missing.";
  let prev = -Infinity;
  for (const k of MILESTONE_KEYS) {
    const m = x[k];
    if (!m || !Number.isSafeInteger(m.atMs) || m.atMs <= 0) return `${milestoneLabel("meeting", k)}: a date and time is needed.`;
    if (typeof m.place !== "string" || m.place.trim().length < 2 || m.place.length > 200) return `${milestoneLabel("meeting", k)}: a place is needed.`;
    if (m.atMs < prev) return `${milestoneLabel("meeting", k)} cannot be earlier than the step before it.`;
    prev = m.atMs;
  }
  return null;
}

/** Used when only a start time is given: voting starts at the start, voting runs 2 hours, the event ends after 3 hours. */
export function defaultSchedule(startMs: number, place: string): Schedule {
  const H = 3_600_000;
  return { start: { atMs: startMs, place }, votingStart: { atMs: startMs, place }, votingEnd: { atMs: startMs + 2 * H, place }, end: { atMs: startMs + 3 * H, place } };
}

export interface DayParts { day: string; date: string; time: string; zone: string }
/** Day of week, date and 24-hour time of an instant in a time zone (falls back to UTC for an unknown zone). */
export function dayParts(ms: number, timeZone: string): DayParts {
  const mk = (tz: string) => new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
  let f: Intl.DateTimeFormat, zone = timeZone;
  try { f = mk(timeZone); } catch { f = mk("UTC"); zone = "UTC"; }
  const p: Record<string, string> = {}; for (const x of f.formatToParts(new Date(ms))) p[x.type] = x.value;
  return { day: p.weekday ?? "", date: `${p.day} ${p.month} ${p.year}`, time: `${p.hour === "24" ? "00" : p.hour}:${p.minute}`, zone };
}

export function formatRemaining(ms: number): string {
  if (ms <= 0) return "0:00:00";
  const s = Math.floor(ms / 1000), d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d ? d + "d " : ""}${h}:${pad(m)}:${pad(sec)}`;
}

export interface Countdown { key: MilestoneKey; label: string; atMs: number; remainingMs: number; text: string; state: "upcoming" | "passed" }
export interface Countdowns {
  all: Countdown[];
  /** The timer to show big: the voting window that is open right now (real end time of the open point), else the next milestone ahead, else null. */
  headline: { label: string; remainingMs: number; text: string } | null;
}
/**
 * Count-down (backwards) timers. `openPointEndsMs` is the REAL end of the voting window currently open (it may have been extended),
 * which wins over the planned "Voting ends" time. `nowMs` should be server-calibrated time on the page.
 */
export function countdowns(s: Schedule, kind: string, nowMs: number, openPointEndsMs: number | null = null): Countdowns {
  const all: Countdown[] = MILESTONE_KEYS.map((k) => {
    const at = k === "votingEnd" && openPointEndsMs ? openPointEndsMs : s[k].atMs;
    const remainingMs = at - nowMs;
    return { key: k, label: countdownLabel(kind, k), atMs: at, remainingMs: Math.max(0, remainingMs), text: formatRemaining(remainingMs), state: remainingMs > 0 ? "upcoming" : "passed" };
  });
  let headline: Countdowns["headline"] = null;
  if (openPointEndsMs && openPointEndsMs > nowMs) headline = { label: countdownLabel(kind, "votingEnd"), remainingMs: openPointEndsMs - nowMs, text: formatRemaining(openPointEndsMs - nowMs) };
  else { const next = all.find((c) => c.state === "upcoming"); if (next) headline = { label: next.label, remainingMs: next.remainingMs, text: next.text }; }
  return { all, headline };
}

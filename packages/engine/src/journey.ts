// Where a voter is in the journey, computed from the log: lets a returning person (same link, new tab, reloaded page, lost connection) continue at the exact point they left.
import type { EventState } from "./replay";

export type JourneyStep = "checkin_pending" | "not_started" | "waiting_for_vote" | "ballot" | "voted_waiting" | "finished";
export interface Journey {
  step: JourneyStep; flatNo: string; present: boolean;
  openPoint: { pointId: string; number: string; title: string; kind: string; secret: boolean; endsMs: number | null } | null;
  voted: Array<{ pointId: string; number: string; title: string; atSeq: number; channel: "online" | "paper" }>;
  pending: Array<{ pointId: string; number: string; title: string; state: string }>;
  remainingMs: number | null; message: string;
}

export function journeyFor(s: EventState, flatNo: string, nowMs: number): Journey {
  const present = s.attendance.has(flatNo);
  const votable = s.pointOrder.map((id) => s.points.get(id)!).filter((p) => p.def.kind !== "discussion");
  const voted = votable.filter((p) => s.ledger.get(p.def.pointId)?.has(flatNo)).map((p) => ({ pointId: p.def.pointId, number: p.def.number, title: p.def.title, atSeq: s.ledger.get(p.def.pointId)!.get(flatNo)!.seq, channel: s.ledger.get(p.def.pointId)!.get(flatNo)!.channel }));
  const pending = votable.filter((p) => !s.ledger.get(p.def.pointId)?.has(flatNo) && p.state !== "closed").map((p) => ({ pointId: p.def.pointId, number: p.def.number, title: p.def.title, state: p.state }));
  const open = votable.find((p) => p.state === "open");
  const openPoint = open ? { pointId: open.def.pointId, number: open.def.number, title: open.def.title, kind: open.def.kind, secret: open.def.secret, endsMs: open.endsMs } : null;
  let step: JourneyStep, message: string;
  if (!present) { step = "checkin_pending"; message = "You are not marked present yet. Go to the check-in desk."; }
  else if (s.status === "closed") { step = "finished"; message = "The event is over. The final report is published."; }
  else if (s.status !== "live") { step = "not_started"; message = "You are checked in. Voting has not started yet."; }
  else if (open && !s.ledger.get(open.def.pointId)?.has(flatNo)) { step = "ballot"; message = `Voting is open on point ${open.def.number}: ${open.def.title}. Your ballot is waiting.`; }
  else if (open) { step = "voted_waiting"; message = `You have voted on point ${open.def.number}. Wait for the next point.`; }
  else if (pending.length) { step = "waiting_for_vote"; message = "No point is open right now. You will be able to vote on the next one."; }
  else { step = "finished"; message = "You have voted on every point. The report will be published when the event closes."; }
  return { step, flatNo, present, openPoint, voted, pending, remainingMs: openPoint?.endsMs ? Math.max(0, openPoint.endsMs - nowMs) : null, message };
}

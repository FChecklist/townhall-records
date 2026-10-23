// Payload builders for the log entries whose content is COMPUTED (not just copied from a request). Shared by the API and the tests,
// so the server writes exactly what the verifier will recompute.
import type { Json } from "./canonical";
import { sha256Hex } from "./crypto";
import { checkNotice } from "./packs";
import { rulesDigest, tallyFor, type EventState, weightsNow, presentFlatNos } from "./replay";
import { aggregate, computeQuorum, type BallotRow } from "./tally";

export interface BoxBallot { receipt: string; choices: string[]; weight: number; kind: "official" | "proxy" }

/** receipt = SHA-256(pointId | choices | nonce). The nonce is shown to the voter only; the receipt is public. */
export const receiptOf = (pointId: string, choices: string[], nonce: string) => sha256Hex(["aoa-rwa/receipt/v1", pointId, [...choices].sort().join(","), nonce].join("|"));

/** Seals a closed secret point: aggregates only, sorted receipts, digest of the sorted box. Per-ballot (choice, weight) pairs are never published. */
export async function sealBoxPayload(s: EventState, pointId: string, box: BoxBallot[]): Promise<Record<string, Json>> {
  const pt = s.points.get(pointId)!;
  const rules = pt.frozen ?? s.rules!;
  const rows: BallotRow[] = box.map((b) => ({ choices: b.choices, weight: b.weight, kind: b.kind }));
  const agg = aggregate(pt.def, rows, rules);
  const receipts = box.map((b) => b.receipt).sort();
  const lines = box.map((b) => `${b.receipt}|${[...b.choices].sort().join(",")}|${b.weight}`).sort();
  const digest = await sha256Hex(lines.join("\n"));
  return { pointId, n: agg.n, castWeight: agg.castWeight, receipts, counts: agg.perOption as unknown as Json, split: (agg.split ?? null) as unknown as Json, digest };
}

export async function openPointPayload(s: EventState, pointId: string, endsMs: number): Promise<Record<string, Json>> {
  const pt = s.points.get(pointId)!;
  const q = s.rules && s.rules.options.quorum_check ? computeQuorum(s.rules, s.roll, presentFlatNos(s)) : null;
  return { pointId, endsMs, rulesDigest: await rulesDigest(s.rules!, pt.def), quorum: (q ? { present: q.present, required: q.required, met: q.met, basis: q.basis ?? "none" } : null) as Json };
}

export function resultPayload(s: EventState, pointId: string): Record<string, Json> {
  const pt = s.points.get(pointId)!;
  return { pointId, tally: tallyFor(s, pt) as unknown as Json };
}

export function agendaPayload(s: EventState, nowMs: number): Record<string, Json> {
  const n = checkNotice(s.rules!, nowMs, s.created!.scheduledMs);
  return { givenDays: n.givenDays, minDays: n.minDays, maxDays: n.maxDays, met: n.met, points: s.points.size };
}

export const weightsPayload = (s: EventState) => (s.rules ? weightsNow(s, s.rules) : { present: 0, total: 0 });

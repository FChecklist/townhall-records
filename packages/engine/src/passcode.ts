// The 6-digit passcode module (PM-STANDARDS section 3). One file, no I/O of its own: storage is a PasscodeStore.
// Security comes from policy, not entropy: one subject, one purpose, one event, expiry, single use, 5 tries then a 15 minute lock.
import { hmacHex, randomInt, timingSafeEqual } from "./crypto";

export type Purpose = "login" | "voter" | "super_login";
export const MAX_TRIES = 5;
export const LOCK_MS = 15 * 60_000;
export const LOGIN_TTL_MS = 15 * 60_000;

export interface PasscodeRow {
  id: string; eventId: string; purpose: Purpose; subject: string;
  hash: string; uniqHash: string;
  issuedMs: number; expiresMs: number; tries: number; lockedUntilMs: number;
  usedMs: number | null; voidedMs: number | null; issuedBy: string | null;
}
export interface PasscodeStore {
  /** All rows (any state) for this subject+purpose in the event, oldest first. */
  forSubject(eventId: string, purpose: Purpose, subject: string): Promise<PasscodeRow[]>;
  /** Is a still-valid (unused, unvoided, unexpired) row with this uniqueness hash present for the event+purpose? */
  uniqueTaken(eventId: string, purpose: Purpose, uniqHash: string, nowMs: number): Promise<boolean>;
  insert(row: PasscodeRow): Promise<void>;
  save(row: PasscodeRow): Promise<void>;
}

/** Exactly 6 numeric digits, rejection sampled (no modulo bias). */
export function generateCode(rnd?: (u: Uint32Array) => void): string {
  return String(randomInt(1_000_000, rnd)).padStart(6, "0");
}
export const isWellFormed = (code: unknown): code is string => typeof code === "string" && /^\d{6}$/.test(code);

/** HMAC-SHA256(pepper, purpose|subject|event|code): binds the digits to ONE purpose, ONE subject, ONE event. */
export const passcodeHash = (pepper: string, p: { purpose: Purpose; subject: string; eventId: string; code: string }) =>
  hmacHex(pepper, ["aoa-rwa/pass/v1", p.purpose, p.subject, p.eventId, p.code].join("|"));
const uniqHashOf = (pepper: string, eventId: string, purpose: Purpose, code: string) => hmacHex(pepper, ["aoa-rwa/uniq/v1", eventId, purpose, code].join("|"));

export interface IssueArgs {
  store: PasscodeStore; pepper: string; eventId: string; purpose: Purpose; subject: string; nowMs: number;
  ttlMs: number; issuedBy?: string | null; newId: () => string; rnd?: (u: Uint32Array) => void;
}
/** Creates a fresh passcode. Any earlier still-valid code for the same subject+purpose is voided (re-issue voids the old one). The digits are returned ONCE; only the keyed hash is stored. */
export async function issuePasscode(a: IssueArgs): Promise<{ code: string; row: PasscodeRow; voidedIds: string[] }> {
  const voidedIds: string[] = [];
  for (const r of await a.store.forSubject(a.eventId, a.purpose, a.subject)) {
    if (!r.usedMs && !r.voidedMs) { r.voidedMs = a.nowMs; await a.store.save(r); voidedIds.push(r.id); }
  }
  let code = "", uniq = "";
  for (let i = 0; i < 50; i++) {
    code = generateCode(a.rnd);
    uniq = await uniqHashOf(a.pepper, a.eventId, a.purpose, code);
    if (!(await a.store.uniqueTaken(a.eventId, a.purpose, uniq, a.nowMs))) break;
    if (i === 49) throw new Error("passcode: could not find a free code");
  }
  const row: PasscodeRow = {
    id: a.newId(), eventId: a.eventId, purpose: a.purpose, subject: a.subject,
    hash: await passcodeHash(a.pepper, { purpose: a.purpose, subject: a.subject, eventId: a.eventId, code }), uniqHash: uniq,
    issuedMs: a.nowMs, expiresMs: a.nowMs + a.ttlMs, tries: 0, lockedUntilMs: 0, usedMs: null, voidedMs: null, issuedBy: a.issuedBy ?? null,
  };
  await a.store.insert(row);
  return { code, row, voidedIds };
}

export type VerifyReason = "invalid" | "locked" | "expired" | "used";
export type VerifyResult = { ok: true; row: PasscodeRow } | { ok: false; reason: VerifyReason; lockedNow?: boolean };
export interface VerifyArgs { store: PasscodeStore; pepper: string; eventId: string; purpose: Purpose; subject: string; code: string; nowMs: number }

/**
 * Checks a submitted code. The HMAC and the constant-time compare are ALWAYS performed (also when there is no candidate), so the
 * response time does not tell an attacker whether a code exists. The caller must show one generic message for every failure.
 */
export async function verifyPasscode(a: VerifyArgs): Promise<VerifyResult> {
  const submitted = await passcodeHash(a.pepper, { purpose: a.purpose, subject: a.subject, eventId: a.eventId, code: isWellFormed(a.code) ? a.code : "000000" });
  const rows = (await a.store.forSubject(a.eventId, a.purpose, a.subject)).filter((r) => !r.voidedMs);
  const row = rows[rows.length - 1];
  const stored = row?.hash ?? "0".repeat(64);
  const match = timingSafeEqual(stored, submitted) && !!row && isWellFormed(a.code);
  if (!row) return { ok: false, reason: "invalid" };
  if (row.usedMs) return { ok: false, reason: "used" }; // replay
  if (row.lockedUntilMs > a.nowMs) return { ok: false, reason: "locked" }; // locked even for the right digits
  if (row.expiresMs <= a.nowMs) return { ok: false, reason: "expired" };
  if (row.lockedUntilMs && row.lockedUntilMs <= a.nowMs) { row.tries = 0; row.lockedUntilMs = 0; } // lock served
  if (!match) {
    row.tries += 1;
    let lockedNow = false;
    if (row.tries >= MAX_TRIES) { row.lockedUntilMs = a.nowMs + LOCK_MS; lockedNow = true; }
    await a.store.save(row);
    return { ok: false, reason: "invalid", lockedNow };
  }
  row.usedMs = a.nowMs; // single use
  await a.store.save(row);
  return { ok: true, row };
}

/** In-memory store for unit tests and the local stub. */
export class MemoryPasscodeStore implements PasscodeStore {
  rows: PasscodeRow[] = [];
  async forSubject(e: string, p: Purpose, s: string) { return this.rows.filter((r) => r.eventId === e && r.purpose === p && r.subject === s).sort((x, y) => x.issuedMs - y.issuedMs); }
  async uniqueTaken(e: string, p: Purpose, u: string, now: number) { return this.rows.some((r) => r.eventId === e && r.purpose === p && r.uniqHash === u && !r.usedMs && !r.voidedMs && r.expiresMs > now); }
  async insert(r: PasscodeRow) { this.rows.push({ ...r }); }
  async save(r: PasscodeRow) { const i = this.rows.findIndex((x) => x.id === r.id); this.rows[i] = { ...r }; }
}

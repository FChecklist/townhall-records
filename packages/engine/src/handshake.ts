// Attendance handshake: the Attendance Officer and the person exchange 4-digit codes that each reads from THEIR OWN screen, face to face.
// Why it works without SMS: each code is shown only on one screen (the officer's, or the voter's phone after it opens the one-time link), so
// entering BOTH codes proves two screens and two people are in the same place. When both are confirmed, the flat is marked present and the
// voter's phone + browser are bound to that flat for this event; a later handshake for the same flat ends the earlier binding.
// 4 digits are weak, so the policy does the work: one live handshake per flat, 10 minutes, 5 wrong tries per side then it is dead,
// the codes are stored only as keyed hashes, the officer's device must differ from the voter's device.
import { hmacHex, randomInt, timingSafeEqual } from "./crypto";

export const HANDSHAKE_TTL_MS = 10 * 60_000;
export const HANDSHAKE_MAX_TRIES = 5;

export const randomCode4 = (rnd?: (u: Uint32Array) => void): string => String(randomInt(10_000, rnd)).padStart(4, "0");
export const isCode4 = (c: unknown): c is string => typeof c === "string" && /^\d{4}$/.test(c);

export type Side = "monitor" | "voter";
export const codeHash = (pepper: string, p: { id: string; eventId: string; flatNo: string; side: Side; code: string }) =>
  hmacHex(pepper, ["aoa-rwa/hs/v1", p.id, p.eventId, p.flatNo, p.side, p.code].join("|"));

export interface Handshake {
  id: string; eventId: string; flatNo: string; monitorPid: string;
  monitorHash: string; voterHash: string; linkHash: string;
  /** hashes of the voter's device / browser, set when the voter's phone opens the link (first device wins) */
  deviceHash: string | null; uaHash: string | null; ipHash: string | null;
  voterConfirmedMs: number | null; monitorConfirmedMs: number | null; triesVoter: number; triesMonitor: number;
  createdMs: number; expiresMs: number; voidedMs: number | null; completedMs: number | null;
  kind: "official" | "proxy"; attendeeName: string;
  mobileMasked: string | null; mobileFp: string | null; smsConfirmedMs: number | null;
}
export type HsFail = "expired" | "voided" | "dead" | "wrong_code" | "wrong_device" | "same_device" | "done" | "not_opened";
export type HsResult = { ok: true; h: Handshake; complete: boolean } | { ok: false; reason: HsFail; h: Handshake };

const live = (h: Handshake, now: number): HsFail | null => (h.voidedMs ? "voided" : h.completedMs ? "done" : h.expiresMs <= now ? "expired" : h.triesVoter >= HANDSHAKE_MAX_TRIES || h.triesMonitor >= HANDSHAKE_MAX_TRIES ? "dead" : null);

/** The voter's phone opens the one-time link: the first device that does so is the one that counts. */
export function openLink(h: Handshake, now: number, device: string, ua: string, ip: string): HsResult {
  const bad = live(h, now); if (bad) return { ok: false, reason: bad, h };
  if (h.deviceHash && h.deviceHash !== device) return { ok: false, reason: "wrong_device", h };
  return { ok: true, h: { ...h, deviceHash: device, uaHash: ua, ipHash: ip }, complete: false };
}

/** The voter types the code shown on the OFFICER's screen. */
export async function voterConfirm(h: Handshake, now: number, pepper: string, code: string, device: string): Promise<HsResult> {
  const bad = live(h, now); if (bad) return { ok: false, reason: bad, h };
  if (!h.deviceHash) return { ok: false, reason: "not_opened", h };
  if (h.deviceHash !== device) return { ok: false, reason: "wrong_device", h };
  const want = await codeHash(pepper, { id: h.id, eventId: h.eventId, flatNo: h.flatNo, side: "monitor", code: isCode4(code) ? code : "----" });
  if (!timingSafeEqual(want, h.monitorHash) || !isCode4(code)) return { ok: false, reason: "wrong_code", h: { ...h, triesVoter: h.triesVoter + 1 } };
  const n = { ...h, voterConfirmedMs: h.voterConfirmedMs ?? now };
  return { ok: true, h: n, complete: !!n.monitorConfirmedMs };
}

/** The officer types the code shown on the VOTER's phone. The officer's own device must not be the voter's device. */
export async function monitorConfirm(h: Handshake, now: number, pepper: string, code: string, monitorDevice: string): Promise<HsResult> {
  const bad = live(h, now); if (bad) return { ok: false, reason: bad, h };
  if (!h.deviceHash) return { ok: false, reason: "not_opened", h };
  if (h.deviceHash === monitorDevice) return { ok: false, reason: "same_device", h };
  const want = await codeHash(pepper, { id: h.id, eventId: h.eventId, flatNo: h.flatNo, side: "voter", code: isCode4(code) ? code : "----" });
  if (!timingSafeEqual(want, h.voterHash) || !isCode4(code)) return { ok: false, reason: "wrong_code", h: { ...h, triesMonitor: h.triesMonitor + 1 } };
  const n = { ...h, monitorConfirmedMs: h.monitorConfirmedMs ?? now };
  return { ok: true, h: n, complete: !!n.voterConfirmedMs };
}

/** Normalised comparison of the number the officer typed from the incoming SMS with the number given at the start (last 10 digits). */
export const sameMobile = (a: string, b: string): boolean => { const d = (s: string) => s.replace(/\D/g, "").slice(-10); return d(a).length >= 8 && d(a) === d(b); };

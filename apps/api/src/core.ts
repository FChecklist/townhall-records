// Shared plumbing for the Pages Function: environment, D1 shapes, HTTP helpers, rate limits, sessions, mail, Turnstile, the log transaction.
import {
  appendEntry, hex, hmacHex, publicKeyFromPrivate, replayLog, sha256Hex, randomHex, MemoryPasscodeStore,
  type Actor, type EventState, type Json, type PasscodeRow, type PasscodeStore, type Purpose, type SignedEntry,
} from "../../../packages/engine/src";

export interface D1Stmt { bind(...v: unknown[]): D1Stmt; run(): Promise<any>; all<T = any>(): Promise<{ results: T[] }>; first<T = any>(): Promise<T | null> }
export interface D1 { prepare(sql: string): D1Stmt; batch(s: D1Stmt[]): Promise<any[]> }
export interface Attachment { filename: string; content: Uint8Array; contentType: string }
export interface Mailer { name: string; send(to: string, subject: string, text: string, attachments?: Attachment[]): Promise<boolean> }

export interface Env {
  DB: D1;
  /** Ed25519 private key, PKCS8 base64url. The ONLY signing secret. */
  SIGNING_KEY: string;
  /** HMAC pepper for passcodes, blind indexes, rate-limit keys and session tokens. */
  PEPPER: string;
  /** Master secret that wraps the per-event data keys of the private store. */
  MASTER_SECRET: string;
  SUPER_EMAIL?: string; INTERNAL_SECRET?: string;
  /** "1" only in local/test. Enables the Turnstile stub token and the test payment confirm. Payments are TEST-only in this build. */
  TEST_MODE?: string;
  TURNSTILE_SECRET?: string;
  RESEND_API_KEY?: string; MAIL_FROM?: string; MAIL_DAILY_LIMIT?: string;
  /** Injected mailers (local file stub, second provider). */
  MAILER?: Mailer; MAILER2?: Mailer;
  PAY_SERVICE_KEY?: string; PAY_SERVICE_URL?: string; PAY_SITE?: string; PAY_WEBHOOK_SECRET?: string;
  PUBLIC_ORIGIN?: string;
  /** "1" = also write an audit row for anonymous reads of public pages (off by default: public data, read-heavy). */
  AUDIT_PUBLIC_READS?: string;
}

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public extra: Record<string, unknown> = {}) { super(message); }
}
export const err = (status: number, code: string, message: string, extra?: Record<string, unknown>) => new ApiError(status, code, message, extra);

export const json = (o: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers } });

export interface Ctx { req: Request; env: Env; db: D1; now: number; url: URL; ip: string; body: any; deviceId: string; bsid: string; bid: string; client: Record<string, string | number | boolean>; cf: Record<string, string | number> | null; newBid?: string; auditId?: number; eventId?: string; actor?: { kind: string; ref: string | null }; lastSeq?: number }

export async function readBody(req: Request, max = 65_536): Promise<any> {
  if (req.method === "GET" || req.method === "HEAD") return {};
  const t = await req.text();
  if (t.length > max) throw err(413, "too_large", "That request is too big.");
  if (!t) return {};
  try { const v = JSON.parse(t); if (v === null || typeof v !== "object") throw 0; return v; } catch { throw err(400, "bad_json", "The request body must be JSON."); }
}

// ---- small validators ----
export const str = (v: unknown, name: string, min = 1, max = 200): string => {
  if (typeof v !== "string") throw err(400, "bad_" + name.replace(/\s+/g, "_"), `${name} is required.`);
  const s = v.normalize("NFC").trim();
  if (s.length < min || s.length > max) throw err(400, "bad_" + name.replace(/\s+/g, "_"), `${name} must be ${min} to ${max} characters.`);
  return s;
};
export const optStr = (v: unknown, name: string, max = 200): string => (v === undefined || v === null || v === "" ? "" : str(v, name, 0, max));
export const int = (v: unknown, name: string, min = 0, max = 1e12): number => {
  if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max) throw err(400, "bad_" + name, `${name} must be a whole number.`);
  return v;
};
export const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
export const email = (v: unknown): string => { const s = str(v, "email", 3, 254).toLowerCase(); if (!EMAIL_RE.test(s)) throw err(400, "bad_email", "That e-mail address does not look right."); return s; };

export const newId = (prefix: string, bytes = 8) => prefix + randomHex(bytes);

// ---- keys ----
let pubCache = new Map<string, string>();
export async function publicKey(env: Env): Promise<{ publicKey: string; kid: string }> {
  let pk = pubCache.get(env.SIGNING_KEY);
  if (!pk) { pk = await publicKeyFromPrivate(env.SIGNING_KEY); pubCache.set(env.SIGNING_KEY, pk); }
  return { publicKey: pk, kid: (await sha256Hex(pk)).slice(0, 16) };
}
export const pepperHash = (env: Env, label: string, value: string) => sha256Hex(`${env.PEPPER}|${label}|${value}`);

// ---- rate limits (fixed windows, keys are salted hashes) ----
export async function rateLimit(c: Ctx, kind: string, value: string, limit: number, windowSec: number): Promise<void> {
  const k = (await pepperHash(c.env, "rl:" + kind, value)).slice(0, 32);
  const bucket = Math.floor(c.now / (windowSec * 1000));
  await c.db.prepare("INSERT INTO rate_limits(k,bucket,n) VALUES(?,?,1) ON CONFLICT(k,bucket) DO UPDATE SET n=n+1").bind(k, bucket).run();
  const row = await c.db.prepare("SELECT n FROM rate_limits WHERE k=? AND bucket=?").bind(k, bucket).first<{ n: number }>();
  if ((row?.n ?? 0) > limit) throw err(429, "rate_limited", "Too many tries. Please wait a little and try again.", { retryAfterSec: windowSec });
}

// ---- turnstile (fails closed) ----
export async function checkTurnstile(c: Ctx, token: unknown): Promise<void> {
  const t = typeof token === "string" ? token : "";
  if (c.env.TURNSTILE_SECRET) {
    try {
      const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: `secret=${encodeURIComponent(c.env.TURNSTILE_SECRET)}&response=${encodeURIComponent(t)}&remoteip=${encodeURIComponent(c.ip)}` });
      const d: any = await r.json(); if (d?.success === true) return;
    } catch { /* fall through: closed */ }
    throw err(403, "turnstile", "Please complete the check and try again.");
  }
  if (c.env.TEST_MODE === "1" && t === "test-ok") return;
  throw err(403, "turnstile", "Please complete the check and try again.");
}

// ---- mail: interface, quota counter, second-provider slot ----
const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const mailLimit = (env: Env) => Math.max(1, parseInt(env.MAIL_DAILY_LIMIT ?? "90", 10) || 90);

class ResendMailer implements Mailer {
  name = "resend";
  constructor(private key: string, private from: string) {}
  async send(to: string, subject: string, text: string, attachments: Attachment[] = []) {
    const b64 = (u: Uint8Array) => { let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
    try { const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { authorization: `Bearer ${this.key}`, "content-type": "application/json" }, body: JSON.stringify({ from: this.from, to: [to], subject, text, ...(attachments.length ? { attachments: attachments.map((a) => ({ filename: a.filename, content: b64(a.content) })) } : {}), headers: { "Auto-Submitted": "auto-generated" } }) }); return r.ok; } catch { return false; }
  }
}
/** Local stub: the mail stays in mail_outbox so tests and a developer can read it. Never used when a real provider is configured. */
class OutboxMailer implements Mailer {
  name = "outbox";
  constructor(private db: D1, private now: number) {}
  async send(to: string, subject: string, text: string, attachments: Attachment[] = []) {
    const note = attachments.map((a) => `\n[attachment ${a.filename} ${a.contentType} ${a.content.length} bytes]`).join("");
    await this.db.prepare("INSERT INTO mail_outbox(to_addr,subject,body,at_ms,sent,provider) VALUES(?,?,?,?,1,'outbox')").bind(to, subject, text + note, this.now).run(); return true;
  }
}
export async function mailsToday(c: Ctx): Promise<Array<{ provider: string; n: number }>> {
  return (await c.db.prepare("SELECT provider, n FROM mail_counter WHERE day=?").bind(dayOf(c.now)).all<{ provider: string; n: number }>()).results;
}
/** Sends one mail through the first provider with quota left. Over quota everywhere -> 503 mail_quota_reached (shown in the super console). */
export async function sendMail(c: Ctx, to: string, subject: string, text: string, attachments: Attachment[] = []): Promise<void> {
  const providers: Mailer[] = [];
  if (c.env.MAILER) providers.push(c.env.MAILER);
  else if (c.env.RESEND_API_KEY) providers.push(new ResendMailer(c.env.RESEND_API_KEY, c.env.MAIL_FROM ?? "Townhall <noreply@example.invalid>"));
  else providers.push(new OutboxMailer(c.db, c.now));
  if (c.env.MAILER2) providers.push(c.env.MAILER2);
  const day = dayOf(c.now), limit = mailLimit(c.env);
  for (const p of providers) {
    const row = await c.db.prepare("SELECT n FROM mail_counter WHERE day=? AND provider=?").bind(day, p.name).first<{ n: number }>();
    if ((row?.n ?? 0) >= limit) continue;
    if (await p.send(to, subject, text, attachments)) {
      await c.db.prepare("INSERT INTO mail_counter(day,provider,n) VALUES(?,?,1) ON CONFLICT(day,provider) DO UPDATE SET n=n+1").bind(day, p.name).run();
      return;
    }
  }
  throw err(503, "mail_quota_reached", "We cannot send e-mail right now (daily limit reached). Please try again tomorrow.");
}
export async function mailQuotaLeft(c: Ctx): Promise<boolean> {
  const day = dayOf(c.now), limit = mailLimit(c.env);
  const rows = await mailsToday(c);
  const used = (p: string) => rows.find((r) => r.provider === p)?.n ?? 0;
  const names = [c.env.MAILER?.name ?? (c.env.RESEND_API_KEY ? "resend" : "outbox"), ...(c.env.MAILER2 ? [c.env.MAILER2.name] : [])];
  void day; return names.some((n) => used(n) < limit);
}

// ---- passcode store on D1 ----
const toRow = (r: any): PasscodeRow => ({ id: r.id, eventId: r.event_id, purpose: r.purpose, subject: r.subject, hash: r.hash, uniqHash: r.uniq_hash, issuedMs: r.issued_ms, expiresMs: r.expires_ms, tries: r.tries, lockedUntilMs: r.locked_until_ms, usedMs: r.used_ms, voidedMs: r.voided_ms, issuedBy: r.issued_by });
export class D1PasscodeStore implements PasscodeStore {
  constructor(private db: D1) {}
  async forSubject(e: string, p: Purpose, s: string) { return (await this.db.prepare("SELECT * FROM passcodes WHERE event_id=? AND purpose=? AND subject=? ORDER BY issued_ms, rowid").bind(e, p, s).all()).results.map(toRow); }
  async uniqueTaken(e: string, p: Purpose, u: string, now: number) { return !!(await this.db.prepare("SELECT 1 x FROM passcodes WHERE event_id=? AND purpose=? AND uniq_hash=? AND used_ms IS NULL AND voided_ms IS NULL AND expires_ms>?").bind(e, p, u, now).first()); }
  async insert(r: PasscodeRow) { await this.db.prepare("INSERT INTO passcodes(id,event_id,purpose,subject,hash,uniq_hash,issued_ms,expires_ms,tries,locked_until_ms,used_ms,voided_ms,issued_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(r.id, r.eventId, r.purpose, r.subject, r.hash, r.uniqHash, r.issuedMs, r.expiresMs, r.tries, r.lockedUntilMs, r.usedMs, r.voidedMs, r.issuedBy).run(); }
  async save(r: PasscodeRow) { await this.db.prepare("UPDATE passcodes SET tries=?, locked_until_ms=?, used_ms=?, voided_ms=? WHERE id=?").bind(r.tries, r.lockedUntilMs, r.usedMs, r.voidedMs, r.id).run(); }
}
export { MemoryPasscodeStore };

// ---- sessions ----
export interface Session { tokenHash: string; kind: "staff" | "voter" | "super"; eventId: string | null; personId: string | null; flatNo: string | null }
export async function createSession(c: Ctx, s: { kind: Session["kind"]; eventId: string | null; personId: string | null; flatNo: string | null }, ttlMs: number): Promise<string> {
  const token = randomHex(32);
  const h = await pepperHash(c.env, "session", token);
  await c.db.prepare("INSERT INTO sessions(token_hash,event_id,person_id,flat_no,kind,created_ms,expires_ms) VALUES(?,?,?,?,?,?,?)").bind(h, s.eventId, s.personId, s.flatNo, s.kind, c.now, c.now + ttlMs).run();
  return token;
}
export async function requireSession(c: Ctx, kind: Session["kind"]): Promise<Session> {
  const m = /^Bearer ([0-9a-f]{64})$/.exec(c.req.headers.get("authorization") ?? "");
  if (!m) throw err(401, "not_signed_in", "Please sign in.");
  const h = await pepperHash(c.env, "session", m[1]!);
  const r = await c.db.prepare("SELECT * FROM sessions WHERE token_hash=? AND kind=? AND expires_ms>?").bind(h, kind, c.now).first<any>();
  if (!r) throw err(401, "not_signed_in", "Please sign in again.");
  if (r.device_hash) { // bound session: this phone (device id) or this browser (server-issued cookie) must be the one that was linked
    const sameDevice = !!c.deviceId && (await pepperHash(c.env, "dev", c.deviceId)) === r.device_hash;
    const sameBrowser = !!c.bid && !!r.browser_hash && (await pepperHash(c.env, "bid", c.bid)) === r.browser_hash;
    if (!sameDevice && !sameBrowser) throw err(403, "wrong_device", "This session belongs to another phone. Ask the Attendance Officer to link this phone.");
  }
  return { tokenHash: h, kind: r.kind, eventId: r.event_id, personId: r.person_id, flatNo: r.flat_no };
}

// ---- the log transaction ----
export const insertEntry = (db: D1, se: SignedEntry) => db.prepare("INSERT INTO log_entries(event_id,seq,hash,prev_hash,entry_json,sig) VALUES(?,?,?,?,?,?)").bind(se.entry.eid, se.entry.seq, se.hash, se.entry.prev, JSON.stringify(se.entry), se.sig);
export async function loadEntries(db: D1, eid: string): Promise<SignedEntry[]> {
  const rows = (await db.prepare("SELECT entry_json, hash, sig FROM log_entries WHERE event_id=? ORDER BY seq").bind(eid).all<{ entry_json: string; hash: string; sig: string }>()).results;
  return rows.map((r) => ({ entry: JSON.parse(r.entry_json), hash: r.hash, sig: r.sig }));
}

/** One atomic write: new log entries (each signed on top of the previous) + the record rows that belong to them, in a single D1 batch. */
export class Tx {
  entries: SignedEntry[]; stmts: D1Stmt[] = []; state!: EventState; private dirty = true;
  constructor(public c: Ctx, public eid: string, entries: SignedEntry[]) { this.entries = entries; }
  static async load(c: Ctx, eid: string): Promise<Tx> {
    const e = await loadEntries(c.db, eid);
    if (!e.length) throw err(404, "no_event", "No such event.");
    const tx = new Tx(c, eid, e); await tx.refresh(); return tx;
  }
  /** For a brand new event (no entries yet). */
  static fresh(c: Ctx, eid: string) { const tx = new Tx(c, eid, []); return tx; }
  async refresh() { this.state = await replayLog(this.entries); this.dirty = false; return this.state; }
  async st(): Promise<EventState> { return this.dirty ? this.refresh() : this.state; }
  async add(type: string, actor: Actor, payload: Record<string, Json>, rows: (seq: number) => D1Stmt[] = () => []): Promise<SignedEntry> {
    // every entry carries a keyed fingerprint of the IP address and device that caused it (never the values; includes eid+seq so entries cannot be linked to each other publicly)
    if (this.c.deviceId) payload = { ...payload, acc: await hmacHex(this.c.env.PEPPER, ["acc", this.eid, this.nextSeq, this.c.ip, this.c.deviceId].join("|")) };
    const se = await appendEntry({ eid: this.eid, prev: this.entries.at(-1) ?? null, type, actor, payload, ts: this.c.now, privateKey: this.c.env.SIGNING_KEY, scanAllow: this.allow() });
    this.entries.push(se); this.dirty = true;
    this.stmts.push(insertEntry(this.c.db, se), ...rows(se.entry.seq));
    return se;
  }
  private allow(): string[] { const reg = this.state?.created?.society.registrationNo; return reg ? [reg] : this.regAllow; }
  regAllow: string[] = [];
  get nextSeq() { return this.entries.length + 1; }
  async commit(extra: D1Stmt[] = []): Promise<void> {
    try { await this.c.db.batch([...this.stmts, ...extra]); } catch (e: any) {
      const m = String(e?.message ?? e);
      if (/UNIQUE|PRIMARY KEY|log chain/i.test(m)) throw err(409, "busy", "Someone else changed this at the same moment. Please try again.");
      throw e;
    }
    this.stmts = [];
    this.c.lastSeq = this.entries.at(-1)?.entry.seq;
  }
}

export const actorOf = (pid: string, role: string): Actor => ({ pid, role });
export const maskedActor = (state: EventState, pid: string): Actor => ({ pid, role: state.people.get(pid)?.roles[0] ?? "none" });
export { hex };

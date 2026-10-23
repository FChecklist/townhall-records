import { TERMS_VERSION, generateSigningKey, verifyChain, type SignedEntry } from "../../../packages/engine/src";
import { handle } from "../src/handler";
import type { Env } from "../src/core";
import { makeD1 } from "./d1-sqlite";

export const T0 = Date.UTC(2026, 10, 1, 9, 0, 0);
export const DAY = 86_400_000;

export class H {
  raw!: ReturnType<typeof makeD1>["raw"]; env!: Env; now = T0; ip = 1;
  static async make(over: Partial<Env> = {}): Promise<H> {
    const h = new H(); const d = makeD1(); h.raw = d.raw; const k = await generateSigningKey(); h.pub = k.publicKeyRaw;
    h.env = { DB: d.db, SIGNING_KEY: k.privateKeyPkcs8, PEPPER: "test-pepper", MASTER_SECRET: "test-master", TEST_MODE: "1", SUPER_EMAIL: "owner@platform.example", INTERNAL_SECRET: "tick", ...over };
    return h;
  }
  pub = "";
  device: string | null = "device-test-00000001";
  /** The terms box is ticked automatically on the three calls that need it, unless the test sets acceptTerms itself. */
  async call(method: string, path: string, body?: unknown, token?: string, ip = "9.9.9." + (this.ip++ % 250)): Promise<{ status: number; body: any; text: string }> {
    if (body && typeof body === "object" && !("acceptTerms" in (body as any)) && method === "POST" && (path === "/api/events" || path === "/api/auth/verify" || path === "/api/vote/login" || (path.startsWith("/api/h/") && path.endsWith("/confirm")))) body = { ...(body as any), acceptTerms: true, termsVersion: TERMS_VERSION };
    const r = await handle(new Request("http://x" + path, { method, headers: { "content-type": "application/json", "cf-connecting-ip": ip, "user-agent": "TestBrowser/1.0 (test)", ...(this.device ? { "x-device-id": this.device } : {}), ...(token ? { authorization: "Bearer " + token } : {}) }, body: method === "GET" || body === undefined ? undefined : JSON.stringify(body) }), this.env, this.now);
    const text = await r.text(); let b: any = null; try { b = JSON.parse(text); } catch { /* html */ }
    return { status: r.status, body: b, text };
  }
  /** The last 6-digit code mailed to this address (local outbox stub). */
  codeFor(to: string): string {
    const rows = this.raw.query("SELECT body FROM mail_outbox WHERE to_addr=? ORDER BY id DESC").all(to) as any[];
    const m = rows.map((r) => /\b(\d{6})\b/.exec(r.body)).find(Boolean); if (!m) throw new Error("no mail code for " + to); return m[1]!;
  }
  count(sql: string, ...a: any[]): number { return (this.raw.query(sql).get(...a) as any).c; }
}

export const ORG = { name: "Rajat Agarwal", email: "rajat.agarwal@example.org", phone: "9876543210" };
export const HOSTP = { name: "Neha Gupta", email: "neha.gupta@example.org", phone: "9123456780" };
export const OFFP = { name: "Sunil Verma", email: "sunil.verma@example.org", phone: "9988776655" };
export const PRIVATE = [ORG, HOSTP, OFFP].flatMap((p) => [p.name, p.email, p.phone, ...p.name.split(" ")]);

export interface EventCtx { h: H; eid: string; org: string; pid: string }
export async function newEvent(h: H, over: Record<string, unknown> = {}): Promise<EventCtx & { ip: string }> {
  const r = await h.call("POST", "/api/events", {
    kind: "meeting", eventType: "agm", title: "Annual General Meeting 2026", venue: "Clubhouse", scheduledMs: h.now + 10 * DAY, packId: "in-up-aoa", country: "IN", useRecommended: true,
    society: { name: "Green Park Apartments", address: "12 Park Road, Lucknow", registrationNo: "REG/2020/118", kind: "AOA" }, organizer: ORG, turnstile: "test-ok", ...over,
  });
  if (r.status !== 201) throw new Error("create failed " + r.text);
  const { eventId, personId } = r.body;
  const v = await h.call("POST", "/api/auth/verify", { eventId, personId, code: h.codeFor(ORG.email) });
  if (v.status !== 200) throw new Error("verify failed " + v.text);
  return { h, eid: eventId, org: v.body.token, pid: personId, ip: "" };
}
export const flatsOf = (n: number) => Array.from({ length: n }, (_, i) => ({ flatNo: `A-${101 + i}`, weight: 1, eligible: true }));
export async function setup(h: H, o: { flats?: number; secret?: boolean; kind?: "meeting" | "election"; pack?: string; eventType?: string } = {}) {
  const e = await newEvent(h, { kind: o.kind ?? "meeting", packId: o.pack ?? "in-up-aoa", eventType: o.eventType ?? "agm" });
  const ok = async (r: Promise<any>) => { const x = await r; if (x.status >= 300) throw new Error(JSON.stringify(x.body)); return x; };
  await ok(h.call("PUT", `/api/events/${e.eid}/roll`, { flats: flatsOf(o.flats ?? 10) }, e.org));
  const pr = o.kind === "election"
    ? await ok(h.call("POST", `/api/events/${e.eid}/points`, { kind: "election_post", title: "President", candidates: ["Asha", "Bimal", "Chitra"], maxChoices: 1, secret: true }, e.org))
    : await ok(h.call("POST", `/api/events/${e.eid}/points`, { kind: "resolution", title: "Approve the accounts", secret: o.secret ?? false, majorityClass: "simple" }, e.org));
  const pay = await ok(h.call("POST", `/api/events/${e.eid}/pay`, {}, e.org));
  await ok(h.call("POST", "/api/pay/test-confirm", { eventId: e.eid, paymentId: pay.body.paymentId }, e.org));
  return { ...e, pointId: pr.body.pointId as string, ok };
}
export async function appointVerified(h: H, e: EventCtx, p: typeof HOSTP, role: string): Promise<{ token: string; pid: string }> {
  const r = await h.call("POST", `/api/events/${e.eid}/people`, { name: p.name, email: p.email, phone: p.phone, role }, e.org);
  if (r.status !== 201) throw new Error("appoint failed " + r.text);
  const v = await h.call("POST", "/api/auth/verify", { eventId: e.eid, personId: r.body.personId, code: h.codeFor(p.email) });
  if (v.status !== 200) throw new Error("verify failed " + v.text);
  return { token: v.body.token, pid: r.body.personId };
}
export async function getLog(h: H, eid: string): Promise<{ entries: SignedEntry[]; publicKey: string }> {
  const r = await h.call("GET", `/api/events/${eid}/log`); return { entries: r.body.entries, publicKey: r.body.publicKey };
}
export async function chainOk(h: H, eid: string) { const { entries, publicKey } = await getLog(h, eid); return verifyChain(entries, publicKey); }

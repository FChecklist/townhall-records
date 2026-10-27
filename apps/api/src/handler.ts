// Townhall API: one framework-free entry point, `handle(request, env, now)`. The Pages Function only forwards to it.
// Routes and rules: docs/design/API.md. There is no DELETE route and no route that edits history.
import rulePacks from "../../../docs/research/rule-packs.json";
import extraPacks from "../../../docs/research/rule-packs-extra.json";
import {
  type Bytes, BRAND, journeyFor, OFFICIAL_GROUPS, OFFICIAL_GROUP_IDS, OUTCOMES, REASON_CODES, REASON_IDS, postponeQuote, ROLE_LIMITS, roleCounts, appointProblem, missingChecks, geoFlags, buildRollTemplateXlsx, readPdfTable, parseRollTable, diffRoll, type SheetFlat, HANDSHAKE_MAX_TRIES, HANDSHAKE_TTL_MS, codeHash, openLink, voterConfirm, monitorConfirm, type Handshake, hmacHex, newSerial, paperToken, parsePaperToken, paperLayout, renderPaperSvg, LANGUAGES, coverage, dictionary, isLang, playbook,
  defaultSchedule, validateSchedule, type Schedule, TERMS_VERSION, TERMS_TEXT, termsSha256, priceFor, isCountry, formatPrice, renderReportPdf, pdfSha256, extractSeal, normalizeBallotDesign, defaultBallotDesign, ballotInstruction, type Actor,
  CUSTOM_WORLD_PACK, OPTIONS, PARAMS, RuleError, aesDecrypt, aesEncrypt, applyRecommended, b64url, buildReportModel, canAmendPoint, canChangeRoll, canChangeRule, canDo, canVote, cloneTemplate,
  deriveKey32, effectiveWeight, extractData, fromB64url, issuePasscode, loadAllPacks, maskEmail, maskName, maskPhone, newRuleSet, parseMajority, progressOf, proxyAllowed, randomHex, renderReportHtml,
  sealReport, setOption, validateBallot, validateParam, verifyPasscode, LOGIN_TTL_MS, sha256Hex, type EnginePack, type EventState, type PointDef, type RuleSet, type Json, type Role,
} from "../../../packages/engine/src";
import { agendaPayload, openPointPayload, receiptOf, resultPayload, sealBoxPayload, type BoxBallot } from "../../../packages/engine/src/commands";
import { centralConfigured, centralOrder, centralVerify, handleRazorpayWebhook, ownerLedger, pushSiteSummary, recordAttempt, hmacHex as payHmac, same as paySame } from "./payments";
import {
  ApiError, D1PasscodeStore, Tx, actorOf, checkTurnstile, createSession, err, int, json, loadEntries, mailLimit, mailQuotaLeft, mailsToday, newId, optStr, pepperHash, publicKey, rateLimit, readBody, requireSession,
  sendMail, str, email as emailOf, type Ctx, type D1Stmt, type Env,
} from "./core";

export const PACKS: Map<string, EnginePack> = loadAllPacks(rulePacks, [], extraPacks);
const EVENT_TYPES = ["agm", "sgm", "monthly", "committee", "custom"];
const PRICES_PUBLIC = { india: { meeting: priceFor("meeting", "IN"), election: priceFor("election", "IN") }, world: { meeting: priceFor("meeting", "US"), election: priceFor("election", "US") } };
const STAFF_TTL = 12 * 3600_000, VOTER_TTL = 8 * 3600_000;
const _unused = 0; void _unused;
const ENTRY_ACTOR = (st: EventState, pid: string) => actorOf(pid, st.people.get(pid)?.roles[0] ?? "none");

type Handler = (c: Ctx, m: RegExpMatchArray) => Promise<Response>;
const routes: Array<{ method: string; re: RegExp; h: Handler }> = [];
const route = (method: string, path: string, h: Handler) => routes.push({ method, re: new RegExp("^" + path.replace(/:(\w+)/g, "([^/]+)") + "/?$"), h });

// ------------------------------------------------------------------------------------------------ private store
async function wrapKey(env: Env) { return deriveKey32(env.MASTER_SECRET, "wrap"); }
async function newEventKeyStmt(c: Ctx, eid: string): Promise<D1Stmt> {
  const key = crypto.getRandomValues(new Uint8Array(32));
  const wrapped = await aesEncrypt(await wrapKey(c.env), b64url(key), eid);
  return c.db.prepare("INSERT INTO event_keys(event_id,wrapped_key,created_ms,destroyed_ms) VALUES(?,?,?,NULL)").bind(eid, wrapped, c.now);
}
async function eventKey(c: Ctx, eid: string): Promise<Bytes> {
  const r = await c.db.prepare("SELECT wrapped_key FROM event_keys WHERE event_id=?").bind(eid).first<{ wrapped_key: string | null }>();
  if (!r?.wrapped_key) throw err(410, "data_erased", "The private details of this event have been erased.");
  return fromB64url(await aesDecrypt(await wrapKey(c.env), r.wrapped_key, eid));
}
interface Contact { name: string; email: string; phone: string }
/** One random key per person ('p:<id>') and per flat's attendee ('f:<flat>'), wrapped under the event key. Throwing the wrapped key away erases that one subject for ever. */
async function subjectKey(c: Ctx, eid: string, ref: string, create: boolean, evKey?: Bytes): Promise<Bytes | null> {
  const r = await c.db.prepare("SELECT wrapped_key FROM subject_keys WHERE event_id=? AND ref=?").bind(eid, ref).first<{ wrapped_key: string | null }>();
  const ek = evKey ?? (r || create ? await eventKey(c, eid) : null);
  if (r) { if (!r.wrapped_key) throw err(410, "subject_erased", "These details have been erased."); return fromB64url(await aesDecrypt(ek!, r.wrapped_key, eid + "|subj|" + ref)); }
  if (!create) return null;
  const k = crypto.getRandomValues(new Uint8Array(32));
  await c.db.prepare("INSERT OR IGNORE INTO subject_keys(event_id,ref,wrapped_key,created_ms,destroyed_ms) VALUES(?,?,?,?,NULL)").bind(eid, ref, await aesEncrypt(ek!, b64url(k), eid + "|subj|" + ref), c.now).run();
  return subjectKey(c, eid, ref, false, ek!); // read back what is really stored (another request may have won the race)
}
async function personStmts(c: Ctx, eid: string, pid: string, p: Contact, flatNo: string | null, key: Bytes): Promise<D1Stmt[]> {
  const sk = (await subjectKey(c, eid, "p:" + pid, true, key))!; const ct = await aesEncrypt(sk, JSON.stringify(p), eid + "|" + pid);
  const idx = p.email ? await pepperHash(c.env, "email:" + eid, p.email) : "";
  return [
    c.db.prepare("INSERT INTO people(id,event_id,masked_name,masked_email,masked_phone,flat_no,created_ms) VALUES(?,?,?,?,?,?,?)").bind(pid, eid, maskName(p.name), p.email ? maskEmail(p.email) : "", p.phone ? maskPhone(p.phone) : "", flatNo, c.now),
    c.db.prepare("INSERT INTO private_contacts(person_id,event_id,ct,email_idx,created_ms) VALUES(?,?,?,?,?)").bind(pid, eid, ct, idx, c.now),
  ];
}
/** null when that person was erased. Contacts written before per-person keys existed still open with the event key. */
async function openContact(c: Ctx, eid: string, pid: string, ct: string): Promise<Contact | null> {
  try { const sk = await subjectKey(c, eid, "p:" + pid, false); return JSON.parse(await aesDecrypt(sk ?? (await eventKey(c, eid)), ct, eid + "|" + pid)); } catch (e) { if (e instanceof ApiError && e.status === 410) return null; throw e; }
}
async function contactOf(c: Ctx, eid: string, pid: string): Promise<Contact> {
  const r = await c.db.prepare("SELECT ct FROM private_contacts WHERE person_id=? AND event_id=?").bind(pid, eid).first<{ ct: string }>();
  if (!r) throw err(404, "no_person", "No such person.");
  const o = await openContact(c, eid, pid, r.ct); if (!o) throw err(410, "subject_erased", "These details have been erased."); return o;
}
const statusStmt = (c: Ctx, eid: string, status: string, seq: number) => c.db.prepare("INSERT INTO event_status(event_id,status,log_seq,at_ms) VALUES(?,?,?,?)").bind(eid, status, seq, c.now);
const roleStmt = (c: Ctx, eid: string, pid: string, role: string, action: string, by: string | null, seq: number) => c.db.prepare("INSERT INTO role_assignments(event_id,person_id,role,action,appointed_by,log_seq,at_ms) VALUES(?,?,?,?,?,?,?)").bind(eid, pid, role, action, by, seq, c.now);

// ------------------------------------------------------------------------------------------------ terms (everyone ticks the box) and the access audit
async function requireTerms(c: Ctx): Promise<void> {
  if (c.body.acceptTerms !== true || c.body.termsVersion !== TERMS_VERSION) throw err(400, "terms_required", "Please read and tick the terms and conditions to continue.", { termsVersion: TERMS_VERSION });
}
const termsEntry = async (subject: "pid" | "flat", ref: string) => ({ subject, ref, version: TERMS_VERSION, termsSha256: await termsSha256() });
const DEVICE_RE = /^[A-Za-z0-9_-]{16,64}$/;
async function auditKey(c: Ctx, eid: string): Promise<{ key: Bytes; scope: "event" | "platform" }> {
  if (eid !== "platform") { try { return { key: await eventKey(c, eid), scope: "event" }; } catch { /* destroyed or none: platform key */ } }
  return { key: await deriveKey32(c.env.MASTER_SECRET, "platform-audit"), scope: "platform" };
}
/** Browser-side protection on every answer: no framing, no sniffing, HTTPS only, no referrer, camera and place only for our own pages, and a closed content policy (the sealed report is one self-contained page, so it may run its own inline code and nothing from elsewhere). */
function secureHeaders(res: Response): void {
  const h = res.headers; const html = (h.get("content-type") ?? "").includes("text/html");
  const set = (k: string, v: string) => { try { h.set(k, v); } catch { /* immutable response: skipped */ } };
  set("strict-transport-security", "max-age=63072000; includeSubDomains; preload"); set("x-content-type-options", "nosniff"); set("x-frame-options", "DENY"); set("referrer-policy", "no-referrer");
  set("permissions-policy", "geolocation=(self), camera=(self), microphone=(), payment=(self), usb=(), interest-cohort=()"); set("cross-origin-opener-policy", "same-origin"); set("cross-origin-resource-policy", "same-origin");
  set("content-security-policy", html ? "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'" : "default-src 'none'; frame-ancestors 'none'");
}
const routeName = (path: string) => path.replace(/\b[0-9a-f]{32,}\b/g, ":id").replace(/\bp_[0-9a-f]{16}\b/g, ":pid").replace(/\bpt_[0-9a-f]{16}\b/g, ":pt");
/** Writes one audit row. Choices, receipts and passcodes are never part of it. Throws if the row cannot be written (the caller then refuses the request). */
async function writeAudit(c: Ctx, phase: "request" | "result", status: number | null): Promise<number> {
  const eid = c.eventId ?? "platform"; const { key, scope } = await auditKey(c, eid); const h = c.req.headers;
  const everything = { ip: c.ip, device: c.deviceId || null, browserSession: c.bsid || null, browserCookie: c.bid || c.newBid || null, ua: (h.get("user-agent") ?? "").slice(0, 300), acceptLanguage: (h.get("accept-language") ?? "").slice(0, 120), referer: (h.get("referer") ?? "").slice(0, 200), secChUa: (h.get("sec-ch-ua") ?? "").slice(0, 200), secChUaPlatform: (h.get("sec-ch-ua-platform") ?? "").slice(0, 40), secChUaMobile: (h.get("sec-ch-ua-mobile") ?? "").slice(0, 8), client: c.client, network: c.cf, forwardedFor: (h.get("x-forwarded-for") ?? "").slice(0, 200) };
  const ct = await aesEncrypt(key, JSON.stringify(everything), "audit|" + eid);
  const bidNow = c.bid || c.newBid || "";
  const r = await c.db.prepare("INSERT INTO access_audit(at_ms,event_id,phase,ref_id,method,route,actor_kind,actor_ref,status,log_seq,ct,ip_idx,dev_idx,key_scope,bsid_idx,bid_idx) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id")
    .bind(c.now, eid, phase, phase === "result" ? c.auditId ?? null : null, c.req.method, routeName(c.url.pathname), c.actor?.kind ?? "anon", c.actor?.ref ?? null, status, phase === "result" ? c.lastSeq ?? null : null, ct, (await pepperHash(c.env, "ip", c.ip)).slice(0, 24), (await pepperHash(c.env, "dev", c.deviceId || "none")).slice(0, 24), scope,
      c.bsid ? (await pepperHash(c.env, "bsid", c.bsid)).slice(0, 24) : null, bidNow ? (await pepperHash(c.env, "bid", bidNow)).slice(0, 24) : null).first<{ id: number }>();
  return r!.id;
}
/** Whitelist of what the browser may tell us about itself (screen, language, time zone ...). Anything else is dropped. */
function sanitizeClient(raw: string | null): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {}; if (!raw || raw.length > 1500) return out;
  let o: any; try { o = JSON.parse(raw); } catch { return out; } if (!o || typeof o !== "object") return out;
  for (const k of ["screen", "viewport", "dpr", "tz", "lang", "langs", "platform", "touch", "memory", "cores", "colorDepth", "orientation", "online", "connection", "standalone", "cookiesEnabled", "storage", "appVersion"]) { const v = o[k]; if (typeof v === "string") out[k] = v.slice(0, 80); else if (typeof v === "number" && Number.isFinite(v)) out[k] = v; else if (typeof v === "boolean") out[k] = v; }
  return out;
}
function pickCf(req: Request): Record<string, string | number> | null {
  const cf = (req as any).cf as Record<string, unknown> | undefined; const out: Record<string, string | number> = {};
  for (const k of ["country", "region", "regionCode", "city", "postalCode", "timezone", "continent", "asn", "asOrganization", "colo", "latitude", "longitude", "tlsVersion", "httpProtocol", "isEUCountry"]) { const v = cf?.[k]; if (typeof v === "string" || typeof v === "number") out[k] = typeof v === "string" ? v.slice(0, 80) : v; }
  const ipc = req.headers.get("cf-ipcountry"); if (ipc && !out.country) out.country = ipc.slice(0, 4);
  return Object.keys(out).length ? out : null;
}
const maskIp = (ip: string) => (ip.includes(":") ? ip.split(":").slice(0, 2).join(":") + ":*" : ip.split(".").slice(0, 2).join(".") + ".*.*");
async function readAudit(c: Ctx, eid: string, full: boolean): Promise<any[]> {
  const rows = (await c.db.prepare("SELECT * FROM access_audit WHERE event_id=? AND phase='result' ORDER BY id DESC LIMIT 500").bind(eid).all<any>()).results;
  const out = [];
  for (const r of rows) {
    let d: any = null;
    try { const k = r.key_scope === "event" ? await eventKey(c, eid) : await deriveKey32(c.env.MASTER_SECRET, "platform-audit"); d = JSON.parse(await aesDecrypt(k, r.ct, "audit|" + eid)); } catch { /* erased */ }
    out.push({ id: r.id, at: r.at_ms, method: r.method, route: r.route, actor: r.actor_kind, ref: r.actor_ref, status: r.status, logSeq: r.log_seq, ...(d ? (full ? { ip: d.ip, device: d.device, userAgent: d.ua } : { ip: maskIp(d.ip), device: String(d.device ?? "").slice(0, 6) + "...", userAgent: String(d.ua).split(/[ /]/)[0] }) : { erased: true }), ipFingerprint: r.ip_idx.slice(0, 8), deviceFingerprint: r.dev_idx.slice(0, 8) });
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ guards
async function staff(c: Ctx, eid: string, action?: Parameters<typeof canDo>[2], extra: Parameters<typeof canDo>[3] = {}): Promise<{ tx: Tx; pid: string }> {
  const s = await requireSession(c, "staff");
  if (s.eventId !== eid) throw err(403, "wrong_event", "This sign-in is for another event.");
  await rateLimit(c, "write", s.tokenHash, 120, 60);
  const tx = await Tx.load(c, eid);
  if (action) { const d = canDo(await tx.st(), s.personId, action, extra); if (!d.ok) throw err(403, d.code, d.message); }
  return { tx, pid: s.personId! };
}
const decide = (d: { ok: true } | { ok: false; code: string; message: string }, status = 403) => { if (!d.ok) throw err(d.code === "already_voted" ? 409 : status, d.code, d.message); };
const needPack = (id: unknown): EnginePack => { const p = PACKS.get(String(id)); if (!p) throw err(400, "bad_pack", "Unknown rule pack."); return p; };

// ------------------------------------------------------------------------------------------------ public reads
route("GET", "/api/health", async () => json({ ok: true }));
route("GET", "/api/terms", async () => json({ version: TERMS_VERSION, text: TERMS_TEXT, sha256: await termsSha256() }));
route("GET", "/api/pubkey", async (c) => json({ alg: "Ed25519", ...(await publicKey(c.env)) }));
route("GET", "/api/schema", async () => json({ params: PARAMS.map(({ requiredWhen, ...p }) => ({ ...p, conditional: !!requiredWhen })), options: OPTIONS, eventTypes: EVENT_TYPES, prices: PRICES_PUBLIC, priceText: { india: [formatPrice(priceFor("meeting", "IN")), formatPrice(priceFor("election", "IN"))], world: [formatPrice(priceFor("meeting", "US")), formatPrice(priceFor("election", "US"))] }, electionFormats: ["single_post", "ranked_posts", "top_n"], ballotDesign: defaultBallotDesign(), milestones: ["start", "votingStart", "votingEnd", "end"] }));
route("GET", "/api/packs", async () => json([...PACKS.values()].map((p) => ({ id: p.id, name: p.name, jurisdiction: p.jurisdiction, confidence: p.confidence, needsLawyer: p.needsLawyer, recommended: p.recommended }))));
route("GET", "/api/packs/:id", async (c, m) => json(needPack(m[1])));

route("GET", "/api/events/:id", async (c, m) => {
  const st = await (await Tx.load(c, m[1]!)).st();
  return json({ model: buildReportModel(st), progress: progressOf(st) });
});
route("GET", "/api/events/:id/log", async (c, m) => {
  const e = await loadEntries(c.db, m[1]!); if (!e.length) throw err(404, "no_event", "No such event.");
  return json({ head: { seq: e.length, hash: e.at(-1)!.hash }, entries: e, ...(await publicKey(c.env)) });
});
route("GET", "/api/events/:id/template", async (c, m) => json(cloneTemplate(await (await Tx.load(c, m[1]!)).st(), { cloneIsVerifiedOrganizerOfSource: false })));
route("GET", "/api/events/:id/receipts/:pid", async (c, m) => {
  const st = await (await Tx.load(c, m[1]!)).st(); const seal = st.seals.get(m[2]!);
  if (!seal) throw err(404, "not_sealed", "The receipt list appears when voting on this point closes.");
  const q = c.url.searchParams.get("check");
  return json(q ? { found: seal.receipts.includes(q) } : { receipts: seal.receipts, digest: seal.digest });
});

async function pageFor(c: Ctx, eid: string): Promise<{ html: string; sealed: boolean }> {
  const rep = await c.db.prepare("SELECT html FROM reports WHERE event_id=? ORDER BY rev DESC LIMIT 1").bind(eid).first<{ html: string }>();
  if (rep) return { html: rep.html, sealed: true };
  const tx = await Tx.load(c, eid); const pk = await publicKey(c.env);
  return { html: renderReportHtml(buildReportModel(await tx.st()), tx.entries, pk.publicKey, pk.kid), sealed: false };
}
route("GET", "/api/r/:id", async (c, m) => {
  const { html } = await pageFor(c, m[1]!);
  const dl = c.url.searchParams.get("download") === "1";
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "content-disposition": `${dl ? "attachment" : "inline"}; filename="aoa-rwa-${m[1]!.slice(0, 8)}-report.html"`, "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; img-src data:" } });
});
route("GET", "/api/r/:id/head", async (c, m) => {
  const last = await c.db.prepare("SELECT seq, hash FROM log_entries WHERE event_id=? ORDER BY seq DESC LIMIT 1").bind(m[1]!).first<{ seq: number; hash: string }>();
  if (!last) throw err(404, "no_event", "No such event.");
  const s = await c.db.prepare("SELECT status FROM event_status WHERE event_id=? ORDER BY id DESC LIMIT 1").bind(m[1]!).first<{ status: string }>();
  return json({ seq: last.seq, hash: last.hash, status: s?.status ?? "setup", serverNow: c.now });
});
route("GET", "/api/r/:id/data", async (c, m) => { const tx = await Tx.load(c, m[1]!); const pk = await publicKey(c.env); return json({ model: buildReportModel(await tx.st()), log: tx.entries, ...pk }); });

// ------------------------------------------------------------------------------------------------ create event (and clone)
route("POST", "/api/events", async (c) => {
  const b = c.body;
  await rateLimit(c, "create-ip", c.ip, 5, 3600);
  await checkTurnstile(c, b.turnstile);
  if (!(await mailQuotaLeft(c))) throw err(503, "mail_quota_reached", "We cannot send e-mail right now (daily limit reached). Please try again tomorrow.");
  const kind = b.kind === "election" ? "election" : b.kind === "meeting" ? "meeting" : (() => { throw err(400, "bad_kind", "kind must be meeting or election."); })();
  const eventType = EVENT_TYPES.includes(b.eventType) ? (b.eventType as string) : (() => { throw err(400, "bad_event_type", "Unknown event type."); })();
  const o = b.organizer ?? {};
  const org = { name: str(o.name, "organizer name", 2, 80), email: emailOf(o.email), phone: optStr(o.phone, "phone", 20) };

  // clone source (anyone may clone a public event; the private roll only for its verified Organizer)
  let tpl: ReturnType<typeof cloneTemplate> | null = null; let srcTx: Tx | null = null; let isSrcOrg = false;
  if (b.cloneFrom) {
    srcTx = await Tx.load(c, String(b.cloneFrom)); const sst = await srcTx.st();
    const m = /^Bearer ([0-9a-f]{64})$/.exec(c.req.headers.get("authorization") ?? "");
    if (m) { const sess = await c.db.prepare("SELECT person_id, event_id FROM sessions WHERE token_hash=? AND kind='staff' AND expires_ms>?").bind(await pepperHash(c.env, "session", m[1]!), c.now).first<any>(); isSrcOrg = !!sess && sess.event_id === srcTx.eid && !!(sst.people.get(sess.person_id)?.roles.includes("organizer") || sst.people.get(sess.person_id)?.roles.includes("host")) && !!sst.people.get(sess.person_id)?.verified; }
    tpl = cloneTemplate(sst, { cloneIsVerifiedOrganizerOfSource: isSrcOrg, wantPrivateRoll: !!b.privateRoll });
  }
  const soc = b.society ?? {};
  const society = {
    name: str(soc.name ?? tpl?.society.name, "society name", 2, 120), address: str(soc.address ?? tpl?.society.address, "society address", 2, 240),
    registrationNo: str(soc.registrationNo ?? tpl?.society.registrationNo, "registration number", 1, 60), kind: str(soc.kind ?? tpl?.society.kind ?? "AOA", "society kind", 2, 30),
  };
  const pack = needPack(b.packId ?? tpl?.packId);
  const country = (isCountry(b.country) ? b.country : pack.jurisdiction.split("-")[0]!).toUpperCase();
  if (!isCountry(country)) throw err(400, "bad_country", "Please choose the country of the society (two letters, for example IN or US).");
  const scheduledMs = int(b.schedule?.start?.atMs ?? b.scheduledMs, "scheduledMs", c.now - 86_400_000, c.now + 3 * 366 * 86_400_000);
  let schedule: Schedule = b.schedule ?? defaultSchedule(scheduledMs, str(b.venue, "venue", 2, 200));
  { const sv = validateSchedule(schedule); if (sv) throw err(400, "bad_schedule", sv); }
  const title = str(b.title ?? tpl?.title, "title", 3, 120), venue = str(b.venue, "venue", 2, 200), timezone = optStr(b.timezone ?? tpl?.timezone, "timezone", 60) || "UTC";

  let rs: RuleSet = tpl ? { packId: pack.id, params: { ...tpl.params }, options: { ...tpl.options }, locked: { ...pack.locked } } : newRuleSet(pack, kind, eventType as any);
  if (b.useRecommended) rs = applyRecommended(rs);

  await requireTerms(c);
  const eid = randomHex(16), pid = newId("p_", 8);
  c.eventId = eid;
  const tx = Tx.fresh(c, eid); tx.regAllow = [society.registrationNo];
  const stmts: D1Stmt[] = [];
  const { db } = c;
  await tx.add("event_created", { pid, role: "organizer" }, { kind, eventType, title, venue, scheduledMs: schedule.start.atMs, schedule: schedule as any, country, packId: pack.id, timezone, society, createdFrom: tpl ? tpl.createdFrom : null } as any,
    () => [
      db.prepare("INSERT INTO societies(id,name,address,registration_no,kind,created_ms) VALUES(?,?,?,?,?,?)").bind(eid, society.name, society.address, society.registrationNo, society.kind, c.now),
      db.prepare("INSERT INTO events(id,society_id,kind,event_type,title,venue,scheduled_ms,pack_id,created_from_event_id,organizer_person_id,created_ms) VALUES(?,?,?,?,?,?,?,?,?,?,?)").bind(eid, eid, kind, eventType, title, venue, schedule.start.atMs, pack.id, tpl?.createdFrom ?? null, pid, c.now),
    ]);
  await tx.add("rules_initialized", { system: true }, { packId: rs.packId, packName: pack.name, packConfidence: pack.confidence, packNeedsLawyer: pack.needsLawyer, params: rs.params as any, options: rs.options as any, locked: rs.locked as any }, (seq) => [
    ...OPTIONS.map((o) => db.prepare("INSERT INTO event_options(event_id,key,value,locked,locked_reason,rev,log_seq) VALUES(?,?,?,?,?,1,?)").bind(eid, o.key, rs.options[o.key] === true ? 1 : 0, rs.locked[o.key] ? 1 : 0, rs.locked[o.key]?.reason ?? null, seq)),
    ...Object.entries(rs.params).filter(([, v]) => v !== null).map(([k, v]) => db.prepare("INSERT INTO event_rules(event_id,scope,param,value_json,rev,changed_by,reason,log_seq,at_ms) VALUES(?,?,?,?,1,?,?,?,?)").bind(eid, "event", k, JSON.stringify(v), pid, "initial", seq, c.now)),
  ]);
  const key = await eventKey2(c, eid, stmts);
  stmts.push(...(await personStmts(c, eid, pid, org, null, key)));
  await tx.add("role_appointed", { system: true }, { pid, role: "organizer", appointedBy: null, maskedName: maskName(org.name), maskedEmail: maskEmail(org.email) }, (seq) => [roleStmt(c, eid, pid, "organizer", "appoint", null, seq), statusStmt(c, eid, "setup", seq)]);
  await tx.add("terms_accepted", actorOf(pid, "organizer"), await termsEntry("pid", pid));
  if (tpl) {
    if (tpl.flats.length) await tx.add("roll_set", actorOf(pid, "organizer"), { rev: 1, flats: tpl.flats } as any, () => tpl!.flats.map((f) => db.prepare("INSERT INTO flats(event_id,flat_no,weight,eligible,rev) VALUES(?,?,?,?,1)").bind(eid, f.flatNo, f.weight, f.eligible ? 1 : 0)));
    for (const p of tpl.points) {
      const pointId = newId("pt_", 8);
      await tx.add("point_added", actorOf(pid, "organizer"), { pointId, ...p, rev: 1 } as any, (seq) => [pointStmt(c, eid, pointId, p, 1, seq)]);
    }
    for (const o of tpl.officials) await tx.add("official_set", actorOf(pid, "organizer"), { id: newId("of_", 6), ...o } as any);
    for (const r of tpl.customRules) await tx.add("custom_rule_set", actorOf(pid, "organizer"), r as any);
    for (const o of tpl.overrides) if (rs.locked[o.key]) await tx.add("option_overridden", actorOf(pid, "organizer"), { key: o.key, value: o.value, declaration: o.declaration, lawReason: rs.locked[o.key]!.reason } as any, (seq) => [db.prepare("INSERT INTO event_options(event_id,key,value,locked,locked_reason,rev,log_seq) VALUES(?,?,?,0,NULL,?,?)").bind(eid, o.key, o.value ? 1 : 0, 1000, seq)]);
    await tx.add("clone_linked", { system: true }, { direction: "from", eventId: tpl.createdFrom });
    if (tpl.includePrivateRoll && srcTx) {
      const rows = (await db.prepare("SELECT p.id, p.flat_no, c.ct FROM people p JOIN private_contacts c ON c.person_id=p.id WHERE p.event_id=? AND p.flat_no IS NOT NULL").bind(srcTx.eid).all<any>()).results;
      const srcKey = await eventKey(c, srcTx.eid);
      for (const r of rows) {
        const contact = await openContact(c, srcTx.eid, r.id, r.ct); if (!contact) continue; const hid = newId("p_", 8); void srcKey;
        stmts.push(...(await personStmts(c, eid, hid, contact, r.flat_no, key)));
        await tx.add("holder_added", actorOf(pid, "organizer"), { pid: hid, flatNo: r.flat_no, maskedName: maskName(contact.name) });
      }
    }
    // the clone link is recorded in BOTH logs
    await srcTx!.add("clone_linked", { system: true }, { direction: "to", eventId: eid });
    stmts.push(...srcTx!.stmts); srcTx!.stmts = [];
  }
  await tx.commit(stmts);
  // issue the e-mail passcode (organizer must verify before anything else, including payment)
  await issueLogin(c, eid, pid, org.email, society.name);
  return json({ eventId: eid, personId: pid, next: "Enter the 6-digit code we e-mailed you." }, 201);
});
async function eventKey2(c: Ctx, eid: string, stmts: D1Stmt[]): Promise<Bytes> {
  const key = crypto.getRandomValues(new Uint8Array(32));
  stmts.unshift(c.db.prepare("INSERT INTO event_keys(event_id,wrapped_key,created_ms,destroyed_ms) VALUES(?,?,?,NULL)").bind(eid, await aesEncrypt(await wrapKey(c.env), b64url(key), eid), c.now));
  return key;
}
const pointStmt = (c: Ctx, eid: string, pointId: string, p: any, rev: number, seq: number) =>
  c.db.prepare("INSERT INTO agenda_points(point_id,event_id,number,title,body,kind,options_json,max_choices,majority_class,secret,extra_json,rev,log_seq) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(pointId, eid, p.number, p.title, p.body, p.kind, JSON.stringify(p.options), p.maxChoices, p.majorityClass, p.secret ? 1 : 0, JSON.stringify({ labels: p.labels ?? {}, minChoices: p.minChoices ?? 1, format: p.format ?? null, seats: p.seats ?? [], topN: p.topN ?? null, design: p.design ?? null }), rev, seq);

// ------------------------------------------------------------------------------------------------ e-mail passcode login
async function issueLogin(c: Ctx, eid: string, pid: string, to: string, society: string): Promise<void> {
  const tx = await Tx.load(c, eid);
  const { code, voidedIds } = await issuePasscode({ store: new D1PasscodeStore(c.db), pepper: c.env.PEPPER, eventId: eid, purpose: "login", subject: pid, nowMs: c.now, ttlMs: LOGIN_TTL_MS, newId: () => newId("pc_"), issuedBy: null });
  await tx.add("passcode_issued", { system: true }, { purpose: "login", subjectKind: "person", subject: pid, voided: voidedIds.length });
  await tx.commit();
  const origin = (c.env.PUBLIC_ORIGIN ?? c.url.origin).replace(/\/+$/, "");
  await sendMail(c, to, `Your ${BRAND} code`, `Your 6-digit code for ${society} is ${code}.\nIt works once and expires in 15 minutes. Never share it.\n\nOr tap this one-tap link on the phone or laptop where you want to work:\n${origin}/desk/#e=${eid}&p=${pid}&c=${code}\n`);
}
route("POST", "/api/auth/request", async (c) => {
  const { eventId, personId } = c.body; const eid = str(eventId, "eventId", 10, 64), pid = str(personId, "personId", 3, 40);
  await rateLimit(c, "auth-ip", c.ip, 20, 600); await rateLimit(c, "auth-person", eid + pid, 5, 600); await rateLimit(c, "auth-event", eid, 60, 600);
  await checkTurnstile(c, c.body.turnstile);
  const known = await c.db.prepare("SELECT 1 x FROM people WHERE id=? AND event_id=?").bind(pid, eid).first();
  if (known) { const ct = await contactOf(c, eid, pid); const tx = await Tx.load(c, eid); await issueLogin(c, eid, pid, ct.email, (await tx.st()).created?.society.name ?? "your society"); }
  return json({ sent: true }); // same answer whether or not the person exists
});
/** Lost link? The event code plus the e-mail the person was added with. Same answer whether or not it matches (no account oracle). */
route("POST", "/api/auth/lookup", async (c) => {
  const eid = str(c.body.eventId, "eventId", 10, 64); const em = emailOf(c.body.email);
  await rateLimit(c, "auth-ip", c.ip, 20, 600); await rateLimit(c, "auth-event", eid, 60, 600); await rateLimit(c, "auth-lookup", await pepperHash(c.env, "lk", eid + em), 5, 600);
  await checkTurnstile(c, c.body.turnstile);
  const idx = await pepperHash(c.env, "email:" + eid, em);
  const row = await c.db.prepare("SELECT person_id FROM private_contacts WHERE event_id=? AND email_idx=? ORDER BY created_ms LIMIT 1").bind(eid, idx).first<{ person_id: string }>();
  if (row) { const tx = await Tx.load(c, eid).catch(() => null); if (tx) await issueLogin(c, eid, row.person_id, em, (await tx.st()).created?.society.name ?? "your society"); }
  return json({ sent: true });
});
route("POST", "/api/auth/verify", async (c) => {
  const eid = str(c.body.eventId, "eventId", 10, 64), pid = str(c.body.personId, "personId", 3, 40), code = typeof c.body.code === "string" ? c.body.code : "";
  await rateLimit(c, "auth-ip", c.ip, 20, 600); await rateLimit(c, "auth-event", eid, 60, 600);
  c.eventId = eid;
  { const pre = await Tx.load(c, eid).catch(() => null); const stp = pre ? await pre.st() : null; if (stp?.people.has(pid) && !stp.terms.has("pid:" + pid)) await requireTerms(c); } // checked BEFORE the code is used up
  const res = await verifyPasscode({ store: new D1PasscodeStore(c.db), pepper: c.env.PEPPER, eventId: eid, purpose: "login", subject: pid, code, nowMs: c.now });
  if (!res.ok) {
    if (res.lockedNow) { const tx = await Tx.load(c, eid).catch(() => null); if (tx) { await tx.add("passcode_locked", { system: true }, { purpose: "login", subjectKind: "person", subject: pid }); await tx.commit(); } }
    throw err(401, "invalid_code", "That code did not work. Check it and try again, or ask for a new one.");
  }
  const tx = await Tx.load(c, eid); const st = await tx.st(); const person = st.people.get(pid);
  if (!person) throw err(401, "invalid_code", "That code did not work.");
  if (!st.terms.has("pid:" + pid)) await tx.add("terms_accepted", ENTRY_ACTOR(st, pid), await termsEntry("pid", pid));
  if (!person.verified) await tx.add("email_verified", ENTRY_ACTOR(st, pid), { pid }, (seq) => [c.db.prepare("INSERT INTO person_verifications(person_id,event_id,at_ms,log_seq) VALUES(?,?,?,?)").bind(pid, eid, c.now, seq)]);
  await tx.commit();
  const token = await createSession(c, { kind: "staff", eventId: eid, personId: pid, flatNo: null }, STAFF_TTL);
  return json({ token, roles: person.roles, verified: true });
});

// ------------------------------------------------------------------------------------------------ setup (options, rules, roll, points, people)
route("GET", "/api/events/:id/private", async (c, m) => {
  const { tx, pid } = await staff(c, m[1]!); const st = await tx.st();
  const me = st.people.get(pid)!;
  return json({ me: { pid, roles: me.roles, verified: me.verified }, progress: progressOf(st), model: buildReportModel(st), rules: st.rules, can: Object.fromEntries((["edit_setup", "pay", "publish_agenda", "start", "mark_attendance", "issue_voter_code", "close_event", "read_contacts"] as const).map((a) => [a, canDo(st, pid, a).ok])) });
});
route("PUT", "/api/events/:id/options", async (c, m) => {
  const { tx, pid } = await staff(c, m[1]!, "edit_setup"); const st = await tx.st();
  const want = c.body.options; if (!want || typeof want !== "object") throw err(400, "bad_options", "options is required.");
  let rs = st.rules!; const changed: Record<string, boolean> = {};
  try { for (const [k, v] of Object.entries(want)) { if (typeof v !== "boolean") throw err(400, "bad_options", "Each option must be yes or no."); rs = setOption(rs, k, v); changed[k] = v; } }
  catch (e) { if (e instanceof RuleError) throw err(e.code === "locked_by_law" ? 403 : 400, e.code, e.message); throw e; }
  const revs = new Map<string, number>();
  for (const k of Object.keys(changed)) revs.set(k, ((await c.db.prepare("SELECT MAX(rev) r FROM event_options WHERE event_id=? AND key=?").bind(tx.eid, k).first<{ r: number }>())?.r ?? 0) + 1);
  await tx.add("options_set", ENTRY_ACTOR(st, pid), { options: changed }, (seq) => Object.entries(changed).map(([k, v]) => c.db.prepare("INSERT INTO event_options(event_id,key,value,locked,locked_reason,rev,log_seq) VALUES(?,?,?,?,?,?,?)").bind(tx.eid, k, v ? 1 : 0, rs.locked[k] ? 1 : 0, rs.locked[k]?.reason ?? null, revs.get(k)!, seq)));
  await tx.commit();
  return json({ ok: true, progress: progressOf(await tx.st()) });
});
route("PUT", "/api/events/:id/rules", async (c, m) => {
  const { tx, pid } = await staff(c, m[1]!, "change_rules"); const st = await tx.st();
  const scope = typeof c.body.scope === "string" ? c.body.scope : "event"; const reason = str(c.body.reason, "reason", 3, 300);
  const changes = c.body.changes; if (!changes || typeof changes !== "object" || !Object.keys(changes).length) throw err(400, "bad_changes", "changes is required.");
  const d = canChangeRule(st, scope);
  if (!d.ok) { // O1: refused AND recorded, so the attempt is visible on the report
    for (const k of Object.keys(changes)) await tx.add("rule_change_rejected", ENTRY_ACTOR(st, pid), { scope, param: k, reason: d.code });
    await tx.commit(); throw err(403, d.code, d.message);
  }
  const olds = st.rules!.params;
  try { for (const [k, v] of Object.entries(changes)) validateParam(k, v as Json); } catch (e) { if (e instanceof RuleError) throw err(400, e.code, e.message); throw e; }
  for (const [k, v] of Object.entries(changes)) {
    const rev = ((await c.db.prepare("SELECT MAX(rev) r FROM event_rules WHERE event_id=? AND scope=? AND param=?").bind(tx.eid, scope, k).first<{ r: number }>())?.r ?? 0) + 1;
    await tx.add("rule_changed", ENTRY_ACTOR(st, pid), { scope, param: k, old: (olds[k] ?? null) as Json, new: v as Json, reason }, (seq) => [c.db.prepare("INSERT INTO event_rules(event_id,scope,param,value_json,rev,changed_by,reason,log_seq,at_ms) VALUES(?,?,?,?,?,?,?,?,?)").bind(tx.eid, scope, k, JSON.stringify(v), rev, pid, reason, seq, c.now)]);
  }
  await tx.commit(); return json({ ok: true, progress: progressOf(await tx.st()) });
});
route("PUT", "/api/events/:id/roll", async (c, m) => {
  const { tx, pid } = await staff(c, m[1]!, "edit_setup"); const st = await tx.st(); decide(canChangeRoll(st));
  const flats = c.body.flats; if (!Array.isArray(flats) || flats.length < 1 || flats.length > 3000) throw err(400, "bad_flats", "Give 1 to 3000 flats.");
  const seen = new Set<string>(); const clean = flats.map((f: any) => {
    const flatNo = str(f.flatNo, "flat number", 1, 24); if (seen.has(flatNo)) throw err(400, "dup_flat", `Flat ${flatNo} is listed twice.`); seen.add(flatNo);
    return { flatNo, weight: f.weight === undefined ? 1 : int(f.weight, "weight", 1, 1_000_000_000), eligible: f.eligible !== false };
  });
  const rev = st.rollRev + 1;
  await tx.add("roll_set", ENTRY_ACTOR(st, pid), { rev, flats: clean }, () => clean.map((f) => c.db.prepare("INSERT INTO flats(event_id,flat_no,weight,eligible,rev) VALUES(?,?,?,?,?)").bind(tx.eid, f.flatNo, f.weight, f.eligible ? 1 : 0, rev)));
  await tx.commit(); return json({ ok: true, flats: clean.length, anonymityWarning: !!st.rules?.options.weightage && !!st.rules?.options.secret_ballot });
});
// ---- the flat list as a PDF: download the Excel sheet, fill it, save it as PDF, upload that PDF. Manual entry and manual correction go through the same recorded path.
const PDF_MAX = 6_000_000;
type RollMeta = { source: "pdf" | "manual"; reason: string; op?: string; pdfSha256?: string; diff: ReturnType<typeof diffRoll> };
async function setRoll(c: Ctx, tx: Tx, st: EventState, pid: string, clean: Array<{ flatNo: string; weight: number; eligible: boolean }>, meta: RollMeta, names: SheetFlat[] = [], pdf?: { name: string; bytes: Uint8Array; sha: string }) {
  const rev = st.rollRev + 1;
  await tx.add("roll_set", ENTRY_ACTOR(st, pid), { rev, flats: clean, source: meta.source, reason: meta.reason, op: meta.op ?? "replace", pdfSha256: meta.pdfSha256 ?? null, diff: { added: meta.diff.added.length, removed: meta.diff.removed.length, changed: meta.diff.changed, addedFlats: meta.diff.added, removedFlats: meta.diff.removed } } as any,
    (seq) => [...clean.map((f) => c.db.prepare("INSERT INTO flats(event_id,flat_no,weight,eligible,rev) VALUES(?,?,?,?,?)").bind(tx.eid, f.flatNo, f.weight, f.eligible ? 1 : 0, rev)),
      ...(pdf ? [c.db.prepare("INSERT INTO roll_documents(event_id,rev,file_name,size,sha256,pdf,by_pid,at_ms,log_seq) VALUES(?,?,?,?,?,?,?,?,?)").bind(tx.eid, rev, pdf.name, pdf.bytes.length, pdf.sha, pdf.bytes, pid, c.now, seq)] : [])]);
  await tx.commit();
  const have = new Set((await c.db.prepare("SELECT DISTINCT flat_no f FROM people WHERE event_id=? AND flat_no IS NOT NULL").bind(tx.eid).all<{ f: string }>()).results.map((r) => r.f)); let named = 0;
  const todo = names.filter((f) => f.name.length >= 2 && !have.has(f.flatNo)); const key = todo.length ? await eventKey(c, tx.eid) : null;
  if (todo.length) {
    const tx2 = await Tx.load(c, tx.eid); const st2 = await tx2.st();
    for (const f of todo) {
      const hid = newId("p_", 8); named++;
      const stmts = await personStmts(c, tx.eid, hid, { name: f.name, email: f.email, phone: f.mobile || undefined } as any, f.flatNo, key!);
      await tx2.add("holder_added", ENTRY_ACTOR(st2, pid), { pid: hid, flatNo: f.flatNo, maskedName: maskName(f.name), source: "roll_" + meta.source }); await tx2.commit(stmts);
    }
  }
  return { rev, named };
}
route("GET", "/api/events/:id/roll/template", async (c, m) => {
  const { tx } = await staff(c, m[1]!, "edit_setup"); const st = await tx.st(); const n = Math.max(1, Math.min(3000, +(c.url.searchParams.get("flats") ?? st.roll.length) || 50));
  return new Response(buildRollTemplateXlsx({ flats: n }) as any, { status: 200, headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "content-disposition": 'attachment; filename="flat-list-template.xlsx"', "cache-control": "no-store" } });
});
route("POST", "/api/events/:id/roll/import", async (c, m) => {
  const { tx, pid } = await staff(c, m[1]!, "edit_setup"); const st = await tx.st(); decide(canChangeRoll(st));
  const b64 = typeof c.body.pdfBase64 === "string" ? c.body.pdfBase64.replace(/^data:[^,]*,/, "").replace(/\s+/g, "") : ""; if (!b64) throw err(400, "no_file", "Please choose the PDF file to upload.");
  let bytes: Uint8Array; try { bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0)); } catch { throw err(400, "bad_file", "That file could not be read. Please choose the PDF again."); }
  if (bytes.length > PDF_MAX) throw err(413, "too_large", "The PDF is bigger than 6 MB. Save it again with fewer pages or smaller size.");
  if (String.fromCharCode(...bytes.subarray(0, 5)) !== "%PDF-") throw err(400, "not_pdf", "Only a PDF file is accepted. Fill the Excel sheet, then File > Save As > PDF, and upload that PDF.");
  const sha = await sha256Hex(bytes as Bytes); const res = parseRollTable(await readPdfTable(bytes));
  const clean = res.flats.map((f) => ({ flatNo: f.flatNo, weight: f.weight, eligible: f.eligible })); const diff = diffRoll(st.roll, clean);
  const preview = { fileSha256: sha, confirmCode: sha.slice(0, 8), ok: res.ok, problems: res.problems, flats: res.flats.length, eligible: res.eligibleCount, totalWeight: res.totalWeight, diff: { added: diff.added, removed: diff.removed, changed: diff.changed, same: diff.same }, rows: res.flats.slice(0, 500).map((f) => ({ flatNo: f.flatNo, name: f.name, weight: f.weight, eligible: f.eligible })), replacesExisting: st.roll.length > 0 };
  if (c.body.confirm === undefined) return json({ applied: false, ...preview, next: res.ok ? "Check the table. If it is right, send the same PDF again with confirm set to the confirmCode." : "Fix the sheet and upload the PDF again. Nothing was saved." });
  if (!res.ok) throw err(422, "sheet_has_problems", "The sheet still has problems. Nothing was saved. Fix them and upload again.");
  if (String(c.body.confirm) !== sha.slice(0, 8)) throw err(409, "confirm_mismatch", "The confirm code does not match this file. Upload the file again and check the table.");
  const reason = optStr(c.body.reason, "reason", 300) ?? ""; if (st.roll.length && reason.length < 5) throw err(400, "reason_required", "This replaces the list you already have. Please write why (at least 5 letters).");
  const r = await setRoll(c, tx, st, pid, clean, { source: "pdf", reason: reason || "first upload", pdfSha256: sha, diff }, res.flats, { name: str(c.body.fileName ?? "flat-list.pdf", "fileName", 1, 120), bytes, sha });
  return json({ applied: true, rev: r.rev, flats: clean.length, namesAdded: r.named, pdfSha256: sha });
});
/** One flat at a time: add, change or remove. Every edit says why, and the earlier list stays in the log. */
route("POST", "/api/events/:id/roll/flat", async (c, m) => {
  const { tx, pid } = await staff(c, m[1]!, "edit_setup"); const st = await tx.st(); decide(canChangeRoll(st));
  const op = String(c.body.op ?? ""); if (!["add", "change", "remove"].includes(op)) throw err(400, "bad_op", "op must be add, change or remove.");
  const flatNo = str(c.body.flatNo, "flat number", 1, 24); const reason = str(c.body.reason, "reason", 5, 300);
  const cur = st.roll.find((f) => f.flatNo === flatNo); const next = st.roll.map((f) => ({ flatNo: f.flatNo, weight: f.weight, eligible: f.eligible }));
  if (op === "add") { if (cur) throw err(409, "dup_flat", `Flat ${flatNo} is already on the list.`); next.push({ flatNo, weight: c.body.weight === undefined ? 1 : int(c.body.weight, "weight", 1, 1_000_000_000), eligible: c.body.eligible !== false }); }
  else if (!cur) throw err(404, "no_flat", `Flat ${flatNo} is not on the list.`);
  else if (op === "remove") next.splice(next.findIndex((f) => f.flatNo === flatNo), 1);
  else { const e = next.find((f) => f.flatNo === flatNo)!; if (c.body.weight === undefined && c.body.eligible === undefined) throw err(400, "nothing_to_change", "Say the new weight or whether the flat can vote."); if (c.body.weight !== undefined) e.weight = int(c.body.weight, "weight", 1, 1_000_000_000); if (c.body.eligible !== undefined) e.eligible = c.body.eligible !== false; }
  if (!next.length) throw err(400, "empty", "The list cannot be empty.");
  const diff = diffRoll(st.roll, next); const name = optStr(c.body.name, "name", 80);
  const r = await setRoll(c, tx, st, pid, next, { source: "manual", reason, op, diff }, op === "add" && name ? [{ flatNo, weight: 1, eligible: true, name, mobile: "", email: "", sheetRow: 0 }] : []);
  return json({ ok: true, rev: r.rev, flats: next.length, change: diff });
});
// ---- team size limits, and the Attendance Monitor's photo of the attendee (with time and place)
route("GET", "/api/events/:id/team", async (c, m) => {
  const { tx } = await staff(c, m[1]!); const st = await tx.st(); const n = roleCounts(st.people.values());
  return json({ counts: n, limits: ROLE_LIMITS, canAdd: { host: n.hostsInclOrganizer < ROLE_LIMITS.hostsInclOrganizer, attendance_officer: n.monitorsOnly < ROLE_LIMITS.monitorsOnly },
    note: "At most 1 Organizer and 5 Hosts (the Organizer counts as one). At most 10 Attendance Monitors besides them; the Organizer and Hosts may also act as monitors, so up to 15 monitors in all." });
});
const PHOTO_MAX = 400_000;
route("POST", "/api/events/:id/attendance/photo", async (c, m) => {
  const { tx, pid } = await staff(c, m[1]!, "mark_attendance"); const st = await tx.st();
  if (!st.rules?.options.attendance_photo) throw err(403, "evidence_off", "Photos are switched off for this event. Ask the Organizer to tick \"Photo of the attendee\".");
  const flatNo = str(c.body.flatNo, "flatNo", 1, 24); if (!st.roll.some((f) => f.flatNo === flatNo)) throw err(400, "no_flat", "That flat is not on the voting list.");
  if (c.body.consent !== true) throw err(400, "consent_needed", "Ask the person first. Tick \"The person agreed to the photo\" before taking it.");
  const raw = typeof c.body.photoBase64 === "string" ? c.body.photoBase64.replace(/^data:[^,]*,/, "").replace(/\s+/g, "") : ""; if (!raw) throw err(400, "no_photo", "Please take the photo.");
  let bytes: Uint8Array; try { bytes = Uint8Array.from(atob(raw), (ch) => ch.charCodeAt(0)); } catch { throw err(400, "bad_photo", "The photo could not be read. Please take it again."); }
  if (bytes.length > PHOTO_MAX) throw err(413, "photo_too_big", "The photo is too big. Take it again at a lower size (under 400 KB).");
  const mime = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff ? "image/jpeg" : bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 ? "image/png" : "";
  if (!mime) throw err(400, "not_a_photo", "Only a JPEG or PNG photo is accepted.");
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const g = c.body.geo && typeof c.body.geo === "object" ? { lat: num(c.body.geo.lat), lon: num(c.body.geo.lon), accuracyM: num(c.body.geo.accuracyM) } : null;
  const client = g && g.lat !== null && g.lon !== null ? { lat: g.lat, lon: g.lon, accuracyM: g.accuracyM ?? undefined } : null;
  const nl = num(Number((c.cf as any)?.latitude)), nn = num(Number((c.cf as any)?.longitude)); const net = nl !== null && nn !== null ? { lat: nl, lon: nn } : null;
  const capturedMs = num(c.body.capturedAtMs); const flags = geoFlags(client, net, capturedMs, c.now);
  const sha = await sha256Hex(bytes as Bytes); const ct = await aesEncrypt((await subjectKey(c, tx.eid, "f:" + flatNo, true))!, raw, tx.eid + "|photo|" + sha);
  const checks = c.body.checks && typeof c.body.checks === "object" ? Object.fromEntries(Object.entries(c.body.checks).filter(([, v]) => typeof v === "boolean").slice(0, 12)) : null;
  await tx.add("evidence_filed", ENTRY_ACTOR(st, pid), { flatNo, kind: "photo", sha256: sha, size: bytes.length, capturedMs, hasLocation: !!client, flags, by: pid } as any, (seq) => [
    c.db.prepare("INSERT INTO attendance_evidence(event_id,flat_no,kind,mime,sha256,size,ct,captured_ms,server_ms,lat,lon,accuracy_m,geo_error,net_lat,net_lon,flags,consent,checks_json,by_pid,log_seq) VALUES(?,?,'photo',?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?,?)")
      .bind(tx.eid, flatNo, mime, sha, bytes.length, ct, capturedMs, c.now, client?.lat ?? null, client?.lon ?? null, client?.accuracyM ?? null, optStr(c.body.geoError, "geoError", 80) || null, net?.lat ?? null, net?.lon ?? null, flags.join(","), checks ? JSON.stringify(checks) : null, pid, seq)]);
  await tx.commit(); return json({ ok: true, sha256: sha, flags, hasLocation: !!client, message: flags.includes("ok") ? "Photo saved with time and place." : "Photo saved. Please look at the notes: " + flags.join(", ") }, 201);
});
route("GET", "/api/events/:id/attendance/photos/:evid", async (c, m) => {
  const { tx } = await staff(c, m[1]!, "read_contacts");
  const r = await c.db.prepare("SELECT flat_no, mime, sha256, ct FROM attendance_evidence WHERE id=? AND event_id=?").bind(+m[2]!, tx.eid).first<{ flat_no: string; mime: string; sha256: string; ct: string }>(); if (!r) throw err(404, "no_photo", "No such photo.");
  const fk = await subjectKey(c, tx.eid, "f:" + r.flat_no, false); const b64 = await aesDecrypt(fk ?? (await eventKey(c, tx.eid)), r.ct, tx.eid + "|photo|" + r.sha256); const bin = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
  return new Response(bin as any, { status: 200, headers: { "content-type": r.mime, "cache-control": "no-store", "x-content-sha256": r.sha256 } });
});
// ---- ending, stopping, cancelling, postponing: tick-boxes, an "are you sure", a 4-digit number typed by hand, and (for later postponements) a payment anyone can make
const INTENT_TTL = 10 * 60_000;
type Intent = { eid: string; pid: string; action: "complete" | "stop" | "cancel" | "postpone"; reasonCodes: string[]; reason: string; newSchedule?: Schedule; codeHash: string; tries: number; exp: number; paymentId?: string; done?: boolean };
const kvGet = async (c: Ctx, k: string) => (await c.db.prepare("SELECT v FROM kv_state WHERE k=?").bind(k).first<{ v: string }>())?.v ?? null;
const kvSet = (c: Ctx, k: string, v: string) => c.db.prepare("INSERT INTO kv_state(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").bind(k, v).run();
const cleanReasons = (b: any) => {
  const codes = Array.isArray(b.reasonCodes) ? [...new Set((b.reasonCodes as unknown[]).filter((x): x is string => typeof x === "string"))] : [];
  if (codes.some((x) => !REASON_IDS.has(x))) throw err(400, "bad_reason", "One of the reasons ticked is not known."); const reason = optStr(b.reason, "reason", 400) ?? "";
  return { codes, reason };
};
route("GET", "/api/events/:id/end-options", async (c, m) => {
  const { tx, pid } = await staff(c, m[1]!); const st = await tx.st(); const me = (a: Parameters<typeof canDo>[2]) => canDo(st, pid, a).ok;
  const everOpened = [...st.points.values()].some((p) => p.state !== "pending");
  const quote = postponeQuote(st.created!.kind, st.created!.country, st.created!.schedule.start.atMs, c.now, st.postponements.filter((x) => x.phase === "after_start").length);
  return json({
    status: st.status, outcome: st.outcome, reasons: REASON_CODES,
    choices: [
      { id: "complete", outcome: "completed", label: "Completed", allowed: st.status === "live" && me("close_event") },
      { id: "stop", outcome: "stopped", label: "Stopped in between", allowed: (st.status === "live" || st.status === "postponed") && me("end_event") },
      { id: "postpone", outcome: "postponed", label: "Postponed (give a new date, time and place)", allowed: me("postpone") && st.status !== "closed", quote },
      { id: "cancel", outcome: "cancelled", label: "Cancelled", allowed: me("end_event") && !everOpened && st.status !== "closed" },
    ].map((x) => ({ ...x, plain: OUTCOMES.find((o) => o.id === x.outcome)!.plain, whyNot: x.allowed ? null : st.status === "closed" ? "This event is already closed." : x.id === "cancel" && everOpened ? "Voting has already begun, so choose Stopped in between." : (x.id === "complete" || x.id === "stop") && st.status !== "live" ? "The meeting has not started yet. Choose Cancelled or Postponed." : "Only the Organizer or a Host can do this." })),
    note: "Choose one, tick the reasons, press Yes on the question, then type the 4-digit number shown on the screen.",
  });
});
route("POST", "/api/events/:id/intent", async (c, m) => {
  const { tx, pid } = await staff(c, m[1]!); const st = await tx.st(); await rateLimit(c, "intent", pid, 20, 600);
  const action = String(c.body.action ?? "") as Intent["action"]; if (!["complete", "stop", "cancel", "postpone"].includes(action)) throw err(400, "bad_action", "Choose complete, stop, cancel or postpone.");
  const need = action === "postpone" ? "postpone" : action === "complete" ? "close_event" : "end_event"; const d = canDo(st, pid, need); if (!d.ok) throw err(403, d.code, d.message);
  if (st.status === "closed") throw err(409, "already_over", "This event is already over.");
  if (action === "complete" && st.status !== "live") throw err(409, "not_live", "Only a meeting that is running can be completed.");
  if (action === "stop" && !(st.status === "live" || st.status === "postponed")) throw err(409, "not_started", "It has not started. Choose Cancelled or Postponed instead.");
  if (action === "cancel" && [...st.points.values()].some((p) => p.state !== "pending")) throw err(409, "has_votes", "Voting has already begun, so choose Stopped in between. Votes already cast stay on record.");
  const { codes, reason } = cleanReasons(c.body); if (action !== "complete" && !codes.length && !reason) throw err(400, "reason_needed", "Tick at least one reason, or write one.");
  let newSchedule: Schedule | undefined; let quote: ReturnType<typeof postponeQuote> | null = null;
  if (action === "postpone") {
    newSchedule = c.body.newSchedule as Schedule; const why = validateSchedule(newSchedule); if (why) throw err(400, "bad_schedule", why);
    if (newSchedule.start.atMs <= c.now) throw err(400, "past_date", "The new date and time must be in the future.");
    quote = postponeQuote(st.created!.kind, st.created!.country, st.created!.schedule.start.atMs, c.now, st.postponements.filter((x) => x.phase === "after_start").length);
  }
  const id = newId("in_", 8); const code = String(1000 + (crypto.getRandomValues(new Uint32Array(1))[0]! % 9000));
  const intent: Intent = { eid: tx.eid, pid, action, reasonCodes: codes, reason, newSchedule, codeHash: await pepperHash(c.env, "intent", id + ":" + code), tries: 0, exp: c.now + INTENT_TTL };
  await kvSet(c, "intent:" + id, JSON.stringify(intent));
  const verb = { complete: "mark this as COMPLETED", stop: "STOP it in between", cancel: "CANCEL it", postpone: "POSTPONE it" }[action];
  return json({ intentId: id, areYouSure: `Are you sure you want to ${verb}? This is recorded on the public page and cannot be undone.`, confirmCode: code, enterThisNumber: "Type the 4-digit number below to confirm.", expiresMs: intent.exp, fee: quote ? { feeMinor: quote.feeMinor, currency: quote.currency, free: quote.free, why: quote.why } : null }, 201);
});
async function applyPostpone(c: Ctx, eid: string, it: Intent, paymentId: string | null, actorSystem: boolean) {
  const tx = await Tx.load(c, eid); const st = await tx.st(); const actor: Actor = actorSystem ? { system: true } : ENTRY_ACTOR(st, it.pid);
  const q = postponeQuote(st.created!.kind, st.created!.country, st.created!.schedule.start.atMs, c.now, st.postponements.filter((x) => x.phase === "after_start").length);
  const wasLive = st.status === "live"; const nextRev = st.scheduleChanges.length + 2;
  await tx.add("event_postponed", actor, { phase: q.phase, feeMinor: q.feeMinor, paymentId: q.feeMinor ? paymentId : null, reasonCodes: it.reasonCodes, reason: it.reason, newSchedule: it.newSchedule as any, by: it.pid, sitting: st.sitting } as any, (seq) => [
    ...(wasLive ? [statusStmt(c, eid, "postponed", seq)] : []),
    c.db.prepare("INSERT INTO event_rules(event_id,scope,param,value_json,rev,changed_by,reason,log_seq,at_ms) VALUES(?,?,?,?,?,?,?,?,?)").bind(eid, "event", "schedule", JSON.stringify(it.newSchedule), nextRev, it.pid, "postponed: " + (it.reason || it.reasonCodes.join(", ")), seq, c.now)]);
  await tx.commit();
}
route("POST", "/api/events/:id/confirm", async (c, m) => {
  const { tx, pid } = await staff(c, m[1]!); await rateLimit(c, "confirm", pid, 30, 600);
  const id = str(c.body.intentId, "intentId", 4, 40); const raw = await kvGet(c, "intent:" + id); if (!raw) throw err(404, "no_intent", "That request has expired. Start again.");
  const it = JSON.parse(raw) as Intent; if (it.eid !== tx.eid || it.pid !== pid) throw err(403, "not_yours", "That request was made by someone else.");
  if (it.done) throw err(409, "already_done", "That was already done."); if (c.now > it.exp) throw err(410, "expired", "That request has expired. Start again.");
  if (it.tries >= 5) throw err(429, "too_many_tries", "Too many wrong numbers. Start again.");
  const code = str(c.body.code, "code", 4, 4);
  if ((await pepperHash(c.env, "intent", id + ":" + code)) !== it.codeHash) { it.tries++; await kvSet(c, "intent:" + id, JSON.stringify(it)); throw err(400, "wrong_code", `That number is not right. ${5 - it.tries} tries left.`); }
  const st = await tx.st(); const need = it.action === "postpone" ? "postpone" : it.action === "complete" ? "close_event" : "end_event"; const d = canDo(st, pid, need); if (!d.ok) throw err(403, d.code, d.message);
  if (it.action === "postpone") {
    const q = postponeQuote(st.created!.kind, st.created!.country, st.created!.schedule.start.atMs, c.now, st.postponements.filter((x) => x.phase === "after_start").length);
    if (q.feeMinor > 0) {
      let payId = it.paymentId; const paid = payId && (await tx.st()).payments.some((p) => p.paymentId === payId && p.state === "paid");
      if (!paid) {
        if (!payId) { payId = (await createPayment(c, tx, st, pid, "reschedule", q.feeMinor, q.currency)).paymentId; it.paymentId = payId; await kvSet(c, "intentpay:" + payId, id); await kvSet(c, "intent:" + id, JSON.stringify(it)); }
        return json({ awaitingPayment: true, feeMinor: q.feeMinor, currency: q.currency, why: q.why, payPath: await payPathFor(c, payId), message: "Postponing again costs half the price. Share the payment link; the new date takes effect as soon as it is paid." }, 202);
      }
    }
    it.done = true; await kvSet(c, "intent:" + id, JSON.stringify(it)); await applyPostpone(c, tx.eid, it, it.paymentId ?? null, false);
    return json({ ok: true, outcome: "postponed", newStart: it.newSchedule!.start.atMs, feeMinor: q.feeMinor });
  }
  it.done = true; await kvSet(c, "intent:" + id, JSON.stringify(it));
  const r = await closeAndPublish(c, tx, pid, { outcome: it.action === "complete" ? "completed" : it.action === "stop" ? "stopped" : "cancelled", reasonCodes: it.reasonCodes, reason: it.reason });
  return json({ ok: true, outcome: it.action === "complete" ? "completed" : it.action === "stop" ? "stopped" : "cancelled", report: `/api/r/${tx.eid}`, pdf: `/api/r/${tx.eid}/pdf`, fileSha256: r.fileSha256, headSeq: r.headSeq });
});

// ---- payment links: the Organizer or a Host creates one, anyone can pay it (no sign-in), like the Corporate Tambola payment link
async function createPayment(c: Ctx, tx: Tx, st: EventState, pid: string, purpose: "event" | "reschedule", amountMinor: number, currency: string) {
  const paymentId = newId("pay_", 8); const mode = c.env.TEST_MODE === "1" ? "test" : "live";
  const o = await centralOrder(c, { paymentId, kind: st.created!.kind, purpose, amountMinor, currency, eventId: tx.eid, label: `${st.created!.kind}: ${st.created!.title}`, userRef: pid });
  await tx.add("payment_state", ENTRY_ACTOR(st, pid), { paymentId, state: "created", amountMinor, currency, mode, purpose, txnId: o.txnId, orderId: o.orderId } as any, (seq) => [c.db.prepare("INSERT INTO payments(payment_id,event_id,state,mode,order_id,amount_minor,currency,ref,log_seq,at_ms,txn_id) VALUES(?,?,'created',?,?,?,?,?,?,?,?)").bind(paymentId, tx.eid, mode, o.orderId, amountMinor, currency, purpose, seq, c.now, o.txnId)]);
  await tx.commit(); return { paymentId, orderId: o.orderId, keyId: o.keyId, txnId: o.txnId };
}
const payTokenFor = async (c: Ctx, paymentId: string) => paymentId + "." + (await pepperHash(c.env, "paylink", paymentId)).slice(0, 20);
const payPathFor = async (c: Ctx, paymentId: string) => "/pay/" + (await payTokenFor(c, paymentId));
async function payByToken(c: Ctx, token: string) {
  const [paymentId, mac] = token.split("."); if (!paymentId || !mac || mac !== (await pepperHash(c.env, "paylink", paymentId)).slice(0, 20)) throw err(404, "no_link", "This payment link is not valid.");
  const row = await c.db.prepare("SELECT event_id, order_id FROM payments WHERE payment_id=? AND state='created'").bind(paymentId).first<{ event_id: string; order_id: string | null }>(); if (!row) throw err(404, "no_link", "This payment link is not valid.");
  const tx = await Tx.load(c, row.event_id); const st = await tx.st(); const pay = st.payments.find((p) => p.paymentId === paymentId && p.state === "created"); if (!pay) throw err(404, "no_link", "This payment link is not valid.");
  return { paymentId, eventId: row.event_id, orderId: row.order_id, st, pay, paid: st.payments.some((p) => p.paymentId === paymentId && p.state === "paid") };
}
route("POST", "/api/events/:id/pay-link", async (c, m) => {
  const { tx, pid } = await staff(c, m[1]!, "edit_setup"); const st = await tx.st();
  if (st.paid) throw err(409, "already_paid", "This event is already paid.");
  const existing = st.payments.find((p) => p.state === "created" && p.purpose === "event" && !st.payments.some((q) => q.paymentId === p.paymentId && q.state === "paid"));
  let paymentId = existing?.paymentId; const price = priceFor(st.created!.kind, st.created!.country);
  if (!paymentId) paymentId = (await createPayment(c, tx, st, pid, "event", price.amountMinor, price.currency)).paymentId;
  return json({ paymentId, payPath: await payPathFor(c, paymentId), amountMinor: price.amountMinor, currency: price.currency, price: formatPrice(price), note: "Send this link to anyone. They can pay without signing in." }, 201);
});
route("GET", "/api/pay/link/:token", async (c, m) => {
  const p = await payByToken(c, m[1]!); const cr = p.st.created!;
  return json({ event: { title: cr.title, society: cr.society.name, kind: cr.kind }, purpose: p.pay.purpose, amountMinor: p.pay.amountMinor, currency: p.pay.currency, paid: p.paid, orderId: p.orderId, mode: c.env.TEST_MODE === "1" ? "test" : "live", keyId: null, txnId: (await c.db.prepare("SELECT txn_id FROM payments WHERE payment_id=? AND state='created'").bind(p.paymentId).first<{ txn_id: string | null }>())?.txn_id ?? null, checkoutOrigin: centralConfigured(c.env) ? (c.env.PAY_SERVICE_URL ?? "https://itservices-rajat-agarwal.pages.dev").replace(/\/+$/, "") : null,
    note: p.pay.purpose === "reschedule" ? "This is the charge for postponing the meeting again. It is half the event price." : "This pays for the meeting or election. Anyone may pay." });
});
route("POST", "/api/pay/link/:token/payer", async (c, m) => {
  const p = await payByToken(c, m[1]!); await rateLimit(c, "paylink", p.paymentId, 20, 600);
  const who = { name: str(c.body.name, "name", 2, 80), email: emailOf(c.body.email), at: c.now };
  await kvSet(c, "payer:" + p.paymentId, await aesEncrypt(await eventKey(c, p.eventId), JSON.stringify(who), p.eventId + "|payer|" + p.paymentId)); return json({ ok: true });
});
route("POST", "/api/pay/link/:token/test-pay", async (c, m) => {
  if (c.env.TEST_MODE !== "1") throw err(404, "not_found", "Not found."); const p = await payByToken(c, m[1]!);
  c.eventId = p.eventId; await markPaid(c, p.eventId, p.paymentId, "pay-link"); return json({ ok: true });
});
// ---- the society's own rules: say where its bye-laws differ from the law pack, and add any rule the pack has no field for
route("POST", "/api/events/:id/options/override", async (c, m) => {
  const { tx, pid } = await staff(c, m[1]!, "edit_setup"); const st = await tx.st(); const key = str(c.body.key, "key", 2, 60);
  if (typeof c.body.value !== "boolean") throw err(400, "bad_value", "value must be yes or no."); const declaration = str(c.body.declaration, "declaration", 10, 400);
  const lock = st.rules?.locked[key]; if (!lock) throw err(409, "not_locked", "The law pack does not lock that option, so you can change it normally.");
  if (st.status === "live" || [...st.points.values()].some((x) => x.state !== "pending")) throw err(403, "frozen", "This cannot change once the event has started.");
  await tx.add("option_overridden", ENTRY_ACTOR(st, pid), { key, value: c.body.value, declaration, lawReason: lock.reason } as any, (seq) => [c.db.prepare("INSERT INTO event_options(event_id,key,value,locked,locked_reason,rev,log_seq) VALUES(?,?,?,0,NULL,?,?)").bind(tx.eid, key, c.body.value ? 1 : 0, 1000 + st.overrides.length, seq)]);
  await tx.commit(); return json({ ok: true, shownOnReport: true, message: "Recorded. The report will show what the law pack said and your declaration." });
});
route("POST", "/api/events/:id/custom-rules", async (c, m) => {
  const { tx, pid } = await staff(c, m[1]!, "edit_setup"); const st = await tx.st(); const title = str(c.body.title, "title", 2, 80);
  if (st.status === "live" || [...st.points.values()].some((x) => x.state !== "pending")) throw err(403, "frozen", "This cannot change once the event has started.");
  const remove = c.body.remove === true; const kind = String(c.body.kind ?? "text");
  if (!remove) { if (!["text", "number", "yes_no"].includes(kind)) throw err(400, "bad_kind", "kind must be text, number or yes_no."); if (st.customRules.size >= 60 && !st.customRules.has(title)) throw err(400, "too_many", "That is enough extra rules (60)."); }
  const value = remove ? null : kind === "number" ? (Number.isFinite(Number(c.body.value)) && c.body.value !== "" && c.body.value !== null ? Number(c.body.value) : (() => { throw err(400, "bad_value", "Give a number."); })()) : kind === "yes_no" ? (typeof c.body.value === "boolean" ? c.body.value : (() => { throw err(400, "bad_value", "Give yes or no."); })()) : str(c.body.value, "value", 1, 1000);
  await tx.add("custom_rule_set", ENTRY_ACTOR(st, pid), { title, kind, value, note: optStr(c.body.note, "note", 300) ?? "" } as any); await tx.commit();
  return json({ ok: true, count: (await tx.st()).customRules.size });
});
// ---- committee, returning officers, government officers, observers ... (all optional, all typed by the Organizer; attendance is marked; signature lines are printed)
route("GET", "/api/officials/groups", async () => json({ groups: OFFICIAL_GROUPS, note: "All optional. Write the name, designation and authority yourself; the same group can be used many times." }));
route("POST", "/api/events/:id/officials", async (c, m) => {
  const { tx, pid } = await staff(c, m[1]!, "edit_setup"); const st = await tx.st();
  if (st.status === "live" || st.status === "closed") throw err(403, "frozen", "The list of officials is published before the start and cannot change after it.");
  const remove = c.body.remove === true; const given = typeof c.body.id === "string" ? c.body.id : "";
  if (remove) { if (!st.officials.has(given)) throw err(404, "no_official", "No such entry."); await tx.add("official_removed", ENTRY_ACTOR(st, pid), { id: given } as any); await tx.commit(); return json({ ok: true, count: (await tx.st()).officials.size }); }
  const group = String(c.body.group ?? ""); if (!OFFICIAL_GROUP_IDS.has(group)) throw err(400, "bad_group", "Choose one of the groups, or Other and write the title yourself.");
  if (given && !st.officials.has(given)) throw err(404, "no_official", "No such entry."); if (!given && st.officials.size >= 60) throw err(400, "too_many", "That is enough entries (60).");
  const id = given || newId("of_", 6);
  const entry = { id, group, groupLabel: optStr(c.body.groupLabel, "groupLabel", 100) ?? "", name: str(c.body.name, "name", 2, 120), designation: optStr(c.body.designation, "designation", 160) ?? "", authority: optStr(c.body.authority, "authority", 200) ?? "", note: optStr(c.body.note, "note", 300) ?? "" };
  await tx.add("official_set", ENTRY_ACTOR(st, pid), entry as any); await tx.commit(); return json({ ok: true, id, count: (await tx.st()).officials.size }, given ? 200 : 201);
});
route("POST", "/api/events/:id/officials/:oid/attendance", async (c, m) => {
  const { tx, pid } = await staff(c, m[1]!, "mark_attendance"); const st = await tx.st(); if (!st.officials.has(m[2]!)) throw err(404, "no_official", "No such entry.");
  const mode = c.body.mode === "online" ? "online" : "physical"; const present = c.body.present !== false;
  await tx.add("official_attendance", ENTRY_ACTOR(st, pid), { id: m[2]!, present, mode } as any); await tx.commit(); return json({ ok: true, present });
});
/** "Make a new meeting or election from this old one": the Organizer or a Host of the old event gets a new event with the same society, rules, options, own rules, officials, agenda,
 *  flat list and (optionally) the private names and contacts. They give the new date, place and title and tick the terms again; the new Organizer then confirms by the usual e-mailed code. */
route("POST", "/api/events/:id/recreate", async (c, m) => {
  const { tx, pid } = await staff(c, m[1]!, "edit_setup"); const st = await tx.st(); const me = await contactOf(c, tx.eid, pid);
  const b = c.body; if (!b.schedule && !b.scheduledMs) throw err(400, "need_date", "Give the new date, time and place.");
  const kind = b.kind === "election" || b.kind === "meeting" ? b.kind : st.created!.kind;
  const sub = new Request(new URL("/api/events", c.url).toString(), { method: "POST", headers: new Headers({ "content-type": "application/json", authorization: c.req.headers.get("authorization") ?? "", "cf-connecting-ip": c.ip, "user-agent": c.req.headers.get("user-agent") ?? "", ...(c.deviceId ? { "x-device-id": c.deviceId } : {}) }),
    body: JSON.stringify({ kind, eventType: b.eventType ?? st.created!.eventType, title: b.title ?? st.created!.title, venue: b.venue ?? st.created!.schedule.start.place, schedule: b.schedule, scheduledMs: b.scheduledMs, cloneFrom: tx.eid, privateRoll: b.privateRoll !== false, organizer: { name: me.name, email: me.email, phone: me.phone }, turnstile: b.turnstile, acceptTerms: b.acceptTerms, termsVersion: b.termsVersion, useRecommended: false }) });
  const res = await handle(sub, c.env, c.now); const body: any = await res.clone().json().catch(() => ({}));
  return json({ ...body, copied: "society, rules, options, the society's own rules, officials, agenda, flat list" + (b.privateRoll !== false ? " and the private names and contacts" : ""), notCopied: "votes, attendance, codes, payments, photos, dates, the team (appoint them again)", next: "The new Organizer confirms with the code e-mailed to them." }, res.status);
});
// ---- privacy rights (DPDP Act 2023 / GDPR): see what is held about you, ask for a correction, withdraw, erase ONE person, complain. Every step is logged.
const SUBJECT_TYPES = ["access", "correct", "erase", "withdraw", "grievance"];
async function subjectExport(c: Ctx, tx: Tx, st: EventState, pid: string) {
  const person = st.people.get(pid) ?? { roles: [] as string[], label: null, verified: false, appointedBy: {} }; if (!(await c.db.prepare("SELECT 1 x FROM people WHERE id=? AND event_id=?").bind(pid, tx.eid).first())) throw err(404, "no_person", "No such person.");
  let contact: Contact | null = null; try { contact = await contactOf(c, tx.eid, pid); } catch (e) { if (!(e instanceof ApiError && e.status === 410)) throw e; }
  const mine = st.attendanceLog.filter((a) => a.by === pid).length;
  const reqs = (await c.db.prepare("SELECT id, type, channel, at_ms FROM privacy_requests WHERE event_id=? AND subject_ref=? ORDER BY at_ms").bind(tx.eid, "p:" + pid).all<any>()).results;
  return { person: { id: pid, roles: person.roles, label: person.label, emailVerified: person.verified, flatNo: (await c.db.prepare("SELECT flat_no f FROM people WHERE id=?").bind(pid).first<{ f: string | null }>())?.f ?? null },
    stored: contact ? { name: contact.name, email: contact.email, phone: contact.phone } : "erased", appointedBy: person.appointedBy, attendanceMarkedByThem: mine, termsAccepted: st.terms.has("pid:" + pid),
    requests: reqs, why: "Your contact details are kept only to run this meeting or election, to e-mail you a sign-in code and the report. They are never shown in full to anyone but the Organizer and Hosts.", rights: "You may ask for a correction, withdraw consent, ask for erasure, or complain, through the privacy request route." };
}
route("GET", "/api/me/data", async (c) => {
  const s = await requireSession(c, "staff"); const tx = await Tx.load(c, s.eventId!); const st = await tx.st();
  await tx.add("subject_access", ENTRY_ACTOR(st, s.personId!), { by: s.personId!, self: true } as any); await tx.commit(); return json(await subjectExport(c, tx, st, s.personId!));
});
route("GET", "/api/events/:id/privacy/export/:pid", async (c, m) => {
  const { tx, pid } = await staff(c, m[1]!, "read_contacts"); const st = await tx.st(); const reason = str(c.url.searchParams.get("reason"), "reason", 5, 300);
  await tx.add("subject_access", ENTRY_ACTOR(st, pid), { by: pid, subject: m[2]!, reason } as any); await tx.commit(); return json(await subjectExport(c, tx, st, m[2]!));
});
/** A signed-in person (staff or voter) files a request about their own data; or anyone files one through the public form with an e-mail the Organizer can reply to. */
async function fileRequest(c: Ctx, eid: string, channel: string, subjectRef: string | null, type: string, detail: Record<string, unknown>) {
  if (!SUBJECT_TYPES.includes(type)) throw err(400, "bad_type", "type must be access, correct, erase, withdraw or grievance.");
  const tx = await Tx.load(c, eid); const st = await tx.st(); const id = newId("pr_", 8);
  const ct = await aesEncrypt(await eventKey(c, eid), JSON.stringify(detail), eid + "|privacy|" + id);
  await tx.add("privacy_request", { system: true }, { requestId: id, type, channel } as any, (seq) => [c.db.prepare("INSERT INTO privacy_requests(id,event_id,type,channel,subject_ref,ct,at_ms,log_seq) VALUES(?,?,?,?,?,?,?,?)").bind(id, eid, type, channel, subjectRef, ct, c.now, seq)]);
  await tx.commit(); return id;
}
route("POST", "/api/privacy/request", async (c) => {
  const bearer = /^Bearer ([0-9a-f]{64})$/.exec(c.req.headers.get("authorization") ?? ""); if (!bearer) throw err(401, "not_signed_in", "Please sign in, or use the public form of the event.");
  const row = await c.db.prepare("SELECT kind, event_id, person_id, flat_no FROM sessions WHERE token_hash=? AND expires_ms>?").bind(await pepperHash(c.env, "session", bearer[1]!), c.now).first<any>(); if (!row) throw err(401, "not_signed_in", "Please sign in again.");
  await rateLimit(c, "privacy", row.event_id, 30, 3600); c.eventId = row.event_id;
  const ref = row.kind === "staff" ? "p:" + row.person_id : "f:" + row.flat_no; const id = await fileRequest(c, row.event_id, row.kind, ref, String(c.body.type ?? ""), { note: optStr(c.body.note, "note", 1000) ?? "" });
  return json({ requestId: id, message: "Received. The Organizer will answer; the date of your request is on record." }, 201);
});
route("POST", "/api/events/:id/privacy/contact", async (c, m) => {
  await rateLimit(c, "privacy-pub", c.ip, 5, 3600); await checkTurnstile(c, c.body.turnstile); c.eventId = m[1]!;
  const detail = { name: str(c.body.name, "name", 2, 80), email: emailOf(c.body.email), note: str(c.body.note, "note", 3, 1000) };
  const id = await fileRequest(c, m[1]!, "public_form", null, String(c.body.type ?? ""), detail); return json({ requestId: id, message: "Received. The Organizer will reply to the e-mail you gave." }, 201);
});
route("GET", "/api/events/:id/privacy/requests", async (c, m) => {
  const { tx, pid } = await staff(c, m[1]!, "read_contacts"); const st = await tx.st(); const key = await eventKey(c, tx.eid);
  const rows = (await c.db.prepare("SELECT r.id, r.type, r.channel, r.subject_ref, r.ct, r.at_ms, (SELECT action FROM privacy_resolutions x WHERE x.request_id=r.id ORDER BY x.id DESC LIMIT 1) status FROM privacy_requests r WHERE r.event_id=? ORDER BY r.at_ms").bind(tx.eid).all<any>()).results;
  const out = []; for (const r of rows) out.push({ id: r.id, type: r.type, channel: r.channel, subject: r.subject_ref, atMs: r.at_ms, status: r.status ?? "open", ...(await (async () => { try { return JSON.parse(await aesDecrypt(key, r.ct, tx.eid + "|privacy|" + r.id)); } catch { return { erased: true }; } })()) });
  await tx.add("contacts_read", ENTRY_ACTOR(st, pid), { by: pid, scope: "privacy_requests" }); await tx.commit(); return json({ requests: out });
});
route("POST", "/api/events/:id/privacy/requests/:rid/resolve", async (c, m) => {
  const { tx, pid } = await staff(c, m[1]!, "read_contacts"); const st = await tx.st(); const action = c.body.action === "refused" ? "refused" : c.body.action === "done" ? "done" : (() => { throw err(400, "bad_action", "action must be done or refused."); })();
  const note = str(c.body.note, "note", 5, 500); const r = await c.db.prepare("SELECT id FROM privacy_requests WHERE id=? AND event_id=?").bind(m[2]!, tx.eid).first(); if (!r) throw err(404, "no_request", "No such request.");
  await tx.add("privacy_resolved", ENTRY_ACTOR(st, pid), { requestId: m[2]!, action } as any, (seq) => [c.db.prepare("INSERT INTO privacy_resolutions(request_id,event_id,action,note,by_pid,at_ms,log_seq) VALUES(?,?,?,?,?,?,?)").bind(m[2]!, tx.eid, action, note, pid, c.now, seq)]);
  await tx.commit(); return json({ ok: true });
});
/** Erase ONE person (their contact) and/or ONE flat's attendee data (photos and the name written at check-in). Organizer only; also after the event is over. The public record is unchanged. */
route("POST", "/api/events/:id/privacy/erase", async (c, m) => {
  const { tx, pid } = await staff(c, m[1]!, "erase_data"); const st = await tx.st(); const reason = str(c.body.reason, "reason", 5, 300); const refs: string[] = [];
  if (typeof c.body.personId === "string") { if (!(await c.db.prepare("SELECT 1 x FROM people WHERE id=? AND event_id=?").bind(c.body.personId, tx.eid).first())) throw err(404, "no_person", "No such person."); refs.push("p:" + c.body.personId); }
  if (typeof c.body.flatNo === "string") refs.push("f:" + c.body.flatNo); if (!refs.length) throw err(400, "nothing", "Say personId and/or flatNo.");
  for (const ref of refs) await c.db.prepare("INSERT INTO subject_keys(event_id,ref,wrapped_key,created_ms,destroyed_ms) VALUES(?,?,NULL,?,?) ON CONFLICT(event_id,ref) DO UPDATE SET wrapped_key=NULL, destroyed_ms=excluded.destroyed_ms").bind(tx.eid, ref, c.now, c.now).run();
  await tx.add("person_erased", ENTRY_ACTOR(st, pid), { refs, reason } as any); await tx.commit(); return json({ ok: true, erased: refs, note: "These details can no longer be read by anyone. The public record is unchanged." });
});
/** The WORKING view: while an Attendance Monitor is checking a person in, they see that person's name in full to compare with the ID; the moment the flat is marked present it is hidden again. Every look is logged. */
route("GET", "/api/events/:id/verify/:flat", async (c, m) => {
  const { tx, pid } = await staff(c, m[1]!, "mark_attendance"); const st = await tx.st(); const flatNo = decodeURIComponent(m[2]!); const f = st.roll.find((x) => x.flatNo === flatNo);
  if (!f) throw err(404, "no_flat", "That flat is not on the list."); const present = st.attendance.has(flatNo);
  const rows = (await c.db.prepare("SELECT p.id, p.masked_name, p.masked_phone, c.ct FROM people p JOIN private_contacts c ON c.person_id=p.id WHERE p.event_id=? AND p.flat_no=?").bind(tx.eid, flatNo).all<any>()).results;
  const holders = []; for (const r of rows) { if (present) { holders.push({ name: r.masked_name, phone: r.masked_phone, hidden: true }); continue; } const ct = await openContact(c, tx.eid, r.id, r.ct); holders.push(ct ? { name: ct.name, phone: ct.phone, hidden: false } : { name: r.masked_name, phone: r.masked_phone, erased: true, hidden: true }); }
  await tx.add("contacts_read", ENTRY_ACTOR(st, pid), { by: pid, scope: "verify", flatNo } as any); await tx.commit();
  return json({ flatNo, weight: f.weight, eligible: f.eligible, alreadyPresent: present, holders, note: present ? "Already marked present: details are hidden again." : "Compare the name with the proof shown. It is hidden again as soon as you mark this flat present." });
});
/** The buyer's checkout came back: the central service checks the signature and asks Razorpay what really happened; the attempt is filed in ledger C and, if paid, the payment is marked paid. Anyone holding the link may call it. */
route("POST", "/api/pay/link/:token/verify", async (c, m) => {
  const p = await payByToken(c, m[1]!); await rateLimit(c, "payverify", p.paymentId, 30, 600);
  const oid = str(c.body.razorpay_order_id, "order", 6, 60), pid2 = str(c.body.razorpay_payment_id, "payment", 6, 60), sig = str(c.body.razorpay_signature, "signature", 10, 200);
  const row = await c.db.prepare("SELECT order_id, txn_id FROM payments WHERE payment_id=? AND state='created'").bind(p.paymentId).first<{ order_id: string | null; txn_id: string | null }>();
  if (!row?.order_id || row.order_id !== oid) throw err(409, "wrong_order", "That payment belongs to a different order.");
  c.eventId = p.eventId; const d = await centralVerify(c, { orderId: oid, paymentId: pid2, signature: sig });
  await recordAttempt(c, { rzpPaymentId: pid2, rzpOrderId: oid, paymentId: p.paymentId, eventId: p.eventId, txnId: d.txn_id ?? row.txn_id, status: d.paid ? "paid" : d.status === "failed" ? "failed" : d.status === "authorized" ? "authorized" : "created", amountMinor: p.pay.amountMinor, currency: p.pay.currency, method: d.method ?? null, feeMinor: typeof d.fee_minor === "number" ? d.fee_minor : null, taxMinor: typeof d.tax_minor === "number" ? d.tax_minor : null, email: d.payer_email ?? null, atMs: c.now });
  if (d.paid) await markPaid(c, p.eventId, p.paymentId, "central-verify");
  return json({ paid: !!d.paid, status: d.status ?? null, txnId: d.txn_id ?? row.txn_id });
});
/** Ledger C for the owner: Bearer OWNER_LEDGER_KEY. ?month=YYYY-MM */
route("GET", "/api/owner/ledger", async (c) => json({ site: c.env.PAY_SITE ?? null, ledger: "C", rows: await ownerLedger(c, c.url.searchParams.get("month")) }));
/** The person to complain to about personal data (DPDP s.13 / GDPR art. 77): set by the deployer; the name defaults to the owner. */
route("GET", "/api/privacy/officer", async (c) => json({ grievanceOfficer: c.env.GRIEVANCE_NAME ?? "Rajat Agarwal", email: c.env.GRIEVANCE_EMAIL ?? null, form: "POST /api/events/:id/privacy/contact", answerWithin: "30 days", note: "You may also write through the privacy form of any event." }));
function pointInput(b: any, cur?: any) {
  const kindIn = b.kind ?? cur?.kind;
  const kind = ["discussion", "resolution", "election_post"].includes(kindIn) ? (kindIn as string) : (() => { throw err(400, "bad_kind", "kind must be discussion, resolution or election_post."); })();
  const title = str(b.title ?? cur?.title, "title", 2, 200), body = optStr(b.body ?? cur?.body, "body", 4000);
  let options: string[] = []; const labels: Record<string, string> = {};
  if (kind === "resolution") {
    const abstain = b.abstain !== undefined ? b.abstain !== false : cur ? cur.options.includes("abstain") : true;
    options = ["yes", "no", ...(abstain ? ["abstain"] : [])]; labels.yes = "Yes"; labels.no = "No"; if (abstain) labels.abstain = "Abstain";
  } else if (kind === "election_post") {
    const raw = Array.isArray(b.candidates) ? b.candidates : cur ? cur.options.map((id: string) => ({ id, label: cur.labels?.[id] ?? id })) : [];
    const seenLabel = new Set<string>();
    for (const x of raw) {
      const label = str(typeof x === "string" ? x : x?.label, "candidate", 1, 80); const given = typeof x === "object" && x ? x.id : undefined;
      let id: string; if (given) { if (!cur?.options.includes(given)) throw err(400, "bad_candidate_id", "Unknown candidate id."); id = given; } else id = "c_" + randomHex(6);
      if (options.includes(id) || seenLabel.has(label.toLowerCase())) throw err(400, "dup_candidate", "Two candidates have the same name or id.");
      seenLabel.add(label.toLowerCase()); options.push(id); labels[id] = label;
    }
    if (options.length < 2) throw err(400, "bad_options", "An election post needs at least two candidates.");
  }
  const n = options.filter((o) => o !== "abstain").length;
  const maxChoices = kind === "election_post" ? int(b.maxChoices ?? cur?.maxChoices ?? 1, "maxChoices", 1, Math.max(1, n)) : 1;
  const minChoices = kind === "discussion" ? 0 : int(b.minChoices ?? cur?.minChoices ?? 1, "minChoices", 0, maxChoices);
  const majorityClass = typeof b.majorityClass === "string" ? b.majorityClass : cur?.majorityClass ?? "simple"; try { parseMajority(majorityClass); } catch { throw err(400, "bad_majority", "Unknown majority class."); }
  let format: string | null = null, seats: string[] = [], topN: number | null = null;
  if (kind === "election_post") {
    format = b.format ?? cur?.format ?? "single_post"; if (!["single_post", "ranked_posts", "top_n"].includes(format!)) throw err(400, "bad_format", "format must be single_post, ranked_posts or top_n.");
    if (format === "ranked_posts") { seats = (b.seats ?? cur?.seats ?? []).map((x: unknown) => str(x, "post name", 2, 60)); if (!seats.length || seats.length > n || new Set(seats.map((x) => x.toLowerCase())).size !== seats.length) throw err(400, "bad_seats", "Give the post names (President, Vice President ...): at least one, all different, no more than the candidates."); }
    if (format === "top_n") { topN = int(b.topN ?? cur?.topN, "topN", 1, n); }
  }
  let design; try { design = normalizeBallotDesign(b.design ?? cur?.design); } catch (e: any) { throw err(400, "bad_design", e.message); }
  return { kind, title, body, options, labels, maxChoices, minChoices, majorityClass, secret: b.secret !== undefined ? b.secret === true : cur?.secret === true, format, seats, topN, design };
}
route("POST", "/api/events/:id/points", async (c, m) => {
  const { tx, pid } = await staff(c, m[1]!, "edit_setup"); const st = await tx.st(); decide(canAmendPoint(st, null));
  const p = pointInput(c.body); const number = optStr(c.body.number, "number", 12) || String(st.pointOrder.length + 1);
  if (p.kind === "election_post" && !st.rules?.options.secret_ballot && !p.secret) p.secret = false; // organizer's explicit choice stands unless the pack locks it
  if (st.rules?.locked.secret_ballot?.value && p.kind === "election_post") p.secret = true;
  const pointId = newId("pt_", 8);
  await tx.add("point_added", ENTRY_ACTOR(st, pid), { pointId, number, ...p, rev: 1 } as any, (seq) => [pointStmt(c, tx.eid, pointId, { number, ...p }, 1, seq)]);
  await tx.commit(); return json({ pointId, number }, 201);
});
route("PUT", "/api/events/:id/points/:pid", async (c, m) => {
  const { tx, pid } = await staff(c, m[1]!, "edit_setup"); const st = await tx.st(); decide(canAmendPoint(st, m[2]!));
  const cur = st.points.get(m[2]!); if (!cur) throw err(404, "unknown_point", "No such agenda point.");
  const p = pointInput(c.body, cur.def); const number = optStr(c.body.number, "number", 12) || cur.def.number; const rev = cur.def.rev + 1;
  await tx.add("point_amended", ENTRY_ACTOR(st, pid), { pointId: m[2]!, number, ...p, rev } as any, (seq) => [pointStmt(c, tx.eid, m[2]!, { number, ...p }, rev, seq)]);
  await tx.commit(); return json({ ok: true, rev });
});
route("POST", "/api/events/:id/people", async (c, m) => {
  const { tx, pid } = await staff(c, m[1]!, "edit_setup"); const st = await tx.st();
  const role = c.body.role as Role; if (!["host", "attendance_officer"].includes(role)) throw err(400, "bad_role", "role must be host or attendance_officer.");
  { const known = typeof c.body.personId === "string" ? st.people.get(c.body.personId) ?? null : null; const why = appointProblem([...st.people.values()], known, role); if (why) throw err(409, "role_limit", why + " Remove someone first, or give the role to a person who already has another role."); }
  const stmts: D1Stmt[] = []; let target = typeof c.body.personId === "string" ? c.body.personId : "";
  let to = "";
  if (target) { if (!st.people.has(target)) throw err(404, "no_person", "No such person."); to = (await contactOf(c, tx.eid, target)).email; }
  else {
    const p = { name: str(c.body.name, "name", 2, 80), email: emailOf(c.body.email), phone: optStr(c.body.phone, "phone", 20) };
    target = newId("p_", 8); to = p.email; stmts.push(...(await personStmts(c, tx.eid, target, p, optStr(c.body.flatNo, "flatNo", 24) || null, await eventKey(c, tx.eid))));
    const tt = target;
    await tx.add("role_appointed", ENTRY_ACTOR(st, pid), { pid: tt, role, appointedBy: pid, maskedName: maskName(p.name), maskedEmail: maskEmail(p.email) }, (seq) => [roleStmt(c, tx.eid, tt, role, "appoint", pid, seq)]);
  }
  if (c.body.personId) await tx.add("role_appointed", ENTRY_ACTOR(st, pid), { pid: target, role, appointedBy: pid, maskedName: st.people.get(target)!.maskedName, maskedEmail: st.people.get(target)!.maskedEmail }, (seq) => [roleStmt(c, tx.eid, target, role, "appoint", pid, seq)]);
  if (c.body.label) {
    const label = str(c.body.label, "label", 2, 40);
    const rev = ((await c.db.prepare("SELECT MAX(rev) r FROM person_labels WHERE person_id=?").bind(target).first<{ r: number }>())?.r ?? 0) + 1;
    await tx.add("label_set", ENTRY_ACTOR(st, pid), { pid: target, label }, (seq) => [c.db.prepare("INSERT INTO person_labels(person_id,event_id,label,rev,log_seq) VALUES(?,?,?,?,?)").bind(target, tx.eid, label, rev, seq)]);
  }
  await tx.commit(stmts);
  const soc = (await tx.st()).created?.society.name ?? "a society";
  await issueLogin(c, tx.eid, target, to, soc).catch((e) => { if (!(e instanceof ApiError)) throw e; });
  return json({ personId: target, role }, 201);
});
route("POST", "/api/events/:id/people/:pid/remove", async (c, m) => {
  const { tx, pid } = await staff(c, m[1]!, "edit_setup"); const st = await tx.st();
  const role = c.body.role as Role; const p = st.people.get(m[2]!);
  if (!p || !p.roles.includes(role)) throw err(404, "no_role", "That person does not hold that role.");
  if (role === "organizer") throw err(403, "organizer_fixed", "The Organizer cannot be removed.");
  await tx.add("role_removed", ENTRY_ACTOR(st, pid), { pid: m[2]!, role, removedBy: pid }, (seq) => [roleStmt(c, tx.eid, m[2]!, role, "remove", pid, seq)]);
  await tx.commit(); return json({ ok: true });
});
route("POST", "/api/events/:id/people/:pid/label", async (c, m) => {
  const { tx, pid } = await staff(c, m[1]!, "edit_setup"); const st = await tx.st(); const target = m[2]!;
  if (!st.people.has(target)) throw err(404, "no_person", "No such person.");
  const label = str(c.body.label, "label", 2, 40);
  const rev = ((await c.db.prepare("SELECT MAX(rev) r FROM person_labels WHERE person_id=?").bind(target).first<{ r: number }>())?.r ?? 0) + 1;
  await tx.add("label_set", ENTRY_ACTOR(st, pid), { pid: target, label }, (seq) => [c.db.prepare("INSERT INTO person_labels(person_id,event_id,label,rev,log_seq) VALUES(?,?,?,?,?)").bind(target, tx.eid, label, rev, seq)]);
  await tx.commit(); return json({ ok: true, rev });
});
route("POST", "/api/events/:id/holders", async (c, m) => {
  const { tx, pid } = await staff(c, m[1]!, "edit_setup"); const st = await tx.st();
  const flatNo = str(c.body.flatNo, "flatNo", 1, 24); if (!st.roll.some((f) => f.flatNo === flatNo)) throw err(400, "no_flat", "That flat is not on the list.");
  const p = { name: str(c.body.name, "name", 2, 80), email: c.body.email ? emailOf(c.body.email) : "", phone: optStr(c.body.phone, "phone", 20) };
  const hid = newId("p_", 8); const stmts = await personStmts(c, tx.eid, hid, p, flatNo, await eventKey(c, tx.eid));
  await tx.add("holder_added", ENTRY_ACTOR(st, pid), { pid: hid, flatNo, maskedName: maskName(p.name) }); await tx.commit(stmts);
  return json({ personId: hid }, 201);
});
route("GET", "/api/events/:id/contacts", async (c, m) => {
  const { tx, pid } = await staff(c, m[1]!, "read_contacts"); const st = await tx.st();
  const key = await eventKey(c, tx.eid);
  const rows = (await c.db.prepare("SELECT p.id, p.flat_no, c.ct FROM people p JOIN private_contacts c ON c.person_id=p.id WHERE p.event_id=?").bind(tx.eid).all<any>()).results;
  const out = []; for (const r of rows) { const ct = await openContact(c, tx.eid, r.id, r.ct); out.push({ pid: r.id, flatNo: r.flat_no, roles: st.people.get(r.id)?.roles ?? [], ...(ct ?? { erased: true }) }); } void key;
  await tx.add("contacts_read", ENTRY_ACTOR(st, pid), { by: pid, scope: "all" }); await tx.commit();
  return json({ contacts: out });
});
route("GET", "/api/events/:id/audit", async (c, m) => {
  const { tx } = await staff(c, m[1]!, "read_contacts"); return json({ note: "IP addresses are shortened here and the device code is shortened. The full values are released only on a lawful request.", rows: await readAudit(c, tx.eid, false) });
});
route("POST", "/api/events/:id/crypto-shred", async (c, m) => {
  const { tx, pid } = await staff(c, m[1]!, "erase_data"); const st = await tx.st(); // organizer only, also after the event closed
  await tx.add("key_destroyed", ENTRY_ACTOR(st, pid), { by: pid });
  await tx.commit([c.db.prepare("UPDATE event_keys SET wrapped_key=NULL, destroyed_ms=? WHERE event_id=?").bind(c.now, tx.eid)]);
  return json({ ok: true, note: "The private details can no longer be read. The public record is unchanged." });
});

// ------------------------------------------------------------------------------------------------ payment (TEST mode only in this build)
route("POST", "/api/events/:id/pay", async (c, m) => {
  const { tx, pid } = await staff(c, m[1]!, "pay"); const st = await tx.st();
  if (c.env.TEST_MODE !== "1" && !centralConfigured(c.env)) throw err(503, "pay_disabled", "Payments are not switched on yet.");
  if (st.paid) throw err(409, "already_paid", "This event is already paid.");
  const price = priceFor(st.created!.kind, st.created!.country); const p = await createPayment(c, tx, st, pid, "event", price.amountMinor, price.currency);
  return json({ paymentId: p.paymentId, amountMinor: price.amountMinor, currency: price.currency, price: formatPrice(price), mode: c.env.TEST_MODE === "1" ? "test" : "live", orderId: p.orderId, keyId: p.keyId, txnId: p.txnId, payPath: await payPathFor(c, p.paymentId) }, 201);
});
async function markPaid(c: Ctx, eid: string, paymentId: string, via: string): Promise<void> {
  const tx = await Tx.load(c, eid); const st = await tx.st();
  const created = st.payments.find((p) => p.paymentId === paymentId && p.state === "created"); if (!created) throw err(404, "no_payment", "No such payment.");
  if (st.payments.some((p) => p.paymentId === paymentId && p.state === "paid")) return; // idempotent
  await tx.add("payment_state", { system: true }, { paymentId, state: "paid", amountMinor: created.amountMinor, currency: created.currency, mode: created.mode, purpose: created.purpose }, (seq) => [c.db.prepare("INSERT INTO payments(payment_id,event_id,state,mode,order_id,amount_minor,currency,ref,log_seq,at_ms) VALUES(?,?,'paid',?,NULL,?,?,?,?,?)").bind(paymentId, eid, created.mode, created.amountMinor, created.currency, via, seq, c.now)]);
  await tx.commit();
  if (created.purpose === "reschedule") { // the postponement the payment was waiting for takes effect now
    const iid = await kvGet(c, "intentpay:" + paymentId); const raw = iid ? await kvGet(c, "intent:" + iid) : null;
    if (iid && raw) { const it = JSON.parse(raw) as Intent; if (!it.done) { it.done = true; await kvSet(c, "intent:" + iid, JSON.stringify(it)); await applyPostpone(c, eid, it, paymentId, true); } }
  }
}
route("POST", "/api/pay/test-confirm", async (c) => {
  if (c.env.TEST_MODE !== "1") throw err(404, "not_found", "Not found.");
  const eid = str(c.body.eventId, "eventId", 10, 64); const { pid } = await staff(c, eid, "pay");
  void pid; await markPaid(c, eid, str(c.body.paymentId, "paymentId", 3, 40), "test-confirm"); return json({ ok: true });
});
route("POST", "/api/pay/webhook", async (c) => {
  if (c.req.headers.get("x-razorpay-signature")) { // a delivery forwarded by IT Services (Razorpay's own signature over the raw body)
    const r = await handleRazorpayWebhook(c, String((c.body as any).__raw ?? JSON.stringify(c.body)), async (eid, pid2, via) => { c.eventId = eid; await markPaid(c, eid, pid2, via); }); return json({ ok: true, result: r.result });
  }
  const sig = c.req.headers.get("x-signature") ?? ""; const secret = c.env.PAY_WEBHOOK_SECRET;
  if (!secret || c.env.TEST_MODE !== "1") throw err(404, "not_found", "Not found.");
  const raw = JSON.stringify(c.body);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = Array.from(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw))), (x) => x.toString(16).padStart(2, "0")).join("");
  if (mac !== sig) throw err(401, "bad_signature", "Bad signature.");
  if (c.body.state === "paid") await markPaid(c, String(c.body.eventId), String(c.body.paymentId), "webhook");
  return json({ ok: true });
});

// ------------------------------------------------------------------------------------------------ life cycle
route("POST", "/api/events/:id/agenda/publish", async (c, m) => {
  const { tx, pid } = await staff(c, m[1]!, "publish_agenda"); const st = await tx.st();
  await tx.add("agenda_published", ENTRY_ACTOR(st, pid), agendaPayload(st, c.now), (seq) => [statusStmt(c, tx.eid, "agenda_published", seq)]);
  await tx.commit(); const s2 = await tx.st(); return json({ ok: true, notice: s2.agenda });
});
route("POST", "/api/events/:id/start", async (c, m) => {
  const { tx, pid } = await staff(c, m[1]!, "start"); const st = await tx.st();
  await tx.add("event_started", ENTRY_ACTOR(st, pid), {}, (seq) => [statusStmt(c, tx.eid, "live", seq)]); await tx.commit(); return json({ ok: true });
});
route("PUT", "/api/events/:id/schedule", async (c, m) => {
  const { tx, pid } = await staff(c, m[1]!, "edit_setup"); const st = await tx.st();
  if (st.status === "live" || st.status === "closed") throw err(403, "frozen", "The schedule can no longer be changed once the event has started.");
  const schedule = c.body.schedule as Schedule; const why = validateSchedule(schedule); if (why) throw err(400, "bad_schedule", why);
  const reason = str(c.body.reason, "reason", 3, 300);
  await tx.add("schedule_set", ENTRY_ACTOR(st, pid), { schedule: schedule as any, reason, old: st.created!.schedule as any });
  await tx.commit([c.db.prepare("INSERT INTO event_rules(event_id,scope,param,value_json,rev,changed_by,reason,log_seq,at_ms) VALUES(?,?,?,?,?,?,?,?,?)").bind(tx.eid, "event", "schedule", JSON.stringify(schedule), st.scheduleChanges.length + 2, pid, reason, tx.entries.length, c.now)]);
  return json({ ok: true, progress: progressOf(await tx.st()) });
});
route("POST", "/api/events/:id/attendance", async (c, m) => {
  const { tx, pid } = await staff(c, m[1]!, "mark_attendance"); const st = await tx.st();
  const flatNo = str(c.body.flatNo, "flatNo", 1, 24); const f = st.roll.find((x) => x.flatNo === flatNo);
  if (!f || !f.eligible) throw err(400, "no_flat", "That flat is not on the voting list.");
  const attendee = str(c.body.attendeeName, "attendeeName", 2, 80), mode = c.body.mode === "online" ? "online" : "physical";
  const method = str(c.body.method ?? "visual", "method", 2, 40), docType = optStr(c.body.docType, "docType", 30) || null, docLast4: string | null = null; // an ID number, even its last digits, is never kept: only the kind of document and who checked it
  const evidenceHash = optStr(c.body.evidenceHash, "evidenceHash", 64) || null; const present = c.body.present !== false;
  const checks = c.body.checks && typeof c.body.checks === "object" ? Object.fromEntries(Object.entries(c.body.checks).filter(([, v]) => typeof v === "boolean").slice(0, 12)) as Record<string, boolean> : null;
  if (present && st.rules?.options.attendance_checklist) {
    const miss = missingChecks({ attendance_photo: !!st.rules.options.attendance_photo, id_check: !!st.rules.options.id_check }, checks);
    if (miss.length) throw err(400, "tick_all_boxes", "Please tick every box before marking present: " + miss.map((x) => x.label).join("; ") + ".");
    if (st.rules.options.attendance_photo && !(await c.db.prepare("SELECT 1 x FROM attendance_evidence WHERE event_id=? AND flat_no=?").bind(tx.eid, flatNo).first())) throw err(400, "photo_first", "Take the photo of the attendee first, then mark present.");
  }
  const independent = st.people.get(pid)!.roles.includes("attendance_officer");
  const key = (await subjectKey(c, tx.eid, "f:" + flatNo, true))!; const ct = await aesEncrypt(key, JSON.stringify({ attendee }), tx.eid + "|att|" + flatNo);
  await tx.add("attendance_marked", ENTRY_ACTOR(st, pid), { flatNo, mode, method, docType, docLast4, maskedName: maskName(attendee), by: pid, independent, evidenceHash, present, checks, idChecked: !!docType, idVerifiedBy: docType ? pid : null },
    (seq) => [c.db.prepare("INSERT INTO attendance(event_id,flat_no,attendee_masked_name,mode,method,doc_type,doc_last4,marked_by,independent,evidence_hash,supersedes_id,log_seq,at_ms) VALUES(?,?,?,?,?,?,?,?,?,?,NULL,?,?)").bind(tx.eid, flatNo, maskName(attendee), mode, method, docType, docLast4, pid, independent ? 1 : 0, evidenceHash, seq, c.now),
      c.db.prepare("INSERT INTO private_evidence(event_id,flat_no,kind,ct,evidence_hash,created_ms) VALUES(?,?,'attendee_name',?,?,?)").bind(tx.eid, flatNo, ct, evidenceHash ?? "", c.now)]);
  await tx.commit(); return json({ ok: true, independent, present: (await tx.st()).attendance.size });
});
route("POST", "/api/events/:id/evidence", async (c, m) => {
  const { tx } = await staff(c, m[1]!, "mark_attendance"); const st = await tx.st();
  if (!st.rules?.options.attendance_photo && !st.rules?.options.id_check) throw err(403, "evidence_off", "Photos and ID images are switched off for this event.");
  const ct = str(c.body.ct, "ct", 16, 300_000), kind = ["photo", "id"].includes(c.body.kind) ? (c.body.kind as string) : (() => { throw err(400, "bad_kind", "kind must be photo or id."); })();
  await c.db.prepare("INSERT INTO private_evidence(event_id,flat_no,kind,ct,evidence_hash,created_ms) VALUES(?,?,?,?,?,?)").bind(tx.eid, str(c.body.flatNo, "flatNo", 1, 24), kind, ct, str(c.body.evidenceHash, "evidenceHash", 16, 64), c.now).run();
  return json({ ok: true }, 201);
});
route("POST", "/api/events/:id/passcodes/voter", async (c, m) => {
  const { tx, pid } = await staff(c, m[1]!, "issue_voter_code"); const st = await tx.st();
  const flatNo = str(c.body.flatNo, "flatNo", 1, 24);
  if (!st.attendance.has(flatNo)) throw err(409, "not_present", "Mark this flat present before giving out a code.");
  const kind = c.body.kind === "proxy" ? "proxy" : "official";
  if (kind === "proxy") {
    const holder = await pepperHash(c.env, "proxy:" + tx.eid, str(c.body.holderRef, "holderRef", 2, 80).toLowerCase());
    const row = await c.db.prepare("SELECT v FROM kv_state WHERE k=?").bind("proxy:" + holder).first<{ v: string }>();
    const pa = proxyAllowed(st.rules!, parseInt(row?.v ?? "0", 10));
    if (!pa.ok) throw err(403, pa.reason!, pa.reason === "proxy_off" ? "Proxy voting is switched off for this event." : "That person already holds the most proxies allowed.");
    await c.db.prepare("INSERT INTO kv_state(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=CAST(v AS INTEGER)+1").bind("proxy:" + holder, "1").run();
  }
  const { code, row, voidedIds } = await issuePasscode({ store: new D1PasscodeStore(c.db), pepper: c.env.PEPPER, eventId: tx.eid, purpose: "voter", subject: flatNo, nowMs: c.now, ttlMs: 12 * 3600_000, newId: () => newId("pc_"), issuedBy: pid });
  await tx.add("passcode_issued", ENTRY_ACTOR(st, pid), { purpose: "voter", subjectKind: "flat", subject: flatNo, by: pid, kind, voided: voidedIds.length });
  await tx.commit([c.db.prepare("UPDATE passcodes SET kind=? WHERE id=?").bind(kind, row.id)]);
  return json({ code, flatNo, kind, note: "Shown once. Hand it to the voter." }, 201);
});

const minutesOf = (v: unknown, d = 30) => (v === undefined ? d : int(v, "minutes", 1, 720));
route("POST", "/api/events/:id/points/:pid/open", async (c, m) => {
  const { tx, pid } = await staff(c, m[1]!, "open_point", { pointId: m[2]!, adjourned: c.body.adjourned === true }); const st = await tx.st();
  const endsMs = c.now + minutesOf(c.body.minutes) * 60_000;
  await tx.add("point_opened", ENTRY_ACTOR(st, pid), await openPointPayload(st, m[2]!, endsMs), (seq) => [c.db.prepare("INSERT INTO point_state(point_id,event_id,state,ends_ms,log_seq,at_ms) VALUES(?,?,'open',?,?,?)").bind(m[2]!, tx.eid, endsMs, seq, c.now)]);
  await tx.commit(); return json({ ok: true, endsMs });
});
route("POST", "/api/events/:id/points/:pid/extend", async (c, m) => {
  const { tx, pid } = await staff(c, m[1]!, "extend_point", { pointId: m[2]!, nowMs: c.now }); const st = await tx.st();
  const reason = str(c.body.reason, "reason", 3, 300); const pt = st.points.get(m[2]!)!;
  const endsMs = (pt.endsMs ?? c.now) + (((st.rules!.params["window.extensionMinutes"] as number) ?? 30) * 60_000);
  await tx.add("point_extended", ENTRY_ACTOR(st, pid), { pointId: m[2]!, endsMs, reason }, (seq) => [c.db.prepare("INSERT INTO point_state(point_id,event_id,state,ends_ms,log_seq,at_ms) VALUES(?,?,'open',?,?,?)").bind(m[2]!, tx.eid, endsMs, seq, c.now)]);
  await tx.commit(); return json({ ok: true, endsMs });
});
async function closePoint(c: Ctx, tx: Tx, pid: string | null, pointId: string): Promise<void> {
  let st = await tx.st(); const actor: Actor = pid ? ENTRY_ACTOR(st, pid) : { system: true };
  await tx.add("point_closed", actor, { pointId, by: pid ?? "system" }, (seq) => [c.db.prepare("INSERT INTO point_state(point_id,event_id,state,ends_ms,log_seq,at_ms) VALUES(?,?,'closed',NULL,?,?)").bind(pointId, tx.eid, seq, c.now)]);
  // a point voted partly on paper stays open for COUNTING (photographing the returned papers) until finishCount; all other points are counted at once
  if (!(await paperStats(c, tx.eid, pointId))) await finishCount(c, tx, pid, pointId);
}
/** Seals the ballot box (secret points), then computes and records the result. For paper points the account of papers is part of the seal. */
async function finishCount(c: Ctx, tx: Tx, pid: string | null, pointId: string): Promise<void> {
  let st = await tx.st(); const pt = st.points.get(pointId)!;
  if (pt.def.secret) {
    const rows = (await c.db.prepare("SELECT receipt_hash, choice_json, weight, kind FROM ballot_box WHERE point_id=?").bind(pointId).all<any>()).results;
    const box: BoxBallot[] = rows.map((r) => ({ receipt: r.receipt_hash, choices: JSON.parse(r.choice_json), weight: r.weight, kind: r.kind }));
    const payload = await sealBoxPayload(st, pointId, box); const paper = await paperStats(c, tx.eid, pointId); if (paper) payload.paper = paper as any;
    await tx.add("ballot_box_sealed", { system: true }, payload, (seq) => [c.db.prepare("INSERT INTO box_seals(event_id,point_id,n,counts_json,digest,log_seq) VALUES(?,?,?,?,?,?)").bind(tx.eid, pointId, payload.n as number, JSON.stringify(payload.counts), payload.digest as string, seq)]);
    st = await tx.st();
  }
  await tx.add("result_computed", { system: true }, resultPayload(st, pointId)); void pid;
}
route("POST", "/api/events/:id/points/:pid/close", async (c, m) => {
  const { tx, pid } = await staff(c, m[1]!, "close_point", { pointId: m[2]!, nowMs: c.now });
  await closePoint(c, tx, pid, m[2]!); await tx.commit(); return json({ ok: true, result: (await tx.st()).results.get(m[2]!) });
});
/** Closes every open point, closes the event, builds + signs + stores the report, all in ONE atomic write. Used by the Host's button and by the automatic end-of-event tick. */
async function closeAndPublish(c: Ctx, tx: Tx, pid: string | null, end?: { outcome: "completed" | "stopped" | "cancelled"; reasonCodes: string[]; reason: string }): Promise<{ fileSha256: string; headSeq: number }> {
  let st = await tx.st();
  for (const id of st.pointOrder) if (st.points.get(id)!.state === "open") { await closePoint(c, tx, pid, id); st = await tx.st(); }
  for (const id of st.pointOrder) { const p = st.points.get(id)!; if (p.state === "closed" && !st.results.has(id) && p.def.kind !== "discussion") { await finishCount(c, tx, pid, id); st = await tx.st(); } }
  st = await tx.st(); const actor: Actor = pid ? ENTRY_ACTOR(st, pid) : { system: true };
  await tx.add("event_closed", actor, { headSeq: tx.nextSeq, auto: pid === null, outcome: end?.outcome ?? "completed", reasonCodes: end?.reasonCodes ?? [], reason: end?.reason ?? "" } as any, (seq) => [statusStmt(c, tx.eid, "closed", seq)]);
  st = await tx.st(); const model = buildReportModel(st); const pk = await publicKey(c.env);
  const { html, seal } = await sealReport(renderReportHtml(model, tx.entries, pk.publicKey, pk.kid), model, c.env.SIGNING_KEY, pk.kid);
  await tx.commit([
    c.db.prepare("INSERT INTO reports(event_id,rev,file_sha256,sig,head_seq,head_hash,html,published_ms) VALUES(?,1,?,?,?,?,?,?)").bind(tx.eid, seal.fileSha256, seal.sig, seal.headSeq, seal.headHash, html, c.now),
    c.db.prepare("INSERT INTO anchors(event_id,head_seq,head_hash,kind,sig,at_ms) VALUES(?,?,?,'report',?,?)").bind(tx.eid, seal.headSeq, seal.headHash, seal.sig, c.now),
  ]);
  try { // best effort: the Organizer gets the PDF by e-mail straight away; a mail problem never blocks or undoes the publication
    const org = [...st.people.values()].find((p) => p.roles.includes("organizer"));
    if (org) await emailReport(c, tx.eid, [(await contactOf(c, tx.eid, org.pid)).email], { system: true });
  } catch (e) { console.error("auto e-mail of the report failed", String((e as any)?.message ?? e)); }
  return { fileSha256: seal.fileSha256, headSeq: seal.headSeq };
}
route("POST", "/api/events/:id/close", async (c, m) => {
  const { tx, pid } = await staff(c, m[1]!, "close_event");
  const r = await closeAndPublish(c, tx, pid);
  return json({ ok: true, report: `/api/r/${tx.eid}`, pdf: `/api/r/${tx.eid}/pdf`, fileSha256: r.fileSha256, headSeq: r.headSeq });
});
/** The scheduler (every minute) closes live events whose scheduled end has passed and publishes their reports: the report is out within about a minute of the end, well inside 120 seconds. */
route("POST", "/api/internal/tick", async (c) => {
  if (!c.env.INTERNAL_SECRET || c.req.headers.get("x-internal-secret") !== c.env.INTERNAL_SECRET) throw err(404, "not_found", "Not found.");
  const live = (await c.db.prepare("SELECT event_id FROM event_status s WHERE id=(SELECT MAX(id) FROM event_status WHERE event_id=s.event_id) AND status='live'").all<{ event_id: string }>()).results;
  const closed: string[] = [];
  for (const r of live) {
    const tx = await Tx.load(c, r.event_id); const st = await tx.st();
    if (st.status !== "live" || st.rules?.options.auto_publish === false || c.now < st.created!.schedule.end.atMs) continue;
    c.eventId = r.event_id; await closeAndPublish(c, tx, null); closed.push(r.event_id);
  }
  // retention: once the keeping period after publication is over, the private details are erased for ever (the event key is destroyed); the public record is unchanged
  const erased: string[] = [];
  const old = (await c.db.prepare("SELECT r.event_id FROM reports r JOIN event_keys k ON k.event_id=r.event_id WHERE k.wrapped_key IS NOT NULL AND r.rev=(SELECT MAX(rev) FROM reports WHERE event_id=r.event_id) AND r.published_ms < ? LIMIT 25").bind(c.now - 30 * 86_400_000).all<{ event_id: string }>()).results;
  for (const r of old) {
    const tx = await Tx.load(c, r.event_id); const st = await tx.st(); const pub = st.closedInfo?.ts ?? 0; const params = st.rules?.params ?? {};
    const days = Math.max((params["privacy.retentionDays"] as number | null) ?? 365, (((params["retention.years"] as number | null) ?? 0) * 365));
    if (!pub || c.now < pub + days * 86_400_000) continue;
    c.eventId = r.event_id; await tx.add("key_destroyed", { system: true }, { auto: true, reason: `retention period of ${days} days is over` } as any);
    await tx.commit([c.db.prepare("UPDATE event_keys SET wrapped_key=NULL, destroyed_ms=? WHERE event_id=?").bind(c.now, r.event_id)]); erased.push(r.event_id);
  }
  const summaries = await pushSiteSummary(c).catch(() => 0);
  return json({ closed: closed.length, events: closed, erased: erased.length, summariesSent: summaries });
});
async function reportBytes(c: Ctx, eid: string): Promise<{ html: string; pdf: Uint8Array; pdfSha256: string; fileSha256: string }> {
  const rep = await c.db.prepare("SELECT html FROM reports WHERE event_id=? ORDER BY rev DESC LIMIT 1").bind(eid).first<{ html: string }>();
  if (!rep) throw err(409, "not_published", "The report is published when the event closes.");
  const data = extractData(rep.html)!, seal = extractSeal(rep.html);
  const pdf = await renderReportPdf(data, seal, { reportUrl: `${(c.env.PUBLIC_ORIGIN ?? c.url.origin).replace(/\/+$/, "")}/api/r/${eid}` });
  return { html: rep.html, pdf, pdfSha256: await pdfSha256(pdf), fileSha256: seal?.fileSha256 ?? "" };
}
route("GET", "/api/r/:id/pdf", async (c, m) => {
  const b = await reportBytes(c, m[1]!);
  return new Response(b.pdf as unknown as BodyInit, { headers: { "content-type": "application/pdf", "cache-control": "no-store", "content-disposition": `attachment; filename="aoa-rwa-${m[1]!.slice(0, 8)}-report.pdf"`, "x-pdf-sha256": b.pdfSha256, "x-report-sha256": b.fileSha256, "x-content-type-options": "nosniff" } });
});
async function emailReport(c: Ctx, eid: string, to: string[], actor: Actor): Promise<void> {
  const tx = await Tx.load(c, eid); const st = await tx.st(); const b = await reportBytes(c, eid);
  const link = `${(c.env.PUBLIC_ORIGIN ?? c.url.origin).replace(/\/+$/, "")}/api/r/${eid}`;
  for (const addr of to) await sendMail(c, addr, `Report: ${st.created!.title}`, `The signed report of "${st.created!.title}" (${st.created!.society.name}) is attached as a PDF for signature by the Returning Officer.\nOnline record and verifier: ${link}\nReport fingerprint (SHA-256): ${b.fileSha256}\n`, [{ filename: `aoa-rwa-${eid.slice(0, 8)}-report.pdf`, content: b.pdf, contentType: "application/pdf" }]);
  await tx.add("report_emailed", actor, { count: to.length, recipients: to.map((x) => maskEmail(x)), pdfSha256: b.pdfSha256, reportSha256: b.fileSha256 });
  await tx.commit();
}
route("POST", "/api/events/:id/report/email", async (c, m) => {
  const { tx, pid } = await staff(c, m[1]!, "read_contacts"); const st = await tx.st();
  await rateLimit(c, "report-email", tx.eid, 5, 3600);
  const to = Array.isArray(c.body.to) ? (c.body.to as unknown[]).map((x) => emailOf(x)) : []; if (!to.length || to.length > 10) throw err(400, "bad_recipients", "Give 1 to 10 e-mail addresses.");
  await emailReport(c, tx.eid, [...new Set(to)], ENTRY_ACTOR(st, pid)); return json({ ok: true, sent: new Set(to).size });
});

// ------------------------------------------------------------------------------------------------ attendance handshake (two screens, two 4-digit codes)
const hsFrom = (r: any): Handshake => ({
  id: r.id, eventId: r.event_id, flatNo: r.flat_no, monitorPid: r.monitor_pid, monitorHash: r.monitor_hash, voterHash: r.voter_hash, linkHash: r.link_hash,
  deviceHash: r.device_hash, uaHash: r.ua_hash, ipHash: r.ip_hash, voterConfirmedMs: r.voter_confirmed_ms, monitorConfirmedMs: r.monitor_confirmed_ms, triesVoter: r.tries_voter, triesMonitor: r.tries_monitor,
  createdMs: r.created_ms, expiresMs: r.expires_ms, voidedMs: r.voided_ms, completedMs: r.completed_ms, kind: r.kind, attendeeName: r.attendee_name, mobileMasked: r.mobile_masked, mobileFp: r.mobile_fp, smsConfirmedMs: r.sms_confirmed_ms,
});
const hsSave = (c: Ctx, h: Handshake) => c.db.prepare("UPDATE handshakes SET device_hash=?, ua_hash=?, ip_hash=?, voter_confirmed_ms=?, monitor_confirmed_ms=?, tries_voter=?, tries_monitor=?, voided_ms=?, completed_ms=?, sms_confirmed_ms=? WHERE id=?")
  .bind(h.deviceHash, h.uaHash, h.ipHash, h.voterConfirmedMs, h.monitorConfirmedMs, h.triesVoter, h.triesMonitor, h.voidedMs, h.completedMs, h.smsConfirmedMs, h.id).run();
/** The two codes are derived from the handshake id with the server secret (so the officer's screen can show its code again after a reload) and only their hashes are compared. */
async function hsCodes(c: Ctx, id: string): Promise<{ monitor: string; voter: string }> {
  const hex = await hmacHex(c.env.PEPPER, "aoa-rwa/hs-codes/" + id); const out: string[] = [];
  for (let i = 0; i + 8 <= hex.length && out.length < 2; i += 8) { const n = parseInt(hex.slice(i, i + 8), 16); if (n < 4_294_960_000) out.push(String(n % 10_000).padStart(4, "0")); }
  if (out.length < 2) throw new Error("hs codes");
  return { monitor: out[0]!, voter: out[1]! };
}
const hsError = (reason: string): ApiError => err(reason === "wrong_code" ? 401 : reason === "wrong_device" || reason === "same_device" ? 403 : reason === "not_opened" ? 409 : 410,
  reason, ({ expired: "This handshake has expired. Ask the officer to start a new one.", voided: "This handshake was replaced by a newer one.", dead: "Too many wrong codes. Ask the officer to start a new handshake.", wrong_code: "That code is not right. Check the other person's screen.", wrong_device: "This link was opened on another phone.", same_device: "The officer's device and the voter's device must be different.", done: "This handshake is already complete.", not_opened: "The voter has not opened the link yet." } as Record<string, string>)[reason] ?? "Not possible.");
async function hsByToken(c: Ctx, token: string): Promise<Handshake> {
  const r = await c.db.prepare("SELECT * FROM handshakes WHERE link_hash=?").bind(await pepperHash(c.env, "hs-link", token)).first<any>();
  if (!r) throw err(404, "no_handshake", "This link is not valid."); c.eventId = r.event_id; return hsFrom(r);
}
/** Marks the flat present (method: mutual code exchange), binds the voter's device, ends any earlier binding for the flat, hands the voter session over once. */
async function hsComplete(c: Ctx, h: Handshake, monitorPid: string): Promise<void> {
  const tx = await Tx.load(c, h.eventId); const st = await tx.st(); const actor = ENTRY_ACTOR(st, monitorPid);
  const independent = !!st.people.get(monitorPid)?.roles.includes("attendance_officer");
  const key = (await subjectKey(c, h.eventId, "f:" + h.flatNo, true))!; const ct = await aesEncrypt(key, JSON.stringify({ attendee: h.attendeeName }), h.eventId + "|att|" + h.flatNo);
  await tx.add("attendance_marked", actor, { flatNo: h.flatNo, mode: "physical", method: "mutual_code_exchange", docType: null, docLast4: null, maskedName: maskName(h.attendeeName), by: monitorPid, independent, evidenceHash: null, present: true, idChecked: false, idVerifiedBy: null },
    (seq) => [c.db.prepare("INSERT INTO attendance(event_id,flat_no,attendee_masked_name,mode,method,doc_type,doc_last4,marked_by,independent,evidence_hash,supersedes_id,log_seq,at_ms) VALUES(?,?,?,?,?,?,?,?,?,?,NULL,?,?)").bind(h.eventId, h.flatNo, maskName(h.attendeeName), "physical", "mutual_code_exchange", null, null, monitorPid, independent ? 1 : 0, null, seq, c.now),
      c.db.prepare("INSERT INTO private_evidence(event_id,flat_no,kind,ct,evidence_hash,created_ms) VALUES(?,?,'attendee_name',?,?,?)").bind(h.eventId, h.flatNo, ct, "", c.now)]);
  const prev = await c.db.prepare("SELECT COUNT(*) c FROM sessions WHERE kind='voter' AND event_id=? AND flat_no=? AND expires_ms>? AND device_hash IS NOT NULL").bind(h.eventId, h.flatNo, c.now).first<{ c: number }>();
  const replaced = (prev?.c ?? 0) > 0;
  await tx.add("device_bound", { flat: h.flatNo }, { flatNo: h.flatNo, handshakeId: h.id, replaced, kind: h.kind });
  const token = randomHex(32);
  await tx.commit([
    c.db.prepare("UPDATE sessions SET expires_ms=? WHERE kind='voter' AND event_id=? AND flat_no=? AND expires_ms>?").bind(c.now, h.eventId, h.flatNo, c.now), // the earlier session of this voter ends
    c.db.prepare("INSERT INTO sessions(token_hash,event_id,person_id,flat_no,kind,voter_kind,device_hash,ua_hash,created_ms,expires_ms) VALUES(?,?,NULL,?,'voter',?,?,?,?,?)").bind(await pepperHash(c.env, "session", token), h.eventId, h.flatNo, h.kind, h.deviceHash, h.uaHash, c.now, c.now + VOTER_TTL),
    c.db.prepare("UPDATE handshakes SET completed_ms=?, voter_token=? WHERE id=?").bind(c.now, token, h.id),
    c.db.prepare("UPDATE sessions SET browser_hash=(SELECT browser_hash FROM handshakes WHERE id=?) WHERE token_hash=?").bind(h.id, await pepperHash(c.env, "session", token)),
  ]);
}
route("POST", "/api/events/:id/handshakes", async (c, m) => {
  const { tx, pid } = await staff(c, m[1]!, "mark_attendance"); const st = await tx.st();
  const flatNo = str(c.body.flatNo, "flatNo", 1, 24), f = st.roll.find((x) => x.flatNo === flatNo);
  if (!f || !f.eligible) throw err(400, "no_flat", "That flat is not on the voting list.");
  const attendeeName = str(c.body.attendeeName, "attendeeName", 2, 80), kind = c.body.kind === "proxy" ? "proxy" : "official";
  if (kind === "proxy") { const pa = proxyAllowed(st.rules!, 0); if (!pa.ok) throw err(403, pa.reason!, "Proxy voting is switched off for this event."); }
  let mobileMasked: string | null = null, mobileFp: string | null = null;
  if (c.body.mobile) { const mob = str(c.body.mobile, "mobile", 8, 20); mobileMasked = maskPhone(mob); mobileFp = await pepperHash(c.env, "mobile:" + tx.eid, mob.replace(/\D/g, "").slice(-10)); }
  const id = newId("hs_", 8), token = randomHex(24), mkHash = await pepperHash(c.env, "hs-link", token);
  const codes = await hsCodes(c, id);
  const monitorHash = await codeHash(c.env.PEPPER, { id, eventId: tx.eid, flatNo, side: "monitor", code: codes.monitor }), voterHash = await codeHash(c.env.PEPPER, { id, eventId: tx.eid, flatNo, side: "voter", code: codes.voter });
  await c.db.batch([
    c.db.prepare("UPDATE handshakes SET voided_ms=? WHERE event_id=? AND flat_no=? AND voided_ms IS NULL AND completed_ms IS NULL").bind(c.now, tx.eid, flatNo), // one live handshake per flat
    c.db.prepare("INSERT INTO handshakes(id,event_id,flat_no,monitor_pid,monitor_hash,voter_hash,link_hash,created_ms,expires_ms,kind,attendee_name,mobile_masked,mobile_fp) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(id, tx.eid, flatNo, pid, monitorHash, voterHash, mkHash, c.now, c.now + HANDSHAKE_TTL_MS, kind, attendeeName, mobileMasked, mobileFp),
  ]);
  await tx.add("handshake_started", ENTRY_ACTOR(st, pid), { handshakeId: id, flatNo, by: pid }); await tx.commit();
  return json({ handshakeId: id, monitorCode: codes.monitor, token, linkPath: `/h/${token}`, expiresMs: c.now + HANDSHAKE_TTL_MS, smsHint: mobileFp ? "Ask the person to send an SMS from their own phone to yours; then use sms-confirm with the sender number you see." : null,
    instruction: "Read your code to the person. They open the link on THEIR phone, read you the code that shows there. Type their code here." }, 201);
});
route("GET", "/api/events/:id/handshakes/:hid", async (c, m) => {
  const { tx } = await staff(c, m[1]!, "mark_attendance"); const r = await c.db.prepare("SELECT * FROM handshakes WHERE id=? AND event_id=?").bind(m[2]!, tx.eid).first<any>(); if (!r) throw err(404, "no_handshake", "No such handshake.");
  const h = hsFrom(r), codes = await hsCodes(c, h.id);
  return json({ handshakeId: h.id, flatNo: h.flatNo, monitorCode: h.completedMs || h.voidedMs ? null : codes.monitor, voterOpened: !!h.deviceHash, voterConfirmed: !!h.voterConfirmedMs, monitorConfirmed: !!h.monitorConfirmedMs, complete: !!h.completedMs, expired: h.expiresMs <= c.now, voided: !!h.voidedMs, mobileMasked: h.mobileMasked, smsConfirmed: !!h.smsConfirmedMs });
});
route("POST", "/api/events/:id/handshakes/:hid/confirm", async (c, m) => {
  const { tx, pid } = await staff(c, m[1]!, "mark_attendance");
  const r = await c.db.prepare("SELECT * FROM handshakes WHERE id=? AND event_id=?").bind(m[2]!, tx.eid).first<any>(); if (!r) throw err(404, "no_handshake", "No such handshake.");
  let h = hsFrom(r); if (h.monitorPid !== pid) throw err(403, "not_your_handshake", "Another officer started this one.");
  const res = await monitorConfirm(h, c.now, c.env.PEPPER, typeof c.body.code === "string" ? c.body.code : "", await pepperHash(c.env, "dev", c.deviceId));
  await hsSave(c, res.h); if (!res.ok) throw hsError(res.reason);
  if (res.complete) { await hsComplete(c, res.h, pid); return json({ ok: true, complete: true, flatNo: h.flatNo }); }
  return json({ ok: true, complete: false, waitingFor: "voter" });
});
route("GET", "/api/h/:token", async (c, m) => {
  let h = await hsByToken(c, m[1]!); if (!c.deviceId) throw err(400, "device_required", "A device identifier is required.");
  const devH = await pepperHash(c.env, "dev", c.deviceId); const bidNow = c.bid || (c.newBid = randomHex(16)); const bidH = await pepperHash(c.env, "bid", bidNow);
  const row = await c.db.prepare("SELECT browser_hash FROM handshakes WHERE id=?").bind(h.id).first<{ browser_hash: string | null }>();
  const byDevice = !!h.deviceHash && h.deviceHash === devH, byCookie = !!c.bid && !!row?.browser_hash && row.browser_hash === bidH;
  if (h.completedMs) { // the same link opened again after check-in: recognise the person and put them back where they left
    if (!byDevice && !byCookie) throw err(403, "not_recognised", "This link was used on another phone. Ask the Attendance Officer to link this phone.");
    const tx = await Tx.load(c, h.eventId); const st = await tx.st(); const token = randomHex(32);
    await tx.add("session_resumed", { flat: h.flatNo }, { flatNo: h.flatNo, handshakeId: h.id, via: byDevice && byCookie ? "device_and_browser" : byDevice ? "device" : "browser_cookie", deviceChanged: !byDevice });
    await tx.commit([
      c.db.prepare("UPDATE sessions SET expires_ms=? WHERE kind='voter' AND event_id=? AND flat_no=? AND expires_ms>?").bind(c.now, h.eventId, h.flatNo, c.now), // the earlier session ends: one live session per voter
      c.db.prepare("INSERT INTO sessions(token_hash,event_id,person_id,flat_no,kind,voter_kind,device_hash,ua_hash,browser_hash,created_ms,expires_ms) VALUES(?,?,NULL,?,'voter',?,?,?,?,?,?)").bind(await pepperHash(c.env, "session", token), h.eventId, h.flatNo, h.kind, devH, (await pepperHash(c.env, "ua", c.req.headers.get("user-agent") ?? "")).slice(0, 24), row?.browser_hash ?? bidH, c.now, c.now + VOTER_TTL),
    ]);
    c.eventId = h.eventId; c.actor = { kind: "voter", ref: h.flatNo };
    return json({ resume: true, eventId: h.eventId, token, flatNo: h.flatNo, kind: h.kind, journey: journeyFor(await tx.st(), h.flatNo, c.now), recognisedBy: byDevice && byCookie ? "device_and_browser" : byDevice ? "device" : "browser_cookie" });
  }
  if (h.deviceHash && !byDevice && byCookie) h = { ...h, deviceHash: devH }; // same browser, device id was cleared: keep the person, adopt the new device id
  const res = openLink(h, c.now, devH, (await pepperHash(c.env, "ua", c.req.headers.get("user-agent") ?? "")).slice(0, 24), (await pepperHash(c.env, "ip", c.ip)).slice(0, 24));
  if (!res.ok) throw hsError(res.reason);
  h = res.h; await hsSave(c, h); if (!row?.browser_hash) await c.db.prepare("UPDATE handshakes SET browser_hash=? WHERE id=?").bind(bidH, h.id).run();
  const tx = await Tx.load(c, h.eventId); const st = await tx.st(); const codes = await hsCodes(c, h.id);
  let smsLink: string | null = null; // optional number check: the voter sends an SMS from their own phone to the OFFICER's phone (no cost to the platform)
  if (h.mobileFp) { try { const ph = (await contactOf(c, h.eventId, h.monitorPid)).phone.replace(/[^\d+]/g, ""); if (ph) smsLink = `sms:${ph}?body=${encodeURIComponent("AOA " + h.id.slice(3, 9))}`; } catch { /* no officer phone known */ } }
  return json({ eventId: h.eventId, flatNo: h.flatNo, society: st.created?.society.name, title: st.created?.title, voterCode: codes.voter, smsLink, termsVersion: TERMS_VERSION, termsRequired: !st.terms.has("flat:" + h.flatNo), voterConfirmed: !!h.voterConfirmedMs, expiresMs: h.expiresMs,
    instruction: "Say this code to the officer. Type the code shown on the officer's screen below." });
});
route("POST", "/api/h/:token/confirm", async (c, m) => {
  const h0 = await hsByToken(c, m[1]!); await rateLimit(c, "hs-voter", h0.id, 30, 600);
  const tx = await Tx.load(c, h0.eventId); const st = await tx.st(); const needTerms = !st.terms.has("flat:" + h0.flatNo); if (needTerms) await requireTerms(c);
  const res = await voterConfirm(h0, c.now, c.env.PEPPER, typeof c.body.code === "string" ? c.body.code : "", await pepperHash(c.env, "dev", c.deviceId));
  await hsSave(c, res.h); if (!res.ok) { if (res.reason === "wrong_code" && res.h.triesVoter >= HANDSHAKE_MAX_TRIES) { await tx.add("passcode_locked", { system: true }, { purpose: "handshake", subjectKind: "flat", subject: h0.flatNo }); await tx.commit(); } throw hsError(res.reason); }
  if (needTerms) { await tx.add("terms_accepted", { flat: h0.flatNo }, await termsEntry("flat", h0.flatNo)); await tx.commit(); }
  if (res.complete) { await hsComplete(c, res.h, res.h.monitorPid); return json({ ok: true, complete: true }); }
  return json({ ok: true, complete: false, waitingFor: "officer" });
});
route("GET", "/api/h/:token/status", async (c, m) => {
  const r = await c.db.prepare("SELECT * FROM handshakes WHERE link_hash=?").bind(await pepperHash(c.env, "hs-link", m[1]!)).first<any>(); if (!r) throw err(404, "no_handshake", "This link is not valid.");
  c.eventId = r.event_id; const h = hsFrom(r);
  if (!h.deviceHash || h.deviceHash !== (await pepperHash(c.env, "dev", c.deviceId))) throw err(403, "wrong_device", "This link was opened on another phone.");
  if (h.completedMs && r.voter_token) { await c.db.prepare("UPDATE handshakes SET voter_token=NULL WHERE id=?").bind(h.id).run(); return json({ state: "complete", token: r.voter_token, flatNo: h.flatNo, kind: h.kind }); } // handed over once
  const state = h.voidedMs ? "replaced" : h.completedMs ? "complete" : h.expiresMs <= c.now ? "expired" : h.triesVoter >= HANDSHAKE_MAX_TRIES || h.triesMonitor >= HANDSHAKE_MAX_TRIES ? "dead" : h.voterConfirmedMs ? "waiting_for_officer" : "waiting_for_you";
  return json({ state, flatNo: h.flatNo });
});
route("POST", "/api/events/:id/handshakes/:hid/sms-confirm", async (c, m) => {
  const { tx, pid } = await staff(c, m[1]!, "mark_attendance"); const st = await tx.st();
  const r = await c.db.prepare("SELECT * FROM handshakes WHERE id=? AND event_id=?").bind(m[2]!, tx.eid).first<any>(); if (!r) throw err(404, "no_handshake", "No such handshake.");
  const h = hsFrom(r); if (!h.mobileFp) throw err(409, "no_mobile", "No mobile number was entered when this handshake started.");
  const typed = str(c.body.senderNumber, "senderNumber", 8, 20);
  if ((await pepperHash(c.env, "mobile:" + tx.eid, typed.replace(/\D/g, "").slice(-10))) !== h.mobileFp) throw err(409, "number_differs", "The number on the SMS is not the number entered for this person.");
  await tx.add("mobile_confirmed", ENTRY_ACTOR(st, pid), { handshakeId: h.id, flatNo: h.flatNo, maskedMobile: h.mobileMasked ?? "", method: "sms_from_voter_phone" });
  await tx.commit([c.db.prepare("UPDATE handshakes SET sms_confirmed_ms=? WHERE id=?").bind(c.now, h.id)]); return json({ ok: true, maskedMobile: h.mobileMasked });
});

// ------------------------------------------------------------------------------------------------ printed ballot papers
async function paperPoint(c: Ctx, tx: Tx, pointId: string, forScan = false) {
  const st = await tx.st(); const pt = st.points.get(pointId); if (!pt) throw err(404, "unknown_point", "No such agenda point.");
  const rules = pt.frozen ?? st.rules!; const mode = (rules.params["ballot.mode"] as string) ?? "online";
  if (mode === "online") throw err(403, "online_only", "This event uses online ballots only.");
  if (pt.def.kind === "discussion" || !pt.def.secret) throw err(409, "paper_needs_secret", "Only secret ballot points can be voted on paper.");
  if (st.seals.has(pointId)) throw err(409, "box_sealed", "Counting for this point is finished.");
  if (!forScan && pt.state !== "open") throw err(409, "point_not_open", "Voting on this point is not open.");
  if (forScan && pt.state === "pending") throw err(409, "point_not_open", "Voting on this point has not opened.");
  return { st, pt, rules };
}
const reissueKey = (eid: string, pointId: string, flat: string) => `reissue:${eid}:${pointId}:${flat}`;
route("POST", "/api/events/:id/points/:pid/paper", async (c, m) => {
  const { tx, pid } = await staff(c, m[1]!, "issue_voter_code"); const { st, pt, rules } = await paperPoint(c, tx, m[2]!);
  const flatNo = str(c.body.flatNo, "flatNo", 1, 24); if (!st.attendance.has(flatNo)) throw err(409, "not_present", "Mark this flat present before giving out a paper ballot.");
  const flat = st.roll.find((f) => f.flatNo === flatNo)!; const weight = effectiveWeight(flat, !!rules.options.weightage);
  const kind = c.body.kind === "proxy" ? "proxy" : "official"; if (kind === "proxy" && !proxyAllowed(rules, 0).ok) throw err(403, "proxy_off", "Proxy voting is switched off for this event.");
  const had = st.ledger.get(m[2]!)?.has(flatNo); const allowance = parseInt((await c.db.prepare("SELECT v FROM kv_state WHERE k=?").bind(reissueKey(tx.eid, m[2]!, flatNo)).first<{ v: string }>())?.v ?? "0", 10);
  if (had && allowance < 1) throw err(409, "already_voted", "This flat has already received a ballot for this point.");
  const serial = newSerial(), token = await paperToken(c.env.PEPPER, tx.eid, m[2]!, serial);
  const stmts: D1Stmt[] = [c.db.prepare("INSERT INTO paper_serials(serial,event_id,point_id,weight,kind) VALUES(?,?,?,?,?)").bind(serial, tx.eid, m[2]!, weight, kind)];
  if (!had) await tx.add("paper_issued", ENTRY_ACTOR(st, pid), { pointId: m[2]!, flatNo, kind }, (seq) => [c.db.prepare("INSERT INTO voter_ledger(event_id,point_id,flat_no,kind,open_choice_json,voted_ms,log_seq,channel) VALUES(?,?,?,?,NULL,?,?,'paper')").bind(tx.eid, m[2]!, flatNo, kind, c.now, seq)]);
  else { await tx.add("paper_reissued", ENTRY_ACTOR(st, pid), { pointId: m[2]!, flatNo }); stmts.push(c.db.prepare("UPDATE kv_state SET v=CAST(v AS INTEGER)-1 WHERE k=?").bind(reissueKey(tx.eid, m[2]!, flatNo))); }
  await tx.commit(stmts);
  const design = pt.def.design!; const layout = paperLayout({ options: pt.def.options, labels: pt.def.labels, maxChoices: pt.def.maxChoices, minChoices: pt.def.minChoices ?? 1 }, design, ballotInstruction(pt.def.minChoices ?? 1, pt.def.maxChoices), pt.def.title);
  return json({ serial, token, qrText: token, svg: renderPaperSvg(layout, token, design), layout, note: "Do not write the voter's name or flat on the paper. The serial is not stored with the flat." }, 201);
});
route("GET", "/api/events/:id/points/:pid/paper/preview", async (c, m) => {
  const { tx } = await staff(c, m[1]!, "edit_setup"); const st = await tx.st(); const pt = st.points.get(m[2]!); if (!pt) throw err(404, "unknown_point", "No such agenda point.");
  const design = pt.def.design!; const layout = paperLayout({ options: pt.def.options, labels: pt.def.labels, maxChoices: pt.def.maxChoices, minChoices: pt.def.minChoices ?? 1 }, design, ballotInstruction(pt.def.minChoices ?? 1, pt.def.maxChoices), pt.def.title);
  return json({ svg: renderPaperSvg(layout, "SAMPLE.0000000000000000", design, { sample: true }), layout });
});
route("POST", "/api/events/:id/points/:pid/paper/void", async (c, m) => {
  const { tx, pid } = await staff(c, m[1]!, "issue_voter_code"); const { st } = await paperPoint(c, tx, m[2]!, true);
  const tk = await parsePaperToken(c.env.PEPPER, tx.eid, m[2]!, c.body.token); if (!tk.ok) throw err(400, "bad_token", "This QR code is not a ballot paper of this vote.");
  const flatNo = str(c.body.flatNo, "flatNo", 1, 24); if (!st.ledger.get(m[2]!)?.has(flatNo)) throw err(409, "no_paper_for_flat", "That flat was not given a paper ballot.");
  if (await c.db.prepare("SELECT 1 x FROM paper_marks WHERE serial=?").bind(tk.serial).first()) throw err(409, "already_handled", "This paper was already counted or voided.");
  await tx.add("paper_voided", ENTRY_ACTOR(st, pid), { pointId: m[2]!, flatNo, serialDigest: await sha256Hex(tk.serial) });
  await tx.commit([c.db.prepare("INSERT INTO paper_marks(event_id,point_id,serial,kind,reason,image_sha256,by_pid,at_ms) VALUES(?,?,?,'voided',?,NULL,?,?)").bind(tx.eid, m[2]!, tk.serial, optStr(c.body.reason, "reason", 200) || "spoiled", pid, c.now),
    c.db.prepare("INSERT INTO kv_state(k,v) VALUES(?,'1') ON CONFLICT(k) DO UPDATE SET v=CAST(v AS INTEGER)+1").bind(reissueKey(tx.eid, m[2]!, flatNo))]);
  return json({ ok: true, note: "Another paper may now be given to this flat." });
});
route("POST", "/api/events/:id/points/:pid/paper/scan", async (c, m) => {
  const { tx, pid } = await staff(c, m[1]!, "issue_voter_code"); await rateLimit(c, "paper-scan", tx.eid, 600, 60);
  const { pt } = await paperPoint(c, tx, m[2]!, true);
  const tk = await parsePaperToken(c.env.PEPPER, tx.eid, m[2]!, c.body.token); if (!tk.ok) throw err(400, "bad_token", "This QR code is not a ballot paper of this vote.");
  const sr = await c.db.prepare("SELECT weight, kind FROM paper_serials WHERE serial=? AND point_id=? AND event_id=?").bind(tk.serial, m[2]!, tx.eid).first<{ weight: number; kind: string }>(); if (!sr) throw err(400, "bad_token", "This paper was not issued for this vote.");
  if (await c.db.prepare("SELECT 1 x FROM paper_marks WHERE serial=?").bind(tk.serial).first()) throw err(409, "already_handled", "This paper was already counted or voided.");
  const image = optStr(c.body.imageSha256, "imageSha256", 64); if (!/^[0-9a-f]{64}$/.test(image)) throw err(400, "image_required", "Every paper must be photographed: send the photo's SHA-256.");
  let raw = c.body.choices; if (c.body.marks !== undefined) { const mk = c.body.marks; if (!mk || typeof mk !== "object" || Array.isArray(mk)) throw err(400, "bad_ballot", "marks must list each box as true or false."); raw = Object.entries(mk).filter(([, v]) => v === true).map(([k]) => k); for (const [k, v] of Object.entries(mk)) if (!pt.def.options.includes(k) || typeof v !== "boolean") throw err(400, "bad_ballot", "That box is not on this ballot."); }
  if (c.body.imageCt) await c.db.prepare("INSERT INTO private_evidence(event_id,flat_no,kind,ct,evidence_hash,created_ms) VALUES(?,?,'paper',?,?,?)").bind(tx.eid, "paper", str(c.body.imageCt, "imageCt", 16, 300_000), image, c.now).run();
  const bc = validateBallot(pt.def as PointDef, raw);
  if (!bc.ok) { await c.db.prepare("INSERT INTO paper_marks(event_id,point_id,serial,kind,reason,image_sha256,by_pid,at_ms) VALUES(?,?,?,'invalid',?,?,?,?)").bind(tx.eid, m[2]!, tk.serial, bc.reason, image, pid, c.now).run(); return json({ result: "invalid", reason: bc.reason, note: "Recorded as an invalid ballot and not counted." }); }
  const receipt = await receiptOf(m[2]!, bc.choices, tk.serial);
  await c.db.batch([
    c.db.prepare("INSERT INTO ballot_box(receipt_hash,event_id,point_id,choice_json,weight,kind) VALUES(?,?,?,?,?,?)").bind(receipt, tx.eid, m[2]!, JSON.stringify(bc.choices), sr.weight, sr.kind),
    c.db.prepare("INSERT INTO paper_marks(event_id,point_id,serial,kind,reason,image_sha256,by_pid,at_ms) VALUES(?,?,?,'counted',NULL,?,?,?)").bind(tx.eid, m[2]!, tk.serial, image, pid, c.now),
  ]);
  return json({ result: "counted", receipt, note: "The receipt is the fingerprint of this paper; it appears in the public list when counting finishes." }, 201);
});
/** Stats of the paper ballots of a point, from the pool and the marks. */
async function paperStats(c: Ctx, eid: string, pointId: string): Promise<{ serials: number; counted: number; invalid: number; voided: number; uncounted: number; imagesDigest: string } | null> {
  const S = (await c.db.prepare("SELECT COUNT(*) c FROM paper_serials WHERE point_id=? AND event_id=?").bind(pointId, eid).first<{ c: number }>())!.c; if (!S) return null;
  const rows = (await c.db.prepare("SELECT kind, image_sha256 FROM paper_marks WHERE point_id=? AND event_id=?").bind(pointId, eid).all<{ kind: string; image_sha256: string | null }>()).results;
  const n = (k: string) => rows.filter((r) => r.kind === k).length;
  return { serials: S, counted: n("counted"), invalid: n("invalid"), voided: n("voided"), uncounted: S - rows.length, imagesDigest: await sha256Hex(rows.map((r) => r.image_sha256 ?? "").filter(Boolean).sort().join("\n")) };
}
route("POST", "/api/events/:id/points/:pid/count/finish", async (c, m) => {
  const { tx, pid } = await staff(c, m[1]!, "close_event"); const st = await tx.st(); const pt = st.points.get(m[2]!);
  if (!pt || pt.state !== "closed") throw err(409, "point_not_closed", "Close voting on this point first."); if (st.seals.has(m[2]!)) throw err(409, "box_sealed", "Counting for this point is already finished.");
  await finishCount(c, tx, pid, m[2]!); await tx.commit(); return json({ ok: true, result: (await tx.st()).results.get(m[2]!) });
});

// ------------------------------------------------------------------------------------------------ languages and step guides
route("GET", "/api/languages", async () => json({ languages: LANGUAGES, coverage: coverage(), note: "English and Hindi are complete. The others cover the core words and fall back to English; they are drafts for a native reader to check." }));
route("GET", "/api/i18n/:lang", async (c, m) => { if (!isLang(m[1])) throw err(404, "no_language", "No such language."); return json({ lang: m[1], dir: LANGUAGES.find((l) => l.code === m[1])!.dir, dictionary: dictionary(m[1]!) }); });
route("GET", "/api/guide/:role", async (c, m) => {
  if (!["organizer", "host", "attendance_officer", "voter"].includes(m[1]!)) throw err(404, "no_role", "No such role.");
  const lang = isLang(c.url.searchParams.get("lang")) ? c.url.searchParams.get("lang")! : "en"; const steps = playbook(m[1] as any, lang);
  const eid = c.url.searchParams.get("event"); let current: string | null = null;
  if (eid && /^[0-9a-f]{32}$/.test(eid) && m[1] === "organizer") { const pr = progressOf(await (await Tx.load(c, eid)).st()); current = pr.currentId; return json({ role: m[1], lang, steps: steps.map((s) => ({ ...s, status: pr.steps.find((x) => x.id === s.id)?.status ?? "todo" })), current, percent: pr.percent }); }
  return json({ role: m[1], lang, steps, current });
});

// ------------------------------------------------------------------------------------------------ resume and evidence per person
async function lastSeen(c: Ctx, eid: string, flatNo: string) {
  const r = await c.db.prepare("SELECT route, at_ms, status FROM access_audit WHERE event_id=? AND actor_kind='voter' AND actor_ref=? AND phase='result' AND route NOT LIKE '/api/vote/resume%' ORDER BY id DESC LIMIT 1").bind(eid, flatNo).first<any>();
  return r ? { route: r.route, atMs: r.at_ms, status: r.status } : null;
}
route("GET", "/api/vote/resume", async (c) => {
  const s = await requireSession(c, "voter"); const st = await (await Tx.load(c, s.eventId!)).st();
  return json({ eventId: s.eventId, journey: journeyFor(st, s.flatNo!, c.now), lastSeen: await lastSeen(c, s.eventId!, s.flatNo!) });
});
/** Everything the system knows about one flat's participation, built from the log and the audit trail. */
async function flatEvidence(c: Ctx, tx: Tx, flatNo: string, full: boolean) {
  const eid = tx.eid, st = await tx.st();
  const ledger = (await c.db.prepare("SELECT l.point_id, l.voted_ms, l.channel, l.log_seq, l.kind FROM voter_ledger l WHERE l.event_id=? AND l.flat_no=? ORDER BY l.id").bind(eid, flatNo).all<any>()).results;
  const hs = (await c.db.prepare("SELECT id, kind, created_ms, completed_ms, voter_confirmed_ms, monitor_confirmed_ms, tries_voter, tries_monitor, sms_confirmed_ms, mobile_masked, device_hash, browser_hash, voided_ms FROM handshakes WHERE event_id=? AND flat_no=? ORDER BY created_ms").bind(eid, flatNo).all<any>()).results;
  const ses = (await c.db.prepare("SELECT created_ms, expires_ms, device_hash, browser_hash, voter_kind FROM sessions WHERE event_id=? AND flat_no=? AND kind='voter' ORDER BY created_ms").bind(eid, flatNo).all<any>()).results;
  const att = (await c.db.prepare("SELECT at_ms, mode, method, marked_by, independent, log_seq FROM attendance WHERE event_id=? AND flat_no=? ORDER BY id").bind(eid, flatNo).all<any>()).results;
  const devs = [...new Set([...hs, ...ses].map((x) => (x.device_hash as string | null)?.slice(0, 24)).filter(Boolean))] as string[], bids = [...new Set([...hs, ...ses].map((x) => (x.browser_hash as string | null)?.slice(0, 24)).filter(Boolean))] as string[];
  const q = "SELECT * FROM access_audit WHERE event_id=? AND phase='result' AND (actor_ref=? " + (devs.length ? `OR dev_idx IN (${devs.map(() => "?").join(",")}) ` : "") + (bids.length ? `OR bid_idx IN (${bids.map(() => "?").join(",")}) ` : "") + ") ORDER BY id LIMIT 800";
  const rows = (await c.db.prepare(q).bind(eid, flatNo, ...devs, ...bids).all<any>()).results;
  const key = await auditKey(c, eid).then((k) => k.key).catch(() => null);
  const decode = async (r: any) => { try { const k = r.key_scope === "event" ? await eventKey(c, eid) : await deriveKey32(c.env.MASTER_SECRET, "platform-audit"); return JSON.parse(await aesDecrypt(k, r.ct, "audit|" + eid)); } catch { return null; } };
  void key;
  const view = (d: any) => (!d ? { erased: true } : full ? d : { ip: maskIp(d.ip), device: String(d.device ?? "").slice(0, 6) + "...", browserSession: d.browserSession ? String(d.browserSession).slice(0, 4) + "..." : null, browser: String(d.ua ?? "").split(/[ /]/)[0], country: d.network?.country ?? null });
  const activity = []; const byLogSeq = new Map<number, any>();
  for (const r of rows) { const a = { id: r.id, atMs: r.at_ms, method: r.method, route: r.route, actor: r.actor_kind, status: r.status, logSeq: r.log_seq, ipFingerprint: r.ip_idx.slice(0, 8), deviceFingerprint: r.dev_idx.slice(0, 8), browserSessionFingerprint: r.bsid_idx?.slice(0, 8) ?? null, browserCookieFingerprint: r.bid_idx?.slice(0, 8) ?? null, ...view(await decode(r)) }; activity.push(a); if (r.log_seq && r.route === "/api/vote/cast" && r.status === 201) byLogSeq.set(r.log_seq, a); }
  const journey = journeyFor(st, flatNo, c.now);
  const voted = ledger.map((l) => { const p = st.points.get(l.point_id)!; return { pointId: l.point_id, number: p?.def.number, title: p?.def.title, secret: !!p?.def.secret, votedMs: l.voted_ms, channel: l.channel, kind: l.kind, logSeq: l.log_seq, castRequest: byLogSeq.get(l.log_seq) ?? null, choice: p && !p.def.secret ? (st.ledger.get(l.point_id)?.get(flatNo)?.choices ?? null) : "secret ballot: never recorded with the person" }; });
  const sh = (h: string | null) => (h ? h.slice(0, 8) : null);
  return {
    flatNo, journey, statement: voted.length ? `Flat ${flatNo} is recorded as having voted on ${voted.map((v) => "point " + v.number).join(", ")}.` : `Flat ${flatNo} has not voted on any point yet.`,
    attendance: att.map((a) => ({ atMs: a.at_ms, mode: a.mode, method: a.method, independent: !!a.independent, logSeq: a.log_seq })),
    handshakes: hs.map((h) => ({ id: h.id, kind: h.kind, createdMs: h.created_ms, voterConfirmedMs: h.voter_confirmed_ms, monitorConfirmedMs: h.monitor_confirmed_ms, completedMs: h.completed_ms, voidedMs: h.voided_ms, wrongTries: { voter: h.tries_voter, officer: h.tries_monitor }, mobileConfirmed: !!h.sms_confirmed_ms, mobile: h.mobile_masked, deviceFingerprint: sh(h.device_hash), browserFingerprint: sh(h.browser_hash) })),
    sessions: ses.map((x) => ({ createdMs: x.created_ms, endedOrExpiresMs: x.expires_ms, deviceFingerprint: sh(x.device_hash), browserFingerprint: sh(x.browser_hash), kind: x.voter_kind })),
    voted, activity,
    photos: (await c.db.prepare("SELECT id, mime, sha256, size, captured_ms, server_ms, lat, lon, accuracy_m, geo_error, net_lat, net_lon, flags, by_pid, checks_json, log_seq FROM attendance_evidence WHERE event_id=? AND flat_no=? ORDER BY id").bind(eid, flatNo).all<any>()).results.map((x) => ({ id: x.id, mime: x.mime, sha256: x.sha256, size: x.size, takenAtMs: x.captured_ms, savedAtMs: x.server_ms, place: x.lat === null ? null : { lat: x.lat, lon: x.lon, accuracyM: x.accuracy_m }, placeError: x.geo_error, networkPlace: x.net_lat === null ? null : { lat: x.net_lat, lon: x.net_lon }, flags: String(x.flags).split(","), takenBy: x.by_pid, checks: x.checks_json ? JSON.parse(x.checks_json) : null, logSeq: x.log_seq, url: `/api/events/${eid}/attendance/photos/${x.id}` })),
    resumes: tx.entries.filter((e) => e.entry.type === "session_resumed" && (e.entry.payload as any).flatNo === flatNo).map((e) => ({ seq: e.entry.seq, atMs: e.entry.ts, via: (e.entry.payload as any).via, deviceChanged: (e.entry.payload as any).deviceChanged })),
  };
}
route("GET", "/api/vote/me", async (c) => {
  const s = await requireSession(c, "voter"); const tx = await Tx.load(c, s.eventId!); return json(await flatEvidence(c, tx, s.flatNo!, false));
});
route("GET", "/api/events/:id/flats/:flat/evidence", async (c, m) => {
  const { tx } = await staff(c, m[1]!, "read_contacts"); return json(await flatEvidence(c, tx, decodeURIComponent(m[2]!), false)); // shortened addresses and ids for office-bearers
});
route("GET", "/api/super/events/:id/flats/:flat/dossier", async (c, m) => {
  await requireSession(c, "super"); const tx = await Tx.load(c, m[1]!); const reason = str(c.url.searchParams.get("reason"), "reason", 5, 300); const flat = decodeURIComponent(m[2]!);
  await tx.add("platform_action", { system: true }, { action: "dossier_read", reason, flatNo: flat }, (seq) => [c.db.prepare("INSERT INTO super_admin_actions(at_ms,actor_hash,action,event_id,reason,log_seq) VALUES(?,?,?,?,?,?)").bind(c.now, "super", "dossier_read", tx.eid, reason, seq)]);
  await tx.commit(); return json(await flatEvidence(c, tx, flat, true)); // full values; the viewing is on the public page
});

// ------------------------------------------------------------------------------------------------ voter
route("POST", "/api/vote/login", async (c) => {
  const eid = str(c.body.eventId, "eventId", 10, 64), flatNo = str(c.body.flatNo, "flatNo", 1, 24), code = typeof c.body.code === "string" ? c.body.code : "";
  // a hall full of voters shares one Wi-Fi address, so the per-address limit is generous; guessing is stopped by the per-passcode lock (5 tries) and the per-address+flat limit
  await rateLimit(c, "vote-ip", c.ip, 400, 600); await rateLimit(c, "vote-ipflat", c.ip + "|" + flatNo, 20, 600); await rateLimit(c, "vote-event", eid, 600, 600);
  await checkTurnstile(c, c.body.turnstile);
  c.eventId = eid;
  const ptx = await Tx.load(c, eid); const pst = await ptx.st(); const needTerms = !pst.terms.has("flat:" + flatNo);
  if (needTerms) await requireTerms(c); // before the code is used up
  const res = await verifyPasscode({ store: new D1PasscodeStore(c.db), pepper: c.env.PEPPER, eventId: eid, purpose: "voter", subject: flatNo, code, nowMs: c.now });
  if (!res.ok) {
    if (res.lockedNow) { const tx = await Tx.load(c, eid).catch(() => null); if (tx) { await tx.add("passcode_locked", { system: true }, { purpose: "voter", subjectKind: "flat", subject: flatNo }); await tx.commit(); } }
    throw err(401, "invalid_code", "That code did not work. Ask the person at the desk for a new one.");
  }
  if (needTerms) { await ptx.add("terms_accepted", { flat: flatNo }, await termsEntry("flat", flatNo)); await ptx.commit(); }
  const kind = (await c.db.prepare("SELECT kind FROM passcodes WHERE id=?").bind(res.row.id).first<{ kind: string }>())?.kind ?? "official";
  const token = await createSession(c, { kind: "voter", eventId: eid, personId: null, flatNo }, VOTER_TTL);
  await c.db.prepare("UPDATE sessions SET voter_kind=? WHERE token_hash=?").bind(kind, await pepperHash(c.env, "session", token)).run();
  return json({ token, flatNo, kind });
});
route("GET", "/api/vote/points", async (c) => {
  const s = await requireSession(c, "voter"); const st = await (await Tx.load(c, s.eventId!)).st();
  return json({ eventId: s.eventId, flatNo: s.flatNo, points: st.pointOrder.map((id) => st.points.get(id)!).filter((p) => p.state === "open").map((p) => ({ pointId: p.def.pointId, number: p.def.number, title: p.def.title, body: p.def.body, kind: p.def.kind, options: p.def.options, maxChoices: p.def.maxChoices, secret: p.def.secret, endsMs: p.endsMs, labels: p.def.labels, minChoices: p.def.minChoices ?? 1, design: p.def.design, instruction: ballotInstruction(p.def.minChoices ?? 1, p.def.maxChoices), voted: !!st.ledger.get(p.def.pointId)?.has(s.flatNo!) })) });
});
const lockNumber = async (c: Ctx, tokenHash: string, pointId: string, choices: string[], nonce: string) => String(1000 + (parseInt((await pepperHash(c.env, "votelock", `${tokenHash}:${pointId}:${[...choices].sort().join("|")}:${nonce}`)).slice(0, 8), 16) % 9000));
/** Step 1 of locking: the voter's ballot is checked and shown back; a 4-digit number appears on the screen and must be typed into the cast call. Nothing is recorded yet. */
route("POST", "/api/vote/prepare", async (c) => {
  const s = await requireSession(c, "voter"); await rateLimit(c, "vote-prepare", s.tokenHash, 60, 60);
  const tx = await Tx.load(c, s.eventId!); const st = await tx.st(); const pointId = str(c.body.pointId, "pointId", 4, 64); const flatNo = s.flatNo!;
  const d = canVote(st, flatNo, pointId, c.now); if (!d.ok) throw err(d.code === "already_voted" ? 409 : 403, d.code, d.message);
  const pt = st.points.get(pointId)!; const rules = pt.frozen ?? st.rules!; if (!rules.options.vote_lock_code) throw err(409, "lock_off", "Locking is not switched on for this event; cast the ballot directly.");
  let rawChoices = c.body.choices;
  if (c.body.marks !== undefined) { const mk = c.body.marks; if (!mk || typeof mk !== "object" || Array.isArray(mk)) throw err(400, "bad_ballot", "The ticks could not be read."); for (const k of Object.keys(mk)) if (!pt.def.options.includes(k)) throw err(400, "bad_ballot", "That option is not on the ballot."); rawChoices = Object.entries(mk).filter(([, v]) => v === true).map(([k]) => k); }
  const bc = validateBallot(pt.def as PointDef, rawChoices); if (!bc.ok) throw err(400, "bad_ballot", "That ballot is not valid. " + (bc as any).reason);
  const nonce = randomHex(8); const exp = c.now + 5 * 60_000; const code = await lockNumber(c, s.tokenHash, pointId, bc.choices, nonce);
  await kvSet(c, `vl:${s.tokenHash}:${pointId}`, JSON.stringify({ nonce, exp, tries: 0 }));
  return json({ review: bc.choices.map((id) => ({ id, label: pt.def.labels?.[id] ?? id })), lockCode: code, expiresMs: exp, message: "Check your choice. To lock your vote, type this 4-digit number and press Cast." });
});
route("POST", "/api/vote/cast", async (c) => {
  const s = await requireSession(c, "voter"); await rateLimit(c, "vote-cast", s.tokenHash, 60, 60);
  const tx = await Tx.load(c, s.eventId!); const st = await tx.st(); const pointId = str(c.body.pointId, "pointId", 3, 40), flatNo = s.flatNo!;
  const d = canVote(st, flatNo, pointId, c.now);
  if (!d.ok) {
    if (["already_voted", "window_ended", "not_present", "point_closed"].includes(d.code) && st.points.has(pointId)) { await tx.add("vote_rejected", { flat: flatNo }, { pointId, flatNo, reason: d.code }); await tx.commit().catch(() => {}); }
    throw err(d.code === "already_voted" ? 409 : 403, d.code, d.message);
  }
  const pt = st.points.get(pointId)!;
  if (((pt.frozen ?? st.rules)?.params["ballot.mode"] ?? "online") === "printed") throw err(403, "printed_only", "This vote is on printed ballot papers only.");
  let rawChoices = c.body.choices;
  if (c.body.marks !== undefined) { // checkbox form: ticked = yes (selected), not ticked = no (not selected)
    const mk = c.body.marks; if (!mk || typeof mk !== "object" || Array.isArray(mk)) throw err(400, "bad_ballot", "marks must list each box as true or false.");
    for (const [k, v] of Object.entries(mk)) { if (!pt.def.options.includes(k)) throw err(400, "bad_ballot", "That box is not on this ballot."); if (typeof v !== "boolean") throw err(400, "bad_ballot", "Each box must be ticked (true) or not ticked (false)."); }
    rawChoices = Object.entries(mk).filter(([, v]) => v === true).map(([k]) => k);
  }
  const bc = validateBallot(pt.def as PointDef, rawChoices); if (!bc.ok) throw err(400, "bad_ballot", "That ballot is not valid: " + bc.reason);
  const rules = pt.frozen ?? st.rules!; const flat = st.roll.find((f) => f.flatNo === flatNo)!; const weight = effectiveWeight(flat, !!rules.options.weightage);
  if (rules.options.vote_lock_code) { // the voter reviewed the ballot and typed the 4-digit number shown to them: only then is it cast
    const raw = await kvGet(c, `vl:${s.tokenHash}:${pointId}`); const given = String(c.body.lockCode ?? "");
    if (!raw) throw err(409, "lock_required", "Review your ballot and lock it first: press Review, then type the 4-digit number shown.");
    const pre = JSON.parse(raw) as { nonce: string; exp: number; tries: number };
    if (c.now > pre.exp) throw err(410, "lock_expired", "That lock has expired. Review your ballot again.");
    if (pre.tries >= 5) throw err(429, "lock_too_many", "Too many wrong numbers. Review your ballot again.");
    // the number is recomputed from the ballot and a server secret, so nothing stored links this voter to a choice
    if (given !== (await lockNumber(c, s.tokenHash, pointId, bc.choices, pre.nonce))) { pre.tries++; await kvSet(c, `vl:${s.tokenHash}:${pointId}`, JSON.stringify(pre)); throw err(400, "wrong_lock_code", `That number is not right, or the ballot is not the one you reviewed. ${5 - pre.tries} tries left.`); }
    await kvSet(c, `vl:${s.tokenHash}:${pointId}`, ""); // used up (an empty value counts as no lock)
  }
  const kind = ((await c.db.prepare("SELECT voter_kind FROM sessions WHERE token_hash=?").bind(s.tokenHash).first<{ voter_kind: string }>())?.voter_kind === "proxy") ? "proxy" : "official";
  if (pt.def.secret) {
    const nonce = randomHex(16); const receipt = await receiptOf(pointId, bc.choices, nonce);
    await tx.add("vote_recorded", { flat: flatNo }, { pointId, flatNo, kind }, (seq) => [
      c.db.prepare("INSERT INTO voter_ledger(event_id,point_id,flat_no,kind,open_choice_json,voted_ms,log_seq) VALUES(?,?,?,?,NULL,?,?)").bind(tx.eid, pointId, flatNo, kind, c.now, seq),
      c.db.prepare("INSERT INTO ballot_box(receipt_hash,event_id,point_id,choice_json,weight,kind) VALUES(?,?,?,?,?,?)").bind(receipt, tx.eid, pointId, JSON.stringify(bc.choices), weight, kind)]);
    await tx.commit(); return json({ recorded: true, receipt, nonce, note: "Keep this code. After voting closes you can find the receipt in the public list." }, 201);
  }
  await tx.add("vote_cast_open", { flat: flatNo }, { pointId, flatNo, kind, choices: bc.choices }, (seq) => [c.db.prepare("INSERT INTO voter_ledger(event_id,point_id,flat_no,kind,open_choice_json,voted_ms,log_seq) VALUES(?,?,?,?,?,?,?)").bind(tx.eid, pointId, flatNo, kind, JSON.stringify(bc.choices), c.now, seq)]);
  await tx.commit(); return json({ recorded: true }, 201);
});

// ------------------------------------------------------------------------------------------------ super console (read-only plus logged support actions)
const superHash = (c: Ctx) => pepperHash(c.env, "super", c.env.SUPER_EMAIL ?? "").then((h) => h.slice(0, 16));
route("POST", "/api/super/request", async (c) => {
  await rateLimit(c, "super-ip", c.ip, 6, 600);
  if (c.env.SUPER_EMAIL) { const { code } = await issuePasscode({ store: new D1PasscodeStore(c.db), pepper: c.env.PEPPER, eventId: "platform", purpose: "super_login", subject: "super", nowMs: c.now, ttlMs: LOGIN_TTL_MS, newId: () => newId("pc_") }); await sendMail(c, c.env.SUPER_EMAIL, "Console code", `Your console code is ${code}. It works once for 15 minutes.\n`).catch(() => {}); }
  return json({ sent: true });
});
route("POST", "/api/super/verify", async (c) => {
  await rateLimit(c, "super-ip", c.ip, 6, 600);
  const res = await verifyPasscode({ store: new D1PasscodeStore(c.db), pepper: c.env.PEPPER, eventId: "platform", purpose: "super_login", subject: "super", code: typeof c.body.code === "string" ? c.body.code : "", nowMs: c.now });
  if (!res.ok || !c.env.SUPER_EMAIL) throw err(401, "invalid_code", "That code did not work.");
  await sendMail(c, c.env.SUPER_EMAIL, "Console sign-in", `A console sign-in just succeeded (${new Date(c.now).toISOString()}).\n`).catch(() => {});
  return json({ token: await createSession(c, { kind: "super", eventId: null, personId: null, flatNo: null }, 2 * 3600_000) });
});
route("GET", "/api/super/overview", async (c) => {
  const s = await requireSession(c, "super"); await rateLimit(c, "super-read", s.tokenHash, 60, 60);
  const events = (await c.db.prepare("SELECT e.id, e.kind, e.title, e.pack_id, e.created_ms, so.name society, (SELECT status FROM event_status WHERE event_id=e.id ORDER BY id DESC LIMIT 1) status, (SELECT MAX(seq) FROM log_entries WHERE event_id=e.id) head_seq FROM events e JOIN societies so ON so.id=e.society_id ORDER BY e.created_ms DESC LIMIT 200").all()).results;
  const payments = (await c.db.prepare("SELECT payment_id, event_id, state, mode, amount_minor, at_ms FROM payments ORDER BY id DESC LIMIT 200").all()).results;
  const mail = await mailsToday(c); const limit = mailLimit(c.env);
  const storage = await c.db.prepare("SELECT (SELECT COUNT(*) FROM log_entries) log_entries, (SELECT COUNT(*) FROM private_evidence) evidence, (SELECT COALESCE(SUM(LENGTH(ct)),0) FROM private_evidence) evidence_bytes, (SELECT COUNT(*) FROM events) events").first();
  const anchors = (await c.db.prepare("SELECT event_id, head_seq, kind, at_ms FROM anchors ORDER BY id DESC LIMIT 50").all()).results;
  return json({ events, payments, mail: { today: mail, dailyLimit: limit, quotaReached: !(await mailQuotaLeft(c)) }, storage, anchors, health: { ok: true, testMode: c.env.TEST_MODE === "1" } });
});
route("POST", "/api/super/events/:id/suspend", async (c, m) => {
  const s = await requireSession(c, "super"); void s; const tx = await Tx.load(c, m[1]!); const st = await tx.st(); const reason = str(c.body.reason, "reason", 5, 300);
  if (st.status !== "setup" && st.status !== "agenda_published") throw err(409, "not_future", "Only an event that has not started can be suspended.");
  const who = await superHash(c);
  await tx.add("platform_action", { system: true }, { action: "suspend", reason }, (seq) => [c.db.prepare("INSERT INTO super_admin_actions(at_ms,actor_hash,action,event_id,reason,log_seq) VALUES(?,?,?,?,?,?)").bind(c.now, who, "suspend", tx.eid, reason, seq)]);
  await tx.add("event_suspended", { system: true }, { reason }, (seq) => [statusStmt(c, tx.eid, "suspended", seq)]);
  await tx.commit(); return json({ ok: true });
});
route("GET", "/api/super/events/:id/audit", async (c, m) => {
  await requireSession(c, "super"); const tx = await Tx.load(c, m[1]!); const reason = str(c.url.searchParams.get("reason"), "reason", 5, 300);
  await tx.add("platform_action", { system: true }, { action: "audit_read", reason }, (seq) => [c.db.prepare("INSERT INTO super_admin_actions(at_ms,actor_hash,action,event_id,reason,log_seq) VALUES(?,?,?,?,?,?)").bind(c.now, "super", "audit_read", tx.eid, reason, seq)]);
  await tx.commit(); return json({ rows: await readAudit(c, tx.eid, true) }); // every full read is itself on the public page
});
route("POST", "/api/super/payments/reconcile", async (c) => {
  await requireSession(c, "super"); const pid = str(c.body.paymentId, "paymentId", 3, 40), note = str(c.body.note, "note", 3, 300);
  const p = await c.db.prepare("SELECT event_id, amount_minor, currency FROM payments WHERE payment_id=? ORDER BY id DESC LIMIT 1").bind(pid).first<any>(); if (!p) throw err(404, "no_payment", "No such payment.");
  await c.db.batch([c.db.prepare("INSERT INTO payments(payment_id,event_id,state,mode,order_id,amount_minor,currency,ref,log_seq,at_ms) VALUES(?,?,'reconciled','test',NULL,?,?,?,NULL,?)").bind(pid, p.event_id, p.amount_minor, p.currency, note, c.now),
    c.db.prepare("INSERT INTO super_admin_actions(at_ms,actor_hash,action,event_id,reason,log_seq) VALUES(?,?,?,?,?,NULL)").bind(c.now, await superHash(c), "reconcile", p.event_id, note)]);
  return json({ ok: true });
});
route("POST", "/api/internal/anchor", async (c) => {
  if (!c.env.INTERNAL_SECRET || c.req.headers.get("x-internal-secret") !== c.env.INTERNAL_SECRET) throw err(404, "not_found", "Not found.");
  const live = (await c.db.prepare("SELECT event_id FROM event_status s WHERE id=(SELECT MAX(id) FROM event_status WHERE event_id=s.event_id) AND status='live'").all<{ event_id: string }>()).results;
  let n = 0;
  for (const r of live) {
    const tx = await Tx.load(c, r.event_id); const head = tx.entries.at(-1)!;
    const se = await tx.add("anchor", { system: true }, { headSeq: head.entry.seq, headHash: head.hash });
    await tx.commit([c.db.prepare("INSERT INTO anchors(event_id,head_seq,head_hash,kind,sig,at_ms) VALUES(?,?,?,'daily',?,?)").bind(r.event_id, head.entry.seq, head.hash, se.sig, c.now)]); n++;
  }
  return json({ anchored: n });
});

// ------------------------------------------------------------------------------------------------ entry point
export async function handle(req: Request, env: Env, now = Date.now()): Promise<Response> {
  const url = new URL(req.url);
  try {
    if (req.method === "DELETE") throw err(405, "no_delete", "Nothing can be deleted here.");
    if (req.method === "OPTIONS") return new Response(null, { status: 204 });
    const hit = routes.find((r) => r.method === req.method && r.re.test(url.pathname));
    if (!hit) throw err(404, "not_found", "Not found.");
    const body = await readBody(req, url.pathname.endsWith("/roll/import") ? 9_000_000 : url.pathname.endsWith("/evidence") ? 400_000 : 65_536);
    const dev = req.headers.get("x-device-id") ?? "";
    const c: Ctx = { req, env, db: env.DB, now, url, ip: (req.headers.get("cf-connecting-ip") ?? "local").slice(0, 64), body, deviceId: DEVICE_RE.test(dev) ? dev : "", bsid: /^[A-Za-z0-9_-]{8,64}$/.test(req.headers.get("x-browser-session") ?? "") ? req.headers.get("x-browser-session")! : "", bid: /(?:^|;\s*)tw_bid=([0-9a-f]{32})/.exec(req.headers.get("cookie") ?? "")?.[1] ?? "", client: sanitizeClient(req.headers.get("x-client-info")), cf: pickCf(req) };
    if (req.method !== "GET") await rateLimit(c, "any-ip", c.ip, 600, 60); else await rateLimit(c, "read-ip", c.ip, 240, 60);
    c.eventId = /\/api\/(?:events|r|vote)\/([0-9a-f]{32})/.exec(url.pathname)?.[1] ?? (typeof body.eventId === "string" && /^[0-9a-f]{32}$/.test(body.eventId) ? body.eventId : undefined);
    const bearer = /^Bearer ([0-9a-f]{64})$/.exec(req.headers.get("authorization") ?? "");
    if (bearer) { const sr = await env.DB.prepare("SELECT kind, person_id, flat_no, event_id FROM sessions WHERE token_hash=? AND expires_ms>?").bind(await pepperHash(env, "session", bearer[1]!), now).first<any>(); if (sr) { c.actor = { kind: sr.kind, ref: sr.person_id ?? sr.flat_no ?? sr.kind }; c.eventId ??= sr.event_id ?? undefined; } }
    const mustAudit = req.method !== "GET" || !!bearer || url.pathname.startsWith("/api/h/") || env.AUDIT_PUBLIC_READS === "1";
    if (mustAudit) {
      // mandatory: every action carries a device identifier and an IP address, and is audited BEFORE it is processed
      if (!c.deviceId) { try { await writeAudit(c, "result", 400); } catch { /* nothing more to do */ } throw err(400, "device_required", "This action needs a device identifier (header x-device-id, 16 to 64 letters or digits)."); }
      try { c.auditId = await writeAudit(c, "request", null); } catch (e2) { console.error("audit write failed", String(e2)); throw err(503, "audit_unavailable", "We cannot record this action right now, so it was not carried out. Please try again."); }
    }
    let res: Response; let status = 500;
    try { res = await hit.h(c, url.pathname.match(hit.re)!); status = res.status; }
    catch (e3: any) { status = e3 instanceof ApiError ? e3.status : String(e3?.message ?? "").startsWith("log payload not masked") ? 400 : 500; if (mustAudit) await writeAudit(c, "result", status).catch(() => {}); throw e3; }
    if (mustAudit) await writeAudit(c, "result", status).catch((e4) => console.error("audit result failed", String(e4)));
    if (c.newBid) res.headers.append("set-cookie", `tw_bid=${c.newBid}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax`); // recognises this browser when the same link is opened again
    secureHeaders(res);
    return res;
  } catch (e: any) {
    if (e instanceof ApiError) return json({ error: e.code, message: e.message, ...e.extra }, e.status);
    if (String(e?.message ?? "").startsWith("log payload not masked")) return json({ error: "contains_personal_data", message: "Please remove e-mail addresses and phone numbers from the text you typed." }, 400);
    console.error("api error", String(e?.stack ?? e));
    return json({ error: "server_error", message: "Something went wrong on our side. Please try again." }, 500);
  }
}
export { CUSTOM_WORLD_PACK, extractData, sha256Hex, maskPhone, mailLimit };

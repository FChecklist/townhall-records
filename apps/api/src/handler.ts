// Townhall API: one framework-free entry point, `handle(request, env, now)`. The Pages Function only forwards to it.
// Routes and rules: docs/design/API.md. There is no DELETE route and no route that edits history.
import rulePacks from "../../../docs/research/rule-packs.json";
import {
  type Bytes, BRAND, HANDSHAKE_MAX_TRIES, HANDSHAKE_TTL_MS, codeHash, openLink, voterConfirm, monitorConfirm, type Handshake, hmacHex, newSerial, paperToken, parsePaperToken, paperLayout, renderPaperSvg, LANGUAGES, coverage, dictionary, isLang, playbook,
  defaultSchedule, validateSchedule, type Schedule, TERMS_VERSION, TERMS_TEXT, termsSha256, priceFor, isCountry, formatPrice, renderReportPdf, pdfSha256, extractSeal, normalizeBallotDesign, defaultBallotDesign, ballotInstruction, type Actor,
  CUSTOM_WORLD_PACK, OPTIONS, PARAMS, RuleError, aesDecrypt, aesEncrypt, applyRecommended, b64url, buildReportModel, canAmendPoint, canChangeRoll, canChangeRule, canDo, canVote, cloneTemplate,
  deriveKey32, effectiveWeight, extractData, fromB64url, issuePasscode, loadAllPacks, maskEmail, maskName, maskPhone, newRuleSet, parseMajority, progressOf, proxyAllowed, randomHex, renderReportHtml,
  sealReport, setOption, validateBallot, validateParam, verifyPasscode, LOGIN_TTL_MS, sha256Hex, type EnginePack, type EventState, type PointDef, type RuleSet, type Json, type Role,
} from "../../../packages/engine/src";
import { agendaPayload, openPointPayload, receiptOf, resultPayload, sealBoxPayload, type BoxBallot } from "../../../packages/engine/src/commands";
import {
  ApiError, D1PasscodeStore, Tx, actorOf, checkTurnstile, createSession, err, int, json, loadEntries, mailLimit, mailQuotaLeft, mailsToday, newId, optStr, pepperHash, publicKey, rateLimit, readBody, requireSession,
  sendMail, str, email as emailOf, type Ctx, type D1Stmt, type Env,
} from "./core";

export const PACKS: Map<string, EnginePack> = loadAllPacks(rulePacks);
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
async function personStmts(c: Ctx, eid: string, pid: string, p: Contact, flatNo: string | null, key: Bytes): Promise<D1Stmt[]> {
  const ct = await aesEncrypt(key, JSON.stringify(p), eid + "|" + pid);
  const idx = p.email ? await pepperHash(c.env, "email:" + eid, p.email) : "";
  return [
    c.db.prepare("INSERT INTO people(id,event_id,masked_name,masked_email,masked_phone,flat_no,created_ms) VALUES(?,?,?,?,?,?,?)").bind(pid, eid, maskName(p.name), p.email ? maskEmail(p.email) : "", p.phone ? maskPhone(p.phone) : "", flatNo, c.now),
    c.db.prepare("INSERT INTO private_contacts(person_id,event_id,ct,email_idx,created_ms) VALUES(?,?,?,?,?)").bind(pid, eid, ct, idx, c.now),
  ];
}
async function contactOf(c: Ctx, eid: string, pid: string): Promise<Contact> {
  const r = await c.db.prepare("SELECT ct FROM private_contacts WHERE person_id=? AND event_id=?").bind(pid, eid).first<{ ct: string }>();
  if (!r) throw err(404, "no_person", "No such person.");
  return JSON.parse(await aesDecrypt(await eventKey(c, eid), r.ct, eid + "|" + pid));
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
const routeName = (path: string) => path.replace(/\b[0-9a-f]{32,}\b/g, ":id").replace(/\bp_[0-9a-f]{16}\b/g, ":pid").replace(/\bpt_[0-9a-f]{16}\b/g, ":pt");
/** Writes one audit row. Choices, receipts and passcodes are never part of it. Throws if the row cannot be written (the caller then refuses the request). */
async function writeAudit(c: Ctx, phase: "request" | "result", status: number | null): Promise<number> {
  const eid = c.eventId ?? "platform"; const { key, scope } = await auditKey(c, eid);
  const ct = await aesEncrypt(key, JSON.stringify({ ip: c.ip, device: c.deviceId || null, ua: (c.req.headers.get("user-agent") ?? "").slice(0, 200) }), "audit|" + eid);
  const r = await c.db.prepare("INSERT INTO access_audit(at_ms,event_id,phase,ref_id,method,route,actor_kind,actor_ref,status,log_seq,ct,ip_idx,dev_idx,key_scope) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id")
    .bind(c.now, eid, phase, phase === "result" ? c.auditId ?? null : null, c.req.method, routeName(c.url.pathname), c.actor?.kind ?? "anon", c.actor?.ref ?? null, status, phase === "result" ? c.lastSeq ?? null : null, ct, (await pepperHash(c.env, "ip", c.ip)).slice(0, 24), (await pepperHash(c.env, "dev", c.deviceId || "none")).slice(0, 24), scope).first<{ id: number }>();
  return r!.id;
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
    if (m) { const sess = await c.db.prepare("SELECT person_id, event_id FROM sessions WHERE token_hash=? AND kind='staff' AND expires_ms>?").bind(await pepperHash(c.env, "session", m[1]!), c.now).first<any>(); isSrcOrg = !!sess && sess.event_id === srcTx.eid && !!sst.people.get(sess.person_id)?.roles.includes("organizer") && !!sst.people.get(sess.person_id)?.verified; }
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
    await tx.add("clone_linked", { system: true }, { direction: "from", eventId: tpl.createdFrom });
    if (tpl.includePrivateRoll && srcTx) {
      const rows = (await db.prepare("SELECT p.id, p.flat_no, c.ct FROM people p JOIN private_contacts c ON c.person_id=p.id WHERE p.event_id=? AND p.flat_no IS NOT NULL").bind(srcTx.eid).all<any>()).results;
      const srcKey = await eventKey(c, srcTx.eid);
      for (const r of rows) {
        const contact: Contact = JSON.parse(await aesDecrypt(srcKey, r.ct, srcTx.eid + "|" + r.id)); const hid = newId("p_", 8);
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
  await sendMail(c, to, `Your ${BRAND} code`, `Your 6-digit code for ${society} is ${code}.\nIt works once and expires in 15 minutes. Never share it.\n`);
}
route("POST", "/api/auth/request", async (c) => {
  const { eventId, personId } = c.body; const eid = str(eventId, "eventId", 10, 64), pid = str(personId, "personId", 3, 40);
  await rateLimit(c, "auth-ip", c.ip, 20, 600); await rateLimit(c, "auth-person", eid + pid, 5, 600); await rateLimit(c, "auth-event", eid, 60, 600);
  await checkTurnstile(c, c.body.turnstile);
  const known = await c.db.prepare("SELECT 1 x FROM people WHERE id=? AND event_id=?").bind(pid, eid).first();
  if (known) { const ct = await contactOf(c, eid, pid); const tx = await Tx.load(c, eid); await issueLogin(c, eid, pid, ct.email, (await tx.st()).created?.society.name ?? "your society"); }
  return json({ sent: true }); // same answer whether or not the person exists
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
  const out = []; for (const r of rows) out.push({ pid: r.id, flatNo: r.flat_no, roles: st.people.get(r.id)?.roles ?? [], ...JSON.parse(await aesDecrypt(key, r.ct, tx.eid + "|" + r.id)) });
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
  if (c.env.TEST_MODE !== "1") throw err(503, "pay_disabled", "Payments are not switched on yet.");
  if (st.paid) throw err(409, "already_paid", "This event is already paid.");
  const price = priceFor(st.created!.kind, st.created!.country); const amountMinor = price.amountMinor; const paymentId = newId("pay_", 8);
  let orderId: string | null = null;
  if (c.env.PAY_SERVICE_KEY) { // central path (IT Services by Rajat Agarwal), same call shape as Corporate Bingo; TEST mode only
    try {
      const r = await fetch(`${(c.env.PAY_SERVICE_URL ?? "https://itservices-rajat-agarwal.pages.dev").replace(/\/+$/, "")}/api/pay/order`, { method: "POST", headers: { "content-type": "application/json", "x-site-key": c.env.PAY_SERVICE_KEY }, body: JSON.stringify({ site: c.env.PAY_SITE ?? "aoa-rwa", product: "aoa_rwa", plan: st.created!.kind, amount_minor: amountMinor, currency: price.currency, payment_ref: paymentId, extra_notes: { event: tx.eid.slice(0, 8), test: "1" } }), signal: AbortSignal.timeout(6000) });
      const d: any = await r.json().catch(() => ({})); if (r.ok && d.orderId) orderId = String(d.orderId);
    } catch { /* falls back to the local test order */ }
  }
  await tx.add("payment_state", ENTRY_ACTOR(st, pid), { paymentId, state: "created", amountMinor, currency: price.currency, mode: "test" }, (seq) => [c.db.prepare("INSERT INTO payments(payment_id,event_id,state,mode,order_id,amount_minor,currency,ref,log_seq,at_ms) VALUES(?,?,'created','test',?,?,?,?,?,?)").bind(paymentId, tx.eid, orderId, amountMinor, price.currency, null, seq, c.now)]);
  await tx.commit(); return json({ paymentId, amountMinor, currency: price.currency, price: formatPrice(price), mode: "test", orderId }, 201);
});
async function markPaid(c: Ctx, eid: string, paymentId: string, via: string): Promise<void> {
  const tx = await Tx.load(c, eid); const st = await tx.st();
  const created = st.payments.find((p) => p.paymentId === paymentId && p.state === "created"); if (!created) throw err(404, "no_payment", "No such payment.");
  if (st.payments.some((p) => p.paymentId === paymentId && p.state === "paid")) return; // idempotent
  await tx.add("payment_state", { system: true }, { paymentId, state: "paid", amountMinor: created.amountMinor, currency: created.currency, mode: "test" }, (seq) => [c.db.prepare("INSERT INTO payments(payment_id,event_id,state,mode,order_id,amount_minor,currency,ref,log_seq,at_ms) VALUES(?,?,'paid','test',NULL,?,?,?,?,?)").bind(paymentId, eid, created.amountMinor, created.currency, via, seq, c.now)]);
  await tx.commit();
}
route("POST", "/api/pay/test-confirm", async (c) => {
  if (c.env.TEST_MODE !== "1") throw err(404, "not_found", "Not found.");
  const eid = str(c.body.eventId, "eventId", 10, 64); const { pid } = await staff(c, eid, "pay");
  void pid; await markPaid(c, eid, str(c.body.paymentId, "paymentId", 3, 40), "test-confirm"); return json({ ok: true });
});
route("POST", "/api/pay/webhook", async (c) => {
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
  const method = str(c.body.method ?? "visual", "method", 2, 40), docType = optStr(c.body.docType, "docType", 30) || null, docLast4 = optStr(c.body.docLast4, "docLast4", 4) || null;
  if (docLast4 && !/^[A-Za-z0-9]{1,4}$/.test(docLast4)) throw err(400, "bad_doc", "Only the last 4 characters of an ID are kept.");
  const evidenceHash = optStr(c.body.evidenceHash, "evidenceHash", 64) || null; const present = c.body.present !== false;
  const independent = st.people.get(pid)!.roles.includes("attendance_officer");
  const key = await eventKey(c, tx.eid); const ct = await aesEncrypt(key, JSON.stringify({ attendee }), tx.eid + "|att|" + flatNo);
  await tx.add("attendance_marked", ENTRY_ACTOR(st, pid), { flatNo, mode, method, docType, docLast4, maskedName: maskName(attendee), by: pid, independent, evidenceHash, present },
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
async function closeAndPublish(c: Ctx, tx: Tx, pid: string | null): Promise<{ fileSha256: string; headSeq: number }> {
  let st = await tx.st();
  for (const id of st.pointOrder) if (st.points.get(id)!.state === "open") { await closePoint(c, tx, pid, id); st = await tx.st(); }
  for (const id of st.pointOrder) { const p = st.points.get(id)!; if (p.state === "closed" && !st.results.has(id) && p.def.kind !== "discussion") { await finishCount(c, tx, pid, id); st = await tx.st(); } }
  st = await tx.st(); const actor: Actor = pid ? ENTRY_ACTOR(st, pid) : { system: true };
  await tx.add("event_closed", actor, { headSeq: tx.nextSeq, auto: pid === null }, (seq) => [statusStmt(c, tx.eid, "closed", seq)]);
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
  return json({ closed: closed.length, events: closed });
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
  const key = await eventKey(c, h.eventId); const ct = await aesEncrypt(key, JSON.stringify({ attendee: h.attendeeName }), h.eventId + "|att|" + h.flatNo);
  await tx.add("attendance_marked", actor, { flatNo: h.flatNo, mode: "physical", method: "mutual_code_exchange", docType: null, docLast4: null, maskedName: maskName(h.attendeeName), by: monitorPid, independent, evidenceHash: null, present: true },
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
  const res = openLink(h, c.now, await pepperHash(c.env, "dev", c.deviceId), (await pepperHash(c.env, "ua", c.req.headers.get("user-agent") ?? "")).slice(0, 24), (await pepperHash(c.env, "ip", c.ip)).slice(0, 24));
  if (!res.ok) throw hsError(res.reason);
  h = res.h; await hsSave(c, h);
  const tx = await Tx.load(c, h.eventId); const st = await tx.st(); const codes = await hsCodes(c, h.id);
  let smsLink: string | null = null; // optional number check: the voter sends an SMS from their own phone to the OFFICER's phone (no cost to the platform)
  if (h.mobileFp) { try { const ph = (await contactOf(c, h.eventId, h.monitorPid)).phone.replace(/[^\d+]/g, ""); if (ph) smsLink = `sms:${ph}?body=${encodeURIComponent("AOA " + h.id.slice(3, 9))}`; } catch { /* no officer phone known */ } }
  return json({ flatNo: h.flatNo, society: st.created?.society.name, title: st.created?.title, voterCode: codes.voter, smsLink, termsVersion: TERMS_VERSION, termsRequired: !st.terms.has("flat:" + h.flatNo), voterConfirmed: !!h.voterConfirmedMs, expiresMs: h.expiresMs,
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
  return json({ flatNo: s.flatNo, points: st.pointOrder.map((id) => st.points.get(id)!).filter((p) => p.state === "open").map((p) => ({ pointId: p.def.pointId, number: p.def.number, title: p.def.title, body: p.def.body, kind: p.def.kind, options: p.def.options, maxChoices: p.def.maxChoices, secret: p.def.secret, endsMs: p.endsMs, labels: p.def.labels, minChoices: p.def.minChoices ?? 1, design: p.def.design, instruction: ballotInstruction(p.def.minChoices ?? 1, p.def.maxChoices), voted: !!st.ledger.get(p.def.pointId)?.has(s.flatNo!) })) });
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
    const body = await readBody(req, url.pathname.endsWith("/evidence") ? 400_000 : 65_536);
    const dev = req.headers.get("x-device-id") ?? "";
    const c: Ctx = { req, env, db: env.DB, now, url, ip: (req.headers.get("cf-connecting-ip") ?? "local").slice(0, 64), body, deviceId: DEVICE_RE.test(dev) ? dev : "" };
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
    return res;
  } catch (e: any) {
    if (e instanceof ApiError) return json({ error: e.code, message: e.message, ...e.extra }, e.status);
    if (String(e?.message ?? "").startsWith("log payload not masked")) return json({ error: "contains_personal_data", message: "Please remove e-mail addresses and phone numbers from the text you typed." }, 400);
    console.error("api error", String(e?.stack ?? e));
    return json({ error: "server_error", message: "Something went wrong on our side. Please try again." }, 500);
  }
}
export { CUSTOM_WORLD_PACK, extractData, sha256Hex, maskPhone, mailLimit };

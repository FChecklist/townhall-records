// Large-scale randomized check of the ENGINE against independently written oracles (BigInt arithmetic, different structure, written from the rules, not from the engine code).
// Reproducible: SEED=<n> N=<scale> bun scripts/sim-engine.ts. Prints one line per property and a final JSON; exit code 1 on any disagreement.
import { setParam, setOption } from "../packages/engine/src/rules";
import { applyRecommended, newRuleSet, loadAllPacks } from "../packages/engine/src/packs";
import { computeQuorum, tallyPoint, validateBallot, type Flat, type PointDef } from "../packages/engine/src/tally";
import { MemoryPasscodeStore, issuePasscode, verifyPasscode, MAX_TRIES, LOCK_MS } from "../packages/engine/src/passcode";
import { maskEmail, maskName, maskPhone, scanPublic } from "../packages/engine/src/masking";
import { detectTicks, paperLayout } from "../packages/engine/src/paper";
import { defaultBallotDesign } from "../packages/engine/src/ballot";
import { codeHash, monitorConfirm, openLink, voterConfirm, type Handshake } from "../packages/engine/src/handshake";
import { appendEntry, verifyChain } from "../packages/engine/src/log";
import { generateSigningKey } from "../packages/engine/src/crypto";
import rulePacks from "../docs/research/rule-packs.json";

const SEED = parseInt(process.env.SEED ?? "20261023", 10), SCALE = parseFloat(process.env.N ?? "1");
let s = SEED >>> 0 || 1;
const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
const ri = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
const pick = <T,>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)]!;
const results: Array<{ property: string; cases: number; failures: number; ms: number; example?: string }> = [];
async function prop(name: string, n: number, f: (i: number) => Promise<string | null> | string | null) {
  if (process.env.PROP && !name.includes(process.env.PROP)) return;
  const N = Math.max(1, Math.round(n * SCALE)); const t0 = performance.now(); let bad = 0, ex: string | undefined;
  for (let i = 0; i < N; i++) { const r = await f(i); if (r) { bad++; ex ??= r; } }
  const ms = Math.round(performance.now() - t0); results.push({ property: name, cases: N, failures: bad, ms, ...(ex ? { example: ex } : {}) });
  console.log(`${bad ? "FAIL" : "ok  "} ${name}: ${N} cases, ${bad} failures, ${ms} ms${ex ? "  e.g. " + ex : ""}`);
}
const packs = loadAllPacks(rulePacks);

// ------------------------------------------------------------------ 1. tally / majority / ranking vs oracle
function oracleTally(p: PointDef, ballots: Array<{ choices: string[]; weight: number }>, rules: { basis: string; abstainIn: boolean; tie: string; cls: string; strictSimple: boolean }, present: number, total: number) {
  const W: Record<string, bigint> = {}, C: Record<string, number> = {}; for (const o of p.options) { W[o] = 0n; C[o] = 0; }
  let cast = 0n; for (const b of ballots) { cast += BigInt(b.weight); for (const c of b.choices) { W[c]! += BigInt(b.weight); C[c]!++; } }
  const options = p.options.map((o) => ({ option: o, weight: Number(W[o]), count: C[o]!, percentBp: cast === 0n ? 0 : Number((W[o]! * 10000n) / cast), notSelected: ballots.length - C[o]! }));
  if (p.kind === "election_post") {
    const cand = p.options.filter((o) => o !== "abstain").map((o) => ({ o, w: W[o]!, c: C[o]! })).sort((a, b) => (a.w === b.w ? (a.o < b.o ? -1 : 1) : a.w > b.w ? -1 : 1));
    const ranking = cand.map((x, i) => { let rank = 1; for (const y of cand) if (y.w > x.w) rank++; const tied = cand.some((y, j) => j !== i && y.w === x.w); return { option: x.o, weight: Number(x.w), count: x.c, rank, tied }; });
    return { options, ranking, outcome: "counted" as const };
  }
  const [num, den] = rules.cls === "simple" ? [1n, 2n] : rules.cls === "two_thirds" ? [2n, 3n] : rules.cls === "three_quarters" ? [3n, 4n] : rules.cls === "unanimous" ? [1n, 1n] : (() => { const [a, b] = rules.cls.split("/"); return [BigInt(a!), BigInt(b!.replace("s", ""))]; })();
  const strict = rules.cls === "simple" || /^\d+\/\d+s$/.test(rules.cls);
  const yes = W["yes"] ?? 0n, no = W["no"] ?? 0n, ab = W["abstain"] ?? 0n;
  const base = rules.basis === "total" ? BigInt(total) : rules.basis === "present" ? BigInt(present) : yes + no + (rules.abstainIn ? ab : 0n);
  let outcome: string;
  if (num === 1n && den === 2n && yes === no && base > 0n && rules.basis === "cast") outcome = rules.tie !== "none" ? "tie" : "not_carried";
  else outcome = yes > 0n && (strict ? yes * den > base * num : yes * den >= base * num) ? "carried" : "not_carried";
  return { options, ranking: null, outcome };
}
await prop("tally, majority, vote %, ranking, ticked/not-ticked counts vs oracle", 3_000_000, () => {
  const election = rnd() < 0.5, nOpt = election ? ri(2, 8) : 0;
  const options = election ? Array.from({ length: nOpt }, (_, i) => "c_" + i.toString(16).padStart(12, "0")) : ["yes", "no", ...(rnd() < 0.6 ? ["abstain"] : [])];
  const max = election ? ri(1, nOpt) : 1, min = election ? ri(0, max) : 1;
  const p: PointDef = { pointId: "pt_x", kind: election ? "election_post" : "resolution", options, maxChoices: max, minChoices: min, majorityClass: "simple", secret: true, format: "single_post" };
  const cls = election ? "simple" : pick(["simple", "two_thirds", "three_quarters", "unanimous", "3/5", "5/9s", "1/2s"]); p.majorityClass = cls;
  const weighted = rnd() < 0.5, ballots: Array<{ choices: string[]; weight: number }> = [];
  for (let b = ri(0, 40); b > 0; b--) { const k = ri(Math.max(min, election ? 0 : 1), max); const pool = [...options].sort(() => rnd() - 0.5); ballots.push({ choices: election ? pool.slice(0, k).sort() : [pick(options)], weight: weighted ? ri(1, 5000) : 1 }); }
  const castW = ballots.reduce((a, b) => a + b.weight, 0), present = castW + ri(0, 300), total = present + ri(0, 300);
  const basis = pick(["cast", "present", "total"]), abstainIn = rnd() < 0.3, tie = pick(["none", "chair_casting_vote", "lots"]);
  let rs = applyRecommended(newRuleSet(packs.get("custom-world")!, "meeting", "agm")); rs = setParam(rs, "majority.simple.basis", basis); rs = setParam(rs, "majority.special.basis", basis); rs = setParam(rs, "abstain.inBase", abstainIn); rs = setParam(rs, "tie.break", tie);
  const t = tallyPoint(p, ballots, rs, present, total); const o = oracleTally(p, ballots, { basis, abstainIn, tie, cls, strictSimple: true }, present, total);
  for (let i = 0; i < options.length; i++) { const a = t.options[i]!, b = o.options[i]!; if (a.weight !== b.weight || a.count !== b.count || a.percentBp !== b.percentBp || a.notSelected !== b.notSelected) return `option ${i} ${JSON.stringify(a)} vs ${JSON.stringify(b)}`; }
  if (t.outcome !== o.outcome) return `outcome ${t.outcome} vs ${o.outcome} (cls ${cls} basis ${basis} abstainIn ${abstainIn} present ${present} total ${total} opts ${JSON.stringify(t.options.map((x) => [x.option, x.weight]))} majority ${JSON.stringify(t.majority)})`;
  if (o.ranking) { const r = t.ranking!; if (r.length !== o.ranking.length) return "ranking length"; for (let i = 0; i < r.length; i++) { const a = r[i]!, b = o.ranking[i]!; if (a.option !== b.option || a.rank !== b.rank || a.tied !== b.tied || a.weight !== b.weight) return `ranking ${i} ${JSON.stringify(a)} vs ${JSON.stringify(b)}`; } }
  if (t.castWeight !== castW) return "cast weight"; return null;
});

// ------------------------------------------------------------------ 2. quorum vs oracle
await prop("quorum (weight or flats, strict, cap, ineligible flats) vs oracle", 3_000_000, () => {
  const n = ri(1, 60), flats: Flat[] = Array.from({ length: n }, (_, i) => ({ flatNo: "F" + i, weight: ri(1, 900), eligible: rnd() < 0.9 }));
  const present = flats.filter(() => rnd() < rnd()).map((f) => f.flatNo), weighted = rnd() < 0.5, basis = pick(["weight", "flats"] as const), pct = ri(1, 10000), strict = rnd() < 0.4, cap = rnd() < 0.3 ? ri(1, 30) : null, on = rnd() < 0.9;
  let rs = applyRecommended(newRuleSet(packs.get("custom-world")!, "meeting", "agm")); rs = setOption(rs, "weightage", weighted); rs = setOption(rs, "quorum_check", on);
  rs = setParam(rs, "quorum.basis", basis); rs = setParam(rs, "quorum.percentBp", pct); rs = setParam(rs, "quorum.strict", strict); rs = setParam(rs, "quorum.capFlats", cap);
  const q = computeQuorum(rs, flats, present);
  const el = flats.filter((f) => f.eligible), here = el.filter((f) => present.includes(f.flatNo));
  if (!on) return q.met && !q.enabled ? null : "off but not met";
  const wt = (f: Flat) => BigInt(weighted ? f.weight : 1); const tot = basis === "flats" ? BigInt(el.length) : el.reduce((a, f) => a + wt(f), 0n), got = basis === "flats" ? BigInt(here.length) : here.reduce((a, f) => a + wt(f), 0n);
  const prod = tot * BigInt(pct); let req = prod / 10000n + (prod % 10000n ? 1n : 0n); if (strict && req * 10000n === prod) req += 1n; if (basis === "flats" && cap !== null && req > BigInt(cap)) req = BigInt(cap);
  return q.required === Number(req) && q.present === Number(got) && q.total === Number(tot) && q.met === (got >= req) ? null : `${JSON.stringify(q)} vs req ${req} got ${got} tot ${tot}`;
});

// ------------------------------------------------------------------ 3. ballot validation vs oracle
await prop("ballot validation (min, max, duplicates, unknown option, shape) vs oracle", 10_000_000, () => {
  const nOpt = ri(2, 7), options = Array.from({ length: nOpt }, (_, i) => "o" + i), max = ri(1, nOpt), min = ri(0, max), kind = rnd() < 0.1 ? "discussion" : "election_post";
  const p: PointDef = { pointId: "p", kind: kind as any, options, maxChoices: max, minChoices: min, majorityClass: "simple", secret: true };
  const shape = rnd(); let c: unknown;
  if (shape < 0.05) c = "o1"; else if (shape < 0.1) c = [1, 2]; else if (shape < 0.15) c = null; else { const len = ri(0, nOpt + 2); c = Array.from({ length: len }, () => (rnd() < 0.1 ? "zz" : pick(options))); if (rnd() < 0.2 && (c as string[]).length) (c as string[]).push((c as string[])[0]!); }
  const got = validateBallot(p, c);
  let want: string;
  if (kind === "discussion") want = "not_votable"; else if (!Array.isArray(c) || (c as unknown[]).some((x) => typeof x !== "string")) want = "bad_shape";
  else { const a = c as string[]; if (a.length === 0 && min >= 1) want = "no_choice"; else if (a.length < min) want = "too_few"; else if (new Set(a).size !== a.length) want = "duplicate"; else if (a.length > max) want = "too_many"; else if (a.some((x) => !options.includes(x))) want = "unknown_option"; else want = "ok"; }
  const g = got.ok ? "ok" : got.reason; return g === want ? null : `${g} vs ${want} for ${JSON.stringify(c)} min ${min} max ${max}`;
});

// ------------------------------------------------------------------ 4. passcode state machine vs model
await prop("6-digit passcode lifecycle (issue, wrong tries, lock, expiry, single use, replay, re-issue) vs model", 40_000, async () => {
  const st = new MemoryPasscodeStore(), pepper = "x"; let now = 1000, n = 0;
  type M = { code: string; issued: number; exp: number; tries: number; lockedUntil: number; used: boolean; voided: boolean };
  let model: M | null = null; const E = "e".repeat(32);
  for (let step = 0; step < 25; step++) {
    const act = rnd();
    if (act < 0.2) { const r = await issuePasscode({ store: st, pepper, eventId: E, purpose: "voter", subject: "A", nowMs: now, ttlMs: 900_000, newId: () => "id" + n++ }); if (model && !model.used) model.voided = true; model = { code: r.code, issued: now, exp: now + 900_000, tries: 0, lockedUntil: 0, used: false, voided: false }; }
    else {
      const right = model && rnd() < 0.5; const code = right ? model!.code : String(ri(0, 999999)).padStart(6, "0");
      const got = await verifyPasscode({ store: st, pepper, eventId: E, purpose: "voter", subject: "A", code, nowMs: now });
      let want: string;
      if (!model || model.voided) want = "invalid";
      else if (model.used) want = "used";
      else if (model.lockedUntil > now) want = "locked";
      else if (model.exp <= now) want = "expired";
      else { if (model.lockedUntil && model.lockedUntil <= now) { model.tries = 0; model.lockedUntil = 0; } if (code === model.code) { model.used = true; want = "ok"; } else { model.tries++; if (model.tries >= MAX_TRIES) model.lockedUntil = now + LOCK_MS; want = "invalid"; } }
      const g = got.ok ? "ok" : got.reason; if (g !== want) return `step ${step}: ${g} vs ${want}`;
    }
    now += pick([1, 10, 1000, 60_000, 400_000, 950_000]);
  }
  return null;
});

// ------------------------------------------------------------------ 5. hash chain: any change anywhere is detected
const key = await generateSigningKey(); const EID = "d".repeat(32);
async function chain(n: number) { const out: any[] = []; for (let i = 0; i < n; i++) out.push(await appendEntry({ eid: EID, prev: out[i - 1] ?? null, type: "t" + (i % 5), actor: { system: true }, payload: { i, v: "x".repeat(i % 7) }, ts: 1_700_000_000_000 + i, privateKey: key.privateKeyPkcs8 })); return out; }
const base = await chain(24);
await prop("log chain: random edit, drop, swap, duplicate, forge or truncation is always detected (and the untouched chain always verifies)", 6_000, async () => {
  const c = JSON.parse(JSON.stringify(base)); const k = rnd(); const anchor = { seq: base.length, hash: base[base.length - 1].hash }; // the head is anchored in the sealed report, so a cut tail is detectable
  if (k < 0.1) return (await verifyChain(c, key.publicKeyRaw, anchor)).ok ? null : "honest chain rejected";
  const i = ri(0, c.length - 1);
  if (k < 0.35) { const f = pick(["ts", "type", "payload", "prev", "seq"]); if (f === "payload") c[i].entry.payload.i = (c[i].entry.payload.i as number) + 1; else if (f === "ts" || f === "seq") c[i].entry[f] += 1; else c[i].entry[f] = f === "type" ? "zz" : "0".repeat(64); }
  else if (k < 0.45) c[i].hash = c[i].hash.replace(/./, (x: string) => (x === "a" ? "b" : "a"));
  else if (k < 0.55) c[i].sig = c[i].sig.replace(/./, (x: string) => (x === "A" ? "B" : "A"));
  else if (k < 0.65) c.splice(i, 1); else if (k < 0.75) { const j = ri(0, c.length - 1); if (i === j) return null; [c[i], c[j]] = [c[j], c[i]]; }
  else if (k < 0.85) c.splice(i, 0, JSON.parse(JSON.stringify(c[i])));
  else { const head = { seq: c.length, hash: c[c.length - 1].hash }; const cut = c.slice(0, ri(1, c.length - 1)); return (await verifyChain(cut, key.publicKeyRaw, head)).ok ? "truncation undetected" : null; }
  return (await verifyChain(c, key.publicKeyRaw, anchor)).ok ? `undetected change (kind ${k.toFixed(2)})` : null;
});

// ------------------------------------------------------------------ 6. masking
const A = "abcdefghijklmnopqrstuvwxyz";
const word = (a: number, b: number) => Array.from({ length: ri(a, b) }, () => A[ri(0, 25)]).join("");
await prop("masking: no complete e-mail, phone number or name survives; the originals are always caught by the scanner", 1_000_000, () => {
  const email = `${word(2, 12)}${rnd() < 0.3 ? "." + word(2, 6) : ""}@${word(3, 10)}.${pick(["com", "org", "co.in", "net"])}`;
  const phone = pick(["", "+91 ", "91", "0"]) + String(ri(6, 9)) + String(ri(0, 999999999)).padStart(9, "0"); const name = `${word(3, 9)} ${word(3, 9)}`;
  const m = [maskEmail(email), maskPhone(phone), maskName(name)].join(" | ");
  if (scanPublic(m).length) return "masked output flagged: " + m;
  if (!scanPublic(email).some((f) => f.kind === "email")) return "plain e-mail not caught " + email;
  if (!scanPublic("call " + phone).some((f) => f.kind === "phone")) return "plain phone not caught " + phone;
  const local = email.split("@")[0]!; if (local.length > 3 && maskEmail(email).split("@")[0]!.includes(local.slice(0, 3))) return "e-mail local part leaks " + maskEmail(email);
  for (const w of name.split(" ")) if (w.length > 1 && maskName(name).includes(w.slice(0, 2))) return "name leaks " + maskName(name);
  return null;
});

// ------------------------------------------------------------------ 7. handshake vs model
await prop("4-digit code handshake (open, wrong tries, both confirmations, devices, expiry) vs model", 120_000, async () => {
  const id = "hs_x", eventId = "e".repeat(32), flatNo = "A-1", mon = String(ri(0, 9999)).padStart(4, "0"), vot = String(ri(0, 9999)).padStart(4, "0");
  let h: Handshake = { id, eventId, flatNo, monitorPid: "m", monitorHash: await codeHash("p", { id, eventId, flatNo, side: "monitor", code: mon }), voterHash: await codeHash("p", { id, eventId, flatNo, side: "voter", code: vot }), linkHash: "l", deviceHash: null, uaHash: null, ipHash: null, voterConfirmedMs: null, monitorConfirmedMs: null, triesVoter: 0, triesMonitor: 0, createdMs: 0, expiresMs: 600_000, voidedMs: null, completedMs: null, kind: "official", attendeeName: "x", mobileMasked: null, mobileFp: null, smsConfirmedMs: null };
  let now = 1, dev: string | null = null, tv = 0, tm = 0, vOk = false, mOk = false;
  for (let step = 0; step < 14; step++) {
    const a = rnd(); now += pick([1, 1000, 100_000]); const expired = now >= 600_000, dead = tv >= 5 || tm >= 5;
    if (a < 0.3) { const d = pick(["P1", "P2"]); const r = openLink(h, now, d, "u", "i"); const want = expired ? "expired" : dead ? "dead" : dev && dev !== d ? "wrong_device" : "ok"; const got = r.ok ? "ok" : r.reason; if (got !== want) return `open ${got} vs ${want}`; if (r.ok) { h = r.h; dev = d; } }
    else if (a < 0.65) { const d = pick(["P1", "P2"]), right = rnd() < 0.5, code = right ? mon : String(ri(0, 9999)).padStart(4, "0"); const r = await voterConfirm(h, now, "p", code, d); let want: string;
      if (expired) want = "expired"; else if (dead) want = "dead"; else if (!dev) want = "not_opened"; else if (dev !== d) want = "wrong_device"; else if (code === mon) { want = "ok"; vOk = true; } else { want = "wrong_code"; tv++; }
      const got = r.ok ? "ok" : r.reason; if (got !== want) return `voter ${got} vs ${want}`; h = r.h; }
    else { const d = pick(["P1", "O1"]), right = rnd() < 0.5, code = right ? vot : String(ri(0, 9999)).padStart(4, "0"); const r = await monitorConfirm(h, now, "p", code, d); let want: string;
      if (expired) want = "expired"; else if (dead) want = "dead"; else if (!dev) want = "not_opened"; else if (dev === d) want = "same_device"; else if (code === vot) { want = "ok"; mOk = true; } else { want = "wrong_code"; tm++; }
      const got = r.ok ? "ok" : r.reason; if (got !== want) return `monitor ${got} vs ${want}`; h = r.h;
      if (r.ok && r.complete !== (vOk && mOk)) return "complete flag wrong"; }
  }
  return null;
});

// ------------------------------------------------------------------ 8. reading ticks from photographs
const layout = paperLayout({ options: ["a", "b", "c", "d", "e", "f"], labels: {}, maxChoices: 3, minChoices: 1 }, defaultBallotDesign(), "x", "t");
let uncertain = 0, boxesRead = 0;
await prop("printed ballot reading: ticked boxes read as ticked and empty boxes as empty under noise, offsets and mark styles (a doubtful box is flagged, never guessed)", 3_000, () => {
  const px = pick([3, 4]), w = layout.widthMm * px, h = layout.heightMm * px, g = new Uint8Array(w * h).fill(ri(225, 255)); const jx = rnd() * 0.5 - 0.25, jy = rnd() * 0.5 - 0.25; // within what the corner marks let the app correct
  const rect = (x0: number, y0: number, x1: number, y1: number, v: number) => { for (let y = Math.max(0, Math.round(y0)); y < Math.min(h, Math.round(y1)); y++) for (let x = Math.max(0, Math.round(x0)); x < Math.min(w, Math.round(x1)); x++) g[y * w + x] = v; };
  const want = new Map<string, boolean>();
  for (const r of layout.rows) { const b = r.box, ox = jx * px, oy = jy * px; rect(b.x * px + ox, b.y * px + oy, (b.x + b.w) * px + ox, (b.y + 0.5) * px + oy, ri(0, 40)); rect(b.x * px + ox, (b.y + b.h - 0.5) * px + oy, (b.x + b.w) * px + ox, (b.y + b.h) * px + oy, ri(0, 40)); rect(b.x * px + ox, b.y * px + oy, (b.x + 0.5) * px + ox, (b.y + b.h) * px + oy, ri(0, 40)); rect((b.x + b.w - 0.5) * px + ox, b.y * px + oy, (b.x + b.w) * px + ox, (b.y + b.h) * px + oy, ri(0, 40));
    const ticked = rnd() < 0.4; want.set(r.option, ticked);
    if (ticked) { const style = pick(["fill", "cross", "blob"]); const v = ri(0, 70);
      if (style === "fill") rect((b.x + 1) * px + ox, (b.y + 1) * px + oy, (b.x + b.w - 1) * px + ox, (b.y + b.h - 1) * px + oy, v);
      else if (style === "cross") { const th = pick([0.9, 1.1, 1.4]); for (let t = 0; t <= 1; t += 0.003) for (const [fx, fy] of [[t, t], [t, 1 - t]] as const) rect((b.x + 0.8 + fx * (b.w - 1.6)) * px + ox, (b.y + 0.8 + fy * (b.h - 1.6)) * px + oy, (b.x + 0.8 + fx * (b.w - 1.6) + th) * px + ox, (b.y + 0.8 + fy * (b.h - 1.6) + th) * px + oy, v); }
      else rect((b.x + 1.8) * px + ox, (b.y + 1.8) * px + oy, (b.x + b.w - 1.8) * px + ox, (b.y + b.h - 1.8) * px + oy, v); } }
  const amp = ri(0, 28); let q = ri(1, 1e6); for (let i = 0; i < g.length; i++) { q = (q * 1103515245 + 12345) & 0x7fffffff; g[i] = Math.max(0, Math.min(255, g[i]! + ((q >> 16) % (2 * amp + 1)) - amp)); }
  const read = detectTicks(g, w, h, layout);
  for (const r of read) { boxesRead++; if (r.state === "uncertain") { uncertain++; continue; } if ((r.state === "ticked") !== want.get(r.option)) return `box ${r.option}: read ${r.state}, truth ${want.get(r.option)}`; }
  return null;
});

const total = results.reduce((a, r) => a + r.cases, 0), fails = results.reduce((a, r) => a + r.failures, 0);
const bound = (n: number, conf: number) => (n > 0 ? -Math.log(1 - conf) / n : 1); // zero-failure upper bound on the failure probability per case
console.log(JSON.stringify({ seed: SEED, scale: SCALE, properties: results.length, totalCases: total, failures: fails, uncertainTickReads: `${uncertain} of ${boxesRead}`, upperBound95: bound(total, 0.95), upperBound999: bound(total, 0.999), results }, null, 1));
process.exit(fails ? 1 : 0);

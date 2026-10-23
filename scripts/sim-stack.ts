// End-to-end randomized simulation through the real API handler and the real migrations (SQLite stand-in for D1):
// random societies, packs, rolls, weights, ballot modes (online / printed / either), meetings and elections in every format, with scripted cheaters,
// compared with an independent oracle, and every published record checked (chain, signatures, replay, seal, PDF, privacy, tamper-evidence, append-only).
// Reproducible: SEED=<n> EVENTS=<n> bun scripts/sim-stack.ts. Exit code 1 on any disagreement.
import { H, OFFP, appointVerified, newEvent, flatsOf, ORG, DAY } from "../apps/api/test/harness";
import { detectTicks, extractData, replayLog, scanPublic, verifyReportHtml, verifyChain, type PaperLayout } from "../packages/engine/src";
import { handle } from "../apps/api/src/handler";

const SEED = parseInt(process.env.SEED ?? "7", 10), EVENTS = parseInt(process.env.EVENTS ?? "60", 10);
let s = SEED >>> 0 || 1;
const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
const ri = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
const pick = <T,>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)]!;
const PACKS = ["in-up-aoa", "in-generic-rwa-societies-act-1860", "in-mh-coop-society", "us-hoa-generic", "us-ca", "us-fl", "us-tx", "custom-world"];
const OFFICER_DEV = "device-officer-0000001";
let calls = 0, checks = 0; const failures: string[] = []; const stats: Record<string, number> = {};
const bump = (k: string, n = 1) => { stats[k] = (stats[k] ?? 0) + n; };
const fail = (ev: number, m: string) => { failures.push(`event ${ev}: ${m}`); console.log("FAIL event", ev, m); };

function oracle(kind: string, options: string[], ballots: Array<{ choices: string[]; weight: number }>, cls: string, basis: string, abstainIn: boolean, tie: string, present: number, total: number) {
  const W: Record<string, bigint> = {}, C: Record<string, number> = {}; for (const o of options) { W[o] = 0n; C[o] = 0; }
  let cast = 0n; for (const b of ballots) { cast += BigInt(b.weight); for (const c of b.choices) { W[c]! += BigInt(b.weight); C[c]!++; } }
  const out: any = { options: options.map((o) => ({ option: o, weight: Number(W[o]), count: C[o]!, notSelected: ballots.length - C[o]! })), n: ballots.length, cast: Number(cast) };
  if (kind === "election_post") {
    const cand = options.filter((o) => o !== "abstain").map((o) => ({ o, w: W[o]! })).sort((a, b) => (a.w === b.w ? (a.o < b.o ? -1 : 1) : a.w > b.w ? -1 : 1));
    out.ranking = cand.map((x, i) => ({ option: x.o, rank: 1 + cand.filter((y) => y.w > x.w).length, tied: cand.some((y, j) => j !== i && y.w === x.w) }));
    out.outcome = "counted"; return out;
  }
  const [num, den] = cls === "simple" ? [1n, 2n] : cls === "two_thirds" ? [2n, 3n] : [3n, 4n]; const strict = cls === "simple";
  const yes = W["yes"] ?? 0n, no = W["no"] ?? 0n, ab = W["abstain"] ?? 0n; const base = basis === "total" ? BigInt(total) : basis === "present" ? BigInt(present) : yes + no + (abstainIn ? ab : 0n);
  out.outcome = cls === "simple" && yes === no && base > 0n && basis === "cast" ? (tie !== "none" ? "tie" : "not_carried") : yes > 0n && (strict ? yes * den > base * num : yes * den >= base * num) ? "carried" : "not_carried"; return out;
}
function paperPage(layout: PaperLayout, ticked: string[]) {
  const px = 3, w = layout.widthMm * px, h = layout.heightMm * px, g = new Uint8Array(w * h).fill(250);
  const rect = (x0: number, y0: number, x1: number, y1: number, v: number) => { for (let y = Math.round(y0); y < Math.round(y1); y++) for (let x = Math.round(x0); x < Math.round(x1); x++) g[y * w + x] = v; };
  for (const r of layout.rows) { const b = r.box; rect(b.x * px, b.y * px, (b.x + b.w) * px, (b.y + 0.5) * px, 0); rect(b.x * px, (b.y + b.h - 0.5) * px, (b.x + b.w) * px, (b.y + b.h) * px, 0); rect(b.x * px, b.y * px, (b.x + 0.5) * px, (b.y + b.h) * px, 0); rect((b.x + b.w - 0.5) * px, b.y * px, (b.x + b.w) * px, (b.y + b.h) * px, 0); if (ticked.includes(r.option)) rect((b.x + 1) * px, (b.y + 1) * px, (b.x + b.w - 1) * px, (b.y + b.h - 1) * px, 12); }
  return { g, w, h };
}

async function oneEvent(ev: number) {
  s = ((SEED * 1000003 + ev * 7919) >>> 0) || 1; // every event is reproducible on its own: SEED=<n> ONLY=<event number>
  const h = await H.make(); const T0 = h.now; h.device = OFFICER_DEV;
  const call = async (m: string, p: string, b?: unknown, t?: string) => { calls++; return h.call(m, p, b, t); };
  const need = async (r: Promise<any>, what: string) => { const x = await r; if (x.status >= 300) throw new Error(`${what}: ${x.status} ${JSON.stringify(x.body)}`); return x; };
  const expectStatus = (r: { status: number; body: any }, codes: number[], what: string) => { checks++; if (!codes.includes(r.status)) fail(ev, `${what}: expected ${codes} got ${r.status} ${JSON.stringify(r.body)}`); };
  const kind = rnd() < 0.5 ? "meeting" : "election", pack = pick(PACKS), mode: "online" | "printed" | "either" = pick(["online", "printed", "either"] as const), n = ri(4, 36), weighted = rnd() < 0.4;
  const e = await newEvent(h, { kind, packId: pack, country: pick(["IN", "US", "GB"]), eventType: pick(["agm", "sgm"]) });
  const weights = Array.from({ length: n }, () => (weighted ? ri(1, 40) : 1));
  await need(call("PUT", `/api/events/${e.eid}/roll`, { flats: weights.map((w, i) => ({ flatNo: `F-${i + 1}`, weight: w, eligible: rnd() > 0.05 })) }, e.org), "roll");
  // rules: make every required value present and choose options
  const q = ri(5, 60) * 100; const sets: Record<string, unknown> = { "ballot.mode": mode, "notice.minDays": 1, "notice.maxDays": 365, "quorum.basis": "weight", "quorum.percentBp": q };
  const basis = pick(["cast", "present", "total"]); sets["majority.simple.basis"] = basis; sets["majority.special.basis"] = basis; const abstainIn = rnd() < 0.3; sets["abstain.inBase"] = abstainIn; const tie = pick(["none", "chair_casting_vote", "lots"]); sets["tie.break"] = tie;
  const mh = pack === "in-mh-coop-society"; if (mh) delete sets["quorum.basis"], delete sets["quorum.percentBp"];
  await need(call("PUT", `/api/events/${e.eid}/rules`, { changes: sets, reason: "simulation setup" }, e.org), "rules");
  const optsSet: Record<string, boolean> = { proxy_voting: false, weightage: weighted, quorum_check: true }; if (mh) optsSet.weightage = false;
  const eff = await call("PUT", `/api/events/${e.eid}/options`, { options: optsSet }, e.org); expectStatus(eff, [200, 403], "options"); // 403 only when the law locks a value
  const weightOn = (await call("GET", `/api/events/${e.eid}`)).body.model.options.find((o: any) => o.key === "weightage").value === true;
  // points
  const nPoints = ri(1, 3), points: Array<{ id: string; kind: string; options: string[]; labels: Record<string, string>; cls: string; min: number; max: number; format: string; seats: string[]; topN: number | null }> = [];
  for (let i = 0; i < nPoints; i++) {
    const election = kind === "election" ? true : rnd() < 0.25; const secret = mode !== "online" || election || rnd() < 0.5;
    if (election) {
      const cands = Array.from({ length: ri(2, 6) }, (_, j) => `Candidate ${i}-${j}`); const max = ri(1, cands.length), min = ri(0, max), format = pick(["single_post", "ranked_posts", "top_n"]);
      const body: any = { kind: "election_post", title: `Post ${i + 1}`, candidates: cands, maxChoices: max, minChoices: min, secret: true, format };
      if (format === "ranked_posts") body.seats = Array.from({ length: ri(1, cands.length) }, (_, j) => `Seat ${j + 1}`); if (format === "top_n") body.topN = ri(1, cands.length);
      const r = await need(call("POST", `/api/events/${e.eid}/points`, body, e.org), "point"); const m = (await call("GET", `/api/events/${e.eid}`)).body.model.points.find((x: any) => x.pointId === r.body.pointId);
      points.push({ id: r.body.pointId, kind: "election_post", options: m.options, labels: m.labels, cls: "simple", min, max, format, seats: body.seats ?? [], topN: body.topN ?? null });
    } else {
      const cls = pick(["simple", "two_thirds", "three_quarters"]); const abstain = rnd() < 0.6;
      const r = await need(call("POST", `/api/events/${e.eid}/points`, { kind: "resolution", title: `Resolution ${i + 1}`, secret, majorityClass: cls, abstain }, e.org), "point");
      points.push({ id: r.body.pointId, kind: "resolution", options: ["yes", "no", ...(abstain ? ["abstain"] : [])], labels: {}, cls, min: 1, max: 1, format: "single_post", seats: [], topN: null });
    }
  }
  const pay = await need(call("POST", `/api/events/${e.eid}/pay`, {}, e.org), "pay"); await need(call("POST", "/api/pay/test-confirm", { eventId: e.eid, paymentId: pay.body.paymentId }, e.org), "confirm");
  const officer = rnd() < 0.7 ? await appointVerified(h, e, OFFP, "attendance_officer") : null; const staff = officer?.token ?? e.org;
  const pub = await call("POST", `/api/events/${e.eid}/agenda/publish`, {}, e.org); if (pub.status !== 200) { bump("publish_refused"); expectStatus(pub, [403], "publish"); return; } // e.g. a pack that needs values we did not set
  await need(call("POST", `/api/events/${e.eid}/start`, {}, e.org), "start");
  const model0 = async () => (await call("GET", `/api/events/${e.eid}`)).body.model;
  const roll = (await model0()); const flatsInfo = (await call("GET", `/api/events/${e.eid}/log`)).body.entries.find((x: any) => x.entry.type === "roll_set"); void flatsInfo;
  const rollState = await replayLog((await call("GET", `/api/events/${e.eid}/log`)).body.entries); const eligible = rollState.roll.filter((f) => f.eligible);
  // attendance: some flats present, by handshake or directly
  const present: string[] = []; const presentFraction = rnd() < 0.15 ? 0.1 : 0.5 + rnd() * 0.5; const sessions: Record<string, { token: string; dev: string }> = {};
  let tick = 0; const spread = async () => { if (++tick % 40 === 0) h.now += 61_000; };
  for (const f of eligible) {
    if (rnd() > presentFraction) continue; await spread(); const dev = `device-voter-${String(present.length).padStart(8, "0")}`;
    if (rnd() < 0.5) {
      h.device = OFFICER_DEV; const hs = await need(call("POST", `/api/events/${e.eid}/handshakes`, { flatNo: f.flatNo, attendeeName: `Owner ${f.flatNo}` }, staff), "hs"); if (!officer) { /* organizer acts as officer */ }
      h.device = dev; const pg = await need(call("GET", `/api/h/${hs.body.token}`), "hs open"); await need(call("POST", `/api/h/${hs.body.token}/confirm`, { code: hs.body.monitorCode }), "hs voter");
      h.device = OFFICER_DEV; await need(call("POST", `/api/events/${e.eid}/handshakes/${hs.body.handshakeId}/confirm`, { code: pg.body.voterCode }, staff), "hs officer");
      h.device = dev; const st = await need(call("GET", `/api/h/${hs.body.token}/status`), "hs status"); sessions[f.flatNo] = { token: st.body.token, dev }; bump("check_in_handshake");
    } else { h.device = OFFICER_DEV; await need(call("POST", `/api/events/${e.eid}/attendance`, { flatNo: f.flatNo, attendeeName: `Owner ${f.flatNo}`, mode: "physical", method: "visual" }, staff), "attendance"); bump("check_in_direct"); }
    present.push(f.flatNo);
  }
  if (officer) { h.device = OFFICER_DEV; const bad = await call("POST", `/api/events/${e.eid}/attendance`, { flatNo: present[0] ?? "F-1", attendeeName: "X Y", mode: "physical", method: "visual" }, e.org); expectStatus(bad, [403], "organizer marking attendance when an officer exists"); }
  // voting
  const accepted = new Map<string, Array<{ choices: string[]; weight: number; flat: string }>>(); const paperStats = new Map<string, { serials: number; counted: number; invalid: number; voided: number }>();
  for (const p of points) { accepted.set(p.id, []); paperStats.set(p.id, { serials: 0, counted: 0, invalid: 0, voided: 0 }); }
  const weightOf = (flat: string) => (weightOn ? rollState.roll.find((f) => f.flatNo === flat)!.weight : 1);
  const randChoices = (p: (typeof points)[0]) => { if (p.kind === "resolution") return [pick(p.options)]; const k = ri(p.min, p.max); return [...p.options].sort(() => rnd() - 0.5).slice(0, k).sort(); };
  for (const p of points) {
    h.device = OFFICER_DEV; const open = await call("POST", `/api/events/${e.eid}/points/${p.id}/open`, { minutes: 700 }, e.org);
    const qr = rollState.roll.filter((f) => f.eligible); const prm = (await call("GET", `/api/events/${e.eid}/private`, undefined, e.org)).body.rules.params as Record<string, any>;
    const qbasis = prm["quorum.basis"] as string, qpct = BigInt(prm["quorum.percentBp"]), qstrict = prm["quorum.strict"] === true, qcap = prm["quorum.capFlats"] as number | null;
    const wt = (f: { weight: number }) => BigInt(weightOn ? f.weight : 1); const totalQ = qbasis === "flats" ? BigInt(qr.length) : qr.reduce((a, f) => a + wt(f), 0n), gotQ = qbasis === "flats" ? BigInt(qr.filter((f) => present.includes(f.flatNo)).length) : qr.filter((f) => present.includes(f.flatNo)).reduce((a, f) => a + wt(f), 0n);
    const prod = totalQ * qpct; let needBig = prod / 10000n + (prod % 10000n ? 1n : 0n); if (qstrict && needBig * 10000n === prod) needBig += 1n; if (qbasis === "flats" && qcap && needBig > BigInt(qcap)) needBig = BigInt(qcap);
    const presW = Number(gotQ), totalW = Number(totalQ), needQ = Number(needBig); const shouldOpen = gotQ >= needBig;
    checks++; if ((open.status === 200) !== shouldOpen) { fail(ev, `quorum decision: API ${open.status}, oracle ${shouldOpen} (present ${presW}/${totalW}, need ${needQ}, basis ${qbasis}, strict ${qstrict})`); return; }
    if (!shouldOpen) { bump("quorum_refused"); break; }
    // rule change after opening must be refused
    const rc = await call("PUT", `/api/events/${e.eid}/rules`, { scope: p.id, changes: { "tie.break": "lots" }, reason: "late attempt" }, e.org); expectStatus(rc, [403], "rule change after open");
    const printedHere = mode === "printed" || (mode === "either" && rnd() < 0.5); const papers: Array<{ flat: string; paper: any; ticks: string[] }> = [];
    for (const flat of present) {
      await spread(); const choices = randChoices(p); const secretPoint = p.kind === "election_post" || (await model0()).points.find((x: any) => x.pointId === p.id).secret;
      if (mode === "printed" || (mode === "either" && rnd() < 0.5)) {
        if (!secretPoint) { const r = await call("POST", `/api/events/${e.eid}/points/${p.id}/paper`, { flatNo: flat }, staff); expectStatus(r, [409], "paper on an open-vote point"); continue; }
        h.device = OFFICER_DEV; const r = await call("POST", `/api/events/${e.eid}/points/${p.id}/paper`, { flatNo: flat }, staff); expectStatus(r, [201], "paper issue"); if (r.status !== 201) continue;
        paperStats.get(p.id)!.serials++; if (rnd() < 0.03) { const v = await call("POST", `/api/events/${e.eid}/points/${p.id}/paper/void`, { token: r.body.token, flatNo: flat }, staff); expectStatus(v, [200], "void"); paperStats.get(p.id)!.voided++; const again = await call("POST", `/api/events/${e.eid}/points/${p.id}/paper`, { flatNo: flat }, staff); expectStatus(again, [201], "reissue"); paperStats.get(p.id)!.serials++; papers.push({ flat, paper: again.body, ticks: choices }); }
        else papers.push({ flat, paper: r.body, ticks: choices });
        const dup = await call("POST", `/api/events/${e.eid}/points/${p.id}/paper`, { flatNo: flat }, staff); expectStatus(dup, [409], "second paper for a flat"); bump("paper_issued");
      } else {
        const sess = sessions[flat] ?? (await (async () => { h.device = OFFICER_DEV; const c = await need(call("POST", `/api/events/${e.eid}/passcodes/voter`, { flatNo: flat }, staff), "code"); h.device = `device-pass-${flat}`.padEnd(20, "0"); const l = await need(call("POST", "/api/vote/login", { eventId: e.eid, flatNo: flat, code: c.body.code, turnstile: "test-ok" }), "login"); return { token: l.body.token, dev: h.device }; })());
        sessions[flat] = sess; h.device = sess.dev; const marks = Object.fromEntries(p.options.map((o) => [o, choices.includes(o)]));
        const r = await call("POST", "/api/vote/cast", { pointId: p.id, marks }, sess.token);
        const secretNow = secretPoint; void secretNow; expectStatus(r, [201], "online vote"); if (r.status === 201) { accepted.get(p.id)!.push({ choices, weight: weightOf(flat), flat }); bump("online_vote"); }
        const again = await call("POST", "/api/vote/cast", { pointId: p.id, marks }, sess.token); expectStatus(again, [409], "double vote"); bump("double_vote_refused");
      }
    }
    if (mode === "printed") { const r = await call("POST", "/api/vote/cast", { pointId: p.id, choices: [p.options[0]!] }, sessions[present[0] ?? ""]?.token ?? "0".repeat(64)); expectStatus(r, [401, 403, 409], "online cast on printed-only vote"); }
    h.device = OFFICER_DEV; const cl = await call("POST", `/api/events/${e.eid}/points/${p.id}/close`, {}, e.org); expectStatus(cl, [200], "close point");
    const late = sessions[present[0] ?? ""]; if (late) { h.device = late.dev; const r = await call("POST", "/api/vote/cast", { pointId: p.id, choices: [p.options[0]!] }, late.token); expectStatus(r, [403, 409, 401], "vote after close"); }
    // photograph the returned papers in random order; some are over-ticked, some never come back
    h.device = OFFICER_DEV; papers.sort(() => rnd() - 0.5);
    for (const pp of papers) {
      if (rnd() < 0.04) continue; // never returned
      let ticks = pp.ticks; const over = rnd() < 0.05 && p.max < p.options.length; if (over) ticks = [...p.options].slice(0, p.max + 1);
      const img = paperPage(pp.paper.layout, ticks); const read = detectTicks(img.g, img.w, img.h, pp.paper.layout); checks++; if (read.some((r) => r.state === "uncertain")) { fail(ev, "clean synthetic page read as uncertain"); continue; }
      const marks = Object.fromEntries(read.map((r) => [r.option, r.state === "ticked"]));
      const sc = await call("POST", `/api/events/${e.eid}/points/${p.id}/paper/scan`, { token: pp.paper.token, marks, imageSha256: "c".repeat(64) }, staff);
      const validBallot = ticks.length >= p.min && ticks.length <= p.max; expectStatus(sc, validBallot ? [201] : [200], "scan");
      if (sc.status === 201 && validBallot) { accepted.get(p.id)!.push({ choices: [...ticks].sort(), weight: weightOf(pp.flat), flat: pp.flat }); paperStats.get(p.id)!.counted++; bump("paper_counted"); } else { paperStats.get(p.id)!.invalid++; bump("paper_invalid"); }
      if (rnd() < 0.1) { const dup = await call("POST", `/api/events/${e.eid}/points/${p.id}/paper/scan`, { token: pp.paper.token, marks, imageSha256: "c".repeat(64) }, staff); expectStatus(dup, [409], "same paper scanned twice"); }
    }
    if (rnd() < 0.3) { const forged = await call("POST", `/api/events/${e.eid}/points/${p.id}/paper/scan`, { token: "bp_" + "a".repeat(12) + "." + "b".repeat(16), marks: {}, imageSha256: "d".repeat(64) }, staff); expectStatus(forged, [400, 403, 409], "forged paper"); }
    if (paperStats.get(p.id)!.serials > 0) { const fin = await call("POST", `/api/events/${e.eid}/points/${p.id}/count/finish`, {}, e.org); expectStatus(fin, [200], "finish count"); }
    h.now += 61_000;
  }
  const closed = await call("POST", `/api/events/${e.eid}/close`, {}, e.org); expectStatus(closed, [200], "close event"); if (closed.status !== 200) return;
  // ------------- compare with the oracle
  const m = (await call("GET", `/api/events/${e.eid}`)).body.model; const lg = (await call("GET", `/api/events/${e.eid}/log`)).body; const st = await replayLog(lg.entries);
  const qrs = st.roll.filter((f) => f.eligible); for (const p of points) {
    const pv = m.points.find((x: any) => x.pointId === p.id); if (!pv || !pv.tally) { if (pv?.state === "pending") continue; fail(ev, `no result for ${p.id}`); continue; }
    const pres = qrs.filter((f) => present.includes(f.flatNo)).reduce((a, f) => a + (weightOn ? f.weight : 1), 0), tot = qrs.reduce((a, f) => a + (weightOn ? f.weight : 1), 0);
    const o = oracle(p.kind, p.options, accepted.get(p.id)!, p.cls, basis, abstainIn, tie, pres, tot); const t = pv.tally; checks++;
    const same = t.ballots === o.n && t.castWeight === o.cast && t.outcome === o.outcome && o.options.every((x: any, i: number) => t.options[i].option === x.option && t.options[i].weight === x.weight && t.options[i].count === x.count && t.options[i].notSelected === x.notSelected) &&
      (!o.ranking || o.ranking.every((x: any, i: number) => t.ranking[i].option === x.option && t.ranking[i].rank === x.rank && t.ranking[i].tied === x.tied));
    if (!same) fail(ev, `result differs for ${p.id} (${p.kind}, ${p.cls}, mode ${mode}): engine ${JSON.stringify({ n: t.ballots, w: t.castWeight, o: t.outcome })} oracle ${JSON.stringify({ n: o.n, w: o.cast, o: o.outcome })}`);
    const ps = paperStats.get(p.id)!; if (ps.serials) { checks++; const got = pv.paper; if (!got || got.serials !== ps.serials || got.counted !== ps.counted || got.invalid !== ps.invalid || got.voided !== ps.voided) fail(ev, `paper accounts differ ${JSON.stringify(got)} vs ${JSON.stringify(ps)}`); }
    bump("results_checked");
  }
  // ------------- the published record
  const page = (await call("GET", `/api/r/${e.eid}`)).text, pk = (await call("GET", "/api/pubkey")).body.publicKey; checks += 6;
  const v = await verifyReportHtml(page, { publicKey: pk }); if (!v.ok) fail(ev, "sealed report does not verify: " + v.problems.join("; "));
  if ((await verifyChain(lg.entries, pk)).ok !== true) fail(ev, "chain does not verify"); if (st.problems.length) fail(ev, "replay problems: " + st.problems.slice(0, 3).join(" | "));
  const pdfRes = await handle(new Request(`http://x/api/r/${e.eid}/pdf`, { headers: { "cf-connecting-ip": "1.1.1.1" } }), h.env, h.now); const pdf = new Uint8Array(await pdfRes.arrayBuffer());
  if (pdfRes.status !== 200 || new TextDecoder("latin1").decode(pdf.slice(0, 5)) !== "%PDF-") fail(ev, "PDF not produced");
  const pdfText = [...new TextDecoder("latin1").decode(pdf).matchAll(/\((.*)\) Tj ET/g)].map((x) => x[1]).join("\n");
  const priv = [ORG.email, ORG.phone, ORG.name, OFFP.email, OFFP.phone, "device-voter-", OFFICER_DEV, "9.9.9."];
  for (const [what, text] of [["page", page], ["log", JSON.stringify(lg)], ["pdf", pdfText]] as const) { const f = scanPublic(text, { allow: ["REG/2020/118"], forbidden: priv }); if (f.length) { const at = text.indexOf(f[0]!.sample); fail(ev, `${what} leaks ${JSON.stringify(f[0])} in ${JSON.stringify(text.slice(Math.max(0, at - 60), at + 70))}`); } }
  for (let k = 0; k < 3; k++) { const pos = ri(0, page.length - 1); const bad = page.slice(0, pos) + (page[pos] === "a" ? "b" : "a") + page.slice(pos + 1); checks++; if ((await verifyReportHtml(bad, { publicKey: pk })).ok) fail(ev, `a changed byte at ${pos} went unnoticed`); bump("tamper_probes"); }
  for (const t of ["log_entries", "voter_ledger", "ballot_box", "reports", "attendance", "paper_serials", "access_audit"]) { checks += 2; let a = false, b = false; try { h.raw.query(`UPDATE ${t} SET event_id = event_id`).run(); } catch { a = true; } try { h.raw.query(`DELETE FROM ${t}`).run(); } catch { b = true; } const rows = (h.raw.query(`SELECT COUNT(*) c FROM ${t}`).get() as any).c; if (rows > 0 && !(a && b)) fail(ev, `${t} accepted an update or delete`); }
  const cols = (h.raw.query("PRAGMA table_info(ballot_box)").all() as any[]).map((c) => c.name); checks++; if (cols.some((c) => ["flat_no", "ip", "ip_hash", "device", "device_hash", "session", "at_ms", "voted_ms", "ts"].includes(c))) fail(ev, "ballot box has an identifying column");
  const aud = JSON.stringify(h.raw.query("SELECT ct FROM access_audit").all()); checks++; if (aud.includes("Candidate") || aud.includes("choices")) fail(ev, "audit rows contain choices");
  const after = await call("POST", `/api/events/${e.eid}/points`, { kind: "discussion", title: "Late addition" }, e.org); expectStatus(after, [403], "change after publication");
  void T0; void DAY; void flatsOf; void roll; bump(`mode_${mode}`); bump(`kind_${kind}`); bump(`pack_${pack}`);
}

const t0 = performance.now(); let done = 0;
for (let ev = 1; ev <= EVENTS; ev++) {
  if (process.env.ONLY && parseInt(process.env.ONLY, 10) !== ev) continue;
  try { await oneEvent(ev); done++; } catch (e: any) { fail(ev, "crashed: " + String(e?.stack ?? e).split(String.fromCharCode(10)).join(" | ").slice(0, 700)); }
  if (ev % 10 === 0) console.log(`... ${ev}/${EVENTS} events, ${calls} API calls, ${checks} checks, ${failures.length} failures`);
}
const bound = (n: number, c: number) => (n > 0 ? -Math.log(1 - c) / n : 1);
const out = { seed: SEED, events: EVENTS, completed: done, apiCalls: calls, checks, failures: failures.length, seconds: Math.round((performance.now() - t0) / 1000), upperBoundPerCheck95: bound(checks, 0.95), upperBoundPerEvent95: bound(done, 0.95), stats, firstFailures: failures.slice(0, 10) };
console.log(JSON.stringify(out, null, 1)); process.exit(failures.length ? 1 : 0);

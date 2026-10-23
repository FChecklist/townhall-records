// Measures the server-side cost of a 120-flat AGM with 5 points (in-memory SQLite stand-in for D1, so it measures OUR code, not network).
import { H, OFFP, appointVerified, newEvent, flatsOf } from "../apps/api/test/harness";
import { replayLog, verifyChain } from "../packages/engine/src";
const h = await H.make();
const e = await newEvent(h);
const ok = async (p: Promise<any>) => { const r = await p; if (r.status >= 300) throw new Error(r.text); return r; };
await ok(h.call("PUT", `/api/events/${e.eid}/roll`, { flats: flatsOf(120) }, e.org));
const pts: string[] = [];
for (let i = 0; i < 5; i++) pts.push((await ok(h.call("POST", `/api/events/${e.eid}/points`, { kind: "resolution", title: "Resolution " + (i + 1), secret: i % 2 === 1 }, e.org))).body.pointId);
const pay = await ok(h.call("POST", `/api/events/${e.eid}/pay`, {}, e.org)); await ok(h.call("POST", "/api/pay/test-confirm", { eventId: e.eid, paymentId: pay.body.paymentId }, e.org));
const off = await appointVerified(h, e, OFFP, "attendance_officer");
await ok(h.call("POST", `/api/events/${e.eid}/agenda/publish`, {}, e.org)); await ok(h.call("POST", `/api/events/${e.eid}/start`, {}, e.org));
for (let i = 0; i < 100; i++) { if (i % 50 === 0) h.now += 61_000; await ok(h.call("POST", `/api/events/${e.eid}/attendance`, { flatNo: `A-${101 + i}`, attendeeName: "Owner " + i, mode: "physical", method: "visual" }, off.token)); }
const voters: string[] = [];
for (let i = 0; i < 100; i++) { if (i % 50 === 0) h.now += 61_000; const c = await ok(h.call("POST", `/api/events/${e.eid}/passcodes/voter`, { flatNo: `A-${101 + i}` }, off.token)); const l = await ok(h.call("POST", "/api/vote/login", { eventId: e.eid, flatNo: `A-${101 + i}`, code: c.body.code, turnstile: "test-ok" })); voters.push(l.body.token); }
const times: number[] = [];
for (const pid of pts) {
  await ok(h.call("POST", `/api/events/${e.eid}/points/${pid}/open`, { minutes: 30 }, e.org));
  h.now += 61_000;
  for (let i = 0; i < 100; i++) { if (i % 50 === 0) h.now += 61_000; const t = performance.now(); await ok(h.call("POST", "/api/vote/cast", { pointId: pid, choices: [i % 4 ? "yes" : "no"] }, voters[i])); times.push(performance.now() - t); }
  await ok(h.call("POST", `/api/events/${e.eid}/points/${pid}/close`, {}, e.org));
}
const tc = performance.now(); await ok(h.call("POST", `/api/events/${e.eid}/close`, {}, e.org)); const closeMs = performance.now() - tc;
const log = (await h.call("GET", `/api/events/${e.eid}/log`)).body;
const page = await h.call("GET", `/api/r/${e.eid}`);
const t0 = performance.now(); await replayLog(log.entries); const replayMs = performance.now() - t0;
const t1 = performance.now(); const v = await verifyChain(log.entries, log.publicKey); const verifyMs = performance.now() - t1;
times.sort((a, b) => a - b);
console.log(JSON.stringify({ flats: 120, points: 5, ballots: 500, logEntries: log.entries.length, voteCastMs: { p50: +times[250]!.toFixed(1), p95: +times[475]!.toFixed(1), max: +times.at(-1)!.toFixed(1) }, closeEventMs: +closeMs.toFixed(0), replayMs: +replayMs.toFixed(1), verifyChainMs: +verifyMs.toFixed(0), chainOk: v.ok, reportKB: +(page.text.length / 1024).toFixed(0), logRowsReadPerVote: log.entries.length > 0 ? "up to " + log.entries.length : 0 }, null, 1));

import { describe, expect, test } from "bun:test";
import { appendEntry, genesisHash, verifyChain, type SignedEntry } from "../src/log";
import { generateSigningKey } from "../src/crypto";
import { buildReportModel, extractData, extractSeal, verifyReportHtml, verifyEmbedded, stripSeal, fileDigest } from "../src/model";
import { renderReportHtml, sealReport } from "../src/render";
import { replayLog } from "../src/replay";
import { scanPublic } from "../src/masking";
import { cloneTemplate } from "../src/clone";
import { progressOf } from "../src/progress";
import { VERIFIER_JS } from "../src/verifier.generated";
import { HOST, OFFICER, ORG, PRIVATE_STRINGS, Scenario, testKey } from "./helpers";

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

describe("signed hash chain", () => {
  test("an honest log verifies, with and without an anchored head", async () => {
    const s = await Scenario.fullMeeting();
    const k = await testKey();
    const r = await verifyChain(s.entries, k.publicKeyRaw, { seq: 5, hash: s.entries[4]!.hash });
    expect(r.ok).toBe(true); expect(r.count).toBe(s.entries.length);
    expect(s.entries[0]!.entry.prev).toBe(await genesisHash(s.eid));
  });
  test("EDIT a payload byte -> flagged (hash mismatch)", async () => {
    const s = await Scenario.fullMeeting(); const k = await testKey();
    const e = clone(s.entries); (e[9]!.entry.payload as any).flatNo = "A-999";
    const r = await verifyChain(e, k.publicKeyRaw);
    expect(r.ok).toBe(false); expect(r.problems[0]).toMatchObject({ reason: "hash_mismatch" });
  });
  test("DROP an entry -> flagged; REORDER -> flagged", async () => {
    const s = await Scenario.fullMeeting(); const k = await testKey();
    const dropped = clone(s.entries); dropped.splice(6, 1);
    expect((await verifyChain(dropped, k.publicKeyRaw)).problems[0]!.reason).toBe("seq_gap");
    const swapped = clone(s.entries); [swapped[6], swapped[7]] = [swapped[7]!, swapped[6]!];
    expect((await verifyChain(swapped, k.publicKeyRaw)).ok).toBe(false);
  });
  test("FORGE: a re-hashed edit without the key fails on the signature; so does another key", async () => {
    const s = await Scenario.fullMeeting(); const k = await testKey(); const other = await generateSigningKey();
    // attacker rewrites entry 9 and every later hash/link (a DB admin can do that) but cannot sign
    const forged = clone(s.entries) as SignedEntry[];
    (forged[8]!.entry.payload as any).flatNo = "A-999";
    const { entryHash } = await import("../src/log");
    let prev = forged[7]!.hash;
    for (let i = 8; i < forged.length; i++) { forged[i]!.entry.prev = prev; forged[i]!.hash = await entryHash(forged[i]!.entry); prev = forged[i]!.hash; }
    expect((await verifyChain(forged, k.publicKeyRaw)).problems[0]).toMatchObject({ seq: 9, reason: "bad_signature" });
    expect((await verifyChain(s.entries, other.publicKeyRaw)).ok).toBe(false);
  });
  test("TRUNCATED tail is caught by an anchored head; a rewritten chain by the head hash", async () => {
    const s = await Scenario.fullMeeting(); const k = await testKey();
    const head = { seq: s.entries.length, hash: s.entries.at(-1)!.hash };
    const cut = s.entries.slice(0, -3);
    expect((await verifyChain(cut, k.publicKeyRaw)).ok).toBe(true); // alone, a clean prefix looks fine ...
    expect((await verifyChain(cut, k.publicKeyRaw, head)).problems[0]!.reason).toBe("truncated"); // ... the anchor exposes it
    expect((await verifyChain(s.entries, k.publicKeyRaw, { seq: 5, hash: "0".repeat(64) })).problems[0]!.reason).toBe("head_mismatch");
  });
  test("a payload carrying a full e-mail or phone number cannot even be written", async () => {
    const k = await testKey();
    await expect(appendEntry({ eid: "x".repeat(32), prev: null, type: "t", actor: { system: true }, payload: { who: "rajat@gmail.com" }, ts: 1, privateKey: k.privateKeyPkcs8 })).rejects.toThrow(/not masked/);
    await expect(appendEntry({ eid: "x".repeat(32), prev: null, type: "t", actor: { system: true }, payload: { who: "9876543210" }, ts: 1, privateKey: k.privateKeyPkcs8 })).rejects.toThrow(/not masked/);
  });
});

describe("replay semantics (the verifier also re-checks the rules)", () => {
  test("an honest meeting replays with zero problems and the right result", async () => {
    const s = await Scenario.fullMeeting();
    const st = await s.state();
    expect(st.problems).toEqual([]);
    expect(st.status).toBe("closed");
    const t = st.results.get("pt_1")!;
    expect(t.outcome).toBe("carried");
    expect(t.options.find((o) => o.option === "yes")!.count).toBe(6);
  });
  test("VOTE TWICE, VOTE BEFORE PRESENT, VOTE AFTER CLOSE written into a log are all flagged by replay", async () => {
    const s = await Scenario.create();
    await s.addPoint("pt_1", "1"); await s.pay(); await s.publish(); await s.start();
    await s.attend("A-101"); await s.open("pt_1");
    await s.voteOpen("A-101", "pt_1", ["yes"]);
    await s.voteOpen("A-101", "pt_1", ["no"]); // twice
    await s.voteOpen("A-105", "pt_1", ["yes"]); // not present
    await s.close("pt_1");
    await s.voteOpen("A-101", "pt_1", ["yes"]); // after close
    const p = (await s.state()).problems.join(" | ");
    expect(p).toContain("voted twice"); expect(p).toContain("without being marked present"); expect(p).toContain("while it was closed");
  });
  test("a doctored result is flagged: result_computed that does not match the votes", async () => {
    const s = await Scenario.fullMeeting();
    const st = await s.state();
    const bad = await Scenario.create(); await bad.addPoint("pt_1", "1"); await bad.pay(); await bad.publish(); await bad.start();
    await bad.attend("A-101"); await bad.open("pt_1"); await bad.voteOpen("A-101", "pt_1", ["no"]);
    await bad.add("point_closed", bad.org, { pointId: "pt_1", by: ORG.pid });
    const fake = JSON.parse(JSON.stringify(st.results.get("pt_1")!)); // the 6-yes result of the other meeting
    await bad.add("result_computed", { system: true }, { pointId: "pt_1", tally: fake });
    expect((await bad.state()).problems.join()).toContain("does not match the recomputed tally");
  });
  test("RULE CHANGE after voting opened on that point is flagged by replay", async () => {
    const s = await Scenario.create();
    await s.addPoint("pt_1", "1"); await s.pay(); await s.publish(); await s.start(); await s.attend("A-101"); await s.open("pt_1");
    await s.add("rule_changed", s.org, { scope: "pt_1", param: "tie.break", old: "none", new: "lots", reason: "x" });
    expect((await s.state()).problems.join()).toContain("rule changed after point");
  });
  test("secret ballot: the sealed box must match the flats that voted (stuffed box flagged)", async () => {
    const s = await Scenario.create();
    await s.addPoint("pt_1", "1", { secret: true }); await s.pay(); await s.publish(); await s.start(); await s.attend("A-101"); await s.attend("A-102"); await s.open("pt_1");
    await s.voteSecret("A-101", "pt_1", ["yes"]);
    s.ballots.get("pt_1")!.push({ receipt: "f".repeat(64), choices: ["yes"], weight: 1, kind: "official" }); // an extra ballot nobody cast
    await s.close("pt_1");
    expect((await s.state()).problems.join()).toContain("ballot box holds 2 ballots but 1 flats voted");
  });
});

describe("the public page / report", () => {
  async function built(secret = false) {
    const s = await Scenario.fullMeeting(secret);
    const k = await testKey();
    const st = await s.state(); const model = buildReportModel(st);
    const html0 = renderReportHtml(model, s.entries, k.publicKeyRaw, k.kid);
    const { html, seal } = await sealReport(html0, model, k.privateKeyPkcs8, k.kid);
    return { s, k, st, model, html0, html, seal };
  }
  test("deterministic: the same log renders the same bytes", async () => {
    const a = await built(), b = await built();
    expect(a.html0).toBe(b.html0);
  });
  test("a sealed report verifies end to end (seal, chain, signatures, replay, figures)", async () => {
    const { html, k } = await built();
    const v = await verifyReportHtml(html, { publicKey: k.publicKeyRaw });
    expect(v).toMatchObject({ ok: true, seal: true, chain: true, model: true, resultsMatch: true });
    expect(v.problems).toEqual([]);
  });
  test("TAMPER with the downloaded file -> flagged: static text, embedded figures, a log hash, the seal, the key", async () => {
    const { html, k, seal } = await built();
    const t1 = html.replace("Green Park Apartments", "Green Park Apartmentz"); // visible text
    expect((await verifyReportHtml(t1)).ok).toBe(false);
    const t2 = html.replace("Approve the accounts", "Approve the account5"); // inside the embedded JSON too
    expect((await verifyReportHtml(t2)).ok).toBe(false);
    const t3 = html.replace(seal.sig, seal.sig.slice(0, -2) + (seal.sig.endsWith("AA") ? "BB" : "AA"));
    expect((await verifyReportHtml(t3)).seal).toBe(false);
    const d = extractData(html)!; const h0 = d.log[3]!.hash; const t4 = html.split(h0).join("0".repeat(64));
    expect((await verifyReportHtml(t4)).ok).toBe(false);
    const other = await generateSigningKey();
    expect((await verifyReportHtml(html, { publicKey: other.publicKeyRaw })).ok).toBe(false);
    expect((await verifyReportHtml(html, { expectedFileSha256: "0".repeat(64) })).digestMatches).toBe(false);
    expect((await verifyReportHtml(html, { expectedFileSha256: seal.fileSha256 })).ok).toBe(true);
    expect((await verifyReportHtml("<html>nothing</html>")).ok).toBe(false);
  });
  test("a doctored figure that is re-signed by an attacker without the key still fails (signature)", async () => {
    const { html, s } = await built();
    const d = extractData(html)!; d.model.points[0]!.tally!.outcome = "not_carried" as any;
    const swapped = html.replace(/<script type="application\/json" id="aoa-data">[\s\S]*?<\/script>/, `<script type="application/json" id="aoa-data">${JSON.stringify(d)}</script>`);
    const v = await verifyReportHtml(swapped);
    expect(v.ok).toBe(false); expect(s.entries.length).toBeGreaterThan(5);
  });
  test("a validly SIGNED file whose displayed figures disagree with the log is flagged (a buggy or dishonest generator)", async () => {
    const { s, k, st } = await built();
    const model = structuredClone(buildReportModel(st)); model.points[0]!.tally!.options[0]!.count = 99; // report says 99 yes votes
    const { html } = await sealReport(renderReportHtml(model, s.entries, k.publicKeyRaw, k.kid), model, k.privateKeyPkcs8, k.kid);
    const v = await verifyReportHtml(html);
    expect(v.seal).toBe(true); expect(v.chain).toBe(true); // the signature and the chain are fine ...
    expect(v.model).toBe(false); expect(v.ok).toBe(false); // ... but the figures are not what the log produces
    expect(v.problems.join()).toContain("displayed figures do not match the log");
  });
  test("PUBLIC OUTPUT contains no complete e-mail, phone number or person name (scanner over HTML, JSON and log)", async () => {
    const { html, s, model } = await built();
    // staff and an attendee all have real-looking private contacts in the test data
    await s.appoint(HOST, "host", ORG.pid); await s.appoint(OFFICER, "attendance_officer", HOST.pid);
    const st = await s.state(); const m2 = buildReportModel(st); const k = await testKey();
    const page = renderReportHtml(m2, s.entries, k.publicKeyRaw, k.kid);
    for (const text of [html, page, JSON.stringify(model), JSON.stringify(s.entries), JSON.stringify(m2)]) {
      expect(scanPublic(text, { allow: ["REG/2020/118"], forbidden: PRIVATE_STRINGS })).toEqual([]);
    }
    expect(page).toContain("R**** A*****"); expect(page).toContain("ra****@e****.org".replace("ra", "ra"));
  });
  test("the embedded verifier bundle is current with the source and runs in a bare JS context", async () => {
    expect(VERIFIER_JS.length).toBeGreaterThan(5000);
    const g: any = { crypto: globalThis.crypto, TextEncoder, TextDecoder, atob, btoa };
    new Function("globalThis", "crypto", "TextEncoder", "TextDecoder", "atob", "btoa", VERIFIER_JS)(g, g.crypto, TextEncoder, TextDecoder, atob, btoa);
    expect(typeof g.aoaVerify.verifyReportHtml).toBe("function");
    const { html } = await built();
    expect((await g.aoaVerify.verifyReportHtml(html)).ok).toBe(true);
    const rebuilt = await Bun.build({ entrypoints: ["packages/engine/src/browser-verifier.ts"], target: "browser", format: "iife", minify: true });
    expect(await rebuilt.outputs[0]!.text()).toBe(VERIFIER_JS);
  });
  test("LIVE then FINAL: the same page is a live dashboard mid-event and a sealed report after close", async () => {
    const s = await Scenario.create();
    await s.addPoint("pt_1", "1", { secret: true }); await s.pay(); await s.publish(); await s.start();
    for (let i = 0; i < 4; i++) await s.attend(`A-${101 + i}`);
    await s.open("pt_1"); await s.voteSecret("A-101", "pt_1", ["yes"]); await s.voteSecret("A-102", "pt_1", ["no"]);
    const k = await testKey(); const st = await s.state(); const live = buildReportModel(st);
    const page = renderReportHtml(live, s.entries, k.publicKeyRaw, k.kid);
    expect(live.live).toBe(true); expect(live.phase).toBe("voting_day");
    expect(page).toContain("LIVE"); expect(page).toContain("2</b> of <b>4</b> present flats have voted");
    expect(page).toContain("Totals appear when voting on this secret ballot closes"); // no running totals on a secret ballot
    expect(live.points[0]!.tally).toBeNull();
    const ve = await verifyEmbedded(extractData(page)!);
    expect(ve.ok).toBe(true); // the unsealed live page is still chain+signature+figures verifiable
    await s.close("pt_1"); await s.closeEvent();
    const fin = buildReportModel(await s.state());
    expect(fin.live).toBe(false); expect(fin.phase).toBe("report"); expect(fin.points[0]!.tally!.ballots).toBe(2); expect(fin.points[0]!.receipts!.length).toBe(2);
  });
  test("attendance line: zero officers -> 'not independently verified'; with a verified officer marking -> 'independently verified'", async () => {
    const a = await Scenario.fullMeeting();
    expect(buildReportModel(await a.state()).attendance.line).toBe("Attendance was not independently verified.");
    const s = await Scenario.create();
    await s.addPoint("pt_1", "1"); await s.pay(); await s.publish();
    await s.appoint(OFFICER, "attendance_officer", ORG.pid);
    await s.start(); await s.attend("A-101", { pid: OFFICER.pid, role: "attendance_officer" }, true);
    expect(buildReportModel(await s.state()).attendance.line).toBe("Attendance was independently verified by 1 Attendance Officer.");
  });
  test("provenance: who appointed whom is a tree rooted at the Organizer", async () => {
    const s = await Scenario.create();
    await s.appoint(HOST, "host", ORG.pid); await s.appoint(OFFICER, "attendance_officer", HOST.pid);
    const m = buildReportModel(await s.state());
    expect(m.tree.length).toBe(1); expect(m.tree[0]!.roles).toEqual(["organizer"]);
    expect(m.tree[0]!.children[0]!.roles).toEqual(["host"]); expect(m.tree[0]!.children[0]!.children[0]!.roles).toEqual(["attendance_officer"]);
  });
});

describe("clone from an old event", () => {
  test("copies profile, pack, options, flats, agenda structure, labels; NEVER contacts, passcodes, images, votes, attendance", async () => {
    const s = await Scenario.fullMeeting();
    await s.appoint(HOST, "host", ORG.pid); await s.add("label_set", s.org, { pid: HOST.pid, label: "Treasurer" });
    const st = await s.state();
    const t = cloneTemplate(st, { cloneIsVerifiedOrganizerOfSource: false, wantPrivateRoll: true });
    const dump = JSON.stringify(t);
    expect(t.society.registrationNo).toBe("REG/2020/118"); expect(t.flats.length).toBe(10); expect(t.points[0]!.title).toBe("Approve the accounts"); expect(t.labels).toEqual(["Treasurer"]);
    expect(t.packId).toBe("in-up-aoa"); expect(t.createdFrom).toBe(st.eid);
    expect(t.includePrivateRoll).toBe(false); // not the verified Organizer: contact roll is never offered
    for (const bad of [...PRIVATE_STRINGS, "p_org", "passcode", "evidence", "receipt", "\"mode\""]) expect(dump.toLowerCase()).not.toContain(bad.toLowerCase());
    for (const key of ["people", "votes", "ballots", "attendance", "payments", "passcodes", "images", "contacts", "scheduledMs"]) expect(Object.keys(t)).not.toContain(key);
    expect(cloneTemplate(st, { cloneIsVerifiedOrganizerOfSource: true, wantPrivateRoll: true }).includePrivateRoll).toBe(true);
  });
});

describe("progress (the step-by-step console)", () => {
  test("8 steps, big picture keys, percent grows as steps complete; next step is 'current'", async () => {
    const s = await Scenario.create();
    let p = progressOf(await s.state());
    expect(p.steps.length).toBe(8); expect(p.steps.every((x) => x.icon && x.title.en && x.title.hi)).toBe(true);
    expect(p.steps[0]!.status).toBe("done"); expect(p.currentId).toBe("agenda"); expect(p.percent).toBeLessThan(60);
    await s.addPoint("pt_1", "1"); await s.pay(); p = progressOf(await s.state());
    expect(p.currentId).toBe("publish"); expect(p.steps.find((x) => x.id === "helpers")!.optional).toBe(true);
    await s.publish(); await s.start(); await s.attend("A-101"); p = progressOf(await s.state());
    expect(p.phase).toBe("voting_day"); expect(p.voting!.flatsPresent).toBe(1); expect(p.currentId).toBe("day");
    await s.open("pt_1"); await s.close("pt_1"); await s.closeEvent(); p = progressOf(await s.state());
    expect(p.percent).toBe(100); expect(p.phase).toBe("report");
  });
  test("an unverified organizer is stuck on step 1; later steps are blocked", async () => {
    const s = await Scenario.create(); const k = await testKey();
    const fresh = await Scenario.create(); fresh.entries.splice(3); // keep created, rules, appointment (no email_verified yet)
    void s; void k;
    const p = progressOf(await fresh.state());
    expect(p.currentId).toBe("email"); expect(p.steps.find((x) => x.id === "pay")!.status).toBe("blocked");
  });
});
void stripSeal; void fileDigest; void extractSeal;

describe("a damaged or hostile report never crashes the verifier", () => {
  test("missing keys, wrong types, null entries, empty logs and garbage all produce 'not verified', never an exception", async () => {
    const s = await Scenario.fullMeeting(); const k = await testKey(); const model = buildReportModel(await s.state());
    const { html } = await sealReport(renderReportHtml(model, s.entries, k.publicKeyRaw, k.kid), model, k.privateKeyPkcs8, k.kid);
    const swap = (mut: (d: any) => void) => { const d = extractData(html)!; mut(d); return html.replace(/<script type="application\/json" id="aoa-data">[\s\S]*?<\/script>/, `<script type="application/json" id="aoa-data">${JSON.stringify(d)}</script>`); };
    const variants = [
      swap((d) => { d.log[0].ontry = d.log[0].entry; delete d.log[0].entry; }), swap((d) => { d.log[2] = null; }), swap((d) => { d.log = []; }), swap((d) => { d.log = "x"; }), swap((d) => { d.log[1].entry.seq = "1"; }),
      swap((d) => { d.log[1].hash = 5; }), swap((d) => { d.log[0].entry.eid = 7; }), swap((d) => { delete d.model; }), swap((d) => { d.publicKey = 5; }), "<html></html>", "", "<!--SEAL--><!--/SEAL-->", html.replace('id="aoa-data">', 'id="aoa-data">{{{'),
    ];
    for (const v of variants) { const r = await verifyReportHtml(v); expect(r.ok).toBe(false); expect(Array.isArray(r.problems)).toBe(true); }
    expect((await verifyEmbedded({ log: [{}] } as any)).ok).toBe(false); expect((await verifyEmbedded(null as any)).ok).toBe(false);
    for (const bad of [[{}], [null], [{ entry: {} }], "x" as any]) expect((await verifyChain(bad, k.publicKeyRaw)).ok).toBe(false);
  });
});

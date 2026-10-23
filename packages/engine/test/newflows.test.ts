import { describe, expect, test } from "bun:test";
import { HANDSHAKE_MAX_TRIES, codeHash, isCode4, monitorConfirm, openLink, randomCode4, sameMobile, voterConfirm, type Handshake } from "../src/handshake";
import { detectTicks, otsu, paperLayout, paperToken, parsePaperToken, renderPaperSvg, newSerial } from "../src/paper";
import { defaultBallotDesign } from "../src/ballot";
import { CATALOG_KEYS, CORE_KEYS, LANGUAGES, coverage, dictionary, isLang, t } from "../src/i18n";
import { GUIDE_FIELDS, PLAYBOOKS, playbook } from "../src/guide";
import { buildReportModel } from "../src/model";
import { renderReportHtml } from "../src/render";
import { complianceChecks } from "../src/compliance";
import { sealBoxPayload, resultPayload } from "../src/commands";
import { Scenario, testKey } from "./helpers";

const pepper = "p";
async function mk(over: Partial<Handshake> = {}, now = 1000): Promise<{ h: Handshake; mon: string; vot: string }> {
  const id = "hs_1", eventId = "e".repeat(32), flatNo = "A-101"; const mon = "4821", vot = "0937";
  return { mon, vot, h: { id, eventId, flatNo, monitorPid: "p_m", monitorHash: await codeHash(pepper, { id, eventId, flatNo, side: "monitor", code: mon }), voterHash: await codeHash(pepper, { id, eventId, flatNo, side: "voter", code: vot }), linkHash: "l", deviceHash: null, uaHash: null, ipHash: null, voterConfirmedMs: null, monitorConfirmedMs: null, triesVoter: 0, triesMonitor: 0, createdMs: now, expiresMs: now + 600_000, voidedMs: null, completedMs: null, kind: "official", attendeeName: "X", mobileMasked: null, mobileFp: null, smsConfirmedMs: null, ...over } };
}

describe("attendance handshake: two screens, two 4-digit codes", () => {
  test("codes are 4 digits, zero padded, unbiased", () => {
    for (let i = 0; i < 1000; i++) expect(randomCode4()).toMatch(/^\d{4}$/);
    expect(randomCode4((u) => { u[0] = 7; })).toBe("0007"); expect(isCode4("123")).toBe(false); expect(isCode4("12a4")).toBe(false);
  });
  test("both sides must confirm, in either order, from different devices; then it is complete", async () => {
    const { h, mon, vot } = await mk();
    let r = openLink(h, 2000, "voterDev", "ua", "ip"); expect(r.ok).toBe(true); let cur = (r as any).h as Handshake;
    const v = await voterConfirm(cur, 3000, pepper, mon, "voterDev"); expect(v).toMatchObject({ ok: true, complete: false }); cur = (v as any).h;
    const m = await monitorConfirm(cur, 4000, pepper, vot, "officerDev"); expect(m).toMatchObject({ ok: true, complete: true });
    // other order
    const o1 = await monitorConfirm(((openLink(h, 2000, "voterDev", "ua", "ip") as any).h) as Handshake, 3000, pepper, vot, "officerDev"); expect(o1).toMatchObject({ ok: true, complete: false });
    expect(await voterConfirm((o1 as any).h, 4000, pepper, mon, "voterDev")).toMatchObject({ ok: true, complete: true });
  });
  test("the officer cannot complete both halves alone: the officer's device must differ from the voter's", async () => {
    const { h, vot } = await mk(); const opened = (openLink(h, 2000, "SAME", "ua", "ip") as any).h as Handshake;
    expect(await monitorConfirm(opened, 3000, pepper, vot, "SAME")).toMatchObject({ ok: false, reason: "same_device" });
  });
  test("a second phone cannot take over the link; codes only work on the right side; neither code works before the phone opens the link", async () => {
    const { h, mon, vot } = await mk();
    expect(await voterConfirm(h, 2000, pepper, mon, "d")).toMatchObject({ ok: false, reason: "not_opened" });
    const opened = (openLink(h, 2000, "phone1", "ua", "ip") as any).h as Handshake;
    expect(openLink(opened, 2100, "phone2", "ua", "ip")).toMatchObject({ ok: false, reason: "wrong_device" });
    expect(await voterConfirm(opened, 3000, pepper, mon, "phone2")).toMatchObject({ ok: false, reason: "wrong_device" });
    expect(await voterConfirm(opened, 3000, pepper, vot, "phone1")).toMatchObject({ ok: false, reason: "wrong_code" }); // the voter's own code is not the officer's
    expect(await monitorConfirm(opened, 3000, pepper, mon, "officer")).toMatchObject({ ok: false, reason: "wrong_code" });
  });
  test("5 wrong tries kill the handshake (even the right code is refused); expiry and voiding too; malformed input is just a wrong try", async () => {
    const { h, mon } = await mk(); let cur = (openLink(h, 2000, "d", "u", "i") as any).h as Handshake;
    for (let i = 0; i < HANDSHAKE_MAX_TRIES; i++) { const r = await voterConfirm(cur, 3000, pepper, "0000", "d"); expect(r.ok).toBe(false); cur = r.h; }
    expect(await voterConfirm(cur, 3100, pepper, mon, "d")).toMatchObject({ ok: false, reason: "dead" });
    const fresh = (openLink((await mk()).h, 2000, "d", "u", "i") as any).h as Handshake;
    expect(await voterConfirm(fresh, 2000 + 600_000, pepper, mon, "d")).toMatchObject({ ok: false, reason: "expired" });
    expect(await voterConfirm({ ...fresh, voidedMs: 5 }, 2500, pepper, mon, "d")).toMatchObject({ ok: false, reason: "voided" });
    expect(await voterConfirm(fresh, 2500, pepper, "12", "d")).toMatchObject({ ok: false, reason: "wrong_code" });
  });
  test("the code hash is bound to the handshake, event, flat and side (a code for one flat does not work for another)", async () => {
    const a = await codeHash(pepper, { id: "h", eventId: "e", flatNo: "A-1", side: "monitor", code: "1234" });
    for (const other of [{ id: "h2", eventId: "e", flatNo: "A-1", side: "monitor" }, { id: "h", eventId: "e2", flatNo: "A-1", side: "monitor" }, { id: "h", eventId: "e", flatNo: "A-2", side: "monitor" }, { id: "h", eventId: "e", flatNo: "A-1", side: "voter" }] as const) expect(await codeHash(pepper, { ...other, code: "1234" })).not.toBe(a);
  });
  test("optional SMS sender check compares the last 10 digits", () => {
    expect(sameMobile("+91 98765 43210", "9876543210")).toBe(true); expect(sameMobile("98765 43210", "9876543211")).toBe(false); expect(sameMobile("123", "123")).toBe(false);
  });
});

// ---------- printed ballots ----------
const design = defaultBallotDesign();
const point = { options: ["c_a", "c_b", "c_c", "c_d"], labels: { c_a: "Asha", c_b: "Bimal", c_c: "Chitra", c_d: "Dev" }, maxChoices: 2, minChoices: 1 };
const layout = paperLayout(point, design, "Tick up to 2.", "President");
function blankPage(px = 4) {
  const w = layout.widthMm * px, h = layout.heightMm * px, g = new Uint8Array(w * h).fill(250);
  const rect = (x0: number, y0: number, x1: number, y1: number, v: number) => { for (let y = Math.round(y0); y < Math.round(y1); y++) for (let x = Math.round(x0); x < Math.round(x1); x++) if (x >= 0 && y >= 0 && x < w && y < h) g[y * w + x] = v; };
  for (const r of layout.rows) { const b = r.box; rect(b.x * px, b.y * px, (b.x + b.w) * px, (b.y + 0.5) * px, 0); rect(b.x * px, (b.y + b.h - 0.5) * px, (b.x + b.w) * px, (b.y + b.h) * px, 0); rect(b.x * px, b.y * px, (b.x + 0.5) * px, (b.y + b.h) * px, 0); rect((b.x + b.w - 0.5) * px, b.y * px, (b.x + b.w) * px, (b.y + b.h) * px, 0); }
  const cross = (opt: string, thick = 0.9) => { const r = layout.rows.find((x) => x.option === opt)!.box; for (let t = 0; t <= 1; t += 0.004) for (const [fx, fy] of [[t, t], [t, 1 - t]] as const) rect((r.x + 0.8 + fx * (r.w - 1.6)) * px, (r.y + 0.8 + fy * (r.h - 1.6)) * px, (r.x + 0.8 + fx * (r.w - 1.6) + thick) * px, (r.y + 0.8 + fy * (r.h - 1.6) + thick) * px, 20); };
  const fill = (opt: string) => { const r = layout.rows.find((x) => x.option === opt)!.box; rect((r.x + 1) * px, (r.y + 1) * px, (r.x + r.w - 1) * px, (r.y + r.h - 1) * px, 10); };
  const dot = (opt: string) => { const r = layout.rows.find((x) => x.option === opt)!.box; rect((r.x + 3) * px, (r.y + 3) * px, (r.x + 5.2) * px, (r.y + 5.2) * px, 10); };
  const noise = (seed = 1) => { let s = seed; for (let i = 0; i < g.length; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; g[i] = Math.max(0, Math.min(255, g[i]! + ((s >> 16) % 41) - 20)); } };
  return { g, w, h, cross, fill, dot, noise };
}
describe("printed ballot paper: QR token, layout, reading the ticks", () => {
  test("a token is accepted only for its own event, point and serial; forged or altered tokens are refused", async () => {
    const serial = newSerial(); const tok = await paperToken(pepper, "e1", "pt_1", serial);
    expect(await parsePaperToken(pepper, "e1", "pt_1", tok)).toEqual({ ok: true, serial });
    for (const bad of [await paperToken(pepper, "e2", "pt_1", serial), await paperToken(pepper, "e1", "pt_2", serial), serial + ".0000000000000000", tok.slice(0, -1) + (tok.endsWith("0") ? "1" : "0"), "bp_zzzz.1234", "", undefined, 5]) expect(await parsePaperToken(pepper, "e1", "pt_1", bad)).toEqual({ ok: false });
    expect(await parsePaperToken("other-pepper", "e1", "pt_1", tok)).toEqual({ ok: false }); // only this system's secret can tell a real paper
    expect(new Set(Array.from({ length: 500 }, () => newSerial())).size).toBe(500);
  });
  test("the paper is deterministic, phone/print friendly, escapes text, and carries the corner marks and the token", () => {
    const evil = paperLayout({ ...point, labels: { ...point.labels, c_a: '<script>"x"</script>' } }, design, "Tick 1.", "T");
    const a = renderPaperSvg(layout, "bp_aaaaaaaaaaaa.0123456789abcdef", design), b = renderPaperSvg(layout, "bp_aaaaaaaaaaaa.0123456789abcdef", design);
    expect(a).toBe(b); expect(a).toContain("bp_aaaaaaaaaaaa.0123456789abcdef"); expect((a.match(/fill="#000"/g) ?? []).length).toBe(4); expect(a).toContain("1. Asha");
    expect(renderPaperSvg(evil, "t", design)).not.toContain("<script>"); expect(layout.rows.length).toBe(4);
    for (const r of layout.rows) { expect(r.box.y + r.box.h).toBeLessThan(layout.heightMm - 20); expect(r.box.w).toBeGreaterThanOrEqual(9); }
    const rowsMinGap = layout.rows.slice(1).map((r, i) => r.box.y - (layout.rows[i]!.box.y + layout.rows[i]!.box.h)); expect(Math.min(...rowsMinGap)).toBeGreaterThan(2);
  });
  test("Otsu finds the threshold between ink and paper", () => { const g = new Uint8Array(1000).map((_, i) => (i % 5 === 0 ? 20 : 240)); const th = otsu(g); expect(th).toBeGreaterThanOrEqual(20); expect(th).toBeLessThan(240); });
  test("ticked boxes are read as ticked (cross or filled), empty boxes as empty, in the presence of noise", () => {
    const p = blankPage(); p.cross("c_a"); p.fill("c_c"); p.noise(7);
    const r = detectTicks(p.g, p.w, p.h, layout); const by = Object.fromEntries(r.map((x) => [x.option, x.state]));
    expect(by).toEqual({ c_a: "ticked", c_b: "empty", c_c: "ticked", c_d: "empty" });
  });
  test("a blank paper is all empty; every box ticked is all ticked (the server then rejects too many ticks)", () => {
    const blank = blankPage(); expect(detectTicks(blank.g, blank.w, blank.h, layout).every((x) => x.state === "empty")).toBe(true);
    const all = blankPage(); for (const o of point.options) all.fill(o); expect(detectTicks(all.g, all.w, all.h, layout).every((x) => x.state === "ticked")).toBe(true);
  });
  test("a faint or tiny mark is NOT guessed: it is flagged uncertain for a person to confirm", () => {
    const p = blankPage(); p.dot("c_b"); const r = detectTicks(p.g, p.w, p.h, layout);
    expect(r.find((x) => x.option === "c_b")!.state).toBe("uncertain"); expect(r.find((x) => x.option === "c_a")!.state).toBe("empty");
  });
  test("works at a lower camera resolution too (2 px per mm)", () => {
    const p = blankPage(2); p.cross("c_d", 1.4); const r = detectTicks(p.g, p.w, p.h, layout);
    expect(r.find((x) => x.option === "c_d")!.state).toBe("ticked"); expect(r.filter((x) => x.state === "ticked").length).toBe(1);
  });
});

// ---------- languages and guides ----------
describe("languages (drop-down in the upper right) and the step-by-step guides", () => {
  test("16 languages incl. right-to-left ones; English and Hindi complete; every language covers the core keys; unknown keys fall back to English", () => {
    expect(LANGUAGES.length).toBe(16); expect(LANGUAGES.filter((l) => l.dir === "rtl").map((l) => l.code).sort()).toEqual(["ar", "ur"]);
    const cov = coverage(); expect(cov.find((c) => c.code === "en")!.percent).toBe(100); expect(cov.find((c) => c.code === "hi")!.percent).toBe(100);
    for (const l of LANGUAGES) { const d = dictionary(l.code); for (const k of CORE_KEYS) expect(d[k]!.length).toBeGreaterThan(0); expect(Object.keys(d).length).toBe(CATALOG_KEYS.length); }
    expect(CORE_KEYS.every((k) => LANGUAGES.every((l) => t(l.code, k) !== t("xx", "no.such.key")))).toBe(true);
    expect(t("fr", "sec.options")).toBe("Options used"); expect(t("hi", "btn.verify")).toBe("जाँचें"); expect(t("xx", "btn.verify")).toBe("Verify"); expect(t("en", "missing.key")).toBe("missing.key");
    expect(isLang("hi")).toBe(true); expect(isLang("zz")).toBe(false);
  });
  test("every playbook step answers WHAT, HOW, WHERE, WHEN, WHY, WITH WHOM and WHICH, in English and Hindi, for all four roles", () => {
    expect(Object.keys(PLAYBOOKS).sort()).toEqual(["attendance_officer", "host", "organizer", "voter"]);
    for (const [role, steps] of Object.entries(PLAYBOOKS)) { expect(steps.length).toBeGreaterThanOrEqual(3); for (const s of steps) { expect(s.title.en.length).toBeGreaterThan(3); expect(/[ऀ-ॿ]/.test(s.title.hi)).toBe(true); for (const f of GUIDE_FIELDS) { expect(s[f].en.length, `${role}.${s.id}.${f}`).toBeGreaterThan(5); expect(/[ऀ-ॿ]/.test(s[f].hi), `${role}.${s.id}.${f} hindi`).toBe(true); } } }
    expect(PLAYBOOKS.organizer.map((s) => s.id)).toEqual(["email", "rules", "flats", "agenda", "helpers", "pay", "publish", "day"]);
    expect(playbook("voter", "hi")[0]!.what).not.toBe(playbook("voter", "en")[0]!.what); expect(playbook("voter", "fr")[0]!.what).toBe(playbook("voter", "en")[0]!.what);
  });
});

// ---------- paper ballots in the log ----------
describe("paper ballots in the signed log", () => {
  async function paperEvent(counted: number, extra: Record<string, number> = {}) {
    const s = await Scenario.create({ schedule: undefined }); await s.addPoint("pt_1", "1", { secret: true, kind: "election_post", options: ["c_a", "c_b"], majorityClass: "simple", maxChoices: 1 });
    await s.pay(); await s.publish(); await s.start(); for (let i = 0; i < 5; i++) await s.attend(`A-${101 + i}`);
    await s.open("pt_1");
    for (let i = 0; i < 5; i++) { await s.acceptFlat(`A-${101 + i}`); await s.add("paper_issued", s.org, { pointId: "pt_1", flatNo: `A-${101 + i}`, kind: "official" }); }
    await s.add("point_closed", s.org, { pointId: "pt_1", by: "x" });
    const st = await s.state();
    const box = Array.from({ length: counted }, (_, i) => ({ receipt: String(i).padStart(64, "0"), choices: [i % 2 ? "c_a" : "c_b"], weight: 1, kind: "official" as const }));
    const payload = await sealBoxPayload(st, "pt_1", box);
    return { s, payload, box, paper: { serials: 5, counted, invalid: 0, voided: 0, uncounted: 5 - counted, imagesDigest: "d".repeat(64), ...extra } };
  }
  test("papers given out, some returned: the sealed box and the accounts add up and the result replays", async () => {
    const { s, payload, paper } = await paperEvent(4);
    await s.add("ballot_box_sealed", { system: true }, { ...payload, paper } as any);
    const st = await s.state(); await s.add("result_computed", { system: true }, resultPayload(st, "pt_1"));
    const fin = await s.state(); expect(fin.problems).toEqual([]);
    const m = buildReportModel(fin); expect(m.points[0]!.paper).toMatchObject({ serials: 5, counted: 4, uncounted: 1 });
    const k = await testKey(); const html = renderReportHtml(m, s.entries, k.publicKeyRaw, k.kid); expect(html).toContain("Paper ballots: 5 issued, 4 counted, 0 invalid, 0 voided, 1 not returned");
    expect(complianceChecks(fin).checks.find((c) => c.id === "paper")!.detail).toContain("1 not returned");
  });
  test("a stuffed box (more ballots than papers returned) and broken accounts are flagged", async () => {
    const a = await paperEvent(4); await a.s.add("ballot_box_sealed", { system: true }, { ...a.payload, paper: { ...a.paper, counted: 3, uncounted: 2 } } as any);
    expect((await a.s.state()).problems.join()).toContain("ballot box holds 4 ballots but 0 online votes and 3 counted papers");
    const b = await paperEvent(4); await b.s.add("ballot_box_sealed", { system: true }, { ...b.payload, paper: { ...b.paper, uncounted: 4 } } as any);
    expect((await b.s.state()).problems.join()).toContain("paper ballot accounts do not add up");
  });
  test("a paper given to a flat that is not present, twice, or after the point closed is flagged", async () => {
    const s = await Scenario.create(); await s.addPoint("pt_1", "1", { secret: true }); await s.pay(); await s.publish(); await s.start(); await s.attend("A-101"); await s.open("pt_1");
    await s.add("paper_issued", s.org, { pointId: "pt_1", flatNo: "A-109", kind: "official" }); await s.add("paper_issued", s.org, { pointId: "pt_1", flatNo: "A-101", kind: "official" }); await s.add("paper_issued", s.org, { pointId: "pt_1", flatNo: "A-101", kind: "official" });
    await s.add("point_closed", s.org, { pointId: "pt_1", by: "x" }); await s.add("paper_issued", s.org, { pointId: "pt_1", flatNo: "A-101", kind: "official" });
    const p = (await s.state()).problems.join(" | "); expect(p).toContain("without being marked present"); expect(p).toContain("voted twice"); expect(p).toContain("while it was closed");
  });
});

describe("the public page has a language drop-down in the upper right", () => {
  test("16 languages in a select at the top, the whole dictionary embedded (works offline), data-i18n on every heading, RTL handled, still deterministic and verifiable", async () => {
    const s = await Scenario.fullMeeting(); const k = await testKey(); const model = buildReportModel(await s.state());
    const a = renderReportHtml(model, s.entries, k.publicKeyRaw, k.kid), b = renderReportHtml(model, s.entries, k.publicKeyRaw, k.kid);
    expect(a).toBe(b);
    expect(a).toContain('<div class="topbar"><label for="lang-select"'); expect((a.match(/<option value="[a-z]{2}">/g) ?? []).length).toBe(16); expect(a).toContain("हिन्दी"); expect(a).toContain("العربية");
    expect((a.match(/data-i18n="/g) ?? []).length).toBeGreaterThan(25);
    const dict = JSON.parse(/<script type="application\/json" id="aoa-i18n">([\s\S]*?)<\/script>/.exec(a)![1]!); expect(Object.keys(dict).length).toBe(16); expect(dict.hi["sec.schedule"]).toBe("समय-सारणी"); expect(dict.ar["page.final"]).toBe("التقرير النهائي");
    expect(a).toContain("dir=RTL[l]?'rtl':'ltr'"); expect(a).toContain("localStorage");
    for (const key of ["sec.schedule", "sec.people", "sec.rules", "sec.attendance", "sec.agenda", "sec.log", "btn.verify", "page.final"]) expect(a).toContain(`data-i18n="${key}"`);
    const { sealReport } = await import("../src/render"); const { verifyReportHtml } = await import("../src/model");
    const { html } = await sealReport(a, model, k.privateKeyPkcs8, k.kid); expect((await verifyReportHtml(html)).ok).toBe(true);
    expect(html).toContain('/pdf" data-i18n="btn.pdf"'); // the final report offers the PDF and a byte-identical copy
  });
});

describe("the six steps of the real room, and the brand line", () => {
  test("stage follows the event: Rules, Attendance, Quorum, Vote, Count, Publish", async () => {
    const { stageOf, BRAND, BRAND_STEPS } = await import("../src");
    const s = await Scenario.create();
    expect(stageOf(await s.state())).toBe("rules");
    await s.addPoint("pt_1", "1"); await s.pay(); await s.publish(); expect(stageOf(await s.state())).toBe("attendance");
    await s.start(); expect(stageOf(await s.state())).toBe("attendance"); // started, nobody checked in yet
    await s.attend("A-101"); expect(stageOf(await s.state())).toBe("attendance"); // 1 present, quorum (30% of 10 = 3) not met
    await s.attend("A-102"); await s.attend("A-103"); expect(stageOf(await s.state())).toBe("quorum");
    await s.open("pt_1"); expect(stageOf(await s.state())).toBe("vote");
    await s.add("point_closed", s.org, { pointId: "pt_1", by: "x" }); expect(stageOf(await s.state())).toBe("count"); // closed, not yet counted
    await s.add("result_computed", { system: true }, resultPayload(await s.state(), "pt_1")); expect(stageOf(await s.state())).toBe("count"); // every point closed
    await s.closeEvent(); expect(stageOf(await s.state())).toBe("publish");
    expect([...BRAND_STEPS]).toEqual(["Rules", "Attendance", "Quorum", "Vote", "Count", "Publish"]); expect(BRAND).toBe("Townhall");
  });
  test("the page shows the brand, the six steps with pictures, highlights the current one, and the terms/mails carry the brand", async () => {
    const s = await Scenario.fullMeeting(); const k = await testKey(); const m = buildReportModel(await s.state()); const html = renderReportHtml(m, s.entries, k.publicKeyRaw, k.kid);
    expect(m.stage).toBe("publish"); expect(html).toContain('<p class="brandline"><b>Townhall</b>'); expect(html).toContain("Rules · Attendance · Quorum · Vote · Count · Publish");
    for (const id of ["rules", "attendance", "quorum", "vote", "count", "publish"]) expect(html).toContain(`data-i18n="stage.${id}"`);
    expect((html.match(/<li class="(done|now)?"?>?<svg/g) ?? []).length + (html.match(/<ol class="track">/g) ?? []).length).toBeGreaterThan(0);
    expect(html).toContain('<li class="now"><svg'); expect(html.split('<li class="done"><svg').length - 1).toBe(5); // five steps done, the last one is now
    expect(html).toContain("<title>Green Park Apartments · Annual General Meeting 2026 · Townhall</title>");
    const { TERMS_TEXT } = await import("../src"); expect(TERMS_TEXT.startsWith("By using Townhall you agree")).toBe(true);
  });
});

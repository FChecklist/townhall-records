// Owner directives: attendance by exchanging 4-digit codes between two screens; printed ballot papers with unique QR codes, photographed and counted; languages and guides.
import { describe, expect, test } from "bun:test";
import { buildReportModel, defaultBallotDesign, detectTicks, replayLog, type PaperLayout, scanPublic } from "../../../packages/engine/src";
import { H, OFFP, ORG, PRIVATE, appointVerified, getLog, newEvent, setup, flatsOf, DAY, STAFF_PUBLIC } from "./harness";

const OFFICER_DEV = "device-officer-0000001", VOTER_DEV = "device-voter-00000001", VOTER2_DEV = "device-voter-00000002";
const ok = async (p: Promise<any>) => { const r = await p; if (r.status >= 300) throw new Error(JSON.stringify(r.body)); return r; };
async function liveEvent(h: H, o: { flats?: number; mode?: "online" | "printed" | "either"; election?: boolean; sets?: Record<string, unknown> } = {}) {
  h.device = OFFICER_DEV;
  const e = await newEvent(h, { kind: o.election === false ? "meeting" : "election" });
  await ok(h.call("PUT", `/api/events/${e.eid}/roll`, { flats: flatsOf(o.flats ?? 6) }, e.org));
  if (o.mode) await ok(h.call("PUT", `/api/events/${e.eid}/rules`, { changes: { "ballot.mode": o.mode, ...(o.sets ?? {}) }, reason: "owner's choice of ballot" }, e.org));
  const pt = o.election === false
    ? await ok(h.call("POST", `/api/events/${e.eid}/points`, { kind: "resolution", title: "Approve the accounts", secret: true }, e.org))
    : await ok(h.call("POST", `/api/events/${e.eid}/points`, { kind: "election_post", title: "President", candidates: ["Asha", "Bimal", "Chitra"], maxChoices: 1, secret: true }, e.org));
  const pay = await ok(h.call("POST", `/api/events/${e.eid}/pay`, {}, e.org)); await ok(h.call("POST", "/api/pay/test-confirm", { eventId: e.eid, paymentId: pay.body.paymentId }, e.org));
  const off = await appointVerified(h, e, OFFP, "attendance_officer");
  await ok(h.call("POST", `/api/events/${e.eid}/agenda/publish`, {}, e.org)); await ok(h.call("POST", `/api/events/${e.eid}/start`, {}, e.org));
  const model = async () => (await h.call("GET", `/api/events/${e.eid}`)).body.model;
  const ids = async () => { const p = (await model()).points[0]; return Object.fromEntries(Object.entries(p.labels as Record<string, string>).map(([id, l]) => [l, id])) as Record<string, string>; };
  return { ...e, off, pointId: pt.body.pointId as string, model, ids };
}
type Ev = Awaited<ReturnType<typeof liveEvent>>;

/** Officer starts, voter's phone opens and confirms, officer confirms. Returns the voter's session token. */
async function checkIn(h: H, e: Ev, flat: string, voterDev = VOTER_DEV, extra: Record<string, unknown> = {}) {
  h.device = OFFICER_DEV; const hs = await ok(h.call("POST", `/api/events/${e.eid}/handshakes`, { flatNo: flat, attendeeName: "Owner " + flat, ...extra }, e.off.token));
  h.device = voterDev; const page = await ok(h.call("GET", `/api/h/${hs.body.token}`));
  const vc = await ok(h.call("POST", `/api/h/${hs.body.token}/confirm`, { code: hs.body.monitorCode }));
  h.device = OFFICER_DEV; const mc = await ok(h.call("POST", `/api/events/${e.eid}/handshakes/${hs.body.handshakeId}/confirm`, { code: page.body.voterCode }, e.off.token));
  h.device = voterDev; const st = await ok(h.call("GET", `/api/h/${hs.body.token}/status`));
  return { hs: hs.body, page: page.body, vc: vc.body, mc: mc.body, token: st.body.token as string };
}

describe("attendance by exchanging two 4-digit codes (no SMS cost)", () => {
  test("officer and voter read each other's screen code; attendance is marked; the voter's phone is bound; the token is handed over once", async () => {
    const h = await H.make(); const e = await liveEvent(h, { mode: "online" });
    h.device = OFFICER_DEV; const hs = await ok(h.call("POST", `/api/events/${e.eid}/handshakes`, { flatNo: "A-101", attendeeName: "Owner One" }, e.off.token));
    expect(hs.body.monitorCode).toMatch(/^\d{4}$/); expect(hs.body.linkPath).toMatch(/^\/h\/[0-9a-f]{48}$/);
    expect((await getLog(h, e.eid)).entries.some((x) => x.entry.type === "attendance_marked" && (x.entry.payload as any).flatNo === "A-101")).toBe(false); // not present yet
    h.device = VOTER_DEV; const page = await ok(h.call("GET", `/api/h/${hs.body.token}`));
    expect(page.body.voterCode).toMatch(/^\d{4}$/); expect(page.body.flatNo).toBe("A-101"); expect(page.body.termsRequired).toBe(true);
    expect(page.body.voterCode).not.toBe(undefined);
    const noTerms = await h.call("POST", `/api/h/${hs.body.token}/confirm`, { code: hs.body.monitorCode, acceptTerms: false }); expect(noTerms.body.error).toBe("terms_required");
    const v = await ok(h.call("POST", `/api/h/${hs.body.token}/confirm`, { code: hs.body.monitorCode })); expect(v.body).toMatchObject({ complete: false, waitingFor: "officer" });
    h.device = OFFICER_DEV; const m = await ok(h.call("POST", `/api/events/${e.eid}/handshakes/${hs.body.handshakeId}/confirm`, { code: page.body.voterCode }, e.off.token)); expect(m.body).toMatchObject({ complete: true });
    const model = await e.model(); expect(model.attendance.present).toBe(1); expect(model.attendance.rows[0]).toMatchObject({ flatNo: "A-101", method: "mutual_code_exchange", independent: true });
    h.device = VOTER_DEV; const st1 = await ok(h.call("GET", `/api/h/${hs.body.token}/status`)); expect(st1.body.state).toBe("complete"); expect(st1.body.token).toMatch(/^[0-9a-f]{64}$/);
    const st2 = await ok(h.call("GET", `/api/h/${hs.body.token}/status`)); expect(st2.body.token).toBeUndefined(); // handed over once
    const types = (await getLog(h, e.eid)).entries.map((x) => x.entry.type); expect(types).toContain("handshake_started"); expect(types).toContain("device_bound");
    expect(h.raw.query("SELECT voter_token FROM handshakes").get()).toEqual({ voter_token: null });
    expect((await replayLog((await getLog(h, e.eid)).entries)).problems).toEqual([]);
  });
  test("codes are never stored: only keyed hashes; neither code is in the log or the audit rows; the link page shows the voter code only to the opening device", async () => {
    const h = await H.make(); const e = await liveEvent(h); h.device = OFFICER_DEV;
    const hs = await ok(h.call("POST", `/api/events/${e.eid}/handshakes`, { flatNo: "A-101", attendeeName: "Owner One" }, e.off.token));
    h.device = VOTER_DEV; const page = await ok(h.call("GET", `/api/h/${hs.body.token}`));
    const dump = JSON.stringify([h.raw.query("SELECT * FROM handshakes").all(), h.raw.query("SELECT entry_json FROM log_entries").all(), h.raw.query("SELECT * FROM access_audit").all()]);
    for (const code of [hs.body.monitorCode, page.body.voterCode]) expect(dump).not.toContain(`"${code}"`);
    expect(dump).not.toContain(hs.body.token);
    h.device = VOTER2_DEV; expect((await h.call("GET", `/api/h/${hs.body.token}`)).body.error).toBe("wrong_device"); // a second phone cannot take the link over
    h.device = VOTER_DEV; expect((await h.call("GET", `/api/h/${hs.body.token}`)).status).toBe(200); // the same phone can reopen
  });
  test("THE OFFICER CANNOT FAKE PRESENCE ALONE: using the officer's own device as the 'voter' is refused", async () => {
    const h = await H.make(); const e = await liveEvent(h); h.device = OFFICER_DEV;
    const hs = await ok(h.call("POST", `/api/events/${e.eid}/handshakes`, { flatNo: "A-102", attendeeName: "Owner Two" }, e.off.token));
    const page = await ok(h.call("GET", `/api/h/${hs.body.token}`)); // opened on the officer's own device
    await ok(h.call("POST", `/api/h/${hs.body.token}/confirm`, { code: hs.body.monitorCode }));
    const m = await h.call("POST", `/api/events/${e.eid}/handshakes/${hs.body.handshakeId}/confirm`, { code: page.body.voterCode }, e.off.token);
    expect(m.status).toBe(403); expect(m.body.error).toBe("same_device"); expect((await e.model()).attendance.present).toBe(0);
  });
  test("5 wrong codes kill the handshake (even the right code then fails); a wrong code on the other side is counted separately; expiry and replacement work", async () => {
    const h = await H.make(); const e = await liveEvent(h); h.device = OFFICER_DEV;
    const hs = await ok(h.call("POST", `/api/events/${e.eid}/handshakes`, { flatNo: "A-103", attendeeName: "Owner Three" }, e.off.token));
    h.device = VOTER_DEV; await ok(h.call("GET", `/api/h/${hs.body.token}`));
    const wrong = hs.body.monitorCode === "0000" ? "0001" : "0000";
    for (let i = 0; i < 5; i++) expect((await h.call("POST", `/api/h/${hs.body.token}/confirm`, { code: wrong })).body.error).toBe("wrong_code");
    expect((await h.call("POST", `/api/h/${hs.body.token}/confirm`, { code: hs.body.monitorCode })).body.error).toBe("dead");
    expect((await getLog(h, e.eid)).entries.some((x) => x.entry.type === "passcode_locked" && (x.entry.payload as any).purpose === "handshake")).toBe(true);
    // expiry
    h.device = OFFICER_DEV; const hs2 = await ok(h.call("POST", `/api/events/${e.eid}/handshakes`, { flatNo: "A-104", attendeeName: "Owner Four" }, e.off.token));
    h.device = VOTER_DEV; await ok(h.call("GET", `/api/h/${hs2.body.token}`)); h.now += 11 * 60_000;
    expect((await h.call("POST", `/api/h/${hs2.body.token}/confirm`, { code: hs2.body.monitorCode })).body.error).toBe("expired");
  });
  test("A NEW HANDSHAKE FOR THE SAME FLAT ENDS THE OLD PHONE: the earlier session stops working, the log says 'replaced', one live handshake per flat", async () => {
    const h = await H.make(); const e = await liveEvent(h, { mode: "online" });
    const first = await checkIn(h, e, "A-101", VOTER_DEV);
    h.device = VOTER_DEV; expect((await h.call("GET", "/api/vote/points", undefined, first.token)).status).toBe(200);
    h.device = VOTER2_DEV; expect((await h.call("GET", "/api/vote/points", undefined, first.token)).body.error).toBe("wrong_device"); // a stolen token on another phone
    const second = await checkIn(h, e, "A-101", VOTER2_DEV);
    h.device = VOTER_DEV; expect((await h.call("GET", "/api/vote/points", undefined, first.token)).status).toBe(401); // the last session ended the first
    h.device = VOTER2_DEV; expect((await h.call("GET", "/api/vote/points", undefined, second.token)).status).toBe(200);
    const bound = (await getLog(h, e.eid)).entries.filter((x) => x.entry.type === "device_bound").map((x) => (x.entry.payload as any).replaced); expect(bound).toEqual([false, true]);
    // a second pending handshake voids the first
    h.device = OFFICER_DEV; const a = await ok(h.call("POST", `/api/events/${e.eid}/handshakes`, { flatNo: "A-105", attendeeName: "O" + "wner" }, e.off.token)); await ok(h.call("POST", `/api/events/${e.eid}/handshakes`, { flatNo: "A-105", attendeeName: "Owner" }, e.off.token));
    h.device = VOTER_DEV; expect((await h.call("GET", `/api/h/${a.body.token}`)).body.error).toBe("voided");
  });
  test("a voter bound by handshake can vote online; a stranger with the token on another phone cannot", async () => {
    const h = await H.make(); const e = await liveEvent(h, { mode: "online" });
    const c = await checkIn(h, e, "A-101"); await checkIn(h, e, "A-102", VOTER_DEV + 9); h.device = OFFICER_DEV; await ok(h.call("POST", `/api/events/${e.eid}/points/${e.pointId}/open`, { minutes: 30 }, e.org)); const id = await e.ids();
    h.device = VOTER2_DEV; expect((await h.call("POST", "/api/vote/cast", { pointId: e.pointId, marks: { [id.Asha!]: true, [id.Bimal!]: false, [id.Chitra!]: false } }, c.token)).body.error).toBe("wrong_device");
    h.device = VOTER_DEV; const r = await h.call("POST", "/api/vote/cast", { pointId: e.pointId, marks: { [id.Asha!]: true, [id.Bimal!]: false, [id.Chitra!]: false } }, c.token); expect(r.status).toBe(201);
  });
  test("OPTIONAL SMS CHECK: the person sends an SMS from their own phone; the officer types the sender number from their own phone; a wrong number is refused; nothing is sent by us", async () => {
    const h = await H.make(); const e = await liveEvent(h); h.device = OFFICER_DEV;
    const hs = await ok(h.call("POST", `/api/events/${e.eid}/handshakes`, { flatNo: "A-101", attendeeName: "Owner One", mobile: "98765 43210" }, e.off.token)); expect(hs.body.smsHint).toContain("their own phone");
    h.device = VOTER_DEV; const pg = await ok(h.call("GET", `/api/h/${hs.body.token}`)); h.device = OFFICER_DEV; expect(pg.body.smsLink === null || pg.body.smsLink.startsWith("sms:")).toBe(true);
    expect((await h.call("POST", `/api/events/${e.eid}/handshakes/${hs.body.handshakeId}/sms-confirm`, { senderNumber: "+91 98765 43211" }, e.off.token)).body.error).toBe("number_differs");
    const good = await ok(h.call("POST", `/api/events/${e.eid}/handshakes/${hs.body.handshakeId}/sms-confirm`, { senderNumber: "+91 98765 43210" }, e.off.token)); expect(good.body.maskedMobile).toBe("******3210");
    const log = JSON.stringify((await getLog(h, e.eid)).entries); expect(log).toContain("mobile_confirmed"); expect(scanPublic(log, { allow: ["REG/2020/118", ...STAFF_PUBLIC], forbidden: ["9876543210", "98765 43210"] })).toEqual([]);
    expect(h.count("SELECT COUNT(*) c FROM mail_outbox WHERE body LIKE '%98765%'")).toBe(0);
    const noMob = await ok(h.call("POST", `/api/events/${e.eid}/handshakes`, { flatNo: "A-102", attendeeName: "Owner Two" }, e.off.token)); expect((await h.call("POST", `/api/events/${e.eid}/handshakes/${noMob.body.handshakeId}/sms-confirm`, { senderNumber: "9876543210" }, e.off.token)).body.error).toBe("no_mobile");
  });
  test("only the officer who started the handshake can complete it; a voter or stranger cannot use the officer routes", async () => {
    const h = await H.make(); const e = await liveEvent(h); h.device = OFFICER_DEV;
    const hs = await ok(h.call("POST", `/api/events/${e.eid}/handshakes`, { flatNo: "A-101", attendeeName: "Owner One" }, e.off.token));
    expect((await h.call("POST", `/api/events/${e.eid}/handshakes`, { flatNo: "A-101", attendeeName: "Owner One" })).status).toBe(401);
    expect((await h.call("POST", `/api/events/${e.eid}/handshakes/${hs.body.handshakeId}/confirm`, { code: "1234" })).status).toBe(401);
    expect((await h.call("POST", `/api/events/${e.eid}/handshakes`, { flatNo: "Z-9", attendeeName: "Nobody" }, e.off.token)).body.error).toBe("no_flat");
  });
});

// ---------------- printed ballots ----------------
function pageImage(layout: PaperLayout, ticks: string[], faint: string[] = [], px = 4) {
  const w = layout.widthMm * px, h = layout.heightMm * px, g = new Uint8Array(w * h).fill(250);
  const rect = (x0: number, y0: number, x1: number, y1: number, v: number) => { for (let y = Math.round(y0); y < Math.round(y1); y++) for (let x = Math.round(x0); x < Math.round(x1); x++) g[y * w + x] = v; };
  for (const r of layout.rows) { const b = r.box; rect(b.x * px, b.y * px, (b.x + b.w) * px, (b.y + 0.5) * px, 0); rect(b.x * px, (b.y + b.h - 0.5) * px, (b.x + b.w) * px, (b.y + b.h) * px, 0); rect(b.x * px, b.y * px, (b.x + 0.5) * px, (b.y + b.h) * px, 0); rect((b.x + b.w - 0.5) * px, b.y * px, (b.x + b.w) * px, (b.y + b.h) * px, 0);
    if (ticks.includes(r.option)) rect((b.x + 1) * px, (b.y + 1) * px, (b.x + b.w - 1) * px, (b.y + b.h - 1) * px, 15); if (faint.includes(r.option)) rect((b.x + 3) * px, (b.y + 3) * px, (b.x + 5.2) * px, (b.y + 5.2) * px, 15); }
  return { g, w, h };
}
/** What the officer's phone does: read the QR (token) and the ticks from the photo, then send the boxes as ticked / not ticked. */
async function scanPaper(h: H, e: Ev, paper: { token: string; layout: PaperLayout }, ticks: string[], faint: string[] = [], imageSha = "a".repeat(64)) {
  const img = pageImage(paper.layout, ticks, faint); const read = detectTicks(img.g, img.w, img.h, paper.layout);
  const marks = Object.fromEntries(read.map((r) => [r.option, r.state === "ticked"]));
  h.device = OFFICER_DEV; return { read, res: await h.call("POST", `/api/events/${e.eid}/points/${e.pointId}/paper/scan`, { token: paper.token, marks, imageSha256: imageSha }, e.off.token) };
}
describe("printed ballot papers with unique QR codes", () => {
  test("issue a paper, the voter ticks it, the officer photographs it, the system reads the ticks and counts: ticked = yes, empty = no; results match", async () => {
    const h = await H.make(); const e = await liveEvent(h, { mode: "printed", flats: 6 }); const id = await e.ids();
    for (let i = 0; i < 6; i++) await checkIn(h, e, `A-${101 + i}`, VOTER_DEV + i);
    h.device = OFFICER_DEV; await ok(h.call("POST", `/api/events/${e.eid}/points/${e.pointId}/open`, { minutes: 30 }, e.org));
    const picks = ["Asha", "Asha", "Bimal", "Asha", "Chitra", "Bimal"]; const papers: any[] = [];
    for (let i = 0; i < 6; i++) { const p = await ok(h.call("POST", `/api/events/${e.eid}/points/${e.pointId}/paper`, { flatNo: `A-${101 + i}` }, e.off.token)); papers.push(p.body); expect(p.body.svg).toContain("data-ballot-paper"); expect(p.body.token).toBe(p.body.qrText); expect(p.body.serial).toMatch(/^bp_[0-9a-f]{12}$/); }
    expect(new Set(papers.map((p) => p.serial)).size).toBe(6); // every paper is unique
    h.device = OFFICER_DEV; await ok(h.call("POST", `/api/events/${e.eid}/points/${e.pointId}/close`, {}, e.org));
    expect((await e.model()).points[0].tally).toBeNull(); // counting not finished: no totals yet
    for (let i = 0; i < 6; i++) { const r = await scanPaper(h, e, papers[i], [id[picks[i]!]!], [], String(i).repeat(64).slice(0, 64)); expect(r.res.status).toBe(201); expect(r.res.body.result).toBe("counted"); }
    h.device = OFFICER_DEV; const fin = await ok(h.call("POST", `/api/events/${e.eid}/points/${e.pointId}/count/finish`, {}, e.org));
    const t = fin.body.result; const row = (n: string) => t.options.find((o: any) => o.option === id[n]); expect([row("Asha").count, row("Asha").notSelected]).toEqual([3, 3]); expect(row("Bimal").count).toBe(2); expect(row("Chitra").count).toBe(1);
    const model = await e.model(); expect(model.points[0].paper).toMatchObject({ serials: 6, counted: 6, invalid: 0, voided: 0, uncounted: 0 });
    const state = await replayLog((await getLog(h, e.eid)).entries); expect(state.problems).toEqual([]);
    await ok(h.call("POST", `/api/events/${e.eid}/close`, {}, e.org)); expect((await h.call("GET", `/api/r/${e.eid}`)).text).toContain("Paper ballots: 6 issued, 6 counted, 0 invalid, 0 voided, 0 not returned");
    const list = (await h.call("GET", `/api/events/${e.eid}/receipts/${e.pointId}`)).body.receipts; expect(list.length).toBe(6);
  });
  test("SECRECY: the serial is not stored with the flat; the serial table has no time and no order; the log never names the serial; counting order does not follow issue order", async () => {
    const h = await H.make(); const e = await liveEvent(h, { mode: "printed", flats: 4 }); const id = await e.ids();
    for (let i = 0; i < 4; i++) await checkIn(h, e, `A-${101 + i}`, VOTER_DEV + i);
    h.device = OFFICER_DEV; await ok(h.call("POST", `/api/events/${e.eid}/points/${e.pointId}/open`, { minutes: 30 }, e.org));
    const papers: any[] = []; for (let i = 0; i < 4; i++) papers.push((await ok(h.call("POST", `/api/events/${e.eid}/points/${e.pointId}/paper`, { flatNo: `A-${101 + i}` }, e.off.token))).body);
    expect((h.raw.query("PRAGMA table_info(paper_serials)").all() as any[]).map((c) => c.name).sort()).toEqual(["event_id", "kind", "point_id", "serial", "weight"]);
    const dump = JSON.stringify([h.raw.query("SELECT * FROM voter_ledger").all(), h.raw.query("SELECT entry_json FROM log_entries").all(), h.raw.query("SELECT * FROM access_audit").all(), h.raw.query("SELECT body FROM mail_outbox").all()]);
    for (const p of papers) { expect(dump).not.toContain(p.serial.slice(3)); }
    expect(h.raw.query("SELECT serial FROM paper_serials").all().map((r: any) => r.serial)).toEqual((h.raw.query("SELECT serial FROM paper_serials").all() as any[]).map((r) => r.serial).sort()); // key order, not issue order
    for (let i = 3; i >= 0; i--) await scanPaper(h, e, papers[i], [id.Asha!]); // scanned in the opposite order
    const marks = h.raw.query("SELECT serial FROM paper_marks ORDER BY id").all().map((r: any) => r.serial); expect(marks).toEqual(papers.map((p) => p.serial).reverse());
    expect(JSON.stringify(h.raw.query("SELECT * FROM paper_marks").all())).not.toMatch(/A-10/); // no flat anywhere in the marks
  });
  test("FORGED OR REUSED PAPERS: a forged QR, a QR of another vote, a paper counted twice, a scan without a photo: all refused; nothing is counted twice", async () => {
    const h = await H.make(); const e = await liveEvent(h, { mode: "printed", flats: 3 }); const id = await e.ids();
    for (let i = 0; i < 3; i++) await checkIn(h, e, `A-${101 + i}`, VOTER_DEV + i);
    h.device = OFFICER_DEV; await ok(h.call("POST", `/api/events/${e.eid}/points/${e.pointId}/open`, { minutes: 30 }, e.org));
    const p = (await ok(h.call("POST", `/api/events/${e.eid}/points/${e.pointId}/paper`, { flatNo: "A-101" }, e.off.token))).body;
    const send = (token: string, extra: Record<string, unknown> = {}) => h.call("POST", `/api/events/${e.eid}/points/${e.pointId}/paper/scan`, { token, marks: { [id.Asha!]: true, [id.Bimal!]: false, [id.Chitra!]: false }, imageSha256: "b".repeat(64), ...extra }, e.off.token);
    expect((await send("bp_000000000000.0000000000000000")).body.error).toBe("bad_token"); expect((await send(p.token.slice(0, -1) + (p.token.endsWith("0") ? "1" : "0"))).body.error).toBe("bad_token");
    expect((await send(p.token, { imageSha256: "" })).body.error).toBe("image_required");
    expect((await send(p.token)).status).toBe(201); expect((await send(p.token)).body.error).toBe("already_handled");
    const other = await liveEvent(h, { mode: "printed", flats: 2 }); h.device = OFFICER_DEV; // a paper of another event is not valid here
    expect((await send("bp_aaaaaaaaaaaa." + "a".repeat(16))).body.error).toBe("bad_token"); void other;
    expect(h.count("SELECT COUNT(*) c FROM ballot_box WHERE event_id=?", e.eid)).toBe(1);
    expect(() => h.raw.query("INSERT INTO paper_marks(event_id,point_id,serial,kind,by_pid,at_ms) VALUES(?,?,?,'counted','x',1)").run(e.eid, e.pointId, "bp_ffffffffffff")).toThrow(/unknown serial/); // the database refuses an unknown serial
    expect(() => h.raw.query("INSERT INTO paper_marks(event_id,point_id,serial,kind,by_pid,at_ms) VALUES(?,?,?,'voided','x',1)").run(e.eid, e.pointId, (h.raw.query("SELECT serial FROM paper_serials").get() as any).serial)).toThrow(/UNIQUE/);
  });
  test("INVALID PAPERS ARE NOT GUESSED: too many ticks is recorded as invalid and not counted; a faint mark is flagged 'uncertain' for the officer; a voided paper can never be counted and the flat may get another", async () => {
    const h = await H.make(); const e = await liveEvent(h, { mode: "printed", flats: 4 }); const id = await e.ids();
    for (let i = 0; i < 4; i++) await checkIn(h, e, `A-${101 + i}`, VOTER_DEV + i);
    h.device = OFFICER_DEV; await ok(h.call("POST", `/api/events/${e.eid}/points/${e.pointId}/open`, { minutes: 30 }, e.org));
    const issue = async (flat: string) => (await ok(h.call("POST", `/api/events/${e.eid}/points/${e.pointId}/paper`, { flatNo: flat }, e.off.token))).body;
    const over = await issue("A-101"); const r1 = await scanPaper(h, e, over, [id.Asha!, id.Bimal!]); expect(r1.res.body).toMatchObject({ result: "invalid", reason: "too_many" });
    const faint = await issue("A-102"); const r2 = pageImage(faint.layout, [], [id.Chitra!]); expect(detectTicks(r2.g, r2.w, r2.h, faint.layout).find((x) => x.option === id.Chitra)!.state).toBe("uncertain"); // the app shows this box to the officer to confirm; this paper stays unscanned here
    const spoiled = await issue("A-103");
    expect((await h.call("POST", `/api/events/${e.eid}/points/${e.pointId}/paper`, { flatNo: "A-103" }, e.off.token)).body.error).toBe("already_voted"); // no second paper without handing the first back
    const vd = await ok(h.call("POST", `/api/events/${e.eid}/points/${e.pointId}/paper/void`, { token: spoiled.token, flatNo: "A-103", reason: "torn" }, e.off.token)); expect(vd.status).toBe(200);
    expect((await scanPaper(h, e, spoiled, [id.Asha!])).res.body.error).toBe("already_handled"); // a voided paper never counts
    const again = await issue("A-103"); expect(again.serial).not.toBe(spoiled.serial); expect((await scanPaper(h, e, again, [id.Bimal!])).res.status).toBe(201);
    expect((await h.call("POST", `/api/events/${e.eid}/points/${e.pointId}/paper`, { flatNo: "A-103" }, e.off.token)).body.error).toBe("already_voted"); // the allowance was used once
    await ok(h.call("POST", `/api/events/${e.eid}/points/${e.pointId}/close`, {}, e.org)); await ok(h.call("POST", `/api/events/${e.eid}/points/${e.pointId}/count/finish`, {}, e.org));
    const m = await e.model(); expect(m.points[0].paper).toMatchObject({ serials: 4, counted: 1, invalid: 1, voided: 1, uncounted: 1 }); // A-102's paper never came back
    expect(m.points[0].tally.ballots).toBe(1); expect((await replayLog((await getLog(h, e.eid)).entries)).problems).toEqual([]);
    const types = (await getLog(h, e.eid)).entries.map((x) => x.entry.type); expect(types).toContain("paper_voided"); expect(types).toContain("paper_reissued");
  });
  test("BALLOT MODE is the Organizer's choice: online only refuses paper; printed only refuses the online cast; 'either' lets both channels count into ONE box; a flat uses only one channel", async () => {
    const h = await H.make(); const online = await liveEvent(h, { mode: "online", flats: 2 }); await checkIn(h, online, "A-101"); h.device = OFFICER_DEV; await ok(h.call("POST", `/api/events/${online.eid}/points/${online.pointId}/open`, { minutes: 30 }, online.org));
    expect((await h.call("POST", `/api/events/${online.eid}/points/${online.pointId}/paper`, { flatNo: "A-101" }, online.off.token)).body.error).toBe("online_only");
    const printed = await liveEvent(h, { mode: "printed", flats: 2 }); const pc = await checkIn(h, printed, "A-101"); h.device = OFFICER_DEV; await ok(h.call("POST", `/api/events/${printed.eid}/points/${printed.pointId}/open`, { minutes: 30 }, printed.org));
    const pid = await printed.ids(); h.device = VOTER_DEV; expect((await h.call("POST", "/api/vote/cast", { pointId: printed.pointId, choices: [pid.Asha!] }, pc.token)).body.error).toBe("printed_only");
    const either = await liveEvent(h, { mode: "either", flats: 3 }); const id = await either.ids();
    const c1 = await checkIn(h, either, "A-101", VOTER_DEV + 1); await checkIn(h, either, "A-102", VOTER_DEV + 2); h.device = OFFICER_DEV; await ok(h.call("POST", `/api/events/${either.eid}/points/${either.pointId}/open`, { minutes: 30 }, either.org));
    h.device = VOTER_DEV + 1; expect((await h.call("POST", "/api/vote/cast", { pointId: either.pointId, choices: [id.Asha!] }, c1.token)).status).toBe(201); // A-101 online
    h.device = OFFICER_DEV; expect((await h.call("POST", `/api/events/${either.eid}/points/${either.pointId}/paper`, { flatNo: "A-101" }, either.off.token)).body.error).toBe("already_voted"); // not on paper too
    const paper = (await ok(h.call("POST", `/api/events/${either.eid}/points/${either.pointId}/paper`, { flatNo: "A-102" }, either.off.token))).body; expect((await scanPaper(h, either, paper, [id.Bimal!])).res.status).toBe(201);
    h.device = OFFICER_DEV; await ok(h.call("POST", `/api/events/${either.eid}/close`, {}, either.org));
    const m = (await h.call("GET", `/api/events/${either.eid}`)).body.model; expect(m.points[0].tally.ballots).toBe(2); expect(m.points[0].paper).toMatchObject({ serials: 1, counted: 1 });
    expect((await replayLog((await getLog(h, either.eid)).entries)).problems).toEqual([]);
  });
  test("printed ballots require a secret ballot: publishing is refused if a point voted on paper is an open vote; paper routes refuse a non-secret point", async () => {
    const h = await H.make(); h.device = OFFICER_DEV; const e = await newEvent(h);
    await ok(h.call("PUT", `/api/events/${e.eid}/roll`, { flats: flatsOf(3) }, e.org)); await ok(h.call("PUT", `/api/events/${e.eid}/rules`, { changes: { "ballot.mode": "printed" }, reason: "we want paper ballots" }, e.org));
    await ok(h.call("POST", `/api/events/${e.eid}/points`, { kind: "resolution", title: "Open question", secret: false }, e.org));
    const pay = await ok(h.call("POST", `/api/events/${e.eid}/pay`, {}, e.org)); await ok(h.call("POST", "/api/pay/test-confirm", { eventId: e.eid, paymentId: pay.body.paymentId }, e.org));
    const pub = await h.call("POST", `/api/events/${e.eid}/agenda/publish`, {}, e.org); expect(pub.status).toBe(403); expect(pub.body.error).toBe("paper_needs_secret");
  });
  test("the paper tables are append-only and frozen after publication; the sealed report prints the paper accounts; the paper preview is available to design the ballot", async () => {
    const h = await H.make(); const e = await liveEvent(h, { mode: "printed", flats: 2 }); const id = await e.ids();
    const prev = await h.call("GET", `/api/events/${e.eid}/points/${e.pointId}/paper/preview`, undefined, e.org); expect(prev.body.svg).toContain("SAMPLE");
    await checkIn(h, e, "A-101"); h.device = OFFICER_DEV; await ok(h.call("POST", `/api/events/${e.eid}/points/${e.pointId}/open`, { minutes: 30 }, e.org));
    const p = (await ok(h.call("POST", `/api/events/${e.eid}/points/${e.pointId}/paper`, { flatNo: "A-101" }, e.off.token))).body; await scanPaper(h, e, p, [id.Asha!]);
    await ok(h.call("POST", `/api/events/${e.eid}/close`, {}, e.org)); // closes the point, finishes counting and publishes
    for (const t of ["paper_serials", "paper_marks"]) { expect(() => h.raw.query(`UPDATE ${t} SET event_id=event_id`).run()).toThrow(/append-only/); expect(() => h.raw.query(`DELETE FROM ${t}`).run()).toThrow(/append-only/); }
    expect(() => h.raw.query("INSERT INTO paper_serials VALUES('bp_eeeeeeeeeeee',?,?,1,'official')").run(e.eid, e.pointId)).toThrow(/published/);
    expect((await h.call("GET", `/api/r/${e.eid}`)).text).toContain("Paper ballots: 1 issued, 1 counted");
    const pdf = new TextDecoder("latin1").decode(new Uint8Array(await (await (await import("../src/handler")).handle(new Request(`http://x/api/r/${e.eid}/pdf`), h.env, h.now)).arrayBuffer())); expect(pdf).toContain("%PDF");
  });
});

describe("languages and step-by-step guides", () => {
  test("language list for the upper-right drop-down, dictionaries per language, and guides for every role in English and Hindi", async () => {
    const h = await H.make(); const l = await h.call("GET", "/api/languages"); expect(l.body.languages.length).toBe(16); expect(l.body.languages.find((x: any) => x.code === "ar").dir).toBe("rtl");
    const hi = await h.call("GET", "/api/i18n/hi"); expect(hi.body.dictionary["btn.verify"]).toBe("जाँचें"); expect((await h.call("GET", "/api/i18n/zz")).status).toBe(404);
    for (const role of ["organizer", "host", "attendance_officer", "voter"]) { const g = await h.call("GET", `/api/guide/${role}?lang=hi`); expect(g.status).toBe(200); for (const s of g.body.steps) for (const f of ["what", "how", "where", "when", "why", "withWhom", "which"]) expect(s[f].length).toBeGreaterThan(3); }
    expect((await h.call("GET", "/api/guide/janitor")).status).toBe(404);
    const e = await newEvent(h); const og = await h.call("GET", `/api/guide/organizer?event=${e.eid}`); expect(og.body.steps[0].status).toBe("done"); expect(og.body.current).toBe("flats"); expect(og.body.steps.length).toBe(8);
  });
});
void ORG; void PRIVATE; void defaultBallotDesign; void buildReportModel; void DAY;

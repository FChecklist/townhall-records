// Owner directive 2026-10-23: everything is logged with IP address and device ID (mandatory); everyone ticks the terms; full traceability without breaking the secret ballot.
import { describe, expect, test } from "bun:test";
import { TERMS_VERSION, buildReportModel, replayLog, scanPublic } from "../../../packages/engine/src";
import { H, OFFP, ORG, appointVerified, getLog, newEvent, setup, STAFF_PUBLIC } from "./harness";
import { DAY } from "./harness";

const DEVICE = "device-test-00000001";
const body = (over: Record<string, unknown> = {}) => ({ kind: "meeting", eventType: "agm", title: "AGM", venue: "Hall", scheduledMs: 0, packId: "in-up-aoa", society: { name: "Sky Heights", address: "Addr 1 Road", registrationNo: "R1", kind: "AOA" }, organizer: ORG, turnstile: "test-ok", ...over });

async function live(h: H, secret = false) {
  const e = await setup(h, { flats: 6, secret }); const off = await appointVerified(h, e, OFFP, "attendance_officer");
  await e.ok(h.call("POST", `/api/events/${e.eid}/agenda/publish`, {}, e.org)); await e.ok(h.call("POST", `/api/events/${e.eid}/start`, {}, e.org));
  for (let i = 0; i < 4; i++) await e.ok(h.call("POST", `/api/events/${e.eid}/attendance`, { flatNo: `A-${101 + i}`, attendeeName: "Owner " + i, mode: "physical", method: "visual" }, off.token));
  await e.ok(h.call("POST", `/api/events/${e.eid}/points/${e.pointId}/open`, { minutes: 30 }, e.org));
  return { ...e, off };
}
async function voter(h: H, e: Awaited<ReturnType<typeof live>>, flat: string, extra: Record<string, unknown> = {}) {
  const c = await h.call("POST", `/api/events/${e.eid}/passcodes/voter`, { flatNo: flat }, e.off.token);
  return { code: c.body.code as string, login: () => h.call("POST", "/api/vote/login", { eventId: e.eid, flatNo: flat, code: c.body.code, turnstile: "test-ok", ...extra }) };
}

describe("terms and conditions: everyone ticks the box", () => {
  test("the terms are public, versioned and hashed", async () => {
    const h = await H.make(); const t = await h.call("GET", "/api/terms");
    expect(t.body.version).toBe(TERMS_VERSION); expect(t.body.sha256).toMatch(/^[0-9a-f]{64}$/); expect(t.body.text).toContain("IP address"); expect(t.body.text).toContain("Secret ballots stay secret");
  });
  test("creating an event without ticking the terms (or with an old version) is refused; nothing is created", async () => {
    const h = await H.make(); h.now = Date.UTC(2026, 10, 1);
    const none = await h.call("POST", "/api/events", body({ scheduledMs: h.now + 9 * DAY, acceptTerms: false }));
    expect(none.status).toBe(400); expect(none.body.error).toBe("terms_required");
    const old = await h.call("POST", "/api/events", body({ scheduledMs: h.now + 9 * DAY, acceptTerms: true, termsVersion: "1999" }));
    expect(old.body.error).toBe("terms_required"); expect(h.count("SELECT COUNT(*) c FROM events")).toBe(0);
  });
  test("an appointed Host/Officer must tick before their code is accepted, and the refused tick does NOT use the code up", async () => {
    const h = await H.make(); const e = await setup(h);
    const r = await h.call("POST", `/api/events/${e.eid}/people`, { name: "Sunil Verma", email: "sunil.verma@example.org", role: "attendance_officer" }, e.org);
    const code = h.codeFor("sunil.verma@example.org");
    const no = await h.call("POST", "/api/auth/verify", { eventId: e.eid, personId: r.body.personId, code, acceptTerms: false });
    expect(no.status).toBe(400); expect(no.body.error).toBe("terms_required");
    const yes = await h.call("POST", "/api/auth/verify", { eventId: e.eid, personId: r.body.personId, code }); // same code, now ticked
    expect(yes.status).toBe(200);
    const log = (await getLog(h, e.eid)).entries.filter((x) => x.entry.type === "terms_accepted").map((x) => x.entry.payload as any);
    expect(log.filter((p) => p.ref === r.body.personId).length).toBe(1); expect(log[0].version).toBe(TERMS_VERSION); expect(log[0].termsSha256).toMatch(/^[0-9a-f]{64}$/);
  });
  test("every voter ticks the terms before the first ballot; refusing does not burn the passcode; the tick is logged once per flat", async () => {
    const h = await H.make(); const e = await live(h); const v = await voter(h, e, "A-101");
    const refused = await h.call("POST", "/api/vote/login", { eventId: e.eid, flatNo: "A-101", code: v.code, turnstile: "test-ok", acceptTerms: false });
    expect(refused.status).toBe(400); expect(refused.body.error).toBe("terms_required");
    const ok = await v.login(); expect(ok.status).toBe(200);
    const flatTerms = (await getLog(h, e.eid)).entries.filter((x) => x.entry.type === "terms_accepted" && (x.entry.payload as any).subject === "flat");
    expect(flatTerms.length).toBe(1); expect((flatTerms[0]!.entry.actor as any).flat).toBe("A-101");
    const st = await replayLog((await getLog(h, e.eid)).entries); expect(st.problems).toEqual([]);
  });
  test("replay flags anyone who acted in the log without accepting the terms (staff and voters)", async () => {
    const { Scenario } = await import("../../../packages/engine/test/helpers");
    const s = await Scenario.create(); await s.addPoint("pt_1", "1"); await s.pay(); await s.publish(); await s.start(); await s.attend("A-101"); await s.open("pt_1");
    await s.add("vote_cast_open", { flat: "A-101" }, { pointId: "pt_1", flatNo: "A-101", kind: "official", choices: ["yes"] }); // no terms_accepted for this flat
    expect((await s.state()).problems.join()).toContain("voted without accepting the terms");
    const s2 = await Scenario.create(); await s2.addPoint("pt_1", "1");
    await s2.add("role_appointed", s2.org, { pid: "p_stranger0000001", role: "host", appointedBy: "p_org0000000000001", maskedName: "S****", maskedEmail: "s****@e****.org" });
    await s2.add("point_added", { pid: "p_stranger0000001", role: "host" }, { pointId: "pt_2", number: "2", title: "Sneaky", body: "", kind: "discussion", options: [], maxChoices: 1, majorityClass: "simple", secret: false, rev: 1 });
    expect((await s2.state()).problems.join()).toContain("p_stranger0000001 acted (point_added) without accepting the terms");
    await s2.add("terms_accepted", { pid: "p_stranger0000001", role: "host" }, { subject: "pid", ref: "p_stranger0000001", version: "v", termsSha256: "0".repeat(64) });
    await s2.add("point_added", { pid: "p_stranger0000001", role: "host" }, { pointId: "pt_3", number: "3", title: "Fine", body: "", kind: "discussion", options: [], maxChoices: 1, majorityClass: "simple", secret: false, rev: 1 });
    expect((await s2.state()).problems.filter((x) => x.includes("(point_added)")).length).toBe(1); // only the earlier one
  });
});

describe("every action: IP address + device ID, audited before it is processed", () => {
  test("DEVICE ID IS MANDATORY: an action without it is refused (and the refusal is itself audited); public page reads need none", async () => {
    const h = await H.make(); h.now = Date.UTC(2026, 10, 1); h.device = null;
    const r = await h.call("POST", "/api/events", body({ scheduledMs: h.now + 9 * DAY }));
    expect(r.status).toBe(400); expect(r.body.error).toBe("device_required");
    expect(h.count("SELECT COUNT(*) c FROM access_audit WHERE status=400")).toBe(1);
    expect(h.count("SELECT COUNT(*) c FROM events")).toBe(0);
    h.device = DEVICE; const e = await newEvent(h); h.device = null;
    expect((await h.call("GET", `/api/r/${e.eid}`)).status).toBe(200); // anonymous public read
    expect((await h.call("GET", `/api/events/${e.eid}/private`, undefined, e.org)).body.error).toBe("device_required"); // authenticated read
    expect((await h.call("GET", "/api/events/" + e.eid)).status).toBe(200);
    h.device = "short"; expect((await h.call("POST", `/api/events/${e.eid}/points`, {}, e.org)).body.error).toBe("device_required"); // malformed id
  });
  test("EVERY request leaves two audit rows: one BEFORE (request) and one AFTER (result with status and the log entry it reached)", async () => {
    const h = await H.make(); const e = await live(h);
    const before = h.count("SELECT COUNT(*) c FROM access_audit"); const logBefore = (await getLog(h, e.eid)).entries.length;
    const v = await voter(h, e, "A-102"); const l = await v.login(); const cast = await h.call("POST", "/api/vote/cast", { pointId: e.pointId, choices: ["yes"] }, l.body.token);
    expect(cast.status).toBe(201);
    const rows = h.raw.query("SELECT * FROM access_audit WHERE id>? ORDER BY id").all(before) as any[];
    expect(rows.length).toBe(6); // issue code, login, cast: 3 requests x 2 rows
    for (let i = 0; i < rows.length; i += 2) { expect(rows[i].phase).toBe("request"); expect(rows[i + 1].phase).toBe("result"); expect(rows[i + 1].ref_id).toBe(rows[i].id); expect(rows[i].at_ms).toBeLessThanOrEqual(rows[i + 1].at_ms); }
    const castRow = rows[5]; expect(castRow.route).toBe("/api/vote/cast"); expect(castRow.status).toBe(201); expect(castRow.actor_kind).toBe("voter"); expect(castRow.actor_ref).toBe("A-102");
    expect(castRow.log_seq).toBe((await getLog(h, e.eid)).entries.length); expect((await getLog(h, e.eid)).entries.length).toBeGreaterThan(logBefore);
    // failures are audited too
    const bad = await h.call("POST", "/api/vote/login", { eventId: e.eid, flatNo: "A-103", code: "000000", turnstile: "test-ok" });
    expect(bad.status).toBe(401); expect(h.count("SELECT COUNT(*) c FROM access_audit WHERE status=401 AND phase='result'")).toBeGreaterThanOrEqual(1);
  });
  test("IP and device are stored ENCRYPTED (not readable in the database), with blind indexes so the same address/device can be traced", async () => {
    const h = await H.make(); const e = await live(h);
    await h.call("POST", `/api/events/${e.eid}/points/${e.pointId}/extend`, { reason: "more time please" }, e.org, "203.0.113.77");
    const dump = JSON.stringify(h.raw.query("SELECT * FROM access_audit").all());
    expect(dump).not.toContain("203.0.113.77"); expect(dump).not.toContain(DEVICE); expect(dump).not.toContain("TestBrowser");
    const idx = h.raw.query("SELECT ip_idx, dev_idx FROM access_audit WHERE actor_kind='staff' LIMIT 50").all() as any[];
    expect(new Set(idx.map((r) => r.dev_idx)).size).toBe(1); // one device -> one blind index across rows
    expect(idx.every((r) => /^[0-9a-f]{24}$/.test(r.ip_idx))).toBe(true);
  });
  test("EVERY log entry written for a request carries a keyed fingerprint of IP+device (`acc`), different for every entry, never the values", async () => {
    const h = await H.make(); const e = await live(h);
    const { entries } = await getLog(h, e.eid);
    const withAcc = entries.filter((x) => typeof (x.entry.payload as any).acc === "string");
    expect(withAcc.length).toBe(entries.length); // every entry here was caused by a request
    expect(new Set(withAcc.map((x) => (x.entry.payload as any).acc)).size).toBe(withAcc.length);
    const model = buildReportModel(await replayLog(entries)); expect(model.access.entriesWithAccessFingerprint).toBe(entries.length); expect(model.access.termsAccepted).toBeGreaterThanOrEqual(2);
    // public output never shows an IP address or a device id
    for (const p of [`/api/r/${e.eid}`, `/api/events/${e.eid}/log`, `/api/r/${e.eid}/data`, `/api/events/${e.eid}`]) {
      const t = (await h.call("GET", p)).text;
      expect(scanPublic(t, { allow: ["R1", ...STAFF_PUBLIC], forbidden: [DEVICE, "9.9.9."] })).toEqual([]);
    }
  });
  test("what the Organizer sees is SHORTENED; what the owner sees is FULL, needs a reason, and the viewing is on the public page", async () => {
    const h = await H.make(); const e = await live(h);
    await h.call("POST", `/api/events/${e.eid}/points/${e.pointId}/close`, {}, e.org, "203.0.113.77");
    const org = await h.call("GET", `/api/events/${e.eid}/audit`, undefined, e.org);
    expect(org.status).toBe(200); const row = org.body.rows.find((r: any) => r.route.endsWith("/close") && r.status === 200);
    expect(row.ip).toBe("203.0.*.*"); expect(row.device).toBe("device..."); expect(JSON.stringify(org.body)).not.toContain(DEVICE); expect(JSON.stringify(org.body)).not.toContain("203.0.113.77");
    expect((await h.call("GET", `/api/events/${e.eid}/audit`, undefined, e.off.token)).status).toBe(403); // an officer cannot
    await h.call("POST", "/api/super/request", {}); const sup = (await h.call("POST", "/api/super/verify", { code: h.codeFor("owner@platform.example") })).body.token;
    expect((await h.call("GET", `/api/super/events/${e.eid}/audit`, undefined, sup)).status).toBe(400); // no reason given
    const full = await h.call("GET", `/api/super/events/${e.eid}/audit?reason=${encodeURIComponent("court order 123")}`, undefined, sup);
    const frow = full.body.rows.find((r: any) => r.route.endsWith("/close") && r.status === 200);
    expect(frow.ip).toBe("203.0.113.77"); expect(frow.device).toBe(DEVICE); expect(frow.userAgent).toContain("TestBrowser");
    expect((await h.call("GET", `/api/r/${e.eid}`)).text).toContain("audit_read");
  });
  test("SECRET BALLOT STAYS SECRET: audit rows hold no choice and no receipt; the ballot box holds no IP, device or time", async () => {
    const h = await H.make(); const e = await live(h, true);
    const v = await voter(h, e, "A-101"); const l = await v.login(); const cast = await h.call("POST", "/api/vote/cast", { pointId: e.pointId, choices: ["no"] }, l.body.token, "198.51.100.9");
    expect(cast.status).toBe(201);
    await h.call("POST", "/api/super/request", {}); const sup = (await h.call("POST", "/api/super/verify", { code: h.codeFor("owner@platform.example") })).body.token;
    const all = JSON.stringify((await h.call("GET", `/api/super/events/${e.eid}/audit?reason=${encodeURIComponent("test review")}`, undefined, sup)).body);
    expect(all).not.toContain(cast.body.receipt); expect(all).not.toContain(cast.body.nonce); expect(all).not.toMatch(/choices|"no"/);
    expect(all).toContain("198.51.100.9"); // WHO voted from where is traced ...
    const cols = (h.raw.query("PRAGMA table_info(ballot_box)").all() as any[]).map((c) => c.name);
    for (const bad of ["ip", "ip_idx", "device", "dev_idx", "flat_no", "at_ms", "voted_ms", "ts", "session"]) expect(cols).not.toContain(bad); // ... but the box (WHAT) carries nothing that points back
    expect(JSON.stringify(h.raw.query("SELECT * FROM ballot_box").all())).not.toContain("198.51.100.9");
    const logs = JSON.stringify((await getLog(h, e.eid)).entries);
    expect(logs).not.toContain(cast.body.receipt); // the receipt only appears after the box is sealed, as part of the sorted list
  });
  test("a request that cannot be audited is NOT carried out (fail closed)", async () => {
    const h = await H.make(); const e = await newEvent(h); const before = (await getLog(h, e.eid)).entries.length;
    h.raw.exec("DROP TRIGGER access_audit_no_update"); h.raw.exec("DROP TABLE access_audit");
    const r = await h.call("PUT", `/api/events/${e.eid}/roll`, { flats: [{ flatNo: "A-101" }] }, e.org);
    expect(r.status).toBe(503); expect(r.body.error).toBe("audit_unavailable");
    h.raw.exec("CREATE TABLE access_audit (id INTEGER PRIMARY KEY AUTOINCREMENT, at_ms INTEGER, event_id TEXT, phase TEXT, ref_id INTEGER, method TEXT, route TEXT, actor_kind TEXT, actor_ref TEXT, status INTEGER, log_seq INTEGER, ct TEXT, ip_idx TEXT, dev_idx TEXT, key_scope TEXT)");
    expect((await getLog(h, e.eid)).entries.length).toBe(before); // nothing happened
  });
  test("after crypto-shredding the private traces are unreadable (the fingerprints remain)", async () => {
    const h = await H.make(); const e = await live(h);
    await h.call("POST", `/api/events/${e.eid}/close`, {}, e.org);
    await h.call("POST", `/api/events/${e.eid}/crypto-shred`, {}, e.org);
    await h.call("POST", "/api/super/request", {}); const sup = (await h.call("POST", "/api/super/verify", { code: h.codeFor("owner@platform.example") })).body.token;
    const rows = (await h.call("GET", `/api/super/events/${e.eid}/audit?reason=${encodeURIComponent("after erasure")}`, undefined, sup)).body.rows;
    expect(rows.filter((r: any) => r.erased).length).toBeGreaterThan(5); expect(rows.every((r: any) => r.ipFingerprint)).toBe(true);
  });
});

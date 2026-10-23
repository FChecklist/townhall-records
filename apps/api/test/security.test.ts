// The tests the PM listed: each one tries to cheat and must FAIL to cheat. scripts/mutate.ts breaks the code and shows them failing.
import { describe, expect, test } from "bun:test";
import { buildReportModel, extractData, replayLog, scanPublic, verifyChain, verifyEmbedded, verifyReportHtml } from "../../../packages/engine/src";
import { DAY, H, HOSTP, OFFP, ORG, PRIVATE, appointVerified, chainOk, flatsOf, getLog, newEvent, setup } from "./harness";

/** A live event with an officer, `n` flats present, first point open for 30 minutes. */
async function liveEvent(h: H, o: { flats?: number; present?: number; secret?: boolean; pack?: string } = {}) {
  const e = await setup(h, { flats: o.flats ?? 10, secret: o.secret, pack: o.pack });
  const off = await appointVerified(h, e, OFFP, "attendance_officer");
  await e.ok(h.call("POST", `/api/events/${e.eid}/agenda/publish`, {}, e.org));
  await e.ok(h.call("POST", `/api/events/${e.eid}/start`, {}, e.org));
  for (let i = 0; i < (o.present ?? 5); i++) await e.ok(h.call("POST", `/api/events/${e.eid}/attendance`, { flatNo: `A-${101 + i}`, attendeeName: `Owner ${i}`, mode: "physical", method: "visual" }, off.token));
  await e.ok(h.call("POST", `/api/events/${e.eid}/points/${e.pointId}/open`, { minutes: 30 }, e.org));
  const voter = async (flat: string) => { const c = await h.call("POST", `/api/events/${e.eid}/passcodes/voter`, { flatNo: flat }, off.token); const l = await h.call("POST", "/api/vote/login", { eventId: e.eid, flatNo: flat, code: c.body.code, turnstile: "test-ok" }); if (l.status !== 200) throw new Error(l.text); return { code: c.body.code as string, token: l.body.token as string }; };
  return { ...e, off, voter };
}

describe("passcodes through the API", () => {
  test("REPLAY: a login code works once; the same code again is refused", async () => {
    const h = await H.make(); const r = await h.call("POST", "/api/events", { kind: "meeting", eventType: "agm", title: "AGM", venue: "Hall", scheduledMs: h.now + 9 * DAY, packId: "in-up-aoa", society: { name: "Sky Heights", address: "Addr 1", registrationNo: "R1", kind: "AOA" }, organizer: ORG, turnstile: "test-ok" });
    const code = h.codeFor(ORG.email);
    const a = await h.call("POST", "/api/auth/verify", { eventId: r.body.eventId, personId: r.body.personId, code }); expect(a.status).toBe(200);
    const b = await h.call("POST", "/api/auth/verify", { eventId: r.body.eventId, personId: r.body.personId, code }); expect(b.status).toBe(401);
  });
  test("a voter code is also single use: logging in twice with it fails", async () => {
    const h = await H.make(); const e = await liveEvent(h);
    const v = await e.voter("A-101");
    const again = await h.call("POST", "/api/vote/login", { eventId: e.eid, flatNo: "A-101", code: v.code, turnstile: "test-ok" });
    expect(again.status).toBe(401);
  });
  test("WRONG SUBJECT: flat A-101's code does not open A-102", async () => {
    const h = await H.make(); const e = await liveEvent(h);
    const c1 = await h.call("POST", `/api/events/${e.eid}/passcodes/voter`, { flatNo: "A-101" }, e.off.token);
    await h.call("POST", `/api/events/${e.eid}/passcodes/voter`, { flatNo: "A-102" }, e.off.token);
    const wrong = await h.call("POST", "/api/vote/login", { eventId: e.eid, flatNo: "A-102", code: c1.body.code, turnstile: "test-ok" });
    expect(wrong.status).toBe(401);
    expect((await h.call("POST", "/api/vote/login", { eventId: e.eid, flatNo: "A-101", code: c1.body.code, turnstile: "test-ok" })).status).toBe(200);
  });
  test("WRONG PURPOSE: a voter code does not sign anyone in as staff, and a staff login code does not open a ballot", async () => {
    const h = await H.make(); const e = await liveEvent(h);
    const c = await h.call("POST", `/api/events/${e.eid}/passcodes/voter`, { flatNo: "A-103" }, e.off.token);
    const asStaff = await h.call("POST", "/api/auth/verify", { eventId: e.eid, personId: e.pid, code: c.body.code }); expect(asStaff.status).toBe(401);
    await h.call("POST", "/api/auth/request", { eventId: e.eid, personId: e.pid, turnstile: "test-ok" });
    const loginCode = h.codeFor(ORG.email);
    const asVoter = await h.call("POST", "/api/vote/login", { eventId: e.eid, flatNo: "A-103", code: loginCode, turnstile: "test-ok" }); expect(asVoter.status).toBe(401);
  });
  test("6 WRONG TRIES: five wrong tries lock the passcode, then even the RIGHT code is refused; the lock is in the log", async () => {
    const h = await H.make(); const e = await liveEvent(h);
    const c = await h.call("POST", `/api/events/${e.eid}/passcodes/voter`, { flatNo: "A-104" }, e.off.token);
    const wrong = c.body.code === "000000" ? "000001" : "000000";
    for (let i = 0; i < 5; i++) expect((await h.call("POST", "/api/vote/login", { eventId: e.eid, flatNo: "A-104", code: wrong, turnstile: "test-ok" })).status).toBe(401);
    const sixth = await h.call("POST", "/api/vote/login", { eventId: e.eid, flatNo: "A-104", code: c.body.code, turnstile: "test-ok" });
    expect(sixth.status).toBe(401);
    const { entries } = await getLog(h, e.eid);
    expect(entries.some((x) => x.entry.type === "passcode_locked")).toBe(true);
  });
  test("no passcode digits anywhere in the database or the log", async () => {
    const h = await H.make(); const e = await liveEvent(h); const v = await e.voter("A-101");
    const dump = JSON.stringify([...(h.raw.query("SELECT * FROM passcodes").all()), ...(h.raw.query("SELECT entry_json FROM log_entries").all())]);
    expect(dump.includes(`"${v.code}"`)).toBe(false); expect(dump).not.toMatch(new RegExp(`(?<![0-9a-f])${v.code}(?![0-9a-f])`));
    expect(h.raw.query("SELECT hash FROM passcodes LIMIT 1").get()).toMatchObject({ hash: expect.stringMatching(/^[0-9a-f]{64}$/) });
  });
  test("login requests are rate limited per person, and need Turnstile", async () => {
    const h = await H.make(); const e = await newEvent(h);
    expect((await h.call("POST", "/api/auth/request", { eventId: e.eid, personId: e.pid })).status).toBe(403); // no Turnstile token
    let last = 0; for (let i = 0; i < 7; i++) last = (await h.call("POST", "/api/auth/request", { eventId: e.eid, personId: e.pid, turnstile: "test-ok" })).status;
    expect(last).toBe(429);
  });
});

describe("voting rules through the API", () => {
  test("VOTE TWICE is refused (409) and logged; the first vote stands", async () => {
    const h = await H.make(); const e = await liveEvent(h); const v = await e.voter("A-101");
    expect((await h.call("POST", "/api/vote/cast", { pointId: e.pointId, choices: ["yes"] }, v.token)).status).toBe(201);
    const second = await h.call("POST", "/api/vote/cast", { pointId: e.pointId, choices: ["no"] }, v.token);
    expect(second.status).toBe(409); expect(second.body.error).toBe("already_voted");
    expect(h.count("SELECT COUNT(*) c FROM voter_ledger WHERE flat_no='A-101'")).toBe(1);
    expect((await getLog(h, e.eid)).entries.some((x) => x.entry.type === "vote_rejected")).toBe(true);
  });
  test("the database itself refuses a second ballot for the same flat and point", async () => {
    const h = await H.make(); const e = await liveEvent(h); const v = await e.voter("A-101");
    await h.call("POST", "/api/vote/cast", { pointId: e.pointId, choices: ["yes"] }, v.token);
    expect(() => h.raw.query("INSERT INTO voter_ledger(event_id,point_id,flat_no,kind,voted_ms) VALUES(?,?,?,'official',1)").run(e.eid, e.pointId, "A-101")).toThrow(/UNIQUE/);
  });
  test("VOTE BEFORE MARKED PRESENT: no code can be issued, and a stray session cannot vote", async () => {
    const h = await H.make(); const e = await liveEvent(h, { present: 3 });
    const c = await h.call("POST", `/api/events/${e.eid}/passcodes/voter`, { flatNo: "A-109" }, e.off.token);
    expect(c.status).toBe(409); expect(c.body.error).toBe("not_present");
    // a code issued while present, then the attendance revoked, cannot vote
    const v = await e.voter("A-101");
    await h.call("POST", `/api/events/${e.eid}/attendance`, { flatNo: "A-101", attendeeName: "Owner 0", mode: "physical", method: "visual", present: false }, e.off.token);
    const cast = await h.call("POST", "/api/vote/cast", { pointId: e.pointId, choices: ["yes"] }, v.token);
    expect(cast.status).toBe(403); expect(cast.body.error).toBe("not_present");
  });
  test("VOTE AFTER CLOSE (point closed) and after the SERVER clock passes the window: refused", async () => {
    const h = await H.make(); const e = await liveEvent(h);
    const a = await e.voter("A-101"), b = await e.voter("A-102");
    h.now += 31 * 60_000; // the server clock, not the client, ends the window
    const late = await h.call("POST", "/api/vote/cast", { pointId: e.pointId, choices: ["yes"] }, a.token);
    expect(late.status).toBe(403); expect(late.body.error).toBe("window_ended");
    h.now -= 20 * 60_000;
    expect((await h.call("POST", `/api/events/${e.eid}/points/${e.pointId}/close`, {}, e.org)).status).toBe(200);
    const closed = await h.call("POST", "/api/vote/cast", { pointId: e.pointId, choices: ["yes"] }, b.token);
    expect(closed.status).toBe(403); expect(closed.body.error).toBe("point_closed");
    expect(h.count("SELECT COUNT(*) c FROM voter_ledger")).toBe(0);
  });
  test("invalid ballots are refused (unknown option, too many choices)", async () => {
    const h = await H.make(); const e = await liveEvent(h); const v = await e.voter("A-101");
    expect((await h.call("POST", "/api/vote/cast", { pointId: e.pointId, choices: ["maybe"] }, v.token)).status).toBe(400);
    expect((await h.call("POST", "/api/vote/cast", { pointId: e.pointId, choices: ["yes", "no"] }, v.token)).status).toBe(400);
    expect((await h.call("POST", "/api/vote/cast", { pointId: e.pointId, choices: [] }, v.token)).status).toBe(400);
  });
  test("CHANGE A RULE AFTER VOTING OPENED on that point: refused, and the attempt is visible in the log and on the page", async () => {
    const h = await H.make(); const e = await liveEvent(h);
    const r = await h.call("PUT", `/api/events/${e.eid}/rules`, { scope: e.pointId, changes: { "tie.break": "lots" }, reason: "tilt it" }, e.org);
    expect(r.status).toBe(403); expect(r.body.error).toBe("frozen");
    const { entries } = await getLog(h, e.eid);
    expect(entries.some((x) => x.entry.type === "rule_change_rejected")).toBe(true);
    expect(entries.some((x) => x.entry.type === "rule_changed")).toBe(false);
    expect((await h.call("GET", `/api/r/${e.eid}`)).text).toContain("refused and logged");
    // the agenda point cannot be amended after it opened either
    expect((await h.call("PUT", `/api/events/${e.eid}/points/${e.pointId}`, { kind: "resolution", title: "Something else" }, e.org)).status).toBe(403);
  });
  test("a rule change BEFORE voting is allowed and shows its history (who, old, new, reason)", async () => {
    const h = await H.make(); const e = await setup(h);
    const r = await h.call("PUT", `/api/events/${e.eid}/rules`, { changes: { "tie.break": "lots" }, reason: "society resolution 12" }, e.org); expect(r.status).toBe(200);
    expect((await h.call("GET", `/api/r/${e.eid}`)).text).toContain("society resolution 12");
  });
  test("proxy voting is off unless ticked; Maharashtra's law lock cannot be unticked by the Organizer", async () => {
    const h = await H.make(); const e = await liveEvent(h);
    const p = await h.call("POST", `/api/events/${e.eid}/passcodes/voter`, { flatNo: "A-101", kind: "proxy", holderRef: "Neha Gupta" }, e.off.token);
    expect(p.status).toBe(403); expect(p.body.error).toBe("proxy_off");
    const mh = await setup(h, { pack: "in-mh-coop-society" });
    const t = await h.call("PUT", `/api/events/${mh.eid}/options`, { options: { proxy_voting: true } }, mh.org);
    expect(t.status).toBe(403); expect(t.body.error).toBe("locked_by_law"); expect(t.body.message).toContain("Election Rules");
  });
});

describe("roles", () => {
  test("nobody acts without verifying their e-mail: no token, no staff action (organizer included)", async () => {
    const h = await H.make();
    const r = await h.call("POST", "/api/events", { kind: "meeting", eventType: "agm", title: "AGM", venue: "Hall", scheduledMs: h.now + 9 * DAY, packId: "in-up-aoa", society: { name: "Sky Heights", address: "Addr 1", registrationNo: "R1", kind: "AOA" }, organizer: ORG, turnstile: "test-ok" });
    expect(r.status).toBe(201);
    for (const [m, p] of [["PUT", "roll"], ["POST", "points"], ["POST", "pay"], ["POST", "start"], ["POST", "attendance"]] as const) expect((await h.call(m, `/api/events/${r.body.eventId}/${p}`, {})).status).toBe(401);
    // a guessed token is not a session
    expect((await h.call("POST", `/api/events/${r.body.eventId}/pay`, {}, "0".repeat(64))).status).toBe(401);
  });
  test("an appointed Host cannot act until THEIR e-mail is verified (and the log says who appointed them)", async () => {
    const h = await H.make(); const e = await setup(h);
    const r = await h.call("POST", `/api/events/${e.eid}/people`, { name: HOSTP.name, email: HOSTP.email, phone: HOSTP.phone, role: "host" }, e.org);
    expect(r.status).toBe(201);
    const v = await h.call("POST", "/api/auth/verify", { eventId: e.eid, personId: r.body.personId, code: h.codeFor(HOSTP.email) });
    const m = await h.call("GET", `/api/events/${e.eid}`);
    const host = m.body.model.people.find((p: any) => p.roles.includes("host"));
    expect(host.verified).toBe(true); expect(v.status).toBe(200);
    expect(m.body.model.tree[0].children[0].roles).toEqual(["host"]); // appointed by the organizer
  });
  test("ONE PERSON AS HOST + ATTENDANCE OFFICER works end to end", async () => {
    const h = await H.make(); const e = await setup(h);
    const host = await appointVerified(h, e, HOSTP, "host");
    const r = await h.call("POST", `/api/events/${e.eid}/people`, { personId: host.pid, role: "attendance_officer" }, e.org); expect(r.status).toBe(201);
    await h.call("POST", `/api/events/${e.eid}/agenda/publish`, {}, host.token);
    const a = await h.call("POST", `/api/events/${e.eid}/attendance`, { flatNo: "A-101", attendeeName: "Owner One", mode: "physical", method: "visual" }, host.token);
    expect(a.status).toBe(200); expect(a.body.independent).toBe(true);
    const model = (await h.call("GET", `/api/events/${e.eid}`)).body.model;
    expect(model.people.find((p: any) => p.pid === host.pid).roles.sort()).toEqual(["attendance_officer", "host"]);
  });
  test("ZERO attendance officers: the Organizer may mark attendance and the page says 'not independently verified'", async () => {
    const h = await H.make(); const e = await setup(h);
    await h.call("POST", `/api/events/${e.eid}/agenda/publish`, {}, e.org);
    const a = await h.call("POST", `/api/events/${e.eid}/attendance`, { flatNo: "A-101", attendeeName: "Owner One", mode: "physical", method: "visual" }, e.org);
    expect(a.status).toBe(200); expect(a.body.independent).toBe(false);
    expect((await h.call("GET", `/api/r/${e.eid}`)).text).toContain("Attendance was not independently verified.");
  });
  test("once an Attendance Officer exists the Organizer can no longer mark attendance", async () => {
    const h = await H.make(); const e = await liveEvent(h);
    const a = await h.call("POST", `/api/events/${e.eid}/attendance`, { flatNo: "A-109", attendeeName: "Owner Nine", mode: "physical", method: "visual" }, e.org);
    expect(a.status).toBe(403);
  });
  test("a token for one event does not work on another", async () => {
    const h = await H.make(); const a = await setup(h); const b = await newEvent(h);
    const x = await h.call("PUT", `/api/events/${b.eid}/roll`, { flats: flatsOf(2) }, a.org); expect(x.status).toBe(403); expect(x.body.error).toBe("wrong_event");
  });
  test("an Attendance Officer cannot pay, change rules or open points", async () => {
    const h = await H.make(); const e = await liveEvent(h);
    expect((await h.call("PUT", `/api/events/${e.eid}/rules`, { changes: { "tie.break": "lots" }, reason: "x y z" }, e.off.token)).status).toBe(403);
    expect((await h.call("POST", `/api/events/${e.eid}/points/${e.pointId}/close`, {}, e.off.token)).status).toBe(403);
    expect((await h.call("GET", `/api/events/${e.eid}/contacts`, undefined, e.off.token)).status).toBe(403);
  });
});

describe("append-only database and tamper evidence", () => {
  async function busyDb() {
    const h = await H.make(); const e = await liveEvent(h, { secret: true });
    await h.call("POST", `/api/events/${e.eid}/people`, { personId: e.pid, role: "host", label: "Chairman" }, e.org);
    const v = await e.voter("A-101"); await h.call("POST", "/api/vote/cast", { pointId: e.pointId, choices: ["yes"] }, v.token);
    await h.call("POST", `/api/events/${e.eid}/close`, {}, e.org);
    const sup = await superLogin(h); await h.call("POST", "/api/super/payments/reconcile", { paymentId: (h.raw.query("SELECT payment_id p FROM payments LIMIT 1").get() as any).p, note: "matched to bank" }, sup);
    return { h, e };
  }
  const RECORD = ["access_audit", "societies", "events", "event_status", "event_options", "event_rules", "flats", "agenda_points", "point_state", "people", "person_labels", "person_verifications", "role_assignments", "attendance", "voter_ledger", "ballot_box", "box_seals", "log_entries", "reports", "anchors", "payments", "super_admin_actions", "private_contacts", "private_evidence"];
  test("EVERY record table rejects UPDATE (trigger), and none of the tests is vacuous: each table holds rows", async () => {
    const { h } = await busyDb();
    for (const t of RECORD) {
      expect(h.count(`SELECT COUNT(*) c FROM ${t}`)).toBeGreaterThan(0);
      const col = (h.raw.query(`PRAGMA table_info(${t})`).all() as any[])[0].name;
      expect(() => h.raw.query(`UPDATE ${t} SET ${col} = ${col}`).run()).toThrow(/append-only: UPDATE refused/);
    }
  });
  test("EVERY record table rejects DELETE (trigger)", async () => {
    const { h } = await busyDb();
    for (const t of RECORD) expect(() => h.raw.query(`DELETE FROM ${t}`).run()).toThrow(/append-only: DELETE refused/);
    expect(h.count("SELECT COUNT(*) c FROM log_entries")).toBeGreaterThan(20);
  });
  test("the database itself refuses a forked or gapped log (chain trigger)", async () => {
    const { h, e } = await busyDb();
    const last = h.raw.query("SELECT seq, hash FROM log_entries WHERE event_id=? ORDER BY seq DESC LIMIT 1").get(e.eid) as any;
    expect(() => h.raw.query("INSERT INTO log_entries VALUES(?,?,?,?,?,?)").run(e.eid, last.seq + 5, "h", last.hash, "{}", "s")).toThrow(/seq gap/);
    expect(() => h.raw.query("INSERT INTO log_entries VALUES(?,?,?,?,?,?)").run(e.eid, last.seq + 1, "h", "wrong", "{}", "s")).toThrow(/prev_hash mismatch/);
  });
  test("a DB ADMIN who drops the trigger and EDITS a log row is exposed by the verifier", async () => {
    const { h, e } = await busyDb();
    expect((await chainOk(h, e.eid)).ok).toBe(true);
    h.raw.exec("DROP TRIGGER log_entries_no_update");
    h.raw.query("UPDATE log_entries SET entry_json = replace(entry_json, 'A-101', 'A-999') WHERE event_id=? AND entry_json LIKE '%A-101%' AND seq=(SELECT MIN(seq) FROM log_entries WHERE event_id=? AND entry_json LIKE '%A-101%')").run(e.eid, e.eid);
    const r = await chainOk(h, e.eid); expect(r.ok).toBe(false); expect(r.problems[0]!.reason).toBe("hash_mismatch");
  });
  test("a DB ADMIN who DELETES a log row (or forges one) is exposed", async () => {
    const { h, e } = await busyDb();
    h.raw.exec("DROP TRIGGER log_entries_no_delete");
    h.raw.query("DELETE FROM log_entries WHERE event_id=? AND seq=7").run(e.eid);
    expect((await chainOk(h, e.eid)).problems[0]!.reason).toBe("seq_gap");
  });
  test("a re-hashed forged tail (no key) fails on signatures", async () => {
    const { h, e } = await busyDb(); const { entries, publicKey } = await getLog(h, e.eid);
    const { entryHash } = await import("../../../packages/engine/src");
    const f = JSON.parse(JSON.stringify(entries)); (f[10].entry.payload as any).forged = true; let prev = f[9].hash;
    for (let i = 10; i < f.length; i++) { f[i].entry.prev = prev; f[i].hash = await entryHash(f[i].entry); prev = f[i].hash; }
    expect((await verifyChain(f, publicKey)).problems[0]!.reason).toBe("bad_signature");
  });
  test("TAMPER with the downloaded report -> flagged; the untouched download verifies; the live page verifies too", async () => {
    const { h, e } = await busyDb();
    const pk = (await h.call("GET", "/api/pubkey")).body.publicKey;
    const dl = await h.call("GET", `/api/r/${e.eid}?download=1`);
    expect((await verifyReportHtml(dl.text, { publicKey: pk })).ok).toBe(true);
    expect((await verifyReportHtml(dl.text.replace("Approve the accounts", "Approve the account5"), { publicKey: pk })).ok).toBe(false);
    expect((await verifyReportHtml(dl.text.replace("FINAL REPORT", "FINAL REPORT (edited)"), { publicKey: pk })).ok).toBe(false);
    const fresh = await setup(h); const live = await h.call("GET", `/api/r/${fresh.eid}`);
    expect((await verifyEmbedded(extractData(live.text)!)).ok).toBe(true);
  });
  test("a closed event's report is stored once and served byte-identical on every read", async () => {
    const { h, e } = await busyDb();
    const a = await h.call("GET", `/api/r/${e.eid}`), b = await h.call("GET", `/api/r/${e.eid}?download=1`);
    expect(a.text).toBe(b.text); expect(h.count("SELECT COUNT(*) c FROM reports WHERE event_id=?", e.eid)).toBe(1);
  });
  test("no DELETE endpoint exists anywhere", async () => {
    const h = await H.make(); const e = await setup(h);
    for (const p of [`/api/events/${e.eid}`, `/api/events/${e.eid}/points/${e.pointId}`, `/api/events/${e.eid}/people/${e.pid}`, `/api/r/${e.eid}`, "/api/super/events/x"]) expect((await h.call("DELETE", p, undefined, e.org)).status).toBe(405);
    expect(await Bun.file("apps/api/src/handler.ts").text()).not.toMatch(/route\("DELETE"/);
    expect(await Bun.file("apps/api/src/handler.ts").text()).not.toMatch(/prepare\("(DELETE|UPDATE) (?!passcodes|sessions|event_keys|kv_state)/);
  });
});

async function superLogin(h: H): Promise<string> {
  await h.call("POST", "/api/super/request", {}); const code = h.codeFor("owner@platform.example");
  const v = await h.call("POST", "/api/super/verify", { code }); if (v.status !== 200) throw new Error(v.text); return v.body.token;
}

describe("privacy: nothing personal in public output", () => {
  test("PUBLIC REPORT, event view, log, template and receipts contain no full e-mail, phone number or name; public tables hold masked values only", async () => {
    const h = await H.make(); const e = await liveEvent(h, { secret: true });
    await appointVerified(h, e, HOSTP, "host");
    const v = await e.voter("A-101"); await h.call("POST", "/api/vote/cast", { pointId: e.pointId, choices: ["yes"] }, v.token);
    const pages = [`/api/r/${e.eid}`, `/api/r/${e.eid}/data`, `/api/events/${e.eid}`, `/api/events/${e.eid}/log`, `/api/events/${e.eid}/template`];
    await h.call("POST", `/api/events/${e.eid}/close`, {}, e.org);
    for (const p of [...pages, `/api/r/${e.eid}?download=1`, `/api/events/${e.eid}/receipts/${e.pointId}`]) {
      const r = await h.call("GET", p);
      expect(scanPublic(r.text, { allow: ["REG/2020/118"], forbidden: PRIVATE })).toEqual([]);
    }
    const publicTables = ["societies", "events", "event_status", "event_options", "event_rules", "flats", "agenda_points", "point_state", "people", "person_labels", "role_assignments", "attendance", "voter_ledger", "ballot_box", "box_seals", "log_entries", "reports", "anchors"];
    for (const t of publicTables) expect(scanPublic(JSON.stringify(h.raw.query(`SELECT * FROM ${t}`).all()), { allow: ["REG/2020/118"], forbidden: PRIVATE })).toEqual([]);
    expect((h.raw.query("SELECT masked_email FROM people LIMIT 1").get() as any).masked_email).toBe("ra****@e****.org");
  });
  test("the private store is encrypted: no plaintext e-mail in private_contacts; contacts readable only by verified staff, and each read is logged", async () => {
    const h = await H.make(); const e = await liveEvent(h);
    expect(JSON.stringify(h.raw.query("SELECT * FROM private_contacts").all())).not.toContain("example.org");
    expect(JSON.stringify(h.raw.query("SELECT * FROM private_evidence").all())).not.toContain("Owner");
    const r = await h.call("GET", `/api/events/${e.eid}/contacts`, undefined, e.org);
    expect(r.status).toBe(200); expect(r.body.contacts.some((c: any) => c.email === ORG.email)).toBe(true);
    expect((await getLog(h, e.eid)).entries.some((x) => x.entry.type === "contacts_read")).toBe(true);
    expect((await h.call("GET", `/api/events/${e.eid}/contacts`)).status).toBe(401);
  });
  test("CRYPTO-SHRED: after the data key is destroyed the contacts are gone for good, the public record is unchanged and still verifies", async () => {
    const h = await H.make(); const e = await liveEvent(h);
    await h.call("POST", `/api/events/${e.eid}/close`, {}, e.org);
    const before = (await h.call("GET", `/api/r/${e.eid}`)).text;
    expect((await h.call("POST", `/api/events/${e.eid}/crypto-shred`, {}, e.org)).status).toBe(200);
    expect((await h.call("GET", `/api/events/${e.eid}/contacts`, undefined, e.org)).status).toBe(410);
    expect((await h.call("GET", `/api/r/${e.eid}`)).text).toBe(before);
    expect(h.count("SELECT COUNT(*) c FROM private_contacts")).toBeGreaterThan(0); // ciphertext rows stay (append-only), unreadable
  });
  test("text with a phone number or e-mail typed into a public field is refused instead of published", async () => {
    const h = await H.make(); const e = await setup(h);
    const r = await h.call("POST", `/api/events/${e.eid}/points`, { kind: "discussion", title: "Call 9876543210 for details" }, e.org);
    expect(r.status).toBe(400); expect(r.body.error).toBe("contains_personal_data");
  });
});

describe("secret ballot", () => {
  test("the ballot box has no flat and no time, and its physical order is the random receipt order, not the cast order", async () => {
    const h = await H.make(); const e = await liveEvent(h, { secret: true, present: 8 });
    const cols = (h.raw.query("PRAGMA table_info(ballot_box)").all() as any[]).map((c) => c.name);
    expect(cols.sort()).toEqual(["choice_json", "event_id", "kind", "point_id", "receipt_hash", "weight"]);
    const cast: string[] = [];
    for (let i = 0; i < 8; i++) { const v = await e.voter(`A-${101 + i}`); const r = await h.call("POST", "/api/vote/cast", { pointId: e.pointId, choices: [i % 2 ? "yes" : "no"] }, v.token); expect(r.status).toBe(201); cast.push(r.body.receipt); }
    const stored = (h.raw.query("SELECT receipt_hash FROM ballot_box").all() as any[]).map((r) => r.receipt_hash);
    expect(stored).toEqual([...stored].sort());
    expect(h.count("SELECT COUNT(*) c FROM ballot_box")).toBe(8);
    // the ledger says WHO voted but not what; the log entry for a secret vote carries no choice
    const { entries } = await getLog(h, e.eid);
    expect(entries.filter((x) => x.entry.type === "vote_recorded").every((x) => !("choices" in x.entry.payload))).toBe(true);
    expect((h.raw.query("SELECT open_choice_json FROM voter_ledger").all() as any[]).every((r) => r.open_choice_json === null)).toBe(true);
    // the voter's receipt is in the public list after close, with no way to see the choice
    await h.call("POST", `/api/events/${e.eid}/close`, {}, e.org);
    const list = (await h.call("GET", `/api/events/${e.eid}/receipts/${e.pointId}`)).body.receipts as string[];
    for (const r of cast) expect(list).toContain(r);
    expect((await h.call("GET", `/api/events/${e.eid}/receipts/${e.pointId}?check=${cast[0]}`)).body.found).toBe(true);
    expect((await h.call("GET", `/api/events/${e.eid}/receipts/${e.pointId}?check=nope`)).body.found).toBe(false);
    const model = buildReportModel(await replayLog((await getLog(h, e.eid)).entries));
    expect(model.points[0]!.tally!.ballots).toBe(8); expect(model.points[0]!.openVotes).toBeNull();
  });
  test("while a secret point is open the page shows turnout only, never running totals", async () => {
    const h = await H.make(); const e = await liveEvent(h, { secret: true });
    const v = await e.voter("A-101"); await h.call("POST", "/api/vote/cast", { pointId: e.pointId, choices: ["yes"] }, v.token);
    const page = (await h.call("GET", `/api/r/${e.eid}`)).text;
    expect(page).toContain("Totals appear when voting on this secret ballot closes"); expect(page).toContain("1</b> of <b>5</b> present flats have voted");
  });
  test("ELECTION: secret ballot, numbers only, no winner declared", async () => {
    const h = await H.make(); const e = await setup(h, { kind: "election", flats: 6 });
    const off = await appointVerified(h, e, OFFP, "attendance_officer");
    await e.ok(h.call("POST", `/api/events/${e.eid}/agenda/publish`, {}, e.org)); await e.ok(h.call("POST", `/api/events/${e.eid}/start`, {}, e.org));
    for (let i = 0; i < 6; i++) await e.ok(h.call("POST", `/api/events/${e.eid}/attendance`, { flatNo: `A-${101 + i}`, attendeeName: "Owner " + i, mode: "physical", method: "visual" }, off.token));
    await e.ok(h.call("POST", `/api/events/${e.eid}/points/${e.pointId}/open`, { minutes: 20 }, e.org));
    const ids = (await h.call("GET", `/api/vote/points`, undefined, "x")).status; void ids; const labelsOf = (await h.call("GET", `/api/events/${e.eid}`)).body.model.points[0].labels as Record<string, string>; const idOf = (n: string) => Object.keys(labelsOf).find((k) => labelsOf[k] === n)!;
    const picks = ["Asha", "Asha", "Bimal", "Asha", "Chitra", "Bimal"].map(idOf);
    for (let i = 0; i < 6; i++) { const c = await h.call("POST", `/api/events/${e.eid}/passcodes/voter`, { flatNo: `A-${101 + i}` }, off.token); const l = await h.call("POST", "/api/vote/login", { eventId: e.eid, flatNo: `A-${101 + i}`, code: c.body.code, turnstile: "test-ok" }); await e.ok(h.call("POST", "/api/vote/cast", { pointId: e.pointId, choices: [picks[i]] }, l.body.token)); }
    await e.ok(h.call("POST", `/api/events/${e.eid}/close`, {}, e.org));
    const model = buildReportModel(await replayLog((await getLog(h, e.eid)).entries));
    const t = model.points[0]!.tally!;
    expect(t.options.map((o) => [model.points[0]!.labels[o.option], o.count])).toEqual([["Asha", 3], ["Bimal", 2], ["Chitra", 1]]);
    expect(t.leaders).toBeNull(); expect(t.outcome).toBe("counted"); expect(model.points[0]!.secret).toBe(true);
  });
});

describe("clone from an old event", () => {
  test("anyone can use a closed event as a template; contacts, passcodes, images, votes and attendance are NEVER copied; both logs record the link", async () => {
    const h = await H.make(); const e = await liveEvent(h); const v = await e.voter("A-101"); await h.call("POST", "/api/vote/cast", { pointId: e.pointId, choices: ["yes"] }, v.token);
    await h.call("POST", `/api/events/${e.eid}/close`, {}, e.org);
    const stranger = { name: "Pooja Singh", email: "pooja.singh@example.net", phone: "9000011111" };
    const r = await h.call("POST", "/api/events", { kind: "meeting", eventType: "sgm", title: "Special Meeting", venue: "Hall B", scheduledMs: h.now + 9 * DAY, cloneFrom: e.eid, organizer: stranger, turnstile: "test-ok" });
    expect(r.status).toBe(201);
    const nid = r.body.eventId;
    const m = (await h.call("GET", `/api/events/${nid}`)).body.model;
    expect(m.society.registrationNo).toBe("REG/2020/118"); expect(m.createdFrom).toBe(e.eid); expect(m.points.length).toBe(1); expect(m.attendance.total).toBe(10);
    expect(m.people.length).toBe(1); expect(m.people[0].maskedName).toBe("P**** S****"); // only the new Organizer, unverified
    expect(m.attendance.present).toBe(0); expect(m.points[0].voted).toEqual([]); expect(m.payments).toEqual([]);
    expect(h.count("SELECT COUNT(*) c FROM voter_ledger WHERE event_id=?", nid)).toBe(0);
    expect(h.count("SELECT COUNT(*) c FROM passcodes WHERE event_id=? AND purpose='voter'", nid)).toBe(0);
    expect(h.count("SELECT COUNT(*) c FROM private_evidence WHERE event_id=?", nid)).toBe(0);
    expect(h.count("SELECT COUNT(*) c FROM private_contacts WHERE event_id=?", nid)).toBe(1);
    expect(JSON.stringify((await getLog(h, nid)).entries)).not.toContain(ORG.name);
    expect((await getLog(h, e.eid)).entries.some((x) => x.entry.type === "clone_linked" && (x.entry.payload as any).direction === "to" && (x.entry.payload as any).eventId === nid)).toBe(true);
    expect((await getLog(h, nid)).entries.some((x) => x.entry.type === "clone_linked" && (x.entry.payload as any).direction === "from")).toBe(true);
    // the new Organizer must verify before anything: no token, no action
    expect((await h.call("PUT", `/api/events/${nid}/roll`, { flats: flatsOf(2) })).status).toBe(401);
  });
  test("the private contact roll is only offered to the verified Organizer of the source", async () => {
    const h = await H.make(); const e = await setup(h);
    await h.call("POST", `/api/events/${e.eid}/holders`, { flatNo: "A-101", name: "Flat Holder", email: "holder@example.net", phone: "9111122222" }, e.org);
    const body = (token?: string) => h.call("POST", "/api/events", { kind: "meeting", eventType: "agm", title: "Next AGM", venue: "Hall", scheduledMs: h.now + 9 * DAY, cloneFrom: e.eid, privateRoll: true, organizer: { name: "New Person", email: "new.person@example.net" }, turnstile: "test-ok" }, token);
    const anon = await body(); expect(h.count("SELECT COUNT(*) c FROM people WHERE event_id=? AND flat_no IS NOT NULL", anon.body.eventId)).toBe(0);
    const owner = await body(e.org); expect(h.count("SELECT COUNT(*) c FROM people WHERE event_id=? AND flat_no IS NOT NULL", owner.body.eventId)).toBe(1);
  });
});

describe("platform: payments, mail quota, abuse limits, super console", () => {
  test("payments exist only in TEST mode: with it off, paying is refused and the confirm route does not exist", async () => {
    const h = await H.make({ TEST_MODE: "0" }); const r = await h.call("POST", "/api/events", { kind: "meeting", eventType: "agm", title: "AGM", venue: "Hall", scheduledMs: h.now + 9 * DAY, packId: "in-up-aoa", society: { name: "Sky Heights", address: "Addr 1", registrationNo: "R1", kind: "AOA" }, organizer: ORG, turnstile: "test-ok" });
    expect(r.status).toBe(403); // Turnstile stub is also closed outside TEST mode
    const h2 = await H.make(); const e = await newEvent(h2); h2.env.TEST_MODE = "0";
    expect((await h2.call("POST", `/api/events/${e.eid}/pay`, {}, e.org)).status).toBe(503);
    expect((await h2.call("POST", "/api/pay/test-confirm", { eventId: e.eid, paymentId: "x" }, e.org)).status).toBe(404);
  });
  test("prices: Rs 499 per meeting, Rs 1499 per election in India; the event cannot be published before payment", async () => {
    const h = await H.make(); const m = await newEvent(h); const el = await newEvent(h, { kind: "election" });
    expect((await h.call("POST", `/api/events/${m.eid}/pay`, {}, m.org)).body.amountMinor).toBe(49900);
    expect((await h.call("POST", `/api/events/${el.eid}/pay`, {}, el.org)).body.amountMinor).toBe(149900);
    await h.call("PUT", `/api/events/${m.eid}/roll`, { flats: flatsOf(3) }, m.org); await h.call("POST", `/api/events/${m.eid}/points`, { kind: "resolution", title: "Q" }, m.org);
    const p = await h.call("POST", `/api/events/${m.eid}/agenda/publish`, {}, m.org); expect(p.status).toBe(403); expect(p.body.error).toBe("not_paid");
  });
  test("MAIL QUOTA: when the daily limit is reached new events are refused with a clear state and the console shows it", async () => {
    const h = await H.make({ MAIL_DAILY_LIMIT: "2" });
    await newEvent(h); // 1 mail
    const e2 = await h.call("POST", "/api/events", { kind: "meeting", eventType: "agm", title: "AGM 2", venue: "Hall", scheduledMs: h.now + 9 * DAY, packId: "in-up-aoa", society: { name: "Sky Two", address: "Addr 2", registrationNo: "R2", kind: "AOA" }, organizer: { name: "Second Org", email: "second@example.org" }, turnstile: "test-ok" });
    expect(e2.status).toBe(201); // 2nd mail
    const e3 = await h.call("POST", "/api/events", { kind: "meeting", eventType: "agm", title: "AGM 3", venue: "Hall", scheduledMs: h.now + 9 * DAY, packId: "in-up-aoa", society: { name: "Sky Three", address: "Addr 3", registrationNo: "R3", kind: "AOA" }, organizer: { name: "Third Org", email: "third@example.org" }, turnstile: "test-ok" });
    expect(e3.status).toBe(503); expect(e3.body.error).toBe("mail_quota_reached");
    expect(h.count("SELECT COUNT(*) c FROM events")).toBe(2); // nothing half-created
  });
  test("a second mail provider slot takes over when the first is over quota", async () => {
    const sent: string[] = []; const second = { name: "second", send: async (to: string) => { sent.push(to); return true; } };
    const h = await H.make({ MAIL_DAILY_LIMIT: "1", MAILER2: second });
    await newEvent(h).catch(() => {}); // first mail uses the outbox provider
    const r = await h.call("POST", "/api/events", { kind: "meeting", eventType: "agm", title: "AGM 2", venue: "Hall", scheduledMs: h.now + 9 * DAY, packId: "in-up-aoa", society: { name: "Sky Two", address: "Addr 2", registrationNo: "R2", kind: "AOA" }, organizer: { name: "Second Org", email: "second@example.org" }, turnstile: "test-ok" });
    expect(r.status).toBe(201); expect(sent).toEqual(["second@example.org"]);
  });
  test("event creation is rate limited per IP and needs Turnstile", async () => {
    const h = await H.make(); const mk = (ip: string, t?: string) => h.call("POST", "/api/events", { kind: "meeting", eventType: "agm", title: "AGM", venue: "Hall", scheduledMs: h.now + 9 * DAY, packId: "custom-world", country: "IN", society: { name: "Sky Heights", address: "Addr 1", registrationNo: "R1", kind: "AOA" }, organizer: { name: "Some Body", email: "a@example.org" }, ...(t ? { turnstile: t } : {}) }, undefined, ip);
    expect((await mk("5.5.5.5")).status).toBe(403);
    for (let i = 0; i < 5; i++) expect((await mk("6.6.6.6", "test-ok")).status).toBe(201);
    expect((await mk("6.6.6.6", "test-ok")).status).toBe(429);
  });
  test("SUPER CONSOLE: sign-in by e-mail code; read-only overview; suspend only a future event; every action is in the event's own log; no edit routes exist", async () => {
    const h = await H.make(); const future = await setup(h); const live = await liveEvent(h);
    expect((await h.call("GET", "/api/super/overview")).status).toBe(401);
    expect((await h.call("GET", "/api/super/overview", undefined, future.org)).status).toBe(401); // an Organizer token is not a console token
    const sup = await superLogin(h);
    const ov = await h.call("GET", "/api/super/overview", undefined, sup);
    expect(ov.status).toBe(200); expect(ov.body.events.length).toBe(2); expect(ov.body.mail.dailyLimit).toBe(90); expect(ov.body.mail.quotaReached).toBe(false);
    expect((await h.call("POST", `/api/super/events/${live.eid}/suspend`, { reason: "abuse report" }, sup)).status).toBe(409);
    expect((await h.call("POST", `/api/super/events/${future.eid}/suspend`, { reason: "abuse report received" }, sup)).status).toBe(200);
    const log = (await getLog(h, future.eid)).entries.map((x) => x.entry.type);
    expect(log).toContain("platform_action"); expect(log).toContain("event_suspended");
    expect((await h.call("GET", `/api/r/${future.eid}`)).text).toContain("Platform actions");
    expect((await h.call("PUT", `/api/events/${future.eid}/roll`, { flats: flatsOf(2) }, future.org)).status).toBe(403); // suspended
    for (const [m, p] of [["PUT", `/api/super/events/${future.eid}`], ["POST", `/api/super/events/${future.eid}/edit`], ["POST", `/api/super/events/${future.eid}/vote`], ["POST", `/api/super/events/${future.eid}/attendance`]] as const) expect((await h.call(m, p, {}, sup)).status).toBe(404);
    expect(h.count("SELECT COUNT(*) c FROM super_admin_actions")).toBe(1);
  });
  test("a wrong console code is refused and the console exists for the configured address only", async () => {
    const h = await H.make(); await h.call("POST", "/api/super/request", {});
    expect((await h.call("POST", "/api/super/verify", { code: "123456" })).status).toBe(401);
    const h2 = await H.make({ SUPER_EMAIL: undefined }); await h2.call("POST", "/api/super/request", {}); expect((await h2.call("POST", "/api/super/verify", { code: "123456" })).status).toBe(401);
  });
  test("the daily anchor adds a signed head to live events and needs the internal secret", async () => {
    const h = await H.make(); const e = await liveEvent(h);
    expect((await h.call("POST", "/api/internal/anchor", {})).status).toBe(404);
    const r = await fetchAnchor(h); expect(r.body.anchored).toBe(1);
    expect((await getLog(h, e.eid)).entries.at(-1)!.entry.type).toBe("anchor"); expect((await chainOk(h, e.eid)).ok).toBe(true);
  });
  test("weighted secret ballots carry an anonymity warning at roll time", async () => {
    const h = await H.make(); const e = await newEvent(h, { kind: "meeting" });
    await h.call("PUT", `/api/events/${e.eid}/options`, { options: { secret_ballot: true } }, e.org);
    const r = await h.call("PUT", `/api/events/${e.eid}/roll`, { flats: [{ flatNo: "A", weight: 100 }, { flatNo: "B", weight: 130 }] }, e.org);
    expect(r.body.anonymityWarning).toBe(true);
  });
  test("worldwide pack: refuses to publish until the society's own values are entered", async () => {
    const h = await H.make(); const e = await setup(h, { pack: "custom-world" });
    const p = await h.call("POST", `/api/events/${e.eid}/agenda/publish`, {}, e.org);
    expect(p.status).toBe(403); expect(p.body.error).toBe("rules_unset"); expect(p.body.message).toContain("notice.minDays");
    const ok = await h.call("PUT", `/api/events/${e.eid}/rules`, { changes: { "notice.minDays": 7, "quorum.basis": "flats", "quorum.percentBp": 5000 }, reason: "from our bye-law 14" }, e.org); expect(ok.status).toBe(200);
    expect((await h.call("PUT", `/api/events/${e.eid}/options`, { options: { proxy_voting: false } }, e.org)).status).toBe(200);
    expect((await h.call("POST", `/api/events/${e.eid}/agenda/publish`, {}, e.org)).status).toBe(200);
    const pr = (await h.call("GET", `/api/events/${e.eid}`)).body.progress; expect(pr.steps.find((s: any) => s.id === "publish").status).toBe("done");
  });
});
async function fetchAnchor(h: H) {
  const r = await (await import("../src/handler")).handle(new Request("http://x/api/internal/anchor", { method: "POST", headers: { "x-internal-secret": "tick", "x-device-id": "scheduler-device-000001", "content-type": "application/json" }, body: "{}" }), h.env, h.now);
  return { status: r.status, body: await r.json() as any };
}
void HOSTP;

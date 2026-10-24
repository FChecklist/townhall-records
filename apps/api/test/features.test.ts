// Owner additions of 2026-10-23: prices by country, unique ids, ballot design, checkbox ballots, election formats, PDF for signature, e-mail of the report,
// automatic publication within 120 seconds, and a published record that nobody can change.
import { describe, expect, test } from "bun:test";
import { maskEmail, buildReportModel, replayLog, renderReportPdf, extractData, extractSeal, scanPublic } from "../../../packages/engine/src";
import { DAY, H, OFFP, ORG, PRIVATE, STAFF_PUBLIC, appointVerified, getLog, newEvent, setup, flatsOf } from "./harness";

const T = Date.UTC(2026, 10, 14, 10, 30, 0), HR = 3_600_000;
const sched = (startMs: number) => ({ start: { atMs: startMs, place: "Hall" }, votingStart: { atMs: startMs, place: "Hall" }, votingEnd: { atMs: startMs + 2 * HR, place: "Hall" }, end: { atMs: startMs + 3 * HR, place: "Hall" } });
const text = (b: ArrayBuffer | Uint8Array) => [...new TextDecoder("latin1").decode(b instanceof Uint8Array ? b : new Uint8Array(b)).matchAll(/\((.*)\) Tj ET/g)].map((m) => m[1]!.replace(/\\([()\\])/g, "$1")).join("\n");

/** A live election with an officer, all `flats` present, the first point open. */
async function liveElection(h: H, point: Record<string, unknown>, flats = 6, over: Record<string, unknown> = {}) {
  const { setOptions, ...create } = over as any; const e = await newEvent(h, { kind: "election", ...create });
  const ok = async (p: Promise<any>) => { const r = await p; if (r.status >= 300) throw new Error(JSON.stringify(r.body)); return r; };
  await ok(h.call("PUT", `/api/events/${e.eid}/roll`, { flats: flatsOf(flats) }, e.org));
  const pt = await ok(h.call("POST", `/api/events/${e.eid}/points`, { kind: "election_post", title: "Committee election", secret: true, ...point }, e.org));
  const pay = await ok(h.call("POST", `/api/events/${e.eid}/pay`, {}, e.org)); await ok(h.call("POST", "/api/pay/test-confirm", { eventId: e.eid, paymentId: pay.body.paymentId }, e.org));
  const off = await appointVerified(h, e, OFFP, "attendance_officer");
  if (over.setOptions) await ok(h.call("PUT", `/api/events/${e.eid}/options`, { options: over.setOptions }, e.org));
  await ok(h.call("POST", `/api/events/${e.eid}/agenda/publish`, {}, e.org)); await ok(h.call("POST", `/api/events/${e.eid}/start`, {}, e.org));
  for (let i = 0; i < flats; i++) await ok(h.call("POST", `/api/events/${e.eid}/attendance`, { flatNo: `A-${101 + i}`, attendeeName: "Owner " + i, mode: "physical", method: "visual" }, off.token));
  await ok(h.call("POST", `/api/events/${e.eid}/points/${pt.body.pointId}/open`, { minutes: 30 }, e.org));
  const vote = async (flat: string, body: Record<string, unknown>) => { const c = await ok(h.call("POST", `/api/events/${e.eid}/passcodes/voter`, { flatNo: flat }, off.token)); const l = await ok(h.call("POST", "/api/vote/login", { eventId: e.eid, flatNo: flat, code: c.body.code, turnstile: "test-ok" })); return h.call("POST", "/api/vote/cast", { pointId: pt.body.pointId, ...body }, l.body.token); };
  const model = async () => (await h.call("GET", `/api/events/${e.eid}`)).body.model;
  return { ...e, ok, off, pointId: pt.body.pointId as string, vote, model, ids: async () => { const m = (await model()).points[0]; return Object.fromEntries(Object.entries(m.labels as Record<string, string>).map(([id, l]) => [l, id])) as Record<string, string>; } };
}

describe("prices", () => {
  test("India Rs 499 per meeting and Rs 1499 per election; everywhere else USD 5 and USD 15; the page shows the currency", async () => {
    const h = await H.make(); const got: Record<string, unknown> = {};
    for (const [country, kind] of [["IN", "meeting"], ["IN", "election"], ["US", "meeting"], ["GB", "election"]] as const) {
      const e = await newEvent(h, { kind, country, packId: "custom-world" });
      const r = await h.call("POST", `/api/events/${e.eid}/pay`, {}, e.org); got[country + kind] = [r.body.amountMinor, r.body.currency, r.body.price];
    }
    expect(got).toEqual({ INmeeting: [49900, "INR", "Rs 499"], INelection: [149900, "INR", "Rs 1499"], USmeeting: [500, "USD", "USD 5"], GBelection: [1500, "USD", "USD 15"] });
    const us = await newEvent(h, { country: "US", packId: "custom-world" }); const pay = await h.call("POST", `/api/events/${us.eid}/pay`, {}, us.org);
    await h.call("POST", "/api/pay/test-confirm", { eventId: us.eid, paymentId: pay.body.paymentId }, us.org);
    expect((await h.call("GET", `/api/r/${us.eid}`)).text).toContain("USD 5.00");
    expect((await h.call("GET", "/api/schema")).body.priceText).toEqual({ india: ["Rs 499", "Rs 1499"], world: ["USD 5", "USD 15"] });
  });
  test("a society must say which country it is in unless the rule pack already says so", async () => {
    const h = await H.make();
    const r = await h.call("POST", "/api/events", { kind: "meeting", eventType: "agm", title: "AGM", venue: "Hall", scheduledMs: h.now + 9 * DAY, packId: "custom-world", society: { name: "Sky Heights", address: "Addr 1 Road", registrationNo: "R1", kind: "HOA" }, organizer: ORG, turnstile: "test-ok" });
    expect(r.status).toBe(400); expect(r.body.error).toBe("bad_country");
  });
});

describe("unique ids for the event, every person, every point and every candidate", () => {
  test("ids are generated, unique, stable under amendment, and printed on the page", async () => {
    const h = await H.make(); const e = await newEvent(h, { kind: "election" });
    const a = await h.call("POST", `/api/events/${e.eid}/points`, { kind: "election_post", title: "President", candidates: ["Asha Rao", "Bimal Das", "Chitra Iyer"] }, e.org);
    const b = await h.call("POST", `/api/events/${e.eid}/points`, { kind: "election_post", title: "Vice President", candidates: ["Asha Rao", "Dev Khan"] }, e.org);
    expect(e.eid).toMatch(/^[0-9a-f]{32}$/); expect(a.body.pointId).toMatch(/^pt_[0-9a-f]{16}$/); expect(e.pid).toMatch(/^p_[0-9a-f]{16}$/);
    const m1 = (await h.call("GET", `/api/events/${e.eid}`)).body.model; const ids = m1.points.flatMap((p: any) => Object.keys(p.labels));
    expect(ids.length).toBe(5); expect(new Set(ids).size).toBe(5); expect(ids.every((i: string) => /^c_[0-9a-f]{12}$/.test(i))).toBe(true); // the same person standing twice still gets a separate id per post
    expect(new Set([a.body.pointId, b.body.pointId]).size).toBe(2);
    const keep = Object.keys(m1.points[0].labels)[0]!;
    const am = await h.call("PUT", `/api/events/${e.eid}/points/${a.body.pointId}`, { candidates: [{ id: keep, label: "Asha Rao (Block A)" }, "Esha Nair"] }, e.org); expect(am.status).toBe(200);
    const m2 = (await h.call("GET", `/api/events/${e.eid}`)).body.model; expect(Object.keys(m2.points[0].labels)).toContain(keep); expect(m2.points[0].labels[keep]).toBe("Asha Rao (Block A)"); expect(Object.keys(m2.points[0].labels).length).toBe(2);
    expect((await h.call("PUT", `/api/events/${e.eid}/points/${a.body.pointId}`, { candidates: [{ id: "c_000000000000", label: "Ghost" }, "Other"] }, e.org)).body.error).toBe("bad_candidate_id");
    expect((await h.call("POST", `/api/events/${e.eid}/points`, { kind: "election_post", title: "Dup", candidates: ["Same Name", "same name"] }, e.org)).body.error).toBe("dup_candidate");
    expect((await h.call("POST", `/api/events/${e.eid}/points`, { kind: "election_post", title: "One", candidates: ["Only One"] }, e.org)).status).toBe(400);
    const page = (await h.call("GET", `/api/r/${e.eid}`)).text; expect(page).toContain(keep);
  });
});

describe("ballot paper design and checkbox ballots", () => {
  test("the Organizer's design is stored, shown to voters and on the report; bad designs are refused; it freezes when voting opens", async () => {
    const h = await H.make(); const e = await liveElection(h, { candidates: ["Asha", "Bimal", "Chitra"], design: { layout: "cards", columns: 2, order: "shuffled", accent: "#AA3300", title: "Choose your President", showNumbers: false, size: "normal" } }, 3);
    const m = await e.model(); expect(m.points[0].design).toMatchObject({ layout: "cards", columns: 2, order: "shuffled", accent: "#aa3300", title: "Choose your President", showNumbers: false });
    expect((await h.call("GET", `/api/r/${e.eid}`)).text).toContain("cards layout");
    const c = await h.call("POST", `/api/events/${e.eid}/passcodes/voter`, { flatNo: "A-101" }, e.off.token); const l = await h.call("POST", "/api/vote/login", { eventId: e.eid, flatNo: "A-101", code: c.body.code, turnstile: "test-ok" });
    const vp = (await h.call("GET", "/api/vote/points", undefined, l.body.token)).body.points[0];
    expect(vp.design.layout).toBe("cards"); expect(vp.instruction).toContain("A ticked box means yes (selected). A box not ticked means no (not selected)."); expect(Object.values(vp.labels).sort()).toEqual(["Asha", "Bimal", "Chitra"]);
    expect((await h.call("PUT", `/api/events/${e.eid}/points/${e.pointId}`, { design: { layout: "list" } }, e.org)).status).toBe(403); // frozen once open
    const bad = await newEvent(h);
    for (const design of [{ accent: "red" }, { layout: "carousel" }, { columns: 5 }]) expect((await h.call("POST", `/api/events/${bad.eid}/points`, { kind: "resolution", title: "Quest", design }, bad.org)).body.error).toBe("bad_design");
    const def = await h.call("POST", `/api/events/${bad.eid}/points`, { kind: "resolution", title: "Default look" }, bad.org); expect(def.status).toBe(201);
    expect((await h.call("GET", `/api/events/${bad.eid}`)).body.model.points[0].design).toMatchObject({ layout: "list", columns: 1, size: "large" });
  });
  test("CHECK BOXES: ticked = yes (selected), not ticked = no (not selected); the report counts both", async () => {
    const h = await H.make(); const e = await liveElection(h, { candidates: ["Asha", "Bimal", "Chitra", "Dev"], maxChoices: 2, minChoices: 1 }, 4); const id = await e.ids();
    const marks = (...on: string[]) => Object.fromEntries(Object.values(id).map((i) => [i, on.includes(i)]));
    expect((await e.vote("A-101", { marks: marks(id.Asha!, id.Bimal!) })).status).toBe(201);
    expect((await e.vote("A-102", { marks: marks(id.Asha!) })).status).toBe(201);
    expect((await e.vote("A-103", { marks: marks(id.Chitra!, id.Dev!) })).status).toBe(201);
    expect((await e.vote("A-104", { marks: { [id.Asha!]: "yes" } })).body.error).toBe("bad_ballot"); // a box is true or false
    expect((await e.vote("A-104", { marks: { c_unknown000000: true } })).body.error).toBe("bad_ballot");
    await e.ok(h.call("POST", `/api/events/${e.eid}/close`, {}, e.org));
    const t = (await e.model()).points[0].tally; const row = (n: string) => t.options.find((o: any) => o.option === id[n])!;
    expect([row("Asha").count, row("Asha").notSelected]).toEqual([2, 1]); expect([row("Bimal").count, row("Bimal").notSelected]).toEqual([1, 2]); expect([row("Dev").count, row("Dev").notSelected]).toEqual([1, 2]);
    expect((await h.call("GET", `/api/r/${e.eid}`)).text).toContain("Ticked = yes");
  });
  test("how many a voter may tick is the Organizer's choice: too few and too many are refused; zero ticks allowed only if the Organizer allows it", async () => {
    const h = await H.make(); const e = await liveElection(h, { candidates: ["A One", "B Two", "C Three", "D Four"], maxChoices: 3, minChoices: 2 }, 5); const id = await e.ids(); const all = Object.values(id);
    expect((await e.vote("A-101", { choices: [all[0]] })).body.error).toBe("bad_ballot");
    expect((await e.vote("A-102", { choices: all })).body.error).toBe("bad_ballot");
    expect((await e.vote("A-103", { choices: [all[0], all[1]] })).status).toBe(201);
    expect((await e.vote("A-104", { choices: [all[0], all[1], all[2]] })).status).toBe(201);
    const h2 = await H.make(); const blank = await liveElection(h2, { candidates: ["A One", "B Two"], maxChoices: 1, minChoices: 0 }, 3);
    expect((await blank.vote("A-101", { choices: [] })).status).toBe(201);
    await blank.ok(h2.call("POST", `/api/events/${blank.eid}/close`, {}, blank.org)); expect((await blank.model()).points[0].tally.ballots).toBe(1);
  });
});

describe("election formats chosen by the Organizer", () => {
  test("SEPARATE ELECTIONS per post, with the post names the Organizer typed", async () => {
    const h = await H.make(); const e = await newEvent(h, { kind: "election" });
    for (const post of ["President", "Vice President", "Treasurer"]) expect((await h.call("POST", `/api/events/${e.eid}/points`, { kind: "election_post", title: post, candidates: ["A One", "B Two"] }, e.org)).status).toBe(201);
    expect((await h.call("GET", `/api/events/${e.eid}`)).body.model.points.map((p: any) => p.title)).toEqual(["President", "Vice President", "Treasurer"]);
  });
  test("ONE ELECTION FOR ALL POSTS: the highest vote gets the first post, the next the second; ties go to the Returning Officer", async () => {
    const h = await H.make(); const e = await liveElection(h, { candidates: ["Asha", "Bimal", "Chitra", "Dev"], format: "ranked_posts", seats: ["President", "Vice President", "Secretary"], maxChoices: 3, minChoices: 1 }, 6); const id = await e.ids();
    const picks: string[][] = [["Asha", "Bimal", "Chitra"], ["Asha", "Bimal"], ["Asha", "Bimal", "Dev"], ["Asha", "Chitra"], ["Bimal", "Chitra"], ["Asha"]];
    for (let i = 0; i < 6; i++) expect((await e.vote(`A-${101 + i}`, { choices: picks[i]!.map((n) => id[n]!) })).status).toBe(201);
    await e.ok(h.call("POST", `/api/events/${e.eid}/close`, {}, e.org));
    const t = (await e.model()).points[0].tally; // Asha 5, Bimal 4, Chitra 3, Dev 1
    expect(t.assignment.seats.map((s: any) => [s.seat, s.option, s.tied])).toEqual([["President", id.Asha, false], ["Vice President", id.Bimal, false], ["Secretary", id.Chitra, false]]);
    expect(t.assignment.needsReturningOfficer).toBe(false); expect(t.leaders).toBeNull();
    const page = (await h.call("GET", `/api/r/${e.eid}`)).text; expect(page).toContain("By rank (for the Returning Officer to confirm)"); expect(page).toContain("President: Asha");
    expect((await h.call("POST", `/api/events/${e.eid}/points`, { kind: "election_post", title: "Test post", candidates: ["a b", "c d"], format: "ranked_posts", seats: [] }, e.org)).status).toBe(403); // event closed
  });
  test("SELECTION OF THE FIRST N candidates, with the cut-off tie flagged; bad settings are refused", async () => {
    const h = await H.make(); const e = await liveElection(h, { candidates: ["C1 One", "C2 Two", "C3 Three", "C4 Four", "C5 Five"], format: "top_n", topN: 3, maxChoices: 3, minChoices: 1 }, 6); const id = await e.ids();
    const picks = [["C1 One", "C2 Two", "C3 Three"], ["C1 One", "C2 Two", "C4 Four"], ["C1 One", "C3 Three", "C4 Four"], ["C2 Two", "C3 Three", "C4 Four"], ["C1 One", "C5 Five"], ["C2 Two"]];
    for (let i = 0; i < 6; i++) await e.vote(`A-${101 + i}`, { choices: picks[i]!.map((n) => id[n]!) });
    await e.ok(h.call("POST", `/api/events/${e.eid}/close`, {}, e.org));
    const a = (await e.model()).points[0].tally.assignment; // C1 4, C2 4, C3 3, C4 3, C5 1  -> tie at the cut-off between C3 and C4
    expect(a.selected.length).toBe(3); expect(a.tieAtCutoff).toBe(true); expect(a.needsReturningOfficer).toBe(true);
    const h2 = await H.make(); const v = await newEvent(h2, { kind: "election" });
    expect((await h2.call("POST", `/api/events/${v.eid}/points`, { kind: "election_post", title: "Test post", candidates: ["a b", "c d"], format: "top_n", topN: 5 }, v.org)).body.error).toBe("bad_topN");
    expect((await h2.call("POST", `/api/events/${v.eid}/points`, { kind: "election_post", title: "Test post", candidates: ["a b", "c d"], format: "ranked_posts", seats: ["Pres", "Pres"] }, v.org)).body.error).toBe("bad_seats");
    expect((await h2.call("POST", `/api/events/${v.eid}/points`, { kind: "election_post", title: "Test post", candidates: ["a b", "c d"], format: "lottery" }, v.org)).body.error).toBe("bad_format");
  });
});

describe("the final report as a PDF for the Returning Officer", () => {
  async function closed(h: H) {
    const e = await liveElection(h, { candidates: ["Asha", "Bimal"] }, 4); const id = await e.ids();
    await e.vote("A-101", { choices: [id.Asha!] }); await e.vote("A-102", { choices: [id.Bimal!] });
    const closeRes = await e.ok(h.call("POST", `/api/events/${e.eid}/close`, {}, e.org)); return { ...e, closeRes, id };
  }
  test("a PDF is available only once published; it is the same bytes every time, fingerprinted, signed for by the log, and has the signature blocks", async () => {
    const h = await H.make(); const e = await liveElection(h, { candidates: ["Asha", "Bimal"] }, 3);
    expect((await h.call("GET", `/api/r/${e.eid}/pdf`)).status).toBe(409);
    await e.ok(h.call("POST", `/api/events/${e.eid}/close`, {}, e.org));
    const r1 = await fetchPdf(h, e.eid), r2 = await fetchPdf(h, e.eid);
    expect(r1.type).toBe("application/pdf"); expect(r1.sha).toMatch(/^[0-9a-f]{64}$/); expect(r1.sha).toBe(r2.sha); expect(r1.bytes.length).toBe(r2.bytes.length);
    expect(new TextDecoder("latin1").decode(r1.bytes.slice(0, 8))).toBe("%PDF-1.4");
    const t = text(r1.bytes);
    for (const needle of ["Returning Officer / Presiding Officer - signature", e.eid, "Appendix A. Complete log", "Ticked (yes)", "Green Park Apartments", "Election"]) expect(t).toContain(needle);
    const rep = await h.call("GET", `/api/r/${e.eid}`); expect(t).toContain(extractSeal(rep.text)!.fileSha256);
    const found = scanPublic(t, { allow: ["REG/2020/118", ...STAFF_PUBLIC], forbidden: PRIVATE }); expect(found.map((f) => f.kind + ":" + f.sample)).toEqual([]);
  });
  test("the publish step answers with the report and the PDF; the Organizer is e-mailed the PDF automatically", async () => {
    const h = await H.make(); const c = await closed(h);
    expect(c.closeRes.body.pdf).toBe(`/api/r/${c.eid}/pdf`);
    const mail = h.raw.query("SELECT * FROM mail_outbox WHERE to_addr=? AND subject LIKE 'Report:%'").all(ORG.email) as any[];
    expect(mail.length).toBe(1); expect(mail[0].body).toContain("[attachment aoa-rwa-"); expect(mail[0].body).toContain("application/pdf"); expect(mail[0].body).toContain("Returning Officer");
    const log = (await getLog(h, c.eid)).entries.filter((x) => x.entry.type === "report_emailed").map((x) => x.entry.payload as any);
    expect(log.length).toBe(1); expect(log[0].recipients).toEqual([maskEmail(ORG.email)]); expect(JSON.stringify(log)).not.toContain(ORG.email);
    expect(log[0].pdfSha256).toBe((await fetchPdf(h, c.eid)).sha);
  });
  test("the Organizer can e-mail the same report to others (up to 10); others cannot; the log records who was mailed in masked form", async () => {
    const h = await H.make(); const c = await closed(h);
    const ok = await h.call("POST", `/api/events/${c.eid}/report/email`, { to: ["returning.officer@example.net", "chair@example.net", "chair@example.net"] }, c.org); expect(ok.status).toBe(200); expect(ok.body.sent).toBe(2);
    expect(h.count("SELECT COUNT(*) c FROM mail_outbox WHERE to_addr IN ('returning.officer@example.net','chair@example.net')")).toBe(2);
    expect((await h.call("POST", `/api/events/${c.eid}/report/email`, { to: Array.from({ length: 11 }, (_, i) => `u${i}@example.net`) }, c.org)).body.error).toBe("bad_recipients");
    expect((await h.call("POST", `/api/events/${c.eid}/report/email`, { to: ["x@example.net"] }, c.off.token)).status).toBe(403);
    expect((await h.call("POST", `/api/events/${c.eid}/report/email`, { to: ["x@example.net"] })).status).toBe(401);
    const last = (await getLog(h, c.eid)).entries.filter((x) => x.entry.type === "report_emailed").at(-1)!.entry.payload as any;
    expect(last.recipients.every((x: string) => x.includes("*"))).toBe(true);
    const e2 = await liveElection(h, { candidates: ["A One", "B Two"] }, 2);
    expect((await h.call("POST", `/api/events/${e2.eid}/report/email`, { to: ["x@example.net"] }, e2.org)).body.error).toBe("not_published");
  });
});

async function fetchPdf(h: H, eid: string) {
  const { handle } = await import("../src/handler");
  const r = await handle(new Request(`http://x/api/r/${eid}/pdf`, { headers: { "cf-connecting-ip": "7.7.7.7" } }), h.env, h.now);
  const bytes = new Uint8Array(await r.arrayBuffer()); return { status: r.status, type: r.headers.get("content-type"), sha: r.headers.get("x-pdf-sha256"), bytes };
}

describe("the report is published within 120 seconds of the end, and a published record cannot change", () => {
  test("AUTO-PUBLISH: at the scheduled end the scheduler closes the event and the report is out within 120 seconds; before the end nothing happens", async () => {
    const h = await H.make(); h.now = T - DAY; const s = sched(T);
    const e = await liveElection(h, { candidates: ["Asha", "Bimal"] }, 3, { schedule: s, scheduledMs: undefined });
    const id = await e.ids(); await e.vote("A-101", { choices: [id.Asha!] });
    const tick = async (now: number) => { h.now = now; const { handle } = await import("../src/handler"); const r = await handle(new Request("http://x/api/internal/tick", { method: "POST", headers: { "x-internal-secret": "tick", "x-device-id": "scheduler-device-000001", "content-type": "application/json" }, body: "{}" }), h.env, now); return (await r.json()) as any; };
    expect((await tick(s.end.atMs - 1000)).closed).toBe(0);
    expect(h.count("SELECT COUNT(*) c FROM reports")).toBe(0);
    const out = await tick(s.end.atMs + 30_000); expect(out.closed).toBe(1);
    const rep = h.raw.query("SELECT published_ms FROM reports WHERE event_id=?").get(e.eid) as any;
    expect(rep.published_ms - s.end.atMs).toBeLessThanOrEqual(120_000);
    const entries = (await getLog(h, e.eid)).entries; const closedEntry = entries.find((x) => x.entry.type === "event_closed")!;
    expect(closedEntry.entry.actor).toEqual({ system: true }); expect((closedEntry.entry.payload as any).auto).toBe(true);
    expect((await h.call("GET", `/api/r/${e.eid}`)).text).toContain("FINAL REPORT");
    expect((await replayLog(entries)).problems).toEqual([]);
    expect((await tick(s.end.atMs + 90_000)).closed).toBe(0); // already closed: nothing to do twice
  });
  test("the Organizer can switch automatic closing off (a check box); then the scheduler leaves the event alone and only the Host's button closes it", async () => {
    const h = await H.make(); h.now = T - DAY; const s = sched(T);
    const off = await liveElection(h, { candidates: ["Asha", "Bimal"] }, 3, { schedule: s, setOptions: { auto_publish: false } });
    const on = await liveElection(h, { candidates: ["Asha", "Bimal"] }, 3, { schedule: s });
    const { handle } = await import("../src/handler");
    const r = await handle(new Request("http://x/api/internal/tick", { method: "POST", headers: { "x-internal-secret": "tick", "x-device-id": "scheduler-device-000001", "content-type": "application/json" }, body: "{}" }), h.env, s.end.atMs + 30_000);
    const out = (await r.json()) as any;
    expect(out.events).toEqual([on.eid]); // only the event that left the box ticked
    expect(h.raw.query("SELECT COUNT(*) c FROM reports WHERE event_id=?").get(off.eid)).toEqual({ c: 0 });
    h.now = T - DAY; // sessions are still valid at this clock
    await off.ok(h.call("POST", `/api/events/${off.eid}/close`, {}, off.org));
    expect(h.raw.query("SELECT COUNT(*) c FROM reports WHERE event_id=?").get(off.eid)).toEqual({ c: 1 });
  });
  test("ONCE PUBLISHED NOTHING CAN BE ADDED OR CHANGED, by anyone: the database refuses new rows, new log entries and a second report", async () => {
    const h = await H.make(); const e = await liveElection(h, { candidates: ["Asha", "Bimal"] }, 3); const id = await e.ids(); await e.vote("A-101", { choices: [id.Asha!] });
    await e.ok(h.call("POST", `/api/events/${e.eid}/close`, {}, e.org));
    const refuse = (sql: string, ...a: any[]) => expect(() => h.raw.query(sql).run(...a)).toThrow(/published|append-only/);
    refuse("INSERT INTO voter_ledger(event_id,point_id,flat_no,kind,voted_ms) VALUES(?,?,?,'official',1)", e.eid, e.pointId, "A-109");
    refuse("INSERT INTO ballot_box(receipt_hash,event_id,point_id,choice_json,weight) VALUES('zz',?,?,'[]',1)", e.eid, e.pointId);
    refuse("INSERT INTO attendance(event_id,flat_no,attendee_masked_name,mode,method,marked_by,independent,at_ms) VALUES(?,'A-109','X*','physical','visual','p',0,1)", e.eid);
    refuse("INSERT INTO flats(event_id,flat_no,weight,eligible,rev) VALUES(?,'Z-1',1,1,9)", e.eid);
    refuse("INSERT INTO event_rules(event_id,scope,param,value_json,rev,at_ms) VALUES(?,'event','tie.break','\"lots\"',9,1)", e.eid);
    refuse("INSERT INTO agenda_points(point_id,event_id,number,title,body,kind,options_json,max_choices,majority_class,secret,rev) VALUES('pt_x',?,'9','t','','discussion','[]',1,'simple',0,1)", e.eid);
    const last = h.raw.query("SELECT seq, hash FROM log_entries WHERE event_id=? ORDER BY seq DESC LIMIT 1").get(e.eid) as any;
    const entry = (type: string) => JSON.stringify({ type });
    expect(() => h.raw.query("INSERT INTO log_entries VALUES(?,?,?,?,?,?)").run(e.eid, last.seq + 1, "h", last.hash, entry("vote_recorded"), "s")).toThrow(/published/);
    expect(() => h.raw.query("INSERT INTO log_entries VALUES(?,?,?,?,?,?)").run(e.eid, last.seq + 1, "h", last.hash, entry("rule_changed"), "s")).toThrow(/published/);
    expect(() => h.raw.query("INSERT INTO log_entries VALUES(?,?,?,?,?,?)").run(e.eid, last.seq + 1, "h", last.hash, entry("anchor"), "s")).not.toThrow(); // a record ABOUT the published record is allowed
    expect(() => h.raw.query("INSERT INTO reports(event_id,rev,file_sha256,sig,head_seq,head_hash,html,published_ms) VALUES(?,2,'a','b',1,'c','<html>',1)").run(e.eid)).toThrow(/final/);
    for (const [m, p] of [["POST", "points"], ["PUT", "roll"], ["POST", "start"], ["POST", "close"], ["PUT", "rules"], ["PUT", "schedule"]] as const) {
      const r = await h.call(m, `/api/events/${e.eid}/${p}`, { flats: flatsOf(2), kind: "discussion", title: "Test pt", changes: { "tie.break": "lots" }, reason: "late late" }, e.org); expect(r.status).toBeGreaterThanOrEqual(400);
    }
    h.raw.exec("DROP TRIGGER reports_no_update");
    h.raw.query("UPDATE reports SET html = replace(html, 'FINAL REPORT', 'FORGED')").run(); // a DB admin edits the stored page ...
    const { verifyReportHtml } = await import("../../../packages/engine/src");
    expect((await verifyReportHtml((await h.call("GET", `/api/r/${e.eid}`)).text)).ok).toBe(false); // ... and it no longer verifies
  });
  test("EVERYONE can read the complete log: no sign-in; open votes show who chose what, secret ballots never do", async () => {
    const h = await H.make(); const e = await setup(h, { flats: 4 }); const off = await appointVerified(h, e, OFFP, "attendance_officer");
    await e.ok(h.call("POST", `/api/events/${e.eid}/agenda/publish`, {}, e.org)); await e.ok(h.call("POST", `/api/events/${e.eid}/start`, {}, e.org));
    for (let i = 0; i < 3; i++) await e.ok(h.call("POST", `/api/events/${e.eid}/attendance`, { flatNo: `A-${101 + i}`, attendeeName: "Owner " + i, mode: "physical", method: "visual" }, off.token));
    await e.ok(h.call("POST", `/api/events/${e.eid}/points/${e.pointId}/open`, { minutes: 20 }, e.org));
    const c = await e.ok(h.call("POST", `/api/events/${e.eid}/passcodes/voter`, { flatNo: "A-101" }, off.token)); const l = await e.ok(h.call("POST", "/api/vote/login", { eventId: e.eid, flatNo: "A-101", code: c.body.code, turnstile: "test-ok" }));
    await e.ok(h.call("POST", "/api/vote/cast", { pointId: e.pointId, choices: ["no"] }, l.body.token));
    const pub = await h.call("GET", `/api/events/${e.eid}/log`); expect(pub.status).toBe(200);
    expect(pub.body.entries.some((x: any) => x.entry.type === "vote_cast_open" && x.entry.payload.flatNo === "A-101" && x.entry.payload.choices[0] === "no")).toBe(true); // open vote: who chose what is public
    expect((await h.call("GET", `/api/r/${e.eid}`)).text).toContain("How each flat voted");
  });
});
void buildReportModel; void extractData; void renderReportPdf;

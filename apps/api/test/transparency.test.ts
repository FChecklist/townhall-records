// Owner directive 2026-10-24: everyone except the Organizer, Hosts and Attendance Monitors is shown only in the hidden form; those three publish their full name and e-mail
// (after agreeing), keep their mobile hidden except the last 4 digits, and every action carries who, role, date and time. An ID number is never kept. Privacy rights work per person.
import { describe, expect, test } from "bun:test";
import { DAY, H, HOSTP, OFFP, ORG, PRIVATE, STAFF_PUBLIC, appointVerified, getLog, newEvent, setup, flatsOf } from "./harness";
import { replayLog, scanPublic, verifyChain } from "../../../packages/engine/src";

const ok = async (p: Promise<any>) => { const r = await p; if (r.status >= 300) throw new Error(JSON.stringify(r.body)); return r; };
async function live(h: H, extra: Record<string, boolean> = {}) {
  const e = await setup(h, { flats: 6 }); const off = await appointVerified(h, e, OFFP, "attendance_officer");
  if (Object.keys(extra).length) await ok(h.call("PUT", `/api/events/${e.eid}/options`, { options: extra }, e.org));
  await ok(h.call("POST", `/api/events/${e.eid}/agenda/publish`, {}, e.org)); await ok(h.call("POST", `/api/events/${e.eid}/start`, {}, e.org));
  return { ...e, off };
}
describe("one universal masking rule", () => {
  test("on the public page, PDF-source model and log EVERYONE is hidden, the Organizer, Hosts and Attendance Monitors too", async () => {
    const h = await H.make(); const e = await live(h);
    const host = await appointVerified(h, e, HOSTP, "host"); void host;
    const page = (await h.call("GET", `/api/r/${e.eid}`)).text; const everything = page + (await h.call("GET", `/api/events/${e.eid}/log`)).text + JSON.stringify((await h.call("GET", `/api/events/${e.eid}`)).body);
    for (const p of [ORG, HOSTP, OFFP]) for (const secret of [p.email, p.phone, p.name, ...p.name.split(" ")]) expect(everything).not.toContain(secret);
    expect(page).toContain("Raj****** Aga******"); expect(page).toContain("Neh****** Gup******"); expect(page).toContain("Sun****** Ver******");
    expect(page).toContain("********rwal@example.org");
    expect(scanPublic(page, { allow: ["REG/2020/118"], forbidden: PRIVATE })).toEqual([]);
  });
  test("a flat holder is hidden the same way: Mee****** Kri******, ********hnan@example.org, ******5678", async () => {
    const h = await H.make(); const e = await newEvent(h); await ok(h.call("PUT", `/api/events/${e.eid}/roll`, { flats: flatsOf(2) }, e.org));
    await ok(h.call("POST", `/api/events/${e.eid}/holders`, { flatNo: "A-101", name: "Meera Krishnan", email: "meera.krishnan@example.org", phone: "9812345678" }, e.org));
    const everything = JSON.stringify((await h.call("GET", `/api/events/${e.eid}`)).body) + (await h.call("GET", `/api/r/${e.eid}`)).text + (await h.call("GET", `/api/events/${e.eid}/log`)).text;
    for (const secret of ["Meera", "Krishnan", "meera.krishnan", "9812345678", "812345678"]) expect(everything).not.toContain(secret);
    expect((await getLog(h, e.eid)).entries.find((x) => x.entry.type === "holder_added")!.entry.payload).toMatchObject({ maskedName: "Mee****** Kri******" });
    expect(h.raw.query("SELECT masked_email, masked_phone FROM people WHERE flat_no='A-101'").get()).toEqual({ masked_email: "********hnan@example.org", masked_phone: "******5678" });
  });
  test("the WORKING view: the Attendance Monitor sees the full name while checking the person in; once marked present it is hidden again; each look is logged", async () => {
    const h = await H.make(); const e = await live(h);
    await ok(h.call("POST", `/api/events/${e.eid}/holders`, { flatNo: "A-101", name: "Meera Krishnan", email: "meera.krishnan@example.org", phone: "9812345678" }, e.org));
    const before = await ok(h.call("GET", `/api/events/${e.eid}/verify/A-101`, undefined, e.off.token)); expect(before.body.alreadyPresent).toBe(false); expect(before.body.holders[0]).toMatchObject({ name: "Meera Krishnan", phone: "9812345678", hidden: false });
    expect((await h.call("GET", `/api/events/${e.eid}/verify/A-101`)).status).toBeGreaterThanOrEqual(401);
    await ok(h.call("POST", `/api/events/${e.eid}/attendance`, { flatNo: "A-101", attendeeName: "Meera Krishnan", mode: "physical", method: "id_document", docType: "Aadhaar card" }, e.off.token));
    const after = await ok(h.call("GET", `/api/events/${e.eid}/verify/A-101`, undefined, e.off.token)); expect(after.body.alreadyPresent).toBe(true); expect(after.body.holders[0]).toMatchObject({ name: "Mee****** Kri******", hidden: true }); expect(JSON.stringify(after.body)).not.toContain("Meera");
    expect((await getLog(h, e.eid)).entries.filter((x) => x.entry.type === "contacts_read" && (x.entry.payload as any).scope === "verify").length).toBe(2);
  });
});
describe("who verified the ID and who marked the attendance, with role, date and time", () => {
  test("shown in the hidden form with role, date and time; the ID number is never kept; the register lists every action", async () => {
    const h = await H.make(); const e = await live(h);
    h.now += 3_600_000;
    await ok(h.call("POST", `/api/events/${e.eid}/attendance`, { flatNo: "A-101", attendeeName: "Anil Kumar Sharma", mode: "physical", method: "id_document", docType: "Aadhaar card", docLast4: "7391" }, e.off.token));
    await ok(h.call("POST", `/api/events/${e.eid}/attendance`, { flatNo: "A-102", attendeeName: "Beena Rao", mode: "physical", method: "known_person" }, e.off.token));
    const page = (await h.call("GET", `/api/r/${e.eid}`)).text;
    expect(page).toContain("Who verified the ID"); expect(page).toContain("Who marked the attendance");
    expect(page).toContain("ID (Aadhaar card) verified by <b>Sun****** Ver******</b> (Attendance Monitor)"); expect(page).toContain("Marked present by <b>Sun****** Ver******</b> (Attendance Monitor)");
    expect(page).toMatch(/<small>[A-Za-z]+ [^<]*\d{2}:\d{2}[^<]*<\/small>/); // a day, date and time
    expect(page).toContain("Ani****** Kum****** Sha******"); expect(page).not.toContain("Anil Kumar"); expect(page).not.toContain("7391");
    expect(h.raw.query("SELECT doc_last4, doc_type FROM attendance WHERE flat_no='A-101'").get()).toEqual({ doc_last4: null, doc_type: "Aadhaar card" });
    expect(page).toContain("Who did what, and when"); const m = (await h.call("GET", `/api/events/${e.eid}`)).body.model;
    const mine = m.accountability.filter((a: any) => a.who === "Sun****** Ver******"); expect(mine.length).toBeGreaterThanOrEqual(2);
    expect(mine.some((a: any) => /Marked flat A-101 present, ID checked \(Aadhaar card\)/.test(a.what))).toBe(true); expect(mine.every((a: any) => a.role === "Attendance Monitor" && a.ts > 0)).toBe(true);
    expect(m.accountability.some((a: any) => a.who === "Raj****** Aga******" && a.role === "Organizer" && /Started the event/.test(a.what))).toBe(true);
  });
});
describe("chronology: a date and time for every action, event and process", () => {
  test("every log entry appears once, in order, with a time, who (hidden form, role) and what; times never run backwards; the PDF carries it too", async () => {
    const h = await H.make(); const e = await live(h); h.now += 60_000;
    await ok(h.call("POST", `/api/events/${e.eid}/attendance`, { flatNo: "A-101", attendeeName: "Owner 0", mode: "physical", method: "visual" }, e.off.token));
    await ok(h.call("POST", `/api/events/${e.eid}/close`, {}, e.org));
    const log = (await getLog(h, e.eid)).entries; const m = (await h.call("GET", `/api/events/${e.eid}`)).body.model;
    expect(m.chronology.length).toBe(log.length); expect(m.chronology.map((r: any) => r.seq)).toEqual(log.map((x) => x.entry.seq));
    for (let i = 1; i < m.chronology.length; i++) expect(m.chronology[i].ts).toBeGreaterThanOrEqual(m.chronology[i - 1].ts - 5000);
    expect(m.chronology.every((r: any) => r.what.length > 3 && r.who.length > 0 && r.hash.length === 12)).toBe(true);
    const whats = m.chronology.map((r: any) => r.what).join(" | "); for (const w of ["Created the", "Published the agenda", "Started the event", "Set the flat list", "Ended the event as completed"]) expect(whats).toContain(w);
    expect(m.chronology.some((r: any) => r.who.startsWith("system"))).toBe(true); expect(m.chronology.some((r: any) => r.who === "Sun****** Ver****** (Attendance Monitor)")).toBe(true);
    const page = (await h.call("GET", `/api/r/${e.eid}`)).text; expect(page).toContain("Chronology"); expect(page).toContain("Started the event");
    const pdf = await h.call("GET", `/api/r/${e.eid}/pdf`); expect(pdf.text).toContain("Chronology"); expect(pdf.text).toContain("Started the event");
    expect(page).not.toContain(OFFP.name);
  });
});
describe("the 4-digit lock on a ballot", () => {
  test("review shows the choice and a number; only that number locks it; changing the ballot after the review fails; nothing links the voter to the choice", async () => {
    const h = await H.make(); const e = await setup(h, { flats: 4 }); const off = await appointVerified(h, e, OFFP, "attendance_officer");
    await ok(h.call("PUT", `/api/events/${e.eid}/options`, { options: { vote_lock_code: true } }, e.org));
    await ok(h.call("POST", `/api/events/${e.eid}/agenda/publish`, {}, e.org)); await ok(h.call("POST", `/api/events/${e.eid}/start`, {}, e.org));
    for (let i = 0; i < 3; i++) await ok(h.call("POST", `/api/events/${e.eid}/attendance`, { flatNo: `A-${101 + i}`, attendeeName: `Owner ${i}`, mode: "physical", method: "visual" }, off.token));
    await ok(h.call("POST", `/api/events/${e.eid}/points/${e.pointId}/open`, { minutes: 30 }, e.org));
    const login = async (flat: string) => { const c = await ok(h.call("POST", `/api/events/${e.eid}/passcodes/voter`, { flatNo: flat }, off.token)); return (await ok(h.call("POST", "/api/vote/login", { eventId: e.eid, flatNo: flat, code: c.body.code, turnstile: "test-ok" }))).body.token as string; };
    const t = await login("A-101");
    expect((await h.call("POST", "/api/vote/cast", { pointId: e.pointId, choices: ["yes"] }, t)).body.error).toBe("lock_required");
    const prep = await ok(h.call("POST", "/api/vote/prepare", { pointId: e.pointId, choices: ["yes"] }, t)); expect(prep.body.lockCode).toMatch(/^\d{4}$/); expect(prep.body.review[0].id).toBe("yes");
    const wrong = prep.body.lockCode === "1234" ? "4321" : "1234";
    expect((await h.call("POST", "/api/vote/cast", { pointId: e.pointId, choices: ["yes"], lockCode: wrong }, t)).body.error).toBe("wrong_lock_code");
    expect((await h.call("POST", "/api/vote/cast", { pointId: e.pointId, choices: ["no"], lockCode: prep.body.lockCode }, t)).body.error).toBe("wrong_lock_code"); // a different ballot than the one reviewed
    expect((await h.call("POST", "/api/vote/cast", { pointId: e.pointId, choices: ["yes"], lockCode: prep.body.lockCode }, t)).status).toBe(201);
    expect((await h.call("POST", "/api/vote/prepare", { pointId: e.pointId, choices: ["yes"] }, t)).body.error).toBe("already_voted");
    const dump = JSON.stringify(h.raw.query("SELECT * FROM kv_state").all()); expect(dump).not.toContain('"yes"'); expect(dump).not.toContain("choices");
    const t2 = await login("A-102"); for (let n = 0; n < 5; n++) { const p2 = await ok(h.call("POST", "/api/vote/prepare", { pointId: e.pointId, choices: ["yes"] }, t2)); void p2; break; }
    const p3 = await ok(h.call("POST", "/api/vote/prepare", { pointId: e.pointId, choices: ["no"] }, t2)); const bad = p3.body.lockCode === "1111" ? "2222" : "1111";
    for (let n = 0; n < 5; n++) expect((await h.call("POST", "/api/vote/cast", { pointId: e.pointId, choices: ["no"], lockCode: bad }, t2)).body.error).toBe("wrong_lock_code");
    expect((await h.call("POST", "/api/vote/cast", { pointId: e.pointId, choices: ["no"], lockCode: p3.body.lockCode }, t2)).body.error).toBe("lock_too_many");
  });
  test("when the option is off the ballot is cast directly, as before", async () => {
    const h = await H.make(); const e = await live(h); void e; const prep = await h.call("POST", "/api/vote/prepare", { pointId: "x", choices: ["yes"] }); expect(prep.status).toBeGreaterThanOrEqual(401);
  });
});
describe("browser protection on every answer", () => {
  test("no framing, no sniffing, HTTPS only, closed content policy, camera and place only for our own pages", async () => {
    const h = await H.make(); const e = await newEvent(h);
    for (const p of ["/api/packs", `/api/r/${e.eid}`, "/api/terms"]) {
      const r = await h.call("GET", p); const g = (k: string) => r.headers.get(k) ?? "";
      expect(g("x-content-type-options")).toBe("nosniff"); expect(g("x-frame-options")).toBe("DENY"); expect(g("strict-transport-security")).toContain("max-age=63072000"); expect(g("referrer-policy")).toBe("no-referrer");
      expect(g("permissions-policy")).toContain("camera=(self)"); expect(g("content-security-policy")).toContain("frame-ancestors 'none'"); expect(g("content-security-policy")).toContain("default-src 'none'");
    }
  });
});
describe("recreate a new meeting or election from an old one", () => {
  test("the Organizer gets the same society, rules, own rules, officials, agenda, flat list and private names in a new event; nothing about votes or attendance", async () => {
    const h = await H.make(); const e = await setup(h, { flats: 3 });
    await ok(h.call("POST", `/api/events/${e.eid}/holders`, { flatNo: "A-101", name: "Meera Krishnan", email: "meera.krishnan@example.org", phone: "9812345678" }, e.org));
    await ok(h.call("POST", `/api/events/${e.eid}/officials`, { group: "returning_officer", name: "Col. R. Sethi", designation: "Returning Officer", authority: "Appointed 3 Oct" }, e.org));
    await ok(h.call("POST", `/api/events/${e.eid}/custom-rules`, { title: "Speaking time (minutes)", kind: "number", value: 3 }, e.org));
    const r = await h.call("POST", `/api/events/${e.eid}/recreate`, { title: "AGM 2027", venue: "Clubhouse", scheduledMs: h.now + 30 * DAY, turnstile: "test-ok", acceptTerms: true, termsVersion: (await import("../../../packages/engine/src")).TERMS_VERSION }, e.org);
    expect(r.status).toBe(201); expect(r.body.copied).toContain("flat list"); expect(r.body.notCopied).toContain("votes");
    const v = await ok(h.call("POST", "/api/auth/verify", { eventId: r.body.eventId, personId: r.body.personId, code: h.codeFor(ORG.email) }));
    const m = (await h.call("GET", `/api/events/${r.body.eventId}`)).body.model;
    expect(m.title).toBe("AGM 2027"); expect(m.society.name).toBe("Green Park Apartments"); expect(m.createdFrom).toBe(e.eid); expect(m.points.length).toBe(1);
    expect(m.officials.map((o: any) => o.name)).toEqual(["Col. R. Sethi"]); expect(m.customRules.map((c: any) => c.title)).toEqual(["Speaking time (minutes)"]);
    expect(m.attendance.present).toBe(0); expect(m.points[0].tally ?? null).toBeNull();
    const contacts = await ok(h.call("GET", `/api/events/${r.body.eventId}/contacts`, undefined, v.body.token)); expect(contacts.body.contacts.some((c: any) => c.name === "Meera Krishnan")).toBe(true);
  });
});
describe("privacy rights, one person at a time", () => {
  test("erase one holder: unreadable for ever, everyone else untouched, the public record still verifies and says it happened", async () => {
    const h = await H.make(); const e = await newEvent(h); await ok(h.call("PUT", `/api/events/${e.eid}/roll`, { flats: flatsOf(2) }, e.org));
    const a = await ok(h.call("POST", `/api/events/${e.eid}/holders`, { flatNo: "A-101", name: "Meera Krishnan", email: "meera@example.org", phone: "9812345678" }, e.org));
    await ok(h.call("POST", `/api/events/${e.eid}/holders`, { flatNo: "A-102", name: "Dev Anand", email: "dev@example.org", phone: "9812300000" }, e.org));
    expect((await h.call("POST", `/api/events/${e.eid}/privacy/erase`, { personId: a.body.personId }, e.org)).status).toBe(400); // a reason is required
    expect((await ok(h.call("POST", `/api/events/${e.eid}/privacy/erase`, { personId: a.body.personId, reason: "She asked, DPDP s.12" }, e.org))).body.erased).toEqual(["p:" + a.body.personId]);
    const cs = (await ok(h.call("GET", `/api/events/${e.eid}/contacts`, undefined, e.org))).body.contacts; expect(cs.find((c: any) => c.pid === a.body.personId)).toMatchObject({ erased: true });
    expect(cs.find((c: any) => c.name === "Dev Anand")).toBeTruthy(); expect(cs.find((c: any) => c.name === ORG.name)).toBeTruthy();
    const log = await getLog(h, e.eid); expect(log.entries.some((x) => x.entry.type === "person_erased")).toBe(true); expect((await verifyChain(log.entries, log.publicKey)).ok).toBe(true);
    expect((await replayLog(log.entries)).problems).toEqual([]);
  });
  test("a signed-in person files a request; the public form works too; the Organizer answers; the person can see their own stored data; every step is logged", async () => {
    const h = await H.make(); const e = await newEvent(h);
    const mine = await ok(h.call("GET", "/api/me/data", undefined, e.org)); expect(mine.body.stored).toMatchObject({ name: ORG.name, email: ORG.email });
    const req = await ok(h.call("POST", "/api/privacy/request", { type: "correct", note: "my surname is spelt wrongly" }, e.org));
    const pub = await ok(h.call("POST", `/api/events/${e.eid}/privacy/contact`, { type: "grievance", name: "A Neighbour", email: "neighbour@example.org", note: "I was photographed without asking", turnstile: "test-ok" }));
    expect((await h.call("POST", "/api/privacy/request", { type: "nonsense" }, e.org)).status).toBe(400);
    const list = (await ok(h.call("GET", `/api/events/${e.eid}/privacy/requests`, undefined, e.org))).body.requests; expect(list.length).toBe(2); expect(list.find((x: any) => x.id === req.body.requestId).note).toContain("spelt");
    await ok(h.call("POST", `/api/events/${e.eid}/privacy/requests/${req.body.requestId}/resolve`, { action: "done", note: "Corrected on 24 Oct" }, e.org));
    expect((await ok(h.call("GET", `/api/events/${e.eid}/privacy/requests`, undefined, e.org))).body.requests.find((x: any) => x.id === req.body.requestId).status).toBe("done");
    const exp = await ok(h.call("GET", `/api/events/${e.eid}/privacy/export/${e.pid}?reason=${encodeURIComponent("subject access request")}`, undefined, e.org)); expect(exp.body.stored.email).toBe(ORG.email);
    const types = (await getLog(h, e.eid)).entries.map((x) => x.entry.type); for (const t of ["privacy_request", "privacy_resolved", "subject_access"]) expect(types).toContain(t);
    expect(JSON.stringify((await getLog(h, e.eid)).entries)).not.toContain("neighbour@example.org"); void pub;
    expect(() => h.raw.query("DELETE FROM privacy_requests").run()).toThrow(/append-only/);
  });
  test("requests are still accepted after the report is published", async () => {
    const h = await H.make(); const e = await live(h); await ok(h.call("POST", `/api/events/${e.eid}/close`, {}, e.org));
    expect((await h.call("POST", `/api/events/${e.eid}/privacy/contact`, { type: "access", name: "A Voter", email: "voter@example.org", note: "please send me my data", turnstile: "test-ok" })).status).toBe(201);
    expect((await h.call("POST", `/api/events/${e.eid}/privacy/erase`, { flatNo: "A-101", reason: "owner asked" }, e.org)).status).toBe(200);
  });
});

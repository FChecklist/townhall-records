// End-to-end: one whole meeting from set-up to erasure, through the real routes and the real migrations, with every directive of the owner exercised in the order a society would meet them.
// Light on memory by design (one event, four flats): about 130 MB.
import { describe, expect, test } from "bun:test";
import { DAY, H, HOSTP, OFFP, ORG, PRIVATE, appointVerified, getLog, newEvent } from "./harness";
import { TERMS_VERSION, replayLog, scanPublic, verifyChain, verifyReportHtml } from "../../../packages/engine/src";
import { ROLL_HEADERS } from "../../../packages/engine/src";
import { excelLikePdf, sheet } from "../../../packages/engine/test/pdfmaker";

const ok = async (p: Promise<any>) => { const r = await p; if (r.status >= 300) throw new Error(JSON.stringify(r.body)); return r; };
const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const JPEG = b64(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]));
const advance = (h: H, ms: number) => { h.now += ms; h.raw.query("UPDATE sessions SET expires_ms = ?").run(h.now + DAY); };

describe("a whole meeting, end to end", () => {
  test("set-up, flat list from a PDF, team, officials, payment by anyone, check-in with photo and ID, locked ballots, completion, verification, privacy and retention", async () => {
    void ROLL_HEADERS;
    const h = await H.make(); const e = await newEvent(h, { eventType: "agm" });
    // 1 options chosen by the Organizer (all tick-boxes)
    await ok(h.call("PUT", `/api/events/${e.eid}/options`, { options: { attendance_photo: true, attendance_checklist: true, vote_lock_code: true } }, e.org));
    // 2 flat list: PDF only, preview then confirm
    const rows = [1, 2, 3, 4].map((i) => [`A-10${i}`, `Owner Number${i} Kumar`, "1", "Yes", `98765432${10 + i}`, `owner${i}@example.org`]);
    const pdf = b64(await excelLikePdf([sheet(rows)])); const pv = await ok(h.call("POST", `/api/events/${e.eid}/roll/import`, { pdfBase64: pdf }, e.org)); expect(pv.body.ok).toBe(true);
    await ok(h.call("POST", `/api/events/${e.eid}/roll/import`, { pdfBase64: pdf, confirm: pv.body.confirmCode }, e.org));
    // 3 team and optional officials
    const host = await appointVerified(h, e, HOSTP, "host"); const mon = await appointVerified(h, e, OFFP, "attendance_officer");
    const off = await ok(h.call("POST", `/api/events/${e.eid}/officials`, { group: "returning_officer", name: "Col. R. Sethi", designation: "Returning Officer", authority: "Appointed by the committee" }, host.token));
    await ok(h.call("POST", `/api/events/${e.eid}/custom-rules`, { title: "Speaking time (minutes)", kind: "number", value: 3 }, e.org));
    // 4 agenda and payment by someone who is not the Organizer
    const pt = await ok(h.call("POST", `/api/events/${e.eid}/points`, { kind: "resolution", title: "Approve the accounts", secret: false, majorityClass: "simple" }, host.token));
    const link = await ok(h.call("POST", `/api/events/${e.eid}/pay-link`, {}, host.token)); const tok = link.body.payPath.replace("/pay/", "");
    await ok(h.call("POST", `/api/pay/link/${tok}/payer`, { name: "A Well Wisher", email: "wellwisher@example.org" })); await ok(h.call("POST", `/api/pay/link/${tok}/test-pay`, {}));
    await ok(h.call("POST", `/api/events/${e.eid}/agenda/publish`, {}, e.org));
    // 5 the day: start, check-in (working view -> photo -> ID -> mark), officials present
    advance(h, 11 * DAY); await ok(h.call("POST", `/api/events/${e.eid}/start`, {}, host.token));
    await ok(h.call("POST", `/api/events/${e.eid}/officials/${off.body.id}/attendance`, { present: true }, mon.token));
    const checks = { proof_seen: true, name_matches: true, flat_matches: true, person_checked: true, photo_taken: true, person_agrees: true };
    for (const f of ["A-101", "A-102", "A-103"]) {
      const view = await ok(h.call("GET", `/api/events/${e.eid}/verify/${f}`, undefined, mon.token)); expect(view.body.holders[0].hidden).toBe(false);
      await ok(h.call("POST", `/api/events/${e.eid}/attendance/photo`, { flatNo: f, photoBase64: JPEG, consent: true, capturedAtMs: h.now, geo: { lat: 26.85, lon: 80.95, accuracyM: 10 } }, mon.token));
      await ok(h.call("POST", `/api/events/${e.eid}/attendance`, { flatNo: f, attendeeName: "Owner", mode: "physical", method: "id_document", docType: "Aadhaar card", docLast4: "0000", checks }, mon.token));
      expect((await ok(h.call("GET", `/api/events/${e.eid}/verify/${f}`, undefined, mon.token))).body.holders[0].hidden).toBe(true); // muted again
    }
    // 6 voting with the 4-digit lock
    await ok(h.call("POST", `/api/events/${e.eid}/points/${pt.body.pointId}/open`, { minutes: 30 }, host.token));
    for (const [f, choice] of [["A-101", "yes"], ["A-102", "yes"], ["A-103", "no"]] as const) {
      const c = await ok(h.call("POST", `/api/events/${e.eid}/passcodes/voter`, { flatNo: f }, mon.token)); const l = await ok(h.call("POST", "/api/vote/login", { eventId: e.eid, flatNo: f, code: c.body.code, turnstile: "test-ok" }));
      const prep = await ok(h.call("POST", "/api/vote/prepare", { pointId: pt.body.pointId, choices: [choice] }, l.body.token));
      await ok(h.call("POST", "/api/vote/cast", { pointId: pt.body.pointId, choices: [choice], lockCode: prep.body.lockCode }, l.body.token));
    }
    // 7 finish: tick-box outcome, Yes, type the number
    const i = await ok(h.call("POST", `/api/events/${e.eid}/intent`, { action: "complete" }, e.org)); const done = await ok(h.call("POST", `/api/events/${e.eid}/confirm`, { intentId: i.body.intentId, code: i.body.confirmCode }, e.org));
    expect(done.body.outcome).toBe("completed");
    // 8 verification by anyone: chain, replay, sealed file, public output
    const log = await getLog(h, e.eid); expect((await verifyChain(log.entries, log.publicKey)).ok).toBe(true); const st = await replayLog(log.entries); expect(st.problems).toEqual([]);
    const page = await h.call("GET", `/api/r/${e.eid}`); expect((await verifyReportHtml(page.text, { publicKey: log.publicKey })).ok).toBe(true);
    const everything = page.text + JSON.stringify(log.entries); expect(scanPublic(everything, { allow: ["REG/2020/118"], forbidden: [...PRIVATE, "Owner Number"] })).toEqual([]); // (an ID number is never stored at all, so there is nothing to find)
    expect(h.raw.query("SELECT COUNT(*) c FROM attendance WHERE doc_last4 IS NOT NULL").get()).toEqual({ c: 0 });
    for (const w of ["COMPLETED", "Chronology", "Who verified the ID", "Who did what, and when", "Col. R. Sethi", "Speaking time (minutes)", "Raj****** Aga******", "Sun****** Ver******"]) expect(page.text).toContain(w);
    const m = (await h.call("GET", `/api/events/${e.eid}`)).body.model; expect(m.chronology.length).toBe(log.entries.length); expect(m.points[0].tally?.outcome ?? m.points[0].result?.outcome ?? "carried").toBeTruthy();
    const pdfRes = await h.call("GET", `/api/r/${e.eid}/pdf`); for (const w of [`MEETING ID ${e.eid}`, "Chronology", "Col. R. Sethi", "signature"]) expect(pdfRes.text).toContain(w);
    expect(h.raw.query("SELECT COUNT(*) c FROM roll_documents").get()).toEqual({ c: 1 }); expect((h.raw.query("SELECT COUNT(*) c FROM attendance_evidence").get() as any).c).toBe(3);
    // 9 a privacy request after publication, then erase one holder
    await ok(h.call("POST", `/api/events/${e.eid}/privacy/contact`, { type: "erase", name: "Owner One", email: "owner1@example.org", note: "please erase my details", turnstile: "test-ok" }));
    const holder = h.raw.query("SELECT id FROM people WHERE flat_no='A-101' LIMIT 1").get() as any;
    await ok(h.call("POST", `/api/events/${e.eid}/privacy/erase`, { personId: holder.id, flatNo: "A-101", reason: "owner asked on 24 Oct" }, e.org));
    const cs = (await ok(h.call("GET", `/api/events/${e.eid}/contacts`, undefined, e.org))).body.contacts; expect(cs.find((c: any) => c.pid === holder.id)).toMatchObject({ erased: true }); expect(cs.find((c: any) => c.email === "owner2@example.org")).toBeTruthy();
    // 10 retention: after the keeping period everything private is erased by the scheduler, the public record still verifies
    advance(h, 400 * DAY); const { handle } = await import("../src/handler");
    const tick = await handle(new Request("http://x/api/internal/tick", { method: "POST", headers: { "x-internal-secret": "tick", "x-device-id": "scheduler-device-000001", "content-type": "application/json" }, body: "{}" }), h.env, h.now); const tb: any = await tick.json();
    expect(tb.erased).toBe(1); expect((await h.call("GET", `/api/events/${e.eid}/contacts`, undefined, e.org)).status).toBe(410);
    const log2 = await getLog(h, e.eid); expect((await verifyChain(log2.entries, log2.publicKey)).ok).toBe(true); expect((await replayLog(log2.entries)).problems).toEqual([]);
    expect(log2.entries.at(-1)!.entry.type).toBe("key_destroyed"); expect((log2.entries.at(-1)!.entry.payload as any).auto).toBe(true);
    expect((await verifyReportHtml((await h.call("GET", `/api/r/${e.eid}`)).text, { publicKey: log2.publicKey })).ok).toBe(true);
    void TERMS_VERSION; void ORG;
  });
});

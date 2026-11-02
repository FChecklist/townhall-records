// B1 (owner decision, 2 Nov 2026): after the notice went out, a change of title or place is mailed to the flat holders who have an e-mail on the list, with the old and the new words.
// Real handler and migrations on SQLite; the mails land in the local outbox stub (nothing leaves the machine). A mail problem never undoes the change.
import { describe, expect, test } from "bun:test";
import { H, HOSTP, appointVerified, newEvent } from "./harness";
import { excelLikePdf, sheet } from "../../../packages/engine/test/pdfmaker";

const ok = async (p: Promise<any>) => { const r = await p; if (r.status >= 300) throw new Error(JSON.stringify(r.body)); return r; };
const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const SUBJECT = "Meeting details changed%";
const sent = (h: H) => h.raw.query("SELECT to_addr, subject, body FROM mail_outbox WHERE subject LIKE ? ORDER BY id").all(SUBJECT) as Array<{ to_addr: string; subject: string; body: string }>;

/** An event with a flat list whose holders have e-mails (owner1..owner4, owner4 shares owner3's address), one point, paid; the notice is NOT published yet. */
async function world() {
  const h = await H.make(); const e = await newEvent(h, { eventType: "agm" });
  const rows = [["A-101", "Owner Number1 Kumar", "1", "Yes", "9876543211", "owner1@example.org"], ["A-102", "Owner Number2 Kumar", "1", "Yes", "9876543212", "owner2@example.org"],
    ["A-103", "Owner Number3 Kumar", "1", "Yes", "9876543213", "owner3@example.org"], ["A-104", "Owner Number4 Kumar", "1", "Yes", "9876543214", "Owner3@Example.org"], ["A-105", "Owner Number5 Kumar", "1", "Yes", "9876543215", ""]];
  const pdf = b64(await excelLikePdf([sheet(rows)])); const pv = await ok(h.call("POST", `/api/events/${e.eid}/roll/import`, { pdfBase64: pdf }, e.org)); expect(pv.body.ok).toBe(true);
  await ok(h.call("POST", `/api/events/${e.eid}/roll/import`, { pdfBase64: pdf, confirm: pv.body.confirmCode }, e.org));
  await ok(h.call("POST", `/api/events/${e.eid}/points`, { kind: "resolution", title: "Approve the accounts", secret: false, majorityClass: "simple" }, e.org));
  const pay = await ok(h.call("POST", `/api/events/${e.eid}/pay`, {}, e.org)); await ok(h.call("POST", "/api/pay/test-confirm", { eventId: e.eid, paymentId: pay.body.paymentId }, e.org));
  return { h, e };
}
const basics = (h: H, eid: string, body: unknown, token: string) => h.call("PUT", `/api/events/${eid}/basics`, body, token);
const model = async (h: H, eid: string) => (await h.call("GET", `/api/events/${eid}`)).body.model;

describe("meeting details changed: mail to the members", () => {
  test("before the notice nobody is mailed; after it, a place change reaches every holder with an e-mail once, with the old and the new words and the reason", async () => {
    const { h, e } = await world();
    const early = await ok(basics(h, e.eid, { venue: "Community hall" }, e.org)); expect(early.body.mailed).toBe(0); expect(sent(h).length).toBe(0); // nobody has been told anything yet
    await ok(h.call("POST", `/api/events/${e.eid}/agenda/publish`, {}, e.org));
    const r = await ok(basics(h, e.eid, { venue: "Garden lawn", reason: "The hall roof is being repaired" }, e.org));
    expect(r.body).toEqual({ ok: true, title: "Annual General Meeting 2026", venue: "Garden lawn", mailed: 3, mailFailed: 0 }); // owner3 and owner4 share one address: one mail; A-105 has none
    const mails = sent(h); expect(mails.map((x) => x.to_addr).sort()).toEqual(["owner1@example.org", "owner2@example.org", "owner3@example.org"]);
    for (const m of mails) {
      expect(m.subject).toBe("Meeting details changed: Annual General Meeting 2026");
      expect(m.body).toContain('Place: was "Community hall", now "Garden lawn"'); expect(m.body).not.toContain("Title:"); expect(m.body).toContain("Reason: The hall roof is being repaired"); expect(m.body).toContain(`/e/${e.eid}`);
      expect(m.body).toContain("Green Park Apartments");
    }
    expect((await model(h, e.eid)).venue).toBe("Garden lawn"); // and the change itself is in the record as before
  });
  test("a title change says Title, both together say both; changing nothing mails nobody", async () => {
    const { h, e } = await world(); await ok(h.call("POST", `/api/events/${e.eid}/agenda/publish`, {}, e.org));
    const same = await ok(basics(h, e.eid, { title: "Annual General Meeting 2026", venue: "Clubhouse" }, e.org)); expect(same.body.mailed).toBe(0); expect(sent(h).length).toBe(0);
    const t = await ok(basics(h, e.eid, { title: "Annual General Meeting 2026 (adjourned)" }, e.org)); expect(t.body.mailed).toBe(3);
    const first = sent(h)[0]!; expect(first.subject).toBe("Meeting details changed: Annual General Meeting 2026 (adjourned)"); expect(first.body).toContain('Title: was "Annual General Meeting 2026", now "Annual General Meeting 2026 (adjourned)"'); expect(first.body).not.toContain("Place:");
    const both = await ok(basics(h, e.eid, { title: "AGM 2026", venue: "Hall B" }, e.org)); expect(both.body.mailed).toBe(3);
    const last = sent(h).at(-1)!; expect(last.body).toContain('Title: was "Annual General Meeting 2026 (adjourned)", now "AGM 2026"'); expect(last.body).toContain('Place: was "Clubhouse", now "Hall B"');
  });
  test("only holders are mailed, never the team; a Host who also edits the details can trigger it", async () => {
    const { h, e } = await world(); const host = await appointVerified(h, e, HOSTP, "host"); await ok(h.call("POST", `/api/events/${e.eid}/agenda/publish`, {}, e.org));
    const r = await ok(basics(h, e.eid, { venue: "Hall B" }, host.token)); expect(r.body.mailed).toBe(3);
    expect(sent(h).some((x) => x.to_addr === HOSTP.email)).toBe(false);
  });
  test("over the daily mail limit the change is still saved; the mails that could not go are counted", async () => {
    const { h, e } = await world(); await ok(h.call("POST", `/api/events/${e.eid}/agenda/publish`, {}, e.org));
    const used = (h.raw.query("SELECT COALESCE(SUM(n),0) n FROM mail_counter").get() as any).n as number; h.env.MAIL_DAILY_LIMIT = String(used + 2);
    const r = await ok(basics(h, e.eid, { venue: "Hall C" }, e.org)); expect(r.body.mailed).toBe(2); expect(r.body.mailFailed).toBe(1);
    expect(sent(h).length).toBe(2); expect((await model(h, e.eid)).venue).toBe("Hall C");
  });
  test("a flat list without any e-mail mails nobody and reports zero (the Organizer is told on the screen to tell people)", async () => {
    const h = await H.make(); const e = await newEvent(h, { eventType: "agm" });
    await ok(h.call("PUT", `/api/events/${e.eid}/roll`, { flats: [{ flatNo: "A-101", weight: 1, eligible: true }, { flatNo: "A-102", weight: 1, eligible: true }] }, e.org));
    await ok(h.call("POST", `/api/events/${e.eid}/points`, { kind: "resolution", title: "Approve the accounts", secret: false, majorityClass: "simple" }, e.org));
    const pay = await ok(h.call("POST", `/api/events/${e.eid}/pay`, {}, e.org)); await ok(h.call("POST", "/api/pay/test-confirm", { eventId: e.eid, paymentId: pay.body.paymentId }, e.org));
    await ok(h.call("POST", `/api/events/${e.eid}/agenda/publish`, {}, e.org));
    const r = await ok(basics(h, e.eid, { venue: "Hall D" }, e.org)); expect(r.body.mailed).toBe(0); expect(r.body.mailFailed).toBe(0); expect(sent(h).length).toBe(0);
  });
});

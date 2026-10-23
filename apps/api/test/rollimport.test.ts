// Owner directive: the flat list comes from a PDF of the downloaded Excel sheet (PDF only), is shown for checking before it is saved, and every manual entry or correction says why. All of it is logged.
import { describe, expect, test } from "bun:test";
import { H, getLog, newEvent } from "./harness";
import { excelLikePdf, sheet } from "../../../packages/engine/test/pdfmaker";

const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const rows = [["A-101", "Asha Rao", "1", "Yes", "9876543210", "asha@example.org"], ["A-102", "Bimal Sen", "2", "No", "", ""], ["B-7", "Charu Das", "", "", "", ""]];
const pdf = async (r = rows) => b64(await excelLikePdf([sheet(r)]));

describe("flat list from a PDF", () => {
  test("template downloads; preview saves nothing; confirm saves; the PDF and its hash are kept; names become holders; the log says what and why", async () => {
    const h = await H.make(); const e = await newEvent(h); const url = `/api/events/${e.eid}/roll/import`;
    const t = await h.call("GET", `/api/events/${e.eid}/roll/template?flats=30`, undefined, e.org); expect(t.status).toBe(200); expect(t.text.startsWith("PK")).toBe(true);
    const rev0 = (await getLog(h, e.eid)).entries.filter((x) => x.entry.type === "roll_set").length;
    const f = await pdf(); const p = await h.call("POST", url, { pdfBase64: f }, e.org);
    expect(p.status).toBe(200); expect(p.body.applied).toBe(false); expect(p.body.ok).toBe(true); expect(p.body.flats).toBe(3); expect(p.body.totalWeight).toBe(2); expect(p.body.diff.added.length).toBe(3);
    expect((await getLog(h, e.eid)).entries.filter((x) => x.entry.type === "roll_set").length).toBe(rev0); // nothing saved by a preview
    expect((await h.call("POST", url, { pdfBase64: f, confirm: "00000000" }, e.org)).body.error).toBe("confirm_mismatch");
    const a = await h.call("POST", url, { pdfBase64: f, confirm: p.body.confirmCode, fileName: "flats.pdf" }, e.org); expect(a.status).toBe(200); expect(a.body.applied).toBe(true); expect(a.body.namesAdded).toBe(3);
    const log = await getLog(h, e.eid); const rs = log.entries.filter((x) => x.entry.type === "roll_set").at(-1)!.entry.payload as any;
    expect(rs.source).toBe("pdf"); expect(rs.pdfSha256).toBe(p.body.fileSha256); expect(rs.flats.length).toBe(3); expect(log.entries.filter((x) => x.entry.type === "holder_added").length).toBeGreaterThanOrEqual(3);
    expect(h.count("SELECT COUNT(*) c FROM roll_documents WHERE event_id=? AND sha256=?", e.eid, p.body.fileSha256)).toBe(1);
    expect(JSON.stringify(log.entries)).not.toContain("Asha Rao"); expect(JSON.stringify(log.entries)).not.toContain("asha@example.org");
    expect(() => h.raw.query("DELETE FROM roll_documents").run()).toThrow(/append-only/); expect(() => h.raw.query("UPDATE roll_documents SET size=1").run()).toThrow(/append-only/);
    expect(h.count("SELECT COUNT(*) c FROM access_audit WHERE event_id=? AND route LIKE '%roll/import%' AND phase='result'", e.eid)).toBeGreaterThanOrEqual(3);
  });
  test("a second upload needs a reason, shows what changes, and the old list stays in the log", async () => {
    const h = await H.make(); const e = await newEvent(h); const url = `/api/events/${e.eid}/roll/import`;
    const f1 = await pdf(); const p1 = await h.call("POST", url, { pdfBase64: f1 }, e.org); await h.call("POST", url, { pdfBase64: f1, confirm: p1.body.confirmCode }, e.org);
    const f2 = await pdf([rows[0]!, ["A-102", "Bimal Sen", "3", "Yes", "", ""], ["C-9", "", "1", "Yes", "", ""]]); const p2 = await h.call("POST", url, { pdfBase64: f2 }, e.org);
    expect(p2.body.replacesExisting).toBe(true); expect(p2.body.diff.added).toEqual(["C-9"]); expect(p2.body.diff.removed).toEqual(["B-7"]); expect(p2.body.diff.changed[0].flatNo).toBe("A-102");
    expect((await h.call("POST", url, { pdfBase64: f2, confirm: p2.body.confirmCode }, e.org)).body.error).toBe("reason_required");
    expect((await h.call("POST", url, { pdfBase64: f2, confirm: p2.body.confirmCode, reason: "two flats changed hands" }, e.org)).body.applied).toBe(true);
    const rolls = (await getLog(h, e.eid)).entries.filter((x) => x.entry.type === "roll_set"); expect(rolls.at(-1)!.entry.payload).toMatchObject({ reason: "two flats changed hands", diff: { added: 1, removed: 1 } });
  });
  test("a sheet with problems is never saved, and says which flat and what to do", async () => {
    const h = await H.make(); const e = await newEvent(h); const url = `/api/events/${e.eid}/roll/import`;
    const f = await pdf([["A-1", "", "zero", "Yes", "", ""], ["A-1", "", "", "", "", ""]]); const p = await h.call("POST", url, { pdfBase64: f }, e.org);
    expect(p.body.ok).toBe(false); expect(p.body.problems.length).toBeGreaterThanOrEqual(2); expect(p.body.problems.map((x: any) => x.message).join(" ")).toContain("flat A-1");
    expect((await h.call("POST", url, { pdfBase64: f, confirm: p.body.confirmCode }, e.org)).body.error).toBe("sheet_has_problems");
  });
  test("only a PDF is accepted: Excel, CSV, text, pictures and other people's PDFs are refused in plain words", async () => {
    const h = await H.make(); const e = await newEvent(h); const url = `/api/events/${e.eid}/roll/import`;
    for (const bad of [btoa("PK\u0003\u0004 an excel file"), btoa("flat,weight\nA-1,1"), btoa("\u0089PNG\r\n picture")]) { const r = await h.call("POST", url, { pdfBase64: bad }, e.org); expect(r.status).toBe(400); expect(r.body.error).toBe("not_pdf"); expect(r.body.message).toContain("PDF"); }
    expect((await h.call("POST", url, {}, e.org)).body.error).toBe("no_file");
    const other = await h.call("POST", url, { pdfBase64: b64(await excelLikePdf([[[30, 30, "My own list"], [30, 60, "A-1"]]])) }, e.org); expect(other.body.ok).toBe(false); expect(other.body.problems[0].message).toContain("not our roll sheet");
    expect((await h.call("POST", url, { pdfBase64: await pdf() })).status).toBeGreaterThanOrEqual(401); // not signed in
  });
  test("manual entry and correction: each needs a reason, is its own revision, and the before/after is public", async () => {
    const h = await H.make(); const e = await newEvent(h); const url = `/api/events/${e.eid}/roll/flat`;
    expect((await h.call("PUT", `/api/events/${e.eid}/roll`, { flats: [{ flatNo: "A-1", weight: 1, eligible: true }, { flatNo: "A-2", weight: 1, eligible: true }] }, e.org)).status).toBe(200);
    expect((await h.call("POST", url, { op: "add", flatNo: "A-3", weight: 2 }, e.org)).body.error).toBeTruthy(); // no reason
    const add = await h.call("POST", url, { op: "add", flatNo: "A-3", weight: 2, name: "Dev Anand", reason: "new flat handed over" }, e.org); expect(add.status).toBe(200); expect(add.body.flats).toBe(3);
    expect((await h.call("POST", url, { op: "add", flatNo: "A-3", reason: "again by mistake" }, e.org)).body.error).toBe("dup_flat");
    const ch = await h.call("POST", url, { op: "change", flatNo: "A-2", weight: 5, reason: "weightage typed wrongly" }, e.org); expect(ch.body.change.changed[0]).toMatchObject({ flatNo: "A-2", before: { weight: 1 }, after: { weight: 5 } });
    expect((await h.call("POST", url, { op: "change", flatNo: "Z-9", weight: 5, reason: "no such flat" }, e.org)).status).toBe(404);
    expect((await h.call("POST", url, { op: "remove", flatNo: "A-1", reason: "merged with A-2" }, e.org)).body.flats).toBe(2);
    const log = await getLog(h, e.eid); const rs = log.entries.filter((x) => x.entry.type === "roll_set"); expect(rs.length).toBeGreaterThanOrEqual(4);
    expect(rs.at(-1)!.entry.payload).toMatchObject({ source: "manual", op: "remove", reason: "merged with A-2" }); expect(rs.at(-2)!.entry.payload).toMatchObject({ op: "change", diff: { changed: [{ flatNo: "A-2" }] } });
    expect(JSON.stringify(log.entries)).not.toContain("Dev Anand");
  });
});

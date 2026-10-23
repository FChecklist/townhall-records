// Owner directive: the Organizer downloads an Excel sheet, fills it, saves it as PDF and uploads ONLY that PDF; every problem is named; nothing is guessed.
import { describe, expect, test } from "bun:test";
import { ROLL_HEADERS, ROLL_TEMPLATE_ID, buildRollTemplateXlsx, crc32, diffRoll, parseRollTable, readPdfTable } from "../src";
import { COLX, excelLikePdf, sheet, type Cell } from "./pdfmaker";

const te = new TextEncoder();

const good = [["A-101", "Asha Rao", "1", "Yes", "9876543210", "asha@example.org"], ["A-102", "Bimal Sen", "2", "No", "", ""], ["B-7", "", "", "", "", ""]];

describe("template", () => {
  test("xlsx is a valid stored zip with the title, headings, dropdown and print setup", () => {
    const z = buildRollTemplateXlsx({ flats: 40, societyName: "Green Park" }); const s = new TextDecoder().decode(z);
    expect(String.fromCharCode(z[0]!, z[1]!)).toBe("PK"); expect(s).toContain(ROLL_TEMPLATE_ID); expect(s).toContain("Green Park"); for (const h of ROLL_HEADERS) expect(s).toContain(h);
    expect(s).toContain('"Yes,No"'); expect(s).toContain('orientation="landscape"'); expect(s).toContain('fitToWidth="1"'); expect(s).toContain('r="A44"');
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });
  test("row count is bounded", () => { expect(new TextDecoder().decode(buildRollTemplateXlsx({ flats: 99999 }))).toContain('r="A3004"'); expect(new TextDecoder().decode(buildRollTemplateXlsx({ flats: 0 }))).toContain('r="A5"'); });
});
describe("reading the saved-as-PDF sheet", () => {
  for (const [name, opt] of [["compressed Identity-H (as Excel)", {}], ["plain uncompressed Latin text", { identity: false, compress: false }]] as const) {
    test(`flats, weights, Yes/No, blanks - ${name}`, async () => {
      const tb = await readPdfTable(await excelLikePdf([sheet(good)], opt)); if (process.env.DBG) console.log(JSON.stringify(tb)); const r = parseRollTable(tb);
      expect(r.problems).toEqual([]); expect(r.ok).toBe(true); expect(r.flats.length).toBe(3);
      expect(r.flats[0]).toMatchObject({ flatNo: "A-101", name: "Asha Rao", weight: 1, eligible: true, mobile: "9876543210", email: "asha@example.org" });
      expect(r.flats[1]).toMatchObject({ flatNo: "A-102", weight: 2, eligible: false }); expect(r.flats[2]).toMatchObject({ flatNo: "B-7", weight: 1, eligible: true });
      expect(r.totalWeight).toBe(2); expect(r.eligibleCount).toBe(2);
    });
  }
  test("a sheet over two pages with the heading repeated is one list", async () => {
    const p1 = sheet([good[0]!]); const p2: Cell[] = []; ROLL_HEADERS.forEach((h, i) => p2.push([COLX[i]!, 40, h])); p2.push([COLX[0]!, 70, "A-103"], [COLX[2]!, 70, "3"], [30, 560, "Page 2 of 2"]);
    const r = parseRollTable(await readPdfTable(await excelLikePdf([p1, p2]))); expect(r.flats.map((f) => f.flatNo)).toEqual(["A-101", "A-103"]); expect(r.problems).toEqual([]);
  });
  test("every problem is named by flat and nothing is guessed", async () => {
    const r = parseRollTable(await readPdfTable(await excelLikePdf([sheet([["A-1", "", "x", "Maybe", "", "not-an-email"], ["A-1", "", "", "", "", ""], ["", "No Flat", "", "", "", ""]])])));
    expect(r.ok).toBe(false); const m = r.problems.map((p) => p.message).join("\n");
    expect(m).toContain("not a whole number"); expect(m).toContain("Choose Yes or No"); expect(m).toContain("e-mail"); expect(m).toContain("already listed"); expect(m).toContain("Flat / House No is empty");
  });
  test("other files are refused in plain words", async () => {
    const wrong = parseRollTable(await readPdfTable(await excelLikePdf([sheet(good, "My own list")]))); expect(wrong.ok).toBe(false); expect(wrong.problems[0]!.message).toContain("not our roll sheet");
    expect(parseRollTable(await readPdfTable(te.encode("hello world, not a pdf at all"))).problems[0]!.message).toContain("not a PDF");
    expect(parseRollTable(await readPdfTable(new Uint8Array([1, 2, 3]))).ok).toBe(false);
    expect(parseRollTable(await readPdfTable(te.encode("%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n%%EOF  padding padding"))).ok).toBe(false);
    const noHead = await excelLikePdf([[[30, 30, ROLL_TEMPLATE_ID], [30, 60, "A-1"]]]); expect(parseRollTable(await readPdfTable(noHead)).problems[0]!.message).toContain("heading");
  });
  test("garbage never throws", async () => { for (let i = 0; i < 200; i++) { const b = new Uint8Array(300 + i); crypto.getRandomValues(b); b.set(te.encode("%PDF-1.4 1 0 obj stream\n"), 0); const r = await readPdfTable(b); expect(typeof r.ok).toBe("boolean"); } });
});
describe("diff", () => {
  test("added, removed, changed", () => {
    const d = diffRoll([{ flatNo: "a", weight: 1, eligible: true }, { flatNo: "b", weight: 1, eligible: true }, { flatNo: "c", weight: 1, eligible: true }], [{ flatNo: "a", weight: 1, eligible: true }, { flatNo: "b", weight: 2, eligible: true }, { flatNo: "d", weight: 1, eligible: true }]);
    expect(d).toEqual({ added: ["d"], removed: ["c"], changed: [{ flatNo: "b", before: { weight: 1, eligible: true }, after: { weight: 2, eligible: true } }], same: 1 });
  });
});

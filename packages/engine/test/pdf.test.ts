import { describe, expect, test } from "bun:test";
import { buildReportModel, extractData, extractSeal } from "../src/model";
import { renderReportHtml, sealReport } from "../src/render";
import { pdfSha256, renderReportPdf } from "../src/pdf";
import { priceFor, formatPrice } from "../src/pricing";
import { scanPublic } from "../src/masking";
import { Scenario, testKey, PRIVATE_STRINGS } from "./helpers";

async function sealed() {
  const s = await Scenario.fullMeeting(true); const k = await testKey(); const model = buildReportModel(await s.state());
  const { html } = await sealReport(renderReportHtml(model, s.entries, k.publicKeyRaw, k.kid), model, k.privateKeyPkcs8, k.kid);
  return { s, html, data: extractData(html)!, seal: extractSeal(html)! };
}
const raw = (b: Uint8Array) => new TextDecoder("latin1").decode(b);
/** Only the printed words: the strings inside "( ... ) Tj", unescaped. (Drawing coordinates are not text and must not be scanned.) */
const unescapePdf = (s: string) => s.replace(/\\([()\\])/g, "$1");
const text = (b: Uint8Array) => [...raw(b).matchAll(/\((.*)\) Tj ET/g)].map((m) => unescapePdf(m[1]!)).join("\n");

describe("pricing", () => {
  test("India: Rs 499 per meeting, Rs 1499 per election; everywhere else USD 5 and USD 15", () => {
    expect(priceFor("meeting", "IN")).toEqual({ amountMinor: 49900, currency: "INR" }); expect(priceFor("election", "in")).toEqual({ amountMinor: 149900, currency: "INR" });
    expect(priceFor("meeting", "US")).toEqual({ amountMinor: 500, currency: "USD" }); expect(priceFor("election", "GB")).toEqual({ amountMinor: 1500, currency: "USD" });
    expect([formatPrice(priceFor("meeting", "IN")), formatPrice(priceFor("election", "IN")), formatPrice(priceFor("meeting", "AE")), formatPrice(priceFor("election", "AE"))]).toEqual(["Rs 499", "Rs 1499", "USD 5", "USD 15"]);
  });
});

describe("PDF of the sealed report (for the Returning Officer to sign)", () => {
  test("a well-formed PDF: header, trailer, a cross-reference table whose offsets really point at the objects, page count right", async () => {
    const { data, seal } = await sealed(); const b = await renderReportPdf(data, seal, { reportUrl: "https://example.test/r/abc" }); const t = raw(b);
    expect(t.startsWith("%PDF-1.4")).toBe(true); expect(t.trimEnd().endsWith("%%EOF")).toBe(true);
    const xref = parseInt(/startxref\n(\d+)/.exec(t)![1]!, 10); expect(t.slice(xref, xref + 4)).toBe("xref");
    const n = parseInt(/xref\n0 (\d+)/.exec(t)![1]!, 10);
    const offs = [...t.slice(xref).matchAll(/(\d{10}) 00000 n /g)].map((m) => parseInt(m[1]!, 10)); expect(offs.length).toBe(n - 1);
    offs.forEach((o, i) => expect(t.slice(o, o + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`));
    const pages = (t.match(/\/Type \/Page /g) ?? []).length; expect(pages).toBe(parseInt(/\/Count (\d+)/.exec(t)![1]!, 10)); expect(pages).toBeGreaterThanOrEqual(3);
  });
  test("contains what an officer needs: ids, schedule, results, checks, fingerprints, signature blocks, the whole log", async () => {
    const { s, data, seal } = await sealed(); const t = text(await renderReportPdf(data, seal, { reportUrl: "https://example.test/r/abc" }));
    for (const needle of ["Green Park Apartments", "REG/2020/118", data.model.eid, "pt_1", "Returning Officer / Presiding Officer - signature", "Chairperson - signature", "Secretary - signature", "Checked against the rules", "Appendix A. Complete log", seal.fileSha256, data.model.head!.hash, "Ticked (yes)", "https://example.test/r/abc", "Appendix B"]) expect(t).toContain(needle);
    for (const e of data.log.slice(0, 3)) expect(t).toContain(e.hash.slice(0, 20));
    expect(t).toContain(String(s.entries.length));
  });
  test("deterministic (same bytes twice), a stable fingerprint, and no private data in it", async () => {
    const { data, seal } = await sealed(); const a = await renderReportPdf(data, seal), b = await renderReportPdf(data, seal);
    expect(await pdfSha256(a)).toBe(await pdfSha256(b)); expect(a.length).toBe(b.length);
    expect(scanPublic(text(a), { allow: ["REG/2020/118"], forbidden: PRIVATE_STRINGS })).toEqual([]);
  });
  test("non-Latin text does not break the file (printed as ?)", async () => {
    const { data, seal } = await sealed(); data.model.title = "वार्षिक आम बैठक (AGM)";
    const t = text(await renderReportPdf(data, seal)); expect(t).toContain("(AGM)"); expect(raw(await renderReportPdf(data, seal)).startsWith("%PDF")).toBe(true);
  });
});

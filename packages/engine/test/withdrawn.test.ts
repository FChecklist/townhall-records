// Agenda point taken off AFTER the notice went out: it is never deleted. It becomes "Withdrawn" (reason + time), stays out of voting, and stays visible in the replayed state,
// the report model, the sealed report HTML, the PDF and the chronology. A point DELETED after the notice is flagged by the replay (so the verifier shows it).
import { describe, expect, test } from "bun:test";
import { buildReportModel, extractData, extractSeal, verifyReportHtml } from "../src/model";
import { renderReportHtml, sealReport } from "../src/render";
import { renderReportPdf } from "../src/pdf";
import { canDo } from "../src/machine";
import { Scenario, ORG, testKey } from "./helpers";

const raw = (b: Uint8Array) => new TextDecoder("latin1").decode(b);
const pdfText = (b: Uint8Array) => [...raw(b).matchAll(/\((.*)\) Tj ET/g)].map((m) => m[1]!.replace(/\\([()\\])/g, "$1")).join("\n");

/** Two points, notice published; point 2 is then withdrawn with a reason. */
async function withdrawn(reason = "The committee dropped this item") {
  const s = await Scenario.create(); await s.addPoint("pt_1", "1", { title: "Approve the accounts" }); await s.addPoint("pt_2", "2", { title: "Repaint the clubhouse" });
  await s.pay(); await s.publish();
  const e = await s.add("point_withdrawn", s.org, { pointId: "pt_2", number: "2", title: "Repaint the clubhouse", reason });
  return { s, at: e.entry.ts };
}

describe("point_withdrawn", () => {
  test("the point leaves voting but is kept with its reason and time; no replay problem", async () => {
    const { s, at } = await withdrawn(); const st = await s.state();
    expect(st.problems).toEqual([]);
    expect(st.points.has("pt_2")).toBe(false); expect(st.pointOrder).toEqual(["pt_1"]);
    expect(st.withdrawn).toEqual([{ seq: expect.any(Number), ts: at, pointId: "pt_2", number: "2", title: "Repaint the clubhouse", reason: "The committee dropped this item", by: ORG.pid }]);
    const m = buildReportModel(st);
    expect(m.points.map((p) => p.number)).toEqual(["1"]);
    expect(m.withdrawn).toEqual([{ seq: expect.any(Number), ts: at, number: "2", title: "Repaint the clubhouse", reason: "The committee dropped this item", byName: "Raj****** Aga******" }]);
    expect(m.chronology.some((c) => /Withdrew agenda point 2 after the notice went out.*The committee dropped this item/.test(c.what))).toBe(true);
    expect(m.accountability.some((a) => /Withdrew agenda point 2/.test(a.what))).toBe(true);
  });
  test("a withdrawn point can never be opened for voting", async () => {
    const { s } = await withdrawn(); await s.start(); const st = await s.state();
    const d = canDo(st, ORG.pid, "open_point", { pointId: "pt_2" });
    expect(d.ok).toBe(false); if (!d.ok) expect(d.code).toBe("unknown_point");
  });
  test("the sealed report HTML and the PDF show it as Withdrawn with the reason and the time, and the report still verifies", async () => {
    const { s, at } = await withdrawn("Dealt with at the last meeting"); const k = await testKey(); const model = buildReportModel(await s.state());
    const { html } = await sealReport(renderReportHtml(model, s.entries, k.publicKeyRaw, k.kid), model, k.privateKeyPkcs8, k.kid);
    expect(html).toContain("Withdrawn agenda points"); expect(html).toContain("Repaint the clubhouse"); expect(html).toContain("Dealt with at the last meeting"); expect(html).toContain("<b>Withdrawn</b>");
    expect(html).toContain(new Date(at).toISOString().replace("T", " ").slice(0, 16) + " UTC");
    const v = await verifyReportHtml(html); expect(v.problems).toEqual([]); expect(v.ok).toBe(true);
    const pdf = await renderReportPdf(extractData(html)!, extractSeal(html)!, { reportUrl: "https://example.test/r/abc" });
    const text = pdfText(pdf); expect(text).toContain("Withdrawn after the notice went out"); expect(text).toContain("Repaint the clubhouse"); expect(text).toContain("WITHDRAWN"); expect(text).toContain("Dealt with at the last meeting");
  });
  test("a report that hides the withdrawn point no longer matches the log (the verifier catches it)", async () => {
    const { s } = await withdrawn(); const k = await testKey(); const st = await s.state(); const model = buildReportModel(st);
    const html0 = renderReportHtml({ ...model, withdrawn: [] }, s.entries, k.publicKeyRaw, k.kid);
    const { html } = await sealReport(html0, { ...model, withdrawn: [] }, k.privateKeyPkcs8, k.kid);
    const v = await verifyReportHtml(html); expect(v.ok).toBe(false); expect(v.problems.join(" ")).toContain("displayed figures do not match the log");
  });
  test("flagged: withdrawn without a reason, withdrawn after the point opened, withdrawn twice (unknown the second time)", async () => {
    const a = await Scenario.create(); await a.addPoint("pt_1", "1"); await a.pay(); await a.publish();
    await a.add("point_withdrawn", a.org, { pointId: "pt_1", number: "1", title: "x", reason: " " });
    expect((await a.state()).problems.join(" ")).toContain("withdrawn without a reason");
    await a.add("point_withdrawn", a.org, { pointId: "pt_1", number: "1", title: "x", reason: "again" });
    expect((await a.state()).problems.join(" ")).toContain("withdrew an unknown agenda point");
    const b = await Scenario.create(); await b.addPoint("pt_1", "1"); await b.pay(); await b.publish(); await b.start();
    for (let i = 0; i < 4; i++) await b.attend(`A-${101 + i}`);
    await b.open("pt_1"); await b.add("point_withdrawn", b.org, { pointId: "pt_1", number: "1", title: "x", reason: "too late" });
    expect((await b.state()).problems.join(" ")).toContain("withdrawn after it opened");
  });
});

describe("point_removed (a plain delete)", () => {
  test("fine before the notice; FLAGGED after it (must be withdrawn)", async () => {
    const a = await Scenario.create(); await a.addPoint("pt_1", "1"); await a.addPoint("pt_2", "2");
    await a.add("point_removed", a.org, { pointId: "pt_2", number: "2", reason: "typo" });
    expect((await a.state()).problems).toEqual([]); expect((await a.state()).withdrawn).toEqual([]);
    await a.pay(); await a.publish();
    await a.add("point_removed", a.org, { pointId: "pt_1", number: "1", reason: "sneaky" });
    expect((await a.state()).problems.join(" ")).toContain("deleted after the notice went out");
  });
});

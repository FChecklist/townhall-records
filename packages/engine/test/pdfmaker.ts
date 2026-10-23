// Test helper: builds a PDF the way Excel / LibreOffice do (flipped page transform, one text object per cell, compressed content, Identity-H font with ToUnicode).
import { ROLL_HEADERS, ROLL_TEMPLATE_ID } from "../src";

const te = new TextEncoder();
async function deflate(s: string): Promise<Uint8Array> { const cs = new CompressionStream("deflate"); const w = cs.writable.getWriter(); void w.write(te.encode(s)); void w.close(); return new Uint8Array(await new Response(cs.readable).arrayBuffer()); }
export type Cell = [number, number, string]; // x, y (from the top), text
/** Builds a PDF the way Excel does: flipped page transform, one text object per cell, compressed content, Identity-H font with a ToUnicode map. */
export async function excelLikePdf(pages: Cell[][], opt: { identity?: boolean; compress?: boolean } = {}): Promise<Uint8Array> {
  const identity = opt.identity !== false, compress = opt.compress !== false;
  const chars = [...new Set(pages.flat().flatMap((c) => [...c[2]]))]; const gid = new Map(chars.map((c, i) => [c, i + 1]));
  const hex4 = (n: number) => n.toString(16).padStart(4, "0");
  const cmap = `/CIDInit /ProcSet findresource begin 12 dict begin begincmap /CMapName /Adobe-Identity-UCS def 1 begincodespacerange <0000> <FFFF> endcodespacerange ${chars.length} beginbfchar ${chars.map((c) => `<${hex4(gid.get(c)!)}> <${hex4(c.charCodeAt(0))}>`).join(" ")} endbfchar endcmap end end`;
  const objs: Array<{ dict: string; stream?: Uint8Array }> = []; const add = (dict: string, stream?: Uint8Array) => (objs.push({ dict, stream }), objs.length);
  add("<< /Type /Catalog /Pages 2 0 R >>"); add("PLACEHOLDER");
  add(identity ? "<< /Type /Font /Subtype /Type0 /BaseFont /ABCDEF+Calibri /Encoding /Identity-H /ToUnicode 4 0 R >>" : "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  add("<< >>", te.encode(cmap));
  const kids: number[] = [];
  for (const cells of pages) {
    const body = ["q 0.75 0 0 -0.75 0 595 cm"].concat(cells.map(([x, y, t]) => `BT /F1 14 Tf 1 0 0 1 ${x} ${y} Tm ${identity ? `<${[...t].map((c) => hex4(gid.get(c)!)).join("")}>` : `(${t.replace(/[()\\]/g, "\\$&")})`} Tj ET`)).concat(["Q"]).join("\n");
    const data = compress ? await deflate(body) : te.encode(body);
    const cid = add(`<< ${compress ? "/Filter /FlateDecode " : ""}/Length ${data.length} >>`, data);
    kids.push(add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 3 0 R >> >> /Contents ${cid} 0 R >>`));
  }
  objs[1]!.dict = `<< /Type /Pages /Kids [${kids.map((k) => k + " 0 R").join(" ")}] /Count ${kids.length} >>`;
  const parts: Uint8Array[] = [te.encode("%PDF-1.4\n")];
  objs.forEach((o, i) => { parts.push(te.encode(`${i + 1} 0 obj\n${o.dict}\n`)); if (o.stream) parts.push(te.encode("stream\n"), o.stream, te.encode("\nendstream\n")); parts.push(te.encode("endobj\n")); });
  parts.push(te.encode("trailer << /Root 1 0 R >>\n%%EOF")); const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out;
}
export const COLX = [30, 150, 420, 520, 640, 760];
export const sheet = (rows: string[][], title = ROLL_TEMPLATE_ID + " | List of flats"): Cell[] => {
  const out: Cell[] = [[30, 30, title], [30, 70, "HOW TO FILL: type one flat per row"]]; ROLL_HEADERS.forEach((h, i) => out.push([COLX[i]!, 120, h]));
  rows.forEach((r, ri) => r.forEach((t, i) => { if (t) out.push([COLX[i]!, 150 + ri * 20, t]); })); return out;
};

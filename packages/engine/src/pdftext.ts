// A small, dependency-free reader that pulls the TEXT and its POSITIONS out of a PDF (the kind Excel / LibreOffice / Google Sheets produce with "Save as PDF"),
// and rebuilds the table rows from them. It never throws: on anything it cannot read it returns { ok: false, reason } in plain words.
// Handles: Flate-compressed streams, object streams (PDF 1.5), fonts with a ToUnicode map (Identity-H), plain Latin text, TJ arrays, text and page transforms.
// Does NOT handle: scanned pages (pictures of text), encrypted files, text drawn as outlines. Those are reported, never guessed at.

export interface Fragment { page: number; x: number; y: number; size: number; text: string }
export interface PdfTable { ok: true; pages: number; rows: Array<Array<{ x: number; text: string }>> }
export type PdfRead = PdfTable | { ok: false; reason: string };

const lat = (b: Uint8Array) => { let s = ""; for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode(...b.subarray(i, i + 8192)); return s; };
async function inflate(b: Uint8Array): Promise<Uint8Array | null> {
  try { const ds = new DecompressionStream("deflate"); const w = ds.writable.getWriter(); void w.write(b as any).catch(() => {}); void w.close().catch(() => {}); return new Uint8Array(await new Response(ds.readable).arrayBuffer()); } catch { return null; }
}
interface Obj { dict: string; stream: Uint8Array | null }

async function readObjects(file: Uint8Array): Promise<Map<number, Obj>> {
  const s = lat(file), objs = new Map<number, Obj>(); const re = /(\d+)\s+(\d+)\s+obj\b/g; let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const num = +m[1]!, start = re.lastIndex; const endObj = s.indexOf("endobj", start); if (endObj < 0) break;
    const body = s.slice(start, endObj); const si = body.search(/stream\r?\n|stream\r/);
    if (si < 0) { objs.set(num, { dict: body, stream: null }); continue; }
    const dict = body.slice(0, si); let from = start + si + 6; if (s[from] === "\r") from++; if (s[from] === "\n") from++;
    let to = s.lastIndexOf("endstream", endObj); if (to < from) to = endObj; while (to > from && (s[to - 1] === "\n" || s[to - 1] === "\r")) to--;
    let data: Uint8Array | null = file.subarray(from, to);
    if (/\/FlateDecode|\/Fl\b/.test(dict)) data = await inflate(data);
    objs.set(num, { dict, stream: data });
    re.lastIndex = endObj;
  }
  for (const [, o] of [...objs]) { // object streams
    if (!/\/Type\s*\/ObjStm/.test(o.dict) || !o.stream) continue;
    const n = +(/\/N\s+(\d+)/.exec(o.dict)?.[1] ?? 0), first = +(/\/First\s+(\d+)/.exec(o.dict)?.[1] ?? 0); const t = lat(o.stream);
    const head = t.slice(0, first).trim().split(/\s+/).map(Number);
    for (let i = 0; i < n; i++) { const num = head[i * 2]!, off = head[i * 2 + 1]!; const end = i + 1 < n ? head[(i + 1) * 2 + 1]! : t.length - first; if (!Number.isNaN(num) && !objs.has(num)) objs.set(num, { dict: t.slice(first + off, first + end), stream: null }); }
  }
  return objs;
}

function parseCMap(text: string): { two: boolean; map: Map<number, string> } {
  const map = new Map<number, string>(); let two = false;
  const hex = (h: string) => { let o = ""; for (let i = 0; i + 3 < h.length + 1; i += 4) { const cp = parseInt(h.slice(i, i + 4), 16); if (!Number.isNaN(cp)) o += String.fromCharCode(cp); } return o; };
  for (const blk of text.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) for (const p of blk[1]!.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) { if (p[1]!.length >= 4) two = true; map.set(parseInt(p[1]!, 16), hex(p[2]!)); }
  for (const blk of text.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const p of blk[1]!.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(<([0-9A-Fa-f]+)>|\[([^\]]*)\])/g)) {
      if (p[1]!.length >= 4) two = true; const lo = parseInt(p[1]!, 16), hi = parseInt(p[2]!, 16);
      if (p[4]) { const base = hex(p[4]!); for (let c = lo; c <= hi && c - lo < 70000; c++) map.set(c, base.length ? String.fromCharCode(base.charCodeAt(0) + (c - lo)) + base.slice(1) : ""); }
      else if (p[5]) { let c = lo; for (const q of p[5]!.matchAll(/<([0-9A-Fa-f]+)>/g)) map.set(c++, hex(q[1]!)); }
    }
  }
  if (/begincodespacerange\s*<[0-9A-Fa-f]{4}>/.test(text)) two = true;
  return { two, map };
}

type Mat = [number, number, number, number, number, number];
const mul = (a: Mat, b: Mat): Mat => [a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3], a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3], a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5]];

function tokens(src: string): Array<string | { s: Uint8Array } | { arr: any[] }> {
  const out: any[] = []; let i = 0; const n = src.length; const stack: any[][] = [];
  const push = (t: any) => (stack.length ? stack[stack.length - 1]!.push(t) : out.push(t));
  while (i < n) {
    const ch = src[i]!;
    if (/\s/.test(ch)) { i++; continue; }
    if (ch === "%") { while (i < n && src[i] !== "\n" && src[i] !== "\r") i++; continue; }
    if (ch === "(") {
      let depth = 1; i++; const bytes: number[] = [];
      while (i < n && depth) {
        const c = src[i]!;
        if (c === "\\") { const d = src[i + 1]!; i += 2; if (d === "n") bytes.push(10); else if (d === "r") bytes.push(13); else if (d === "t") bytes.push(9); else if (d === "b") bytes.push(8); else if (d === "f") bytes.push(12); else if (/[0-7]/.test(d)) { let o = d; while (o.length < 3 && /[0-7]/.test(src[i] ?? "")) o += src[i++]; bytes.push(parseInt(o, 8) & 255); } else if (d === "\n" || d === "\r") { if (d === "\r" && src[i] === "\n") i++; } else bytes.push(d.charCodeAt(0) & 255); continue; }
        if (c === "(") depth++; else if (c === ")") { depth--; if (!depth) { i++; break; } }
        bytes.push(c.charCodeAt(0) & 255); i++;
      }
      push({ s: new Uint8Array(bytes) }); continue;
    }
    if (ch === "<" && src[i + 1] !== "<") { const e = src.indexOf(">", i); let h = src.slice(i + 1, e < 0 ? n : e).replace(/\s+/g, ""); if (h.length % 2) h += "0"; const b = new Uint8Array(h.length / 2); for (let k = 0; k < b.length; k++) b[k] = parseInt(h.slice(k * 2, k * 2 + 2), 16) || 0; push({ s: b }); i = e < 0 ? n : e + 1; continue; }
    if (ch === "<" || ch === ">") { i += 2; continue; }
    if (ch === "[") { stack.push([]); i++; continue; }
    if (ch === "]") { const a = stack.pop() ?? []; push({ arr: a }); i++; continue; }
    let j = i + 1; while (j < n && !/[\s()<>\[\]\/%]/.test(src[j]!)) j++;
    push(src.slice(i, j)); i = j;
  }
  return out;
}

function decodeShown(b: Uint8Array, font: { two: boolean; map: Map<number, string> } | null): string {
  if (!font || !font.map.size) { let o = ""; for (const x of b) o += x >= 32 ? String.fromCharCode(x) : ""; return o; }
  let o = ""; if (font.two) { for (let i = 0; i + 1 < b.length; i += 2) o += font.map.get((b[i]! << 8) | b[i + 1]!) ?? ""; } else for (const x of b) o += font.map.get(x) ?? String.fromCharCode(x);
  return o;
}

async function pageFragments(content: string, fonts: Map<string, { two: boolean; map: Map<number, string> }>, page: number): Promise<Fragment[]> {
  const toks = tokens(content); const out: Fragment[] = [];
  let ctm: Mat = [1, 0, 0, 1, 0, 0]; const cstack: Mat[] = []; let tm: Mat = [1, 0, 0, 1, 0, 0], tlm: Mat = [1, 0, 0, 1, 0, 0]; let font: any = null, size = 10, leading = 0;
  const args: any[] = []; const num = (v: any) => (typeof v === "string" ? parseFloat(v) : 0);
  const show = (b: Uint8Array) => { const text = decodeShown(b, font); if (!text) return; const m = mul(tm, ctm); out.push({ page, x: m[4], y: m[5], size: Math.abs(size * (m[3] || m[0] || 1)) || size, text }); const adv = text.length * size * 0.5; tm = mul([1, 0, 0, 1, adv, 0], tm); };
  for (const t of toks) {
    if (typeof t !== "string" || /^[-+.\d]/.test(t) || t.startsWith("/")) { args.push(t); continue; }
    const a = args.splice(0); const nums = a.map(num);
    switch (t) {
      case "q": cstack.push([...ctm] as Mat); break;
      case "Q": ctm = cstack.pop() ?? ctm; break;
      case "cm": if (nums.length >= 6) ctm = mul(nums.slice(-6) as Mat, ctm); break;
      case "BT": tm = [1, 0, 0, 1, 0, 0]; tlm = [1, 0, 0, 1, 0, 0]; break;
      case "Tf": font = fonts.get(String(a[0]).slice(1)) ?? null; size = nums[1] || size; break;
      case "TL": leading = nums[0] ?? 0; break;
      case "Tm": if (nums.length >= 6) { tm = nums.slice(-6) as Mat; tlm = [...tm] as Mat; } break;
      case "Td": tlm = mul([1, 0, 0, 1, nums[0] ?? 0, nums[1] ?? 0], tlm); tm = [...tlm] as Mat; break;
      case "TD": leading = -(nums[1] ?? 0); tlm = mul([1, 0, 0, 1, nums[0] ?? 0, nums[1] ?? 0], tlm); tm = [...tlm] as Mat; break;
      case "T*": tlm = mul([1, 0, 0, 1, 0, -leading], tlm); tm = [...tlm] as Mat; break;
      case "Tj": if (a[0]?.s) show(a[0].s); break;
      case "'": tlm = mul([1, 0, 0, 1, 0, -leading], tlm); tm = [...tlm] as Mat; if (a[0]?.s) show(a[0].s); break;
      case '"': tlm = mul([1, 0, 0, 1, 0, -leading], tlm); tm = [...tlm] as Mat; if (a[2]?.s) show(a[2].s); break;
      case "TJ": { // one array = one run of text: join its pieces (a big negative gap is a space) so a word is never split
        let run = ""; const m0 = mul(tm, ctm); let w = 0;
        for (const e of a[0]?.arr ?? []) { if (e?.s) { const t = decodeShown(e.s, font); run += t; w += t.length * size * 0.5; } else if (typeof e === "string") { const k = parseFloat(e); if (k < -300) { run += " "; w += (-k / 1000) * size; } } }
        if (run) { out.push({ page, x: m0[4], y: m0[5], size: Math.abs(size * (m0[3] || m0[0] || 1)) || size, text: run }); tm = mul([1, 0, 0, 1, w, 0], tm); }
        break;
      }
      default: break;
    }
  }
  return out;
}

export async function readPdfTable(file: Uint8Array): Promise<PdfRead> {
  try {
    if (file.length < 20 || lat(file.subarray(0, 8)).indexOf("%PDF-") < 0) return { ok: false, reason: "This file is not a PDF. Save the sheet as PDF and upload that." };
    const head = lat(file);
    if (/\/Encrypt\b/.test(head)) return { ok: false, reason: "This PDF is password protected. Save it again without a password." };
    const objs = await readObjects(file);
    const fontMaps = new Map<number, { two: boolean; map: Map<number, string> }>();
    for (const [num, o] of objs) {
      if (!/\/Type\s*\/Font\b|\/Subtype\s*\/(TrueType|Type0|Type1|Type3)/.test(o.dict)) continue;
      const tu = /\/ToUnicode\s+(\d+)\s+\d+\s+R/.exec(o.dict); const cm = tu ? objs.get(+tu[1]!) : null;
      if (cm?.stream) fontMaps.set(num, parseCMap(lat(cm.stream)));
    }
    const pages: Array<{ dict: string }> = [];
    const pageObjs = [...objs.entries()].filter(([, o]) => /\/Type\s*\/Page\b(?!s)/.test(o.dict)).sort((a, b) => a[0] - b[0]);
    // keep the document's own order when a page tree is present
    const kids = (() => { const root = [...objs.values()].find((o) => /\/Type\s*\/Pages\b/.test(o.dict) && !/\/Parent\b/.test(o.dict)); const order: number[] = []; const walk = (d: string, depth = 0) => { if (depth > 8) return; const k = /\/Kids\s*\[([^\]]*)\]/.exec(d)?.[1]; if (!k) return; for (const r of k.matchAll(/(\d+)\s+\d+\s+R/g)) { const id = +r[1]!, o = objs.get(id); if (!o) continue; if (/\/Type\s*\/Pages\b/.test(o.dict)) walk(o.dict, depth + 1); else order.push(id); } }; if (root) walk(root.dict); return order; })();
    const ordered = kids.length ? kids.map((id) => [id, objs.get(id)!] as const) : pageObjs;
    const frags: Fragment[] = []; let pageNo = 0;
    for (const [, po] of ordered) {
      pageNo++; pages.push(po);
      const res = (() => { const direct = /\/Resources\s*<<([\s\S]*)>>/.exec(po.dict)?.[1]; const ref = /\/Resources\s+(\d+)\s+\d+\s+R/.exec(po.dict); return ref ? objs.get(+ref[1]!)?.dict ?? "" : direct ?? ""; })();
      const fontDict = (() => { const ref = /\/Font\s+(\d+)\s+\d+\s+R/.exec(res); if (ref) return objs.get(+ref[1]!)?.dict ?? ""; return /\/Font\s*<<([\s\S]*?)>>\s*(?:\/|>>|$)/.exec(res)?.[1] ?? /\/Font\s*<<([\s\S]*)>>/.exec(res)?.[1] ?? ""; })();
      const fonts = new Map<string, { two: boolean; map: Map<number, string> }>();
      for (const f of fontDict.matchAll(/\/([^\s/<>\[\]()]+)\s+(\d+)\s+\d+\s+R/g)) { const fm = fontMaps.get(+f[2]!); if (fm) fonts.set(f[1]!, fm); else { const o = objs.get(+f[2]!); const desc = o && /\/DescendantFonts\s*\[?\s*(\d+)/.exec(o.dict); void desc; } }
      const cref = /\/Contents\s*(\[[^\]]*\]|\d+\s+\d+\s+R)/.exec(po.dict)?.[1] ?? ""; let content = "";
      for (const r of cref.matchAll(/(\d+)\s+\d+\s+R/g)) { const st = objs.get(+r[1]!)?.stream; if (st) content += lat(st) + "\n"; }
      frags.push(...(await pageFragments(content, fonts, pageNo)));
    }
    if (!pageNo) return { ok: false, reason: "No pages could be read from this PDF." };
    if (!frags.length) return { ok: false, reason: "This PDF has no readable text. It may be a scan or a photo. Save the filled Excel sheet directly as PDF (File > Save As > PDF)." };
    // rows: same page, same line (y within half a letter height); then cells: pieces closer than a third of a letter belong to one cell
    const rows: PdfTable["rows"] = [];
    const byPage = new Map<number, Fragment[]>(); for (const f of frags) { (byPage.get(f.page) ?? byPage.set(f.page, []).get(f.page)!).push(f); }
    for (const p of [...byPage.keys()].sort((a, b) => a - b)) {
      const list = byPage.get(p)!.sort((a, b) => b.y - a.y || a.x - b.x); const lines: Fragment[][] = [];
      for (const f of list) { const l = lines[lines.length - 1]; if (l && Math.abs(l[0]!.y - f.y) <= Math.max(2, f.size * 0.5)) l.push(f); else lines.push([f]); }
      for (const l of lines) {
        l.sort((a, b) => a.x - b.x); const cells: Array<{ x: number; text: string; end: number }> = [];
        // only glued glyph pieces are joined; two cells are never merged (the width guess is rough)
        for (const f of l) { const c = cells[cells.length - 1]; const w = f.text.length * f.size * 0.5; if (c && Math.abs(f.x - c.end) <= f.size * 0.2 && (f.text.length <= 2 || c.text.length <= 2)) { c.text += f.text; c.end = f.x + w; } else cells.push({ x: f.x, text: f.text, end: f.x + w }); }
        rows.push(cells.map((c) => ({ x: c.x, text: c.text.replace(/\s+/g, " ").trim() })).filter((c) => c.text));
      }
    }
    return { ok: true, pages: pageNo, rows: rows.filter((r) => r.length) };
  } catch (e) { return { ok: false, reason: "This PDF could not be read. Save the sheet as PDF again from Excel and upload that." }; }
}

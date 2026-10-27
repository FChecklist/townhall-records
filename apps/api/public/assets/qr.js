// Townhall QR code encoder. Self-contained, no library, no network. Byte mode (UTF-8), error correction level M, versions 1 to 10 (up to 213 bytes).
// Algorithm follows ISO/IEC 18004 (Reed-Solomon over GF(256), eight masks, the four standard penalty rules).
// Exports: qrMatrix(text) -> boolean[][] (true = dark), qrSvgPath(text, border) -> {size, d}, qrSvg(text, px) -> <svg> element, drawQrInto(g, text, sizeUnits) for the printed ballot.
const ECC_PER_BLOCK = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26]; // level M, index = version
const BLOCKS = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5];
export const QR_MAX_BYTES = 213;

const bit = (x, i) => ((x >>> i) & 1) !== 0;
function rawModules(ver) {
  let r = (16 * ver + 128) * ver + 64;
  if (ver >= 2) { const n = Math.floor(ver / 7) + 2; r -= (25 * n - 10) * n - 55; if (ver >= 7) r -= 36; }
  return r;
}
const dataCodewords = (ver) => Math.floor(rawModules(ver) / 8) - ECC_PER_BLOCK[ver] * BLOCKS[ver];
function alignPositions(ver) {
  if (ver === 1) return [];
  const n = Math.floor(ver / 7) + 2, size = ver * 4 + 17;
  const step = Math.ceil((ver * 4 + 4) / (n * 2 - 2)) * 2;
  const res = [6]; for (let pos = size - 7; res.length < n; pos -= step) res.splice(1, 0, pos);
  return res;
}
function gfMul(x, y) { let z = 0; for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11d); z ^= ((y >>> i) & 1) * x; } return z; }
function rsDivisor(deg) {
  const r = new Array(deg - 1).fill(0); r.push(1); let root = 1;
  for (let i = 0; i < deg; i++) { for (let j = 0; j < r.length; j++) { r[j] = gfMul(r[j], root); if (j + 1 < r.length) r[j] ^= r[j + 1]; } root = gfMul(root, 2); }
  return r;
}
function rsRemainder(data, div) {
  const r = div.map(() => 0);
  for (const b of data) { const f = b ^ r.shift(); r.push(0); div.forEach((c, i) => { r[i] ^= gfMul(c, f); }); }
  return r;
}
function utf8(text) { return Array.from(new TextEncoder().encode(String(text))); }

function buildCodewords(bytes, ver) {
  const bits = [];
  const put = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
  put(4, 4); put(bytes.length, ver < 10 ? 8 : 16); for (const b of bytes) put(b, 8);
  const cap = dataCodewords(ver) * 8;
  put(0, Math.min(4, cap - bits.length)); while (bits.length % 8) bits.push(0);
  for (let pad = 0xec; bits.length < cap; pad ^= 0xec ^ 0x11) put(pad, 8);
  const data = []; for (let i = 0; i < bits.length; i += 8) { let v = 0; for (let k = 0; k < 8; k++) v = (v << 1) | bits[i + k]; data.push(v); }
  // split into blocks, add error correction, interleave
  const nb = BLOCKS[ver], eccLen = ECC_PER_BLOCK[ver], raw = Math.floor(rawModules(ver) / 8), nShort = nb - (raw % nb), shortLen = Math.floor(raw / nb);
  const div = rsDivisor(eccLen), blocks = []; let k = 0;
  for (let i = 0; i < nb; i++) {
    const dat = data.slice(k, k + shortLen - eccLen + (i < nShort ? 0 : 1)); k += dat.length;
    const ecc = rsRemainder(dat, div); if (i < nShort) dat.push(0); blocks.push(dat.concat(ecc));
  }
  const out = [];
  for (let i = 0; i < blocks[0].length; i++) blocks.forEach((b, j) => { if (i !== shortLen - eccLen || j >= nShort) out.push(b[i]); });
  return out;
}

function penalty(m, size) {
  let p = 0;
  const lines = [];
  for (let y = 0; y < size; y++) lines.push(m[y].map((v) => (v ? 1 : 0)).join(""));
  for (let x = 0; x < size; x++) { let s = ""; for (let y = 0; y < size; y++) s += m[y][x] ? 1 : 0; lines.push(s); }
  for (const s of lines) {
    const runs = s.match(/0+|1+/g) || []; for (const r of runs) if (r.length >= 5) p += 3 + (r.length - 5);
    for (const pat of ["00001011101", "10111010000"]) { let i = -1; while ((i = s.indexOf(pat, i + 1)) >= 0) p += 40; }
  }
  for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) { const c = m[y][x]; if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) p += 3; }
  let dark = 0; for (const row of m) for (const v of row) if (v) dark++;
  p += Math.floor(Math.abs((dark * 100) / (size * size) - 50) / 5) * 10;
  return p;
}
const MASKS = [
  (x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x, y) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

/** The QR code as a square matrix of booleans (true = dark module). Throws if the text is longer than 213 bytes. */
export function qrMatrix(text) {
  const bytes = utf8(text);
  let ver = 1; while (ver <= 10) { const need = 4 + (ver < 10 ? 8 : 16) + bytes.length * 8; if (need <= dataCodewords(ver) * 8) break; ver++; }
  if (ver > 10) throw new Error("qr_too_long");
  const size = ver * 4 + 17;
  const m = Array.from({ length: size }, () => new Array(size).fill(false));
  const fn = Array.from({ length: size }, () => new Array(size).fill(false));
  const setF = (x, y, v) => { m[y][x] = v; fn[y][x] = true; };
  for (let i = 0; i < size; i++) { setF(6, i, i % 2 === 0); setF(i, 6, i % 2 === 0); }
  const finder = (cx, cy) => { for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const d = Math.max(Math.abs(dx), Math.abs(dy)), x = cx + dx, y = cy + dy; if (x >= 0 && x < size && y >= 0 && y < size) setF(x, y, d !== 2 && d !== 4); } };
  finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
  const ap = alignPositions(ver), n = ap.length;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) setF(ap[i] + dx, ap[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }
  const formatBits = (mask) => {
    const data = (0 << 3) | mask; // level M = 00
    let rem = data; for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits = ((data << 10) | rem) ^ 0x5412;
    for (let i = 0; i <= 5; i++) setF(8, i, bit(bits, i));
    setF(8, 7, bit(bits, 6)); setF(8, 8, bit(bits, 7)); setF(7, 8, bit(bits, 8));
    for (let i = 9; i < 15; i++) setF(14 - i, 8, bit(bits, i));
    for (let i = 0; i < 8; i++) setF(size - 1 - i, 8, bit(bits, i));
    for (let i = 8; i < 15; i++) setF(8, size - 15 + i, bit(bits, i));
    setF(8, size - 8, true);
  };
  formatBits(0);
  if (ver >= 7) {
    let rem = ver; for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bits = (ver << 12) | rem;
    for (let i = 0; i < 18; i++) { const c = bit(bits, i), a = size - 11 + (i % 3), b = Math.floor(i / 3); setF(a, b, c); setF(b, a, c); }
  }
  // place the data zig-zag
  const cw = buildCodewords(bytes, ver); let idx = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
      const x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - vert : vert;
      if (!fn[y][x] && idx < cw.length * 8) { m[y][x] = bit(cw[idx >>> 3], 7 - (idx & 7)); idx++; }
    }
  }
  const applyMask = (k) => { for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && MASKS[k](x, y)) m[y][x] = !m[y][x]; };
  let best = 0, bestP = Infinity;
  for (let k = 0; k < 8; k++) { applyMask(k); formatBits(k); const p = penalty(m, size); if (p < bestP) { bestP = p; best = k; } applyMask(k); }
  applyMask(best); formatBits(best);
  return m;
}

/** One SVG path for all dark modules, with a quiet zone of `border` modules. Use viewBox "0 0 size size". */
export function qrSvgPath(text, border = 4) {
  const m = qrMatrix(text), n = m.length; let d = "";
  for (let y = 0; y < n; y++) { let x = 0; while (x < n) { if (!m[y][x]) { x++; continue; } let e = x; while (e < n && m[y][e]) e++; d += `M${x + border} ${y + border}h${e - x}v1h${x - e}z`; x = e; } }
  return { size: n + border * 2, d };
}
const NS = "http://www.w3.org/2000/svg";
/** A ready <svg> element, `px` pixels wide, black on white. */
export function qrSvg(text, px = 220, label = "QR code") {
  const { size, d } = qrSvgPath(text, 3);
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${size} ${size}`); svg.setAttribute("width", String(px)); svg.setAttribute("height", String(px)); svg.setAttribute("role", "img"); svg.setAttribute("aria-label", label); svg.setAttribute("shape-rendering", "crispEdges");
  const bg = document.createElementNS(NS, "rect"); bg.setAttribute("width", String(size)); bg.setAttribute("height", String(size)); bg.setAttribute("fill", "#fff");
  const p = document.createElementNS(NS, "path"); p.setAttribute("d", d); p.setAttribute("fill", "#000");
  svg.append(bg, p); return svg;
}
/** Draw the code into an existing SVG <g> (the printed ballot's <g id="qr">), filling a square of `sizeUnits` (millimetres) with a 1-module quiet zone. */
export function drawQrInto(g, text, sizeUnits) {
  const { size, d } = qrSvgPath(text, 1), s = sizeUnits / size;
  while (g.firstChild) g.removeChild(g.firstChild);
  const bg = document.createElementNS(NS, "rect"); bg.setAttribute("width", String(sizeUnits)); bg.setAttribute("height", String(sizeUnits)); bg.setAttribute("fill", "#fff");
  const p = document.createElementNS(NS, "path"); p.setAttribute("d", d); p.setAttribute("fill", "#000"); p.setAttribute("transform", `scale(${s})`);
  g.append(bg, p);
}

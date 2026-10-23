// Printed ballot papers. Each paper carries a unique QR code whose content is an opaque token (serial + keyed MAC): only this system can tell a real paper from a forged
// one, because the token means nothing without the server's secret and the serial pool. The voter ticks check boxes with a pen; the Attendance Officer photographs every
// returned paper; the system reads the QR and the ticked boxes (ticked = yes, empty = no) and counts them with the SAME rules as an online ballot.
//
// SECRECY: the serial is never stored next to the flat that received the paper, and the serial pool has no timestamp and no insertion order, so a counted paper
// cannot be traced back to a voter (the manual process: ballot papers are blank and indistinguishable; only the register shows who took one).
import { hmacHex, randomHex, timingSafeEqual } from "./crypto";
import type { BallotDesign } from "./ballot";
import type { PointDef } from "./tally";

export const newSerial = () => "bp_" + randomHex(6);
const SERIAL_RE = /^bp_[0-9a-f]{12}$/;

/** QR text: serial + "." + 16 hex of HMAC(pepper, event|point|serial). */
export async function paperToken(pepper: string, eventId: string, pointId: string, serial: string): Promise<string> {
  return `${serial}.${(await hmacHex(pepper, ["aoa-rwa/paper/v1", eventId, pointId, serial].join("|"))).slice(0, 16)}`;
}
export async function parsePaperToken(pepper: string, eventId: string, pointId: string, token: unknown): Promise<{ ok: true; serial: string } | { ok: false }> {
  if (typeof token !== "string") return { ok: false };
  const [serial, mac] = token.trim().split("."); if (!serial || !mac || !SERIAL_RE.test(serial) || !/^[0-9a-f]{16}$/.test(mac)) return { ok: false };
  const want = (await paperToken(pepper, eventId, pointId, serial)).split(".")[1]!;
  return timingSafeEqual(want, mac) ? { ok: true, serial } : { ok: false };
}

// ---- layout: millimetres on an A4 portrait page. The detector and the printed paper use the SAME numbers. ----
export interface Rect { x: number; y: number; w: number; h: number }
export interface PaperLayout {
  widthMm: number; heightMm: number; qr: Rect; fiducials: Rect[];
  title: { x: number; y: number; text: string }; instruction: { x: number; y: number; text: string };
  rows: Array<{ option: string; label: string; box: Rect; labelAt: { x: number; y: number } }>;
}
const A4 = { w: 210, h: 297 };
export function paperLayout(p: Pick<PointDef, "options" | "labels" | "maxChoices" | "minChoices">, design: BallotDesign, instruction: string, title: string): PaperLayout {
  const fid = (x: number, y: number): Rect => ({ x, y, w: 8, h: 8 });
  const opts = p.options.filter((o) => o !== "");
  const top = 78, bottomLimit = A4.h - 24, avail = bottomLimit - top;
  const rowH = Math.min(design.size === "large" ? 16 : 11, avail / Math.max(1, opts.length));
  const box = design.size === "large" ? 9 : 7;
  return {
    widthMm: A4.w, heightMm: A4.h, qr: { x: A4.w - 48, y: 18, w: 34, h: 34 },
    fiducials: [fid(8, 8), fid(A4.w - 16, 8), fid(8, A4.h - 16), fid(A4.w - 16, A4.h - 16)],
    title: { x: 16, y: 30, text: design.title || title }, instruction: { x: 16, y: 62, text: design.instruction ? design.instruction + " " + instruction : instruction },
    rows: opts.map((o, i) => ({ option: o, label: p.labels?.[o] ?? o, box: { x: 18, y: top + i * rowH, w: box, h: box }, labelAt: { x: 18 + box + 6, y: top + i * rowH + box - 1.5 } })),
  };
}
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/** Printable SVG of the paper. The QR matrix is drawn by the app into <g id="qr"> (a QR library); the token text is printed under it as a fallback for manual entry. */
export function renderPaperSvg(l: PaperLayout, token: string, design: BallotDesign, opts: { sample?: boolean } = {}): string {
  const rows = l.rows.map((r, i) => `<rect x="${r.box.x}" y="${r.box.y}" width="${r.box.w}" height="${r.box.h}" fill="none" stroke="#000" stroke-width="0.6"/><text x="${r.labelAt.x}" y="${r.labelAt.y}" font-size="6" font-family="Arial,Helvetica,sans-serif">${design.showNumbers ? i + 1 + ". " : ""}${esc(r.label)}</text>`).join("");
  const fids = l.fiducials.map((f) => `<rect x="${f.x}" y="${f.y}" width="${f.w}" height="${f.h}" fill="#000"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${l.widthMm} ${l.heightMm}" width="${l.widthMm}mm" height="${l.heightMm}mm" data-ballot-paper="1">${fids}<text x="${l.title.x}" y="${l.title.y}" font-size="9" font-weight="bold" font-family="Arial,Helvetica,sans-serif" fill="${esc(design.accent)}">${esc(l.title.text)}</text><text x="${l.instruction.x}" y="${l.instruction.y}" font-size="4.2" font-family="Arial,Helvetica,sans-serif">${esc(l.instruction.text)}</text><g id="qr" transform="translate(${l.qr.x},${l.qr.y})" data-size="${l.qr.w}" data-token="${esc(token)}"><rect width="${l.qr.w}" height="${l.qr.h}" fill="#fff" stroke="#000" stroke-width="0.4"/></g><text x="${l.qr.x}" y="${l.qr.y + l.qr.h + 5}" font-size="3.2" font-family="Courier,monospace">${esc(token)}</text>${opts.sample ? '<text x="40" y="150" font-size="30" fill="#ccc" transform="rotate(-30 105 150)">SAMPLE</text>' : ""}${rows}</svg>`;
}

// ---- reading the ticks from a photo that has already been straightened to the page (the app uses the four corner marks to do that) ----
export interface TickReading { option: string; darkness: number; state: "ticked" | "empty" | "uncertain" }
export interface DetectOptions { /** minimum share of dark pixels inside a ticked box */ tick?: number; /** at or below this the box counts as empty */ empty?: number }

/** Otsu threshold of an 8-bit grayscale image. */
export function otsu(gray: Uint8Array): number {
  const hist = new Array<number>(256).fill(0); for (const v of gray) hist[v]!++;
  const total = gray.length; let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i]!;
  let sumB = 0, wB = 0, best = 0, thr = 128;
  for (let t = 0; t < 256; t++) { wB += hist[t]!; if (!wB) continue; const wF = total - wB; if (!wF) break; sumB += t * hist[t]!; const mB = sumB / wB, mF = (sum - sumB) / wF, between = wB * wF * (mB - mF) ** 2; if (between > best) { best = between; thr = t; } }
  return thr;
}
/**
 * `gray` is the whole page, width x height pixels, rectified to the layout's aspect. For each option the interior of its box (inside the printed outline) is measured:
 * the share of dark pixels. A clear mark is ticked, a clean box empty, anything in between is `uncertain` and must be confirmed by a person on screen.
 */
export function detectTicks(gray: Uint8Array, width: number, height: number, l: PaperLayout, o: DetectOptions = {}): TickReading[] {
  const tickAt = o.tick ?? 0.14, emptyAt = o.empty ?? 0.05, thr = Math.min(190, Math.max(70, otsu(gray))), px = width / l.widthMm, py = height / l.heightMm;
  return l.rows.map((r) => {
    const inset = 1.1; // stay inside the printed outline
    const x0 = Math.round((r.box.x + inset) * px), x1 = Math.round((r.box.x + r.box.w - inset) * px), y0 = Math.round((r.box.y + inset) * py), y1 = Math.round((r.box.y + r.box.h - inset) * py);
    let dark = 0, n = 0; for (let y = Math.max(0, y0); y < Math.min(height, y1); y++) for (let x = Math.max(0, x0); x < Math.min(width, x1); x++) { n++; if (gray[y * width + x]! <= thr) dark++; }
    const darkness = n ? dark / n : 0;
    return { option: r.option, darkness: Math.round(darkness * 1000) / 1000, state: darkness >= tickAt ? "ticked" : darkness <= emptyAt ? "empty" : "uncertain" };
  });
}

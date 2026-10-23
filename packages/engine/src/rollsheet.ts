// Turns the table read from the uploaded PDF into the list of flats, with every problem named by ROW and in plain words. Nothing is guessed:
// a row with a problem is reported and the Organizer must fix the sheet (or use manual entry); the roll is only changed when there are zero problems and the Organizer confirms.
import { ROLL_HEADERS, ROLL_TEMPLATE_ID } from "./rolltemplate";
import type { PdfRead } from "./pdftext";

export interface SheetFlat { flatNo: string; weight: number; eligible: boolean; name: string; mobile: string; email: string; sheetRow: number }
export interface SheetProblem { row: number | null; message: string }
export interface SheetResult { ok: boolean; flats: SheetFlat[]; problems: SheetProblem[]; totalWeight: number; eligibleCount: number }

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const HEAD_KEYS = ["flat", "owner", "vote", "can vote", "mobile", "e mail"];

export function parseRollTable(r: PdfRead): SheetResult {
  const bad = (m: string): SheetResult => ({ ok: false, flats: [], problems: [{ row: null, message: m }], totalWeight: 0, eligibleCount: 0 });
  if (!r.ok) return bad(r.reason);
  const idRow = r.rows.findIndex((row) => row.some((c) => c.text.includes(ROLL_TEMPLATE_ID)));
  if (idRow < 0) return bad("This is not our roll sheet. Please click \"Download Excel sheet\" again, fill that sheet, and save it as PDF without changing the top line.");
  const hIdx = r.rows.findIndex((row, i) => i > idRow && row.filter((c) => HEAD_KEYS.some((k) => norm(c.text).startsWith(k))).length >= 3);
  if (hIdx < 0) return bad("The grey heading row is missing or changed. Please use the downloaded sheet and do not change the headings.");
  const header = r.rows[hIdx]!; const colOf = (key: string) => header.findIndex((c) => norm(c.text).startsWith(key));
  const cols = { flat: colOf("flat"), name: colOf("owner"), weight: colOf("vote"), elig: colOf("can vote"), mobile: colOf("mobile"), email: colOf("e mail") };
  if (cols.flat < 0 || cols.weight < 0 || cols.elig < 0) return bad("A heading is missing (Flat / House No, Vote weightage, Can vote?). Please use the downloaded sheet.");
  const xs = header.map((c) => c.x); const colAt = (x: number) => { let best = -1; for (let i = 0; i < xs.length; i++) if (xs[i]! <= x + 3) best = i; return best; };
  const problems: SheetProblem[] = [], flats: SheetFlat[] = []; const seen = new Map<string, number>(); let n = 0;
  for (let i = hIdx + 1; i < r.rows.length; i++) {
    const row = r.rows[i]!;
    if (row.filter((c) => HEAD_KEYS.some((k) => norm(c.text).startsWith(k))).length >= 3) continue; // heading repeated at the top of each page
    if (row.length === 1 && /^(page\s*)?\d+(\s*(of|\/)\s*\d+)?$/i.test(row[0]!.text)) continue; // page number
    const cell: string[] = ["", "", "", "", "", ""]; for (const c of row) { const k = colAt(c.x); if (k >= 0) cell[k] = (cell[k] ? cell[k] + " " : "") + c.text; }
    n++; const sheetRow = n; const pick = (k: number) => (k >= 0 ? cell[k]!.trim() : "");
    const flatNo = pick(cols.flat), name = pick(cols.name), w = pick(cols.weight), el = pick(cols.elig), mobile = pick(cols.mobile), email = pick(cols.email);
    if (!flatNo && !name && !w && !el && !mobile && !email) continue;
    const here = `Filled row ${sheetRow}${flatNo ? " (flat " + flatNo + ")" : ""}`; const p = (message: string) => problems.push({ row: sheetRow, message: `${here}: ${message}` });
    if (!flatNo) { p("the Flat / House No is empty."); continue; }
    if (flatNo.length > 24) p("the Flat / House No is too long (24 letters at most).");
    if (seen.has(flatNo.toLowerCase())) p(`this flat is already listed in row ${seen.get(flatNo.toLowerCase())}.`); else seen.set(flatNo.toLowerCase(), sheetRow);
    let weight = 1; if (w) { if (!/^\d{1,10}$/.test(w.replace(/[, ]/g, "")) || +w.replace(/[, ]/g, "") < 1) p(`vote weightage "${w}" is not a whole number of 1 or more.`); else weight = +w.replace(/[, ]/g, ""); }
    let eligible = true; if (el) { const e = el.toLowerCase(); if (["yes", "y", "true"].includes(e)) eligible = true; else if (["no", "n", "false"].includes(e)) eligible = false; else p(`"Can vote?" says "${el}". Choose Yes or No.`); }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) p(`the e-mail "${email}" does not look right.`);
    if (mobile && !/^[+\d][\d\s-]{6,17}$/.test(mobile)) p(`the mobile number "${mobile}" does not look right.`);
    if (name.length > 80) p("the name is too long.");
    flats.push({ flatNo, weight, eligible, name, mobile, email, sheetRow });
  }
  if (!flats.length && !problems.length) problems.push({ row: null, message: "No flats were found below the headings. Type at least one flat." });
  if (flats.length > 3000) problems.push({ row: null, message: "More than 3000 flats. Please split the society." });
  return { ok: problems.length === 0, flats, problems, totalWeight: flats.reduce((a, f) => a + (f.eligible ? f.weight : 0), 0), eligibleCount: flats.filter((f) => f.eligible).length };
}

export interface RollDiff { added: string[]; removed: string[]; changed: Array<{ flatNo: string; before: { weight: number; eligible: boolean }; after: { weight: number; eligible: boolean } }>; same: number }
export function diffRoll(before: Array<{ flatNo: string; weight: number; eligible: boolean }>, after: Array<{ flatNo: string; weight: number; eligible: boolean }>): RollDiff {
  const b = new Map(before.map((f) => [f.flatNo, f])), a = new Map(after.map((f) => [f.flatNo, f])); const d: RollDiff = { added: [], removed: [], changed: [], same: 0 };
  for (const [k, f] of a) { const o = b.get(k); if (!o) d.added.push(k); else if (o.weight !== f.weight || o.eligible !== f.eligible) d.changed.push({ flatNo: k, before: { weight: o.weight, eligible: o.eligible }, after: { weight: f.weight, eligible: f.eligible } }); else d.same++; }
  for (const k of b.keys()) if (!a.has(k)) d.removed.push(k);
  return d;
}
export const ROLL_SHEET_HEADERS = ROLL_HEADERS;

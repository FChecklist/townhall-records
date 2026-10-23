// The Excel template the Organizer downloads, fills in, saves as PDF and uploads. Built here as a real .xlsx (a zip of XML files, stored without compression)
// so the sheet opens in Excel / LibreOffice / Google Sheets with: a title that names the template, plain instructions, a dropdown for Yes/No, whole-number checks,
// grey header, and print settings (landscape, one page wide) so that "Save as PDF" gives a clean table the reader below can understand.
export const ROLL_TEMPLATE_ID = "TOWNHALL-ROLL-V1";
export const ROLL_HEADERS = ["Flat / House No", "Owner name", "Vote weightage", "Can vote? (Yes/No)", "Mobile (optional)", "E-mail (optional)"] as const;
export const ROLL_FIRST_ROW = 5; // rows 1-4 are title, instructions and the header

const te = new TextEncoder();
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
export function crc32(b: Uint8Array): number { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]!) & 255]! ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

/** A zip with every file stored (no compression): simple, valid, and readable by every spreadsheet program. */
export function zipStored(files: Array<{ name: string; data: Uint8Array }>): Uint8Array {
  const parts: Uint8Array[] = [], central: Uint8Array[] = []; let off = 0;
  const u16 = (v: number) => [v & 255, (v >> 8) & 255], u32 = (v: number) => [v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255];
  for (const f of files) {
    const name = te.encode(f.name), crc = crc32(f.data);
    const lh = new Uint8Array([...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(f.data.length), ...u32(f.data.length), ...u16(name.length), ...u16(0), ...name]);
    central.push(new Uint8Array([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(f.data.length), ...u32(f.data.length), ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(off), ...name]));
    parts.push(lh, f.data); off += lh.length + f.data.length;
  }
  const cdSize = central.reduce((a, c) => a + c.length, 0);
  const end = new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(cdSize), ...u32(off), ...u16(0)]);
  const all = [...parts, ...central, end]; const out = new Uint8Array(all.reduce((a, p) => a + p.length, 0)); let o = 0; for (const p of all) { out.set(p, o); o += p.length; } return out;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const col = (i: number) => String.fromCharCode(65 + i);
const cell = (r: number, c: number, text: string, style: number) => `<c r="${col(c)}${r}" t="inlineStr" s="${style}"><is><t xml:space="preserve">${esc(text)}</t></is></c>`;
const blank = (r: number, c: number, style: number) => `<c r="${col(c)}${r}" s="${style}"/>`;

/** `flats` = how many empty rows to give (1..3000). The Organizer types over them. */
export function buildRollTemplateXlsx(opts: { flats: number; societyName?: string; eventTitle?: string }): Uint8Array {
  const n = Math.max(1, Math.min(3000, Math.floor(opts.flats))); const last = ROLL_FIRST_ROW + n - 1;
  const title = `${ROLL_TEMPLATE_ID}  |  List of flats and vote weightage${opts.societyName ? "  |  " + opts.societyName : ""}${opts.eventTitle ? "  |  " + opts.eventTitle : ""}`;
  const how = "HOW TO FILL: 1) Type one flat per row, under the grey headings. 2) Do not change the headings or this title. 3) Vote weightage is a whole number (1 if every flat has one equal vote). 4) Can vote? choose Yes or No from the list. 5) File > Save As > PDF, then upload that PDF.";
  const rows: string[] = [];
  rows.push(`<row r="1" ht="22" customHeight="1">${cell(1, 0, title, 1)}</row>`);
  rows.push(`<row r="2" ht="48" customHeight="1">${cell(2, 0, how, 2)}</row>`);
  rows.push(`<row r="3" ht="6" customHeight="1"/>`);
  rows.push(`<row r="4" ht="30" customHeight="1">${ROLL_HEADERS.map((h, i) => cell(4, i, h, 3)).join("")}</row>`);
  for (let r = ROLL_FIRST_ROW; r <= last; r++) rows.push(`<row r="${r}" ht="20" customHeight="1">${ROLL_HEADERS.map((_, i) => blank(r, i, i === 2 ? 5 : 4)).join("")}</row>`);
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><sheetViews><sheetView workbookViewId="0"><pane ySplit="4" topLeftCell="A5" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="1" width="18" customWidth="1"/><col min="2" max="2" width="34" customWidth="1"/><col min="3" max="3" width="16" customWidth="1"/><col min="4" max="4" width="20" customWidth="1"/><col min="5" max="5" width="20" customWidth="1"/><col min="6" max="6" width="32" customWidth="1"/></cols><sheetData>${rows.join("")}</sheetData><mergeCells count="2"><mergeCell ref="A1:F1"/><mergeCell ref="A2:F2"/></mergeCells><dataValidations count="2"><dataValidation type="list" allowBlank="1" showErrorMessage="1" errorTitle="Yes or No" error="Please choose Yes or No." sqref="D${ROLL_FIRST_ROW}:D${last}"><formula1>"Yes,No"</formula1></dataValidation><dataValidation type="whole" operator="between" allowBlank="1" showErrorMessage="1" errorTitle="Whole number" error="Type a whole number, for example 1." sqref="C${ROLL_FIRST_ROW}:C${last}"><formula1>1</formula1><formula2>1000000000</formula2></dataValidation></dataValidations><pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/><pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="4"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="13"/><name val="Calibri"/></font><font><sz val="10"/><i/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFD9D9D9"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FF808080"/></left><right style="thin"><color rgb="FF808080"/></right><top style="thin"><color rgb="FF808080"/></top><bottom style="thin"><color rgb="FF808080"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="6"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf><xf numFmtId="0" fontId="3" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment wrapText="1" vertical="center"/></xf><xf numFmtId="49" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyNumberFormat="1" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="1" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyNumberFormat="1" applyAlignment="1"><alignment vertical="center"/></xf></cellXfs></styleSheet>`;
  const wb = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Roll" sheetId="1" r:id="rId1"/></sheets><definedNames><definedName name="_xlnm.Print_Titles" localSheetId="0">Roll!$4:$4</definedName></definedNames></workbook>`;
  const ct = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  const wbRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
  const f = (name: string, s: string) => ({ name, data: te.encode(s) });
  return zipStored([f("[Content_Types].xml", ct), f("_rels/.rels", rels), f("xl/workbook.xml", wb), f("xl/_rels/workbook.xml.rels", wbRels), f("xl/styles.xml", styles), f("xl/worksheets/sheet1.xml", sheet)]);
}

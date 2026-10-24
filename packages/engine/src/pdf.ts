// Printable PDF of the sealed report, for signature by the Returning Officer / Presiding Officer and submission.
// A deterministic function of the sealed report (same report in, same bytes out): plain A4 text pages with the standard PDF fonts, no external resources.
// Limit, stated: the standard fonts cover Latin text only. Characters outside Latin-1 (for example Devanagari) print as '?' in the PDF; the full text is always in the HTML report.
import { watermarkText } from "./lifecycle";
import { dayParts, milestoneLabel, MILESTONE_KEYS } from "./schedule";
import { sha256Hex, type Bytes } from "./crypto";
import type { EmbeddedData, Seal } from "./model";
import { FORMAT_LABEL } from "./ballot";
import { BRAND } from "./brand";

const W = 595, H = 842, M = 48, LEAD = 1.28;
type FontKey = "F1" | "F2" | "F3";
const CW: Record<FontKey, number> = { F1: 0.52, F2: 0.56, F3: 0.6 };

const latin = (s: string): string => Array.from(String(s ?? "")).map((ch) => {
  const c = ch.codePointAt(0)!;
  if (c === 0x2022 || c === 0xb7) return "|"; if (c === 0x2013 || c === 0x2014) return "-"; if (c === 0x2018 || c === 0x2019) return "'"; if (c === 0x201c || c === 0x201d) return '"'; if (c === 0x2026) return "..."; if (c === 0x2714) return "pass"; if (c === 0x2718) return "FAIL";
  if (c === 0x2611 || c === 0x2610) return c === 0x2611 ? "[x]" : "[ ]";
  return c < 32 || c > 255 ? (c === 10 ? " " : "?") : ch;
}).join("");
const esc = (s: string) => latin(s).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

class Doc {
  pages: string[][] = [[]]; y = H - M; constructor(private footer: string, private watermark: string = "") {}
  private get cur() { return this.pages[this.pages.length - 1]!; }
  private ensure(h: number) { if (this.y - h < M + 18) { this.pages.push([]); this.y = H - M; } }
  space(n = 6) { this.y -= n; }
  text(s: string, o: { size?: number; font?: FontKey; indent?: number; gap?: number } = {}) {
    const size = o.size ?? 10, font = o.font ?? "F1", indent = o.indent ?? 0, maxChars = Math.max(10, Math.floor((W - 2 * M - indent) / (size * CW[font])));
    const words = latin(s).split(/(\s+)/); const lines: string[] = []; let line = "";
    for (const w of words) {
      if ((line + w).length <= maxChars) { line += w; continue; }
      if (line.trim()) lines.push(line.trimEnd());
      let rest = w.trimStart(); while (rest.length > maxChars) { lines.push(rest.slice(0, maxChars)); rest = rest.slice(maxChars); } line = rest;
    }
    if (line.trim()) lines.push(line.trimEnd());
    if (!lines.length) lines.push("");
    for (const l of lines) { this.ensure(size * LEAD); this.y -= size * LEAD; this.cur.push(`BT /${font} ${size} Tf ${M + indent} ${this.y.toFixed(1)} Td (${esc(l)}) Tj ET`); }
    this.y -= o.gap ?? 2;
  }
  h(s: string, size = 13) { this.space(8); this.ensure(size * 3); this.text(s, { size, font: "F2", gap: 3 }); this.line(); }
  line() { this.ensure(6); this.cur.push(`0.6 w ${M} ${this.y.toFixed(1)} m ${W - M} ${this.y.toFixed(1)} l S`); this.y -= 5; }
  row(cols: string[], widths: number[], o: { font?: FontKey; size?: number } = {}) {
    const size = o.size ?? 9, font = o.font ?? "F1"; this.ensure(size * LEAD * 2);
    const wrapped = cols.map((c, i) => { const mc = Math.max(3, Math.floor(widths[i]! / (size * CW[font]))); const out: string[] = []; let rest = latin(c); while (rest.length > mc) { let cut = rest.lastIndexOf(" ", mc); if (cut < mc / 2) cut = mc; out.push(rest.slice(0, cut)); rest = rest.slice(cut).trimStart(); } out.push(rest); return out; });
    const n = Math.max(...wrapped.map((w) => w.length));
    for (let k = 0; k < n; k++) { this.ensure(size * LEAD); this.y -= size * LEAD; let x = M; wrapped.forEach((w, i) => { if (w[k]) this.cur.push(`BT /${font} ${size} Tf ${x} ${this.y.toFixed(1)} Td (${esc(w[k]!)}) Tj ET`); x += widths[i]!; }); }
    this.y -= 2;
  }
  box(h: number, label: string) { this.ensure(h + 14); this.cur.push(`0.6 w ${M} ${(this.y - h).toFixed(1)} ${W - 2 * M} ${h} re S`); this.cur.push(`BT /F1 8 Tf ${M + 4} ${(this.y - 10).toFixed(1)} Td (${esc(label)}) Tj ET`); this.y -= h + 6; }
  sig(label: string) {
    this.ensure(64); this.space(26); this.cur.push(`0.6 w ${M} ${this.y.toFixed(1)} m ${M + 230} ${this.y.toFixed(1)} l S`); this.cur.push(`0.6 w ${M + 270} ${this.y.toFixed(1)} m ${W - M} ${this.y.toFixed(1)} l S`);
    this.y -= 11; this.cur.push(`BT /F2 9 Tf ${M} ${this.y.toFixed(1)} Td (${esc(label)} - signature) Tj ET`); this.cur.push(`BT /F1 9 Tf ${M + 270} ${this.y.toFixed(1)} Td (Name, date and place) Tj ET`); this.y -= 4;
  }
  bytes(): Bytes {
    const n = this.pages.length, objs: string[] = [];
    const fonts = ["Helvetica", "Helvetica-Bold", "Courier"];
    objs[1] = "<< /Type /Catalog /Pages 2 0 R >>";
    const kids = this.pages.map((_, i) => `${6 + i * 2} 0 R`).join(" ");
    objs[2] = `<< /Type /Pages /Kids [${kids}] /Count ${n} >>`;
    fonts.forEach((f, i) => { objs[3 + i] = `<< /Type /Font /Subtype /Type1 /BaseFont /${f} /Encoding /WinAnsiEncoding >>`; });
    objs[0] = "";
    this.pages.forEach((ops, i) => {
      const footer = `BT /F1 7.5 Tf ${M} 28 Td (${esc(this.footer)}   Page ${i + 1} of ${n}) Tj ET`;
      // watermark first, so it sits behind the text: light grey, 45 degrees, centred, sized to fit the diagonal
      const wm = this.watermark ? latin(this.watermark) : ""; const size = Math.min(34, 700 / Math.max(1, wm.length * CW.F2)); const half = (wm.length * size * CW.F2) / 2; const k = 0.70711;
      const mark = wm ? [`q 0.86 g BT /F2 ${size.toFixed(1)} Tf ${k} ${k} ${-k} ${k} ${(W / 2 - half * k).toFixed(1)} ${(H / 2 - half * k).toFixed(1)} Tm (${esc(wm)}) Tj ET Q`] : [];
      const stream = [...mark, ...ops, footer].join("\n");
      objs[6 + i * 2] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >> /Contents ${7 + i * 2} 0 R >>`;
      objs[7 + i * 2] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
    });
    let out = "%PDF-1.4\n%âãÏÓ\n"; const offs: number[] = [];
    const last = 6 + (n - 1) * 2 + 1;
    for (let id = 1; id <= last; id++) { offs[id] = out.length; out += `${id} 0 obj\n${objs[id]}\nendobj\n`; }
    const xref = out.length;
    out += `xref\n0 ${last + 1}\n0000000000 65535 f \n`; for (let id = 1; id <= last; id++) out += String(offs[id]).padStart(10, "0") + " 00000 n \n";
    out += `trailer\n<< /Size ${last + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    const b = new Uint8Array(out.length); for (let i = 0; i < out.length; i++) b[i] = out.charCodeAt(i) & 255; return b;
  }
}

const isoZ = (ms: number) => new Date(ms).toISOString().replace("T", " ").slice(0, 19) + "Z";
const pct = (bp: number) => `${Math.floor(bp / 100)}.${String(bp % 100).padStart(2, "0")}%`;

export interface PdfOptions { reportUrl?: string }
export async function renderReportPdf(data: EmbeddedData, seal: Seal | null, opts: PdfOptions = {}): Promise<Bytes> {
  const m = data.model, kindWord = m.kind === "election" ? "Election" : "Meeting";
  const d = new Doc(`Event ${m.eid}   Log head ${m.head?.hash.slice(0, 16) ?? ""}...`, watermarkText(m.kind, m.eid));
  d.text(`${BRAND} | Record of a ${kindWord}`, { size: 9, font: "F2" });
  d.text(m.title, { size: 20, font: "F2", gap: 4 });
  d.text(`${m.society.name} (${m.society.kind}) | Registration no. ${m.society.registrationNo}`, { size: 11, font: "F2" });
  d.text(m.society.address, { size: 10 });
  d.text("Personal details in this document are partly hidden with * to protect privacy.", { size: 8 });
  d.h("1. Identification");
  d.row(["Event ID", m.eid], [110, 380], { font: "F3", size: 8.5 });
  d.row(["Type", `${kindWord} | ${m.eventType.toUpperCase()}`], [110, 380]);
  d.row(["Rules in use", `${m.compliance.packName || m.packId} (${m.packId})${m.compliance.packConfidence ? ", pack confidence: " + m.compliance.packConfidence : ""}`], [110, 380]);
  d.row(["Time zone", m.timezone], [110, 380]);
  if (m.createdFrom) d.row(["Created from", m.createdFrom], [110, 380], { font: "F3", size: 8.5 });
  d.h("2. Schedule");
  d.row(["", "Day", "Date", "Time", "Place"], [105, 70, 100, 50, 168], { font: "F2" });
  for (const k of MILESTONE_KEYS) { const x = m.schedule[k], p = dayParts(x.atMs, m.timezone); d.row([milestoneLabel(m.kind, k), p.day, p.date, p.time, x.place], [105, 70, 100, 50, 168]); }
  d.h("3. People and who appointed whom");
  for (const p of m.people) d.row([p.pid, p.maskedName, p.roles.join(" + ").replace(/_/g, " "), p.label ?? "", p.verified ? "e-mail verified" : "not verified"], [112, 100, 120, 70, 88], { font: "F1", size: 8 });
  d.h("4. Attendance and quorum");
  d.text(m.attendance.line, { font: "F2" });
  d.text(`${m.attendance.present} of ${m.attendance.total} flats present.${m.quorum ? ` Quorum: ${m.quorum.present} present, ${m.quorum.required} needed (${m.quorum.basis}): ${m.quorum.met ? "met" : "NOT met"}.` : " The quorum check was off."}`);
  d.h("5. Agenda and results");
  for (const p of m.points) {
    d.text(`${p.number}.  ${p.title}`, { font: "F2", size: 11 });
    d.row(["Point ID", p.pointId], [90, 400], { font: "F3", size: 8.5 });
    if (p.body) d.text(p.body, { size: 9, indent: 6 });
    if (p.kind !== "discussion") {
      d.text(`${p.kind === "election_post" ? "Election post" : "Resolution"} | ${p.secret ? "secret ballot" : "open vote by flat"} | ${p.instruction}${p.kind === "election_post" && p.format ? " | Format: " + FORMAT_LABEL[p.format] : ""}`, { size: 8.5, indent: 6 });
      d.text(`Ballot paper: ${p.design.layout} layout, ${p.design.order === "shuffled" ? "shuffled order" : "listed order"}, ${p.design.size} tick boxes.`, { size: 8.5, indent: 6 });
      d.text(`${p.voted.length} of ${m.attendance.present} present flats voted: ${p.voted.join(", ") || "none"}`, { size: 9, indent: 6 });
    }
    const t = p.tally;
    if (t && !p.countsHidden) {
      d.row(["Option ID", "Option", "Ticked (yes)", "Not ticked (no)", "Weight", "Vote %"], [92, 150, 66, 76, 54, 52], { font: "F2", size: 8 });
      for (const o of t.options) d.row([o.option, p.labels[o.option] ?? o.option, String(o.count), String(o.notSelected), String(o.weight), pct(o.percentBp)], [92, 150, 66, 76, 54, 52], { size: 8 });
      if (t.majority) d.text(`Counted on ${t.majority.basis} (${t.majority.base}); needs ${t.majority.num}/${t.majority.den}${t.majority.strict ? " (more than)" : ""}. Result: ${t.outcome.replace(/_/g, " ").toUpperCase()}`, { font: "F2", size: 9, indent: 6 });
      if (t.ranking) d.text("Ranking: " + t.ranking.map((r) => `${r.rank}. ${p.labels[r.option] ?? r.option} (${r.count})${r.tied ? " tie" : ""}`).join(" | "), { size: 8.5, indent: 6 });
      if (t.assignment?.seats) d.text("By rank, for the Returning Officer to confirm: " + t.assignment.seats.map((x) => `${x.seat}: ${x.option ? p.labels[x.option] ?? x.option : "-"}${x.tied ? " (tie)" : ""}`).join(" | ") + (t.assignment.needsReturningOfficer ? "  A TIE NEEDS THE RETURNING OFFICER." : ""), { size: 8.5, indent: 6 });
      if (t.assignment?.selected) d.text(`First ${t.assignment.selected.length} by votes, for the Returning Officer to confirm: ` + t.assignment.selected.map((x) => p.labels[x] ?? x).join(", ") + (t.assignment.tieAtCutoff ? "  A TIE AT THE CUT-OFF NEEDS THE RETURNING OFFICER." : ""), { size: 8.5, indent: 6 });
      if (p.kind === "election_post" && !t.assignment && !t.leaders) d.text("Numbers only. The Returning Officer declares the result.", { size: 8.5, indent: 6 });
    }
    if (p.openVotes?.length) { d.text("How each flat voted (open vote):", { size: 8.5, indent: 6, font: "F2" }); d.text(p.openVotes.map((v) => `${v.flatNo}: ${v.choices.map((c) => p.labels[c] ?? c).join("+")}`).join("   "), { size: 8, indent: 6 }); }
    d.space(4);
  }
  d.h("6. Checked against the rules");
  d.text(`Rules in use: ${m.compliance.packName || m.packId}${m.compliance.needsLawyer ? ". The society should confirm these values against its own bye-laws." : ""}`, { size: 9 });
  for (const c of m.compliance.checks) d.row([c.status === "pass" ? "pass" : c.status === "fail" ? "FAIL" : c.status === "not_set" ? "not set" : "info", c.label, c.detail], [48, 170, 272], { size: 8, font: c.status === "fail" ? "F2" : "F1" });
  d.text(m.compliance.disclaimer, { size: 8 });
  d.h("7. Verification");
  d.text(`This document is generated from a hash-chained, digitally signed log of ${data.log.length} entries. Every entry (${m.access.entriesWithAccessFingerprint} of ${m.access.entries}) carries a coded fingerprint of the IP address and device that made the request; ${m.access.termsAccepted} acceptances of the terms and conditions are recorded.`, { size: 9 });
  d.row(["Log head", `#${m.head?.seq ?? 0}  ${m.head?.hash ?? ""}`], [90, 400], { font: "F3", size: 8 });
  d.row(["Signing key", data.kid], [90, 400], { font: "F3", size: 8 });
  if (seal) { d.row(["Report file SHA-256", seal.fileSha256], [90, 400], { font: "F3", size: 8 }); d.row(["Report signature", seal.sig.slice(0, 64) + "..."], [90, 400], { font: "F3", size: 8 }); }
  if (opts.reportUrl) d.text(`Check the live record and run the verifier at: ${opts.reportUrl}`, { size: 9, font: "F2" });
  if (m.officials.length) {
    d.h("7A. Committee, officers and observers");
    d.row(["Role", "Name", "Designation / authority", "Attendance"], [110, 120, 170, 90], { font: "F2", size: 8 });
    for (const o of m.officials.slice(0, 60)) d.row([o.groupLabel, o.name, [o.designation, o.authority].filter(Boolean).join(" - "), o.present ? "present " + isoZ(o.presentTs!).slice(0, 16) : "not marked"], [110, 120, 170, 90], { size: 8 });
    d.space(4); for (const o of m.officials.slice(0, 60)) d.sig(`${o.name}${o.designation ? ", " + o.designation : ""} (${o.groupLabel})`);
  }
  d.h("8. Certification");
  d.text(`We, the undersigned, certify that this document is a true print of the record of the ${kindWord.toLowerCase()} identified above, as published on the platform with the log head and file fingerprint shown in section 7.`, { size: 10 });
  d.sig("Returning Officer / Presiding Officer"); d.sig("Chairperson"); d.sig("Secretary"); d.space(10);
  d.box(70, "Seal / stamp of the society");
  // appendices
  d.h("Appendix A. Complete log (every entry, in order)");
  d.row(["#", "Time (UTC)", "Type", "Actor", "Entry hash (first 20)"], [30, 108, 110, 110, 132], { font: "F2", size: 7.5 });
  for (const e of data.log) { const a = e.entry.actor as any; d.row([String(e.entry.seq), isoZ(e.entry.ts), e.entry.type, a.pid ? a.pid.slice(0, 14) + "..." : a.flat ? "flat " + a.flat : "system", e.hash.slice(0, 20)], [30, 108, 110, 110, 132], { font: "F3", size: 7 }); }
  const secrets = m.points.filter((p) => p.receipts?.length);
  if (secrets.length) {
    d.h("Appendix B. Receipt codes of secret ballots (a voter can find their receipt here)");
    for (const p of secrets) { d.text(`${p.number}. ${p.title} - ${p.receipts!.length} receipts`, { font: "F2", size: 9 }); for (const r of p.receipts!) d.text(r, { font: "F3", size: 7, gap: 0 }); d.space(4); }
  }
  void sha256Hex;
  return d.bytes();
}

export const pdfSha256 = (b: Bytes) => sha256Hex(b);

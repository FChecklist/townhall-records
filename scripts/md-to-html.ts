// Turns the project's own markdown documents (tables, headings, lists, checkboxes) into ONE readable HTML file. Usage: bun scripts/md-to-html.ts <out.html> <title> <a.md> [b.md ...]
import { readFileSync, writeFileSync } from "node:fs";
const [out, title, ...files] = process.argv.slice(2);
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const inline = (s: string) => esc(s).replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>").replace(/\[x\]/g, '<span class="ok">☑</span>').replace(/\[~\]/g, '<span class="part">◐</span>').replace(/\[ \]/g, '<span class="todo">☐</span>').replace(/\[D\]/g, '<span class="dec">◆</span>').replace(/\[R\]/g, '<span class="todo">☐</span>');
function convert(md: string): string {
  const lines = md.replace(/\r/g, "").split("\n"); const o: string[] = []; let i = 0; let list = false;
  const closeList = () => { if (list) { o.push("</ul>"); list = false; } };
  while (i < lines.length) {
    const l = lines[i]!;
    if (/^\|.*\|\s*$/.test(l) && /^\|[\s:|-]+\|\s*$/.test(lines[i + 1] ?? "")) {
      closeList(); const head = l.split("|").slice(1, -1).map((x) => x.trim()); i += 2; const rows: string[][] = [];
      while (i < lines.length && /^\|.*\|\s*$/.test(lines[i]!)) { rows.push(lines[i]!.split("|").slice(1, -1).map((x) => x.trim())); i++; }
      o.push(`<table><thead><tr>${head.map((h) => `<th>${inline(h)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`); continue;
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(l); if (h) { closeList(); o.push(`<h${h[1]!.length}>${inline(h[2]!)}</h${h[1]!.length}>`); i++; continue; }
    if (/^---+\s*$/.test(l)) { closeList(); o.push("<hr>"); i++; continue; }
    const li = /^\s*(?:-|\d+\.)\s+(.*)$/.exec(l); if (li) { if (!list) { o.push("<ul>"); list = true; } o.push(`<li>${inline(li[1]!)}</li>`); i++; continue; }
    if (!l.trim()) { closeList(); i++; continue; }
    closeList(); o.push(`<p>${inline(l)}</p>`); i++;
  }
  closeList(); return o.join("\n");
}
const body = files!.map((f) => convert(readFileSync(f, "utf8"))).join("\n<hr class=\"page\">\n");
writeFileSync(out!, `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title!)}</title><style>
body{font-family:Calibri,Arial,sans-serif;color:#1C2B3A;margin:0;line-height:1.45}main{max-width:1050px;margin:0 auto;padding:24px 28px}h1{font-size:26px}h2{font-size:19px;border-bottom:2px solid #1C2B3A;padding-bottom:3px;margin-top:30px}h3{font-size:15px}
table{border-collapse:collapse;width:100%;margin:10px 0;font-size:13px}th{background:#1C2B3A;color:#fff;text-align:left;padding:5px 7px}td{border:1px solid #bbb;padding:4px 7px;vertical-align:top}tr:nth-child(even) td{background:#f5f7f9}
ul{padding-left:20px}li{margin:3px 0}code{background:#eef1f4;padding:0 3px;border-radius:3px;font-size:12px}.ok{color:#117a4d}.part{color:#b25b00}.todo{color:#a33}.dec{color:#336}hr.page{page-break-after:always;border:0;margin:30px 0}@media print{h2{page-break-after:avoid}}
</style></head><body><main>${body}</main></body></html>`);
console.log("written", out);

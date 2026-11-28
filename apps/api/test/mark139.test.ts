// Guard: the small mark "१३९" must be on every page, exactly once, with the approved look.
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const pub = join(import.meta.dir, "..", "public");
const pages = [join(pub, "index.html"), join(pub, "404.html"),
  ...readdirSync(pub, { withFileTypes: true }).filter((d) => d.isDirectory() && existsSync(join(pub, d.name, "index.html"))).map((d) => join(pub, d.name, "index.html"))];
const MARK = '<div class="mark139" lang="hi" aria-hidden="true"><span>१३९</span></div>';
const CSS = [
  '.mark139{position:absolute;top:0;left:0;right:0;margin:0;padding:1px 0 0;text-align:center;line-height:1;pointer-events:none;user-select:none;z-index:2147483647;font-family:"Noto Sans Devanagari","Mukta","Nirmala UI","Mangal","Kohinoor Devanagari","Devanagari Sangam MN",sans-serif;font-size:6px;font-weight:700;color:#0B2A6B}',
  ".mark139 span{display:inline-block;border-bottom:.5px solid #7A1010;padding-bottom:.5px}",
];

describe("mark 139", () => {
  test("page list is not empty", () => expect(pages.length).toBeGreaterThanOrEqual(15));
  for (const p of pages) {
    test(`${p.slice(pub.length)} has the mark exactly once, first in body`, () => {
      const s = readFileSync(p, "utf8");
      expect(s.split('class="mark139"').length - 1).toBe(1);
      expect(s).toMatch(/<body[^>]*>/);
      expect(s.replace(/<body[^>]*>/, "<body>")).toContain("<body>" + MARK);
    });
    test(`${p.slice(pub.length)} loads the shared stylesheet`, () => expect(readFileSync(p, "utf8")).toContain("/assets/townhall.css"));
  }
  test("shared stylesheet holds the approved CSS once", () => {
    const css = readFileSync(join(pub, "assets", "townhall.css"), "utf8");
    for (const rule of CSS) expect(css.split(rule).length - 1).toBe(1);
    expect(css.split(".mark139{").length - 1).toBe(1);
    for (const t of ["#0B2A6B", "#7A1010", "6px", "700", ".5px"]) expect(CSS.join("")).toContain(t);
  });
});

// The marketing site (townhall-records.com) lives in site/ and must carry the same mark.
const siteDir = join(import.meta.dir, "..", "..", "..", "site");
const SITE_PAGES = readdirSync(siteDir).filter((f) => f.endsWith(".html")).map((f) => join(siteDir, f));
describe("mark 139 on the marketing site", () => {
  test("site page list is not empty", () => expect(SITE_PAGES.length).toBeGreaterThanOrEqual(3));
  for (const p of SITE_PAGES) {
    test(`site/${p.slice(siteDir.length + 1)} has the mark exactly once, first in body`, () => {
      const t = readFileSync(p, "utf8");
      expect(t.split('class="mark139"').length - 1).toBe(1);
      expect(t.replace(/<body[^>]*>/, "<body>")).toContain("<body>" + MARK);
      expect(t).toContain("/site.css");
    });
  }
  test("site stylesheet holds the approved CSS once", () => {
    const c = readFileSync(join(siteDir, "site.css"), "utf8");
    for (const rule of CSS) expect(c.split(rule).length - 1).toBe(1);
  });
});

// Grey text must be readable (owner decision, 2 Nov 2026): every grey / muted text colour in townhall.css is at least 4.5:1 against the surface it sits on (WCAG 2.1 AA for normal text).
// Reads the real stylesheet and works out the ratio from the real colours, so a lighter grey cannot slip in. Set TOWNHALL_CSS=<file> to check another copy (used once to prove this test fails on the old stylesheet).
// Run: bun test --isolate apps/api/test/contrast.test.ts
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const CSS = readFileSync(process.env.TOWNHALL_CSS ?? join(import.meta.dir, "../public/assets/townhall.css"), "utf8");
const MIN = 4.5;

// ---- a very small stylesheet reader: rules as { selectors, declarations }, and the :root colour tokens
const rules: Array<{ selectors: string[]; decl: Record<string, string> }> = [];
for (const m of CSS.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
  const decl: Record<string, string> = {};
  for (const part of m[2]!.split(";")) { const i = part.indexOf(":"); if (i > 0) decl[part.slice(0, i).trim()] = part.slice(i + 1).trim(); }
  rules.push({ selectors: m[1]!.split(",").map((s) => s.trim().replace(/\s+/g, " ")), decl });
}
const tokens: Record<string, string> = {};
for (const r of rules) if (r.selectors.includes(":root")) for (const [k, v] of Object.entries(r.decl)) if (k.startsWith("--")) tokens[k] = v;

function colour(v: string): string {
  const x = v.trim(); const m = /^var\((--[\w-]+)\)$/.exec(x); if (m) return colour(tokens[m[1]!] ?? "");
  if (/^#[0-9a-f]{6}$/i.test(x)) return x.toUpperCase(); if (/^#[0-9a-f]{3}$/i.test(x)) return ("#" + [...x.slice(1)].map((c) => c + c).join("")).toUpperCase();
  throw new Error("not a plain colour: " + v);
}
const lum = (hex: string) => { const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((u) => (u <= 0.03928 ? u / 12.92 : ((u + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!; };
const ratio = (a: string, b: string) => { const [l1, l2] = [lum(colour(a)), lum(colour(b))].sort((x, y) => y - x); return (l1! + 0.05) / (l2! + 0.05); };
/** The last declaration of `prop` among the rules that list this exact selector (CSS: the last one wins at equal weight). */
const decl = (selector: string, prop: string): string => {
  let out = ""; for (const r of rules) if (r.selectors.includes(selector) && r.decl[prop] !== undefined) out = r.decl[prop]!;
  if (!out) throw new Error(`no "${prop}" for ${selector}`); return out;
};
/** The FIRST declaration (the base rule, before any phone @media override). */
const base = (selector: string, prop: string): string => { for (const r of rules) if (r.selectors.includes(selector) && r.decl[prop] !== undefined) return r.decl[prop]!; throw new Error(`no "${prop}" for ${selector}`); };
const PAGE = ["--bg", "--sunk", "--surface", "--ivory"]; // the surfaces text can sit on

describe("grey text is at least 4.5:1", () => {
  test("the grey / muted / gold text colours against every page surface", () => {
    for (const tok of ["--muted", "--faint", "--grey-text", "--goldd", "--ink2", "--ink"]) for (const bg of PAGE) expect(ratio(`var(${tok})`, `var(${bg})`), `${tok} on ${bg}`).toBeGreaterThanOrEqual(MIN);
  });
  test("the status colours on their own tinted backgrounds", () => {
    for (const [fg, bg] of [["--ok", "--okbg"], ["--warn", "--warnbg"], ["--bad", "--badbg"], ["--info", "--infobg"]] as const) expect(ratio(`var(${fg})`, `var(${bg})`), `${fg} on ${bg}`).toBeGreaterThanOrEqual(MIN);
  });
  test("the greyed-out parts of the Team Desk (tiles, locked cards, ghost lists, the reason under a grey section, the note under the bar)", () => {
    const cases: Array<[string, string, string]> = [
      [".tile.off", "color", "var(--sunk)"], [".tile.off h3", "color", "var(--sunk)"], [".tile.off .eyebrow", "color", "var(--sunk)"],
      [".card.locked", "color", "var(--sunk)"], [".card.locked h2", "color", "var(--sunk)"], [".card.locked .eyebrow", "color", "var(--sunk)"],
      [".ghostlist li", "color", "#F6F2E8"], [".tabs.scroll.collapsible .ti .why", "color", "var(--surface)"], [".tabs.scroll.collapsible .ti .why", "color", "var(--infobg)"],
      [".tab-hint", "color", "var(--sunk)"], [".why-off", "color", "var(--surface)"], [".why-off", "color", "var(--sunk)"],
    ];
    for (const [sel, prop, bg] of cases) expect(ratio(decl(sel, prop), bg), `${sel} ${prop} on ${bg}`).toBeGreaterThanOrEqual(MIN);
  });
  test("a disabled button's label against its own grey fill", () => {
    expect(ratio(decl(".btn[disabled]", "color"), decl(".btn[disabled]", "background")), "disabled button").toBeGreaterThanOrEqual(MIN);
  });
  test("tab labels (normal, selected) on the bar and in the phone menu", () => {
    for (const bg of PAGE) expect(ratio(decl(".tabs button", "color"), `var(${bg})`), `tab on ${bg}`).toBeGreaterThanOrEqual(MIN);
    expect(ratio(decl(".tabs button.on", "color"), "var(--bg)")).toBeGreaterThanOrEqual(MIN);
    expect(ratio(decl(".tabs button.on", "color"), "var(--infobg)"), "selected item in the menu").toBeGreaterThanOrEqual(MIN);
    expect(ratio(decl(".tabs-menu-btn", "color"), decl(".tabs-menu-btn", "background")), "menu button").toBeGreaterThanOrEqual(MIN);
  });
});

describe("the sheet itself: seven sections collapse into a menu on a narrow screen", () => {
  test("the menu button is hidden on a wide screen and shown below 760px; the list is hidden until opened and shows each reason there", () => {
    expect(base(".tabs-menu-btn", "display")).toBe("none");
    const block = [...CSS.matchAll(/@media\s*\(max-width:\s*760px\)\s*\{([\s\S]*?)\n\}/g)].map((m) => m[1]!).find((b) => b.includes(".tabs-menu-btn"));
    expect(block).toBeTruthy(); // the phone block that holds the menu rules
    expect(block).toMatch(/\.tabs-menu-btn\{display:flex\}/); expect(block).toMatch(/\.tabs\.scroll\.collapsible\{display:none/); expect(block).toMatch(/\.tabs\.scroll\.collapsible\.open\{display:flex\}/);
    expect(block).toMatch(/\.tabs\.scroll\.collapsible \.ti \.why\{display:block/);
    expect(decl(".tabs .ti .why", "display")).toBe("none"); // on a wide screen the reason sits in the note under the bar instead
  });
});

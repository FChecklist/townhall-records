// ERROR-MESSAGE LINT (generated from the source): every error code the server or the rules engine can send must have a plain "how to fix" sentence in the UI table,
// every fix and every title the user can see must be short and free of developer words, and explain() must never return an empty box.
import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
// @ts-ignore plain browser module without types
import { FIXES } from "../public/assets/fixes.js";
// @ts-ignore plain browser module without types
import { TITLES } from "../public/assets/fixes.js";
// @ts-ignore plain browser module without types
import { explain } from "../public/assets/core.js";

const files = [...readdirSync("apps/api/src").filter((f) => f.endsWith(".ts")).map((f) => "apps/api/src/" + f), ...readdirSync("packages/engine/src").filter((f) => f.endsWith(".ts") && !f.includes("generated")).map((f) => "packages/engine/src/" + f)];
const found = new Map<string, string>();
for (const f of files) {
  const s = readFileSync(f, "utf8");
  for (const m of s.matchAll(/err\((\d{3}),\s*"([a-z_0-9]+)",\s*(?:`([^`]*)`|"([^"]*)")/g)) if (!found.has(m[2]!)) found.set(m[2]!, m[3] ?? m[4] ?? "");
  for (const m of s.matchAll(/\bno\("([a-z_0-9]+)",\s*(?:`([^`]*)`|"([^"]*)")/g)) if (!found.has(m[1]!)) found.set(m[1]!, m[2] ?? m[3] ?? "");
}
const JARGON = /\b(json|http|https|api|token|header|sha-?256|payload|endpoint|null|undefined|exception|stack|sql|database|hash|signature|passcode|nonce|ed25519|d1|cors|csrf|jwt|uuid|regex|query|server error)\b/i;
const words = (s: string) => s.trim().split(/\s+/).length;

describe("error messages are plain, short and say how to fix", () => {
  test("the scan found the codes (guards against the scan silently finding none)", () => { expect(found.size).toBeGreaterThan(100); });
  test("every code has a how-to-fix sentence", () => {
    const missing = [...found.keys()].filter((c) => !(c in FIXES));
    expect(missing).toEqual([]);
  });
  test("no fix is empty, long or full of developer words", () => {
    const bad: string[] = [];
    for (const [c, f] of Object.entries(FIXES as Record<string, string>)) { if (!f || words(f) > 28 || JARGON.test(f) || !/[.!?]$/.test(f)) bad.push(`${c}: ${f}`); }
    expect(bad).toEqual([]);
  });
  test("what the user reads as the title is plain: the server sentence, or a friendly title where the server sentence has developer words", () => {
    const bad: string[] = [];
    for (const [c, m] of found) { const shown = (TITLES as Record<string, string>)[c] ?? m; if (!shown) continue; if (JARGON.test(shown)) bad.push(`${c}: ${shown}`); }
    expect(bad).toEqual([]);
  });
  test("explain() always gives a title and a fix, for every code and for unknown codes and statuses", () => {
    for (const [c, m] of found) { const x = explain({ code: c, status: 403, message: (TITLES as Record<string, string>)[c] ?? m }); expect(x.title.length).toBeGreaterThan(3); expect(x.fix.length).toBeGreaterThan(8); }
    for (const st of [0, 400, 401, 403, 404, 409, 410, 413, 422, 429, 500, 502, 503]) { const x = explain({ code: "never_heard_of_it", status: st, message: "" }); expect(x.fix.length).toBeGreaterThan(8); expect(x.title.length).toBeGreaterThan(3); }
  });
});

// Merges the engine blocks written by the research agents (docs/research/extra/<region>.json) into docs/research/rule-packs-extra.json, which the API loads.
// A pack that fails the product's own checks is NOT merged and is listed. Usage: bun scripts/merge-extra-packs.ts
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import rulePacks from "../docs/research/rule-packs.json";
import { loadAllPacks, loadExtraPacks } from "../packages/engine/src";

const dir = new URL("../docs/research/extra/", import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
const taken = new Set(loadAllPacks(rulePacks).keys()); const engine: unknown[] = []; const report: string[] = [];
for (const f of files) {
  let j: any; try { j = JSON.parse(readFileSync(new URL(f, dir), "utf8")); } catch (e) { report.push(`${f}: NOT VALID JSON (${(e as Error).message})`); continue; }
  const defs = (j.packs ?? []).map((p: any) => p.engine).filter(Boolean);
  const { packs, errors } = loadExtraPacks({ packs: defs }, taken);
  const ok = new Set(packs.map((p) => p.id)); for (const d of defs) if (ok.has(d.id)) { engine.push(d); taken.add(d.id); }
  report.push(`${f}: ${defs.length} engine blocks, ${packs.length} accepted, ${errors.length} rejected${errors.length ? "\n    " + errors.join("\n    ") : ""}`);
}
writeFileSync(new URL("../docs/research/rule-packs-extra.json", import.meta.url), JSON.stringify({ _note: "Built by scripts/merge-extra-packs.ts from docs/research/extra/*.json. Research, not legal advice; every pack carries its own confidence and needs a lawyer's check.", packs: engine }, null, 1) + "\n");
console.log(report.join("\n") + `\nTOTAL merged packs: ${engine.length}`);

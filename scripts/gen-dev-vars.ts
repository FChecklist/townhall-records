// Writes apps/api/.dev.vars with FRESH random local secrets (the file is gitignored). Run once per machine.
import { existsSync, writeFileSync } from "node:fs";
import { generateSigningKey, randomHex } from "../packages/engine/src";
const p = "apps/api/.dev.vars";
if (existsSync(p)) { console.log(p + " already exists; leaving it alone"); process.exit(0); }
const k = await generateSigningKey();
writeFileSync(p, [`SIGNING_KEY=${k.privateKeyPkcs8}`, `PEPPER=${randomHex(32)}`, `MASTER_SECRET=${randomHex(32)}`, `INTERNAL_SECRET=${randomHex(16)}`, `SUPER_EMAIL=owner@localhost.invalid`, `TEST_MODE=1`, ""].join("\n"));
console.log("wrote " + p);

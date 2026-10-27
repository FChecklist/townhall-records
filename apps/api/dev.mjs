// Local dev server (Bun): the real handler + real migrations on SQLite (stand-in for D1) + the static pages. LOCAL ONLY.
// Run: bun run apps/api/dev.mjs [port]   (uses ~100 MB; one process at a time)
// Dev extras that do not exist in production: GET /dev/code?to=<email> returns the last mailed 6-digit code; every browser device gets its own fake IP so the per-IP limits do not trip.
import { generateSigningKey } from "../../packages/engine/src";
import { handle } from "./src/handler";
import { makeD1 } from "./test/d1-sqlite";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const PORT = Number(process.argv[2] || process.env.PORT || 8788);
const PUB = join(import.meta.dir, "public");
const d = makeD1(); const k = await generateSigningKey();
const env = { DB: d.db, SIGNING_KEY: k.privateKeyPkcs8, PEPPER: "dev-pepper", MASTER_SECRET: "dev-master", TEST_MODE: "1", SUPER_EMAIL: "owner@platform.example", INTERNAL_SECRET: "dev-tick" };
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json", ".png": "image/png", ".txt": "text/plain" };
const REWRITES = [[/^\/e\//, "/e/index.html"], [/^\/v\//, "/v/index.html"], [/^\/pay\//, "/pay/index.html"], [/^\/hall\//, "/hall/index.html"], [/^\/h\//, "/v/index.html"]];
const hash = (s) => { let x = 7; for (const c of s) x = (x * 31 + c.charCodeAt(0)) >>> 0; return x; };

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/dev/code") {
      const to = url.searchParams.get("to") || "";
      const rows = d.raw.query("SELECT body FROM mail_outbox WHERE to_addr=? ORDER BY id DESC").all(to);
      const m = rows.map((r) => /\b(\d{6})\b/.exec(r.body)).find(Boolean);
      return Response.json({ code: m ? m[1] : null });
    }
    if (url.pathname.startsWith("/api/")) {
      const dev = req.headers.get("x-device-id") || "anon"; const h = new Headers(req.headers);
      h.set("cf-connecting-ip", `10.${hash(dev) % 250}.${(hash(dev) >> 8) % 250}.${(hash(dev) >> 16) % 250}`);
      const body = req.method === "GET" || req.method === "HEAD" ? undefined : await req.arrayBuffer();
      return handle(new Request(req.url, { method: req.method, headers: h, body }), env, Date.now());
    }
    let p = url.pathname; for (const [re, to] of REWRITES) if (re.test(p)) { p = to; break; }
    let f = join(PUB, p);
    if (existsSync(f) && statSync(f).isDirectory()) f = join(f, "index.html");
    if (!existsSync(f)) f = join(PUB, "404.html");
    if (!existsSync(f)) return new Response("Not found", { status: 404 });
    return new Response(readFileSync(f), { headers: { "content-type": MIME[extname(f)] || "application/octet-stream", "cache-control": "no-store" } });
  },
});
setInterval(() => { handle(new Request("http://x/api/internal/tick", { method: "POST", headers: { "x-internal-secret": "dev-tick", "x-device-id": "devtickdevice0001", "content-type": "application/json" }, body: "{}" }), env, Date.now()).catch(() => {}); }, 60_000);
console.log(`Townhall dev server on http://localhost:${PORT}  (in-memory data; restart wipes it)`);

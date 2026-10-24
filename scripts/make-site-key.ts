// Makes this product's secret site key for IT SERVICES BY RAJAT AGARWAL and the SQL that registers the product there. The key itself is written to a git-ignored file and NEVER printed.
// Usage: bun scripts/make-site-key.ts <host, for example townhall.pages.dev> [out-dir]
// Result: <out-dir>/.site-key.txt (give this value to the Pages secret PAY_SERVICE_KEY of this product), <out-dir>/0013_townhall_site.sql (apply to the central D1 only when the owner says go).
import { writeFileSync } from "node:fs";
const host = process.argv[2]; const dir = process.argv[3] ?? "docs/payments";
if (!host || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host)) { console.error("give the product's host name, for example townhall.pages.dev"); process.exit(1); }
const bytes = crypto.getRandomValues(new Uint8Array(32)); const key = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
const sha = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key))), (b) => b.toString(16).padStart(2, "0")).join("");
writeFileSync(`${dir}/.site-key.txt`, key + "\n");
const sql = `-- Registers the Townhall product (meetings and elections for housing societies) as a website of IT SERVICES BY RAJAT AGARWAL. Apply ONLY when the owner says go.
-- Also add  "${host}": "TWN"  to SITE_CODES in functions/_lib.js of the central service and deploy it, so txn_id = TWN-<payment id>.
INSERT OR IGNORE INTO site(host,name,webhook_url) VALUES('${host}','Townhall (society meetings and elections)','https://${host}/api/pay/webhook');
UPDATE site SET key_hash='${sha}', active=1, name='Townhall (society meetings and elections)', webhook_url='https://${host}/api/pay/webhook' WHERE host='${host}';
INSERT OR IGNORE INTO plan_catalog(site,stream,plan,name,currency,amount_minor,notes) VALUES
('${host}','sales','meeting','Meeting (one event)','INR',49900,'US$5 abroad'),
('${host}','sales','election','Election (one event)','INR',149900,'US$15 abroad'),
('${host}','sales','reschedule_meeting','Postponement of a meeting after its start (second and later)','INR',24950,'half the event price; US$2.50 abroad'),
('${host}','sales','reschedule_election','Postponement of an election after its start (second and later)','INR',74950,'half the event price; US$7.50 abroad');
INSERT OR IGNORE INTO product_catalog(product,product_type,site,name,seller,notes) VALUES
('townhall','event','${host}','Townhall meeting or election','IT Services by Rajat Agarwal','plan = meeting | election | reschedule_meeting | reschedule_election; no refunds');
`;
writeFileSync(`${dir}/0013_townhall_site.sql`, sql);
console.log(`site key written to ${dir}/.site-key.txt (not shown). sha256 of the key: ${sha}\nSQL written to ${dir}/0013_townhall_site.sql`);

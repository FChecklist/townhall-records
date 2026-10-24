-- Registers the Townhall product (meetings and elections for housing societies) as a website of IT SERVICES BY RAJAT AGARWAL. Apply ONLY when the owner says go.
-- Also add  "townhall.pages.dev": "TWN"  to SITE_CODES in functions/_lib.js of the central service and deploy it, so txn_id = TWN-<payment id>.
INSERT OR IGNORE INTO site(host,name,webhook_url) VALUES('townhall.pages.dev','Townhall (society meetings and elections)','https://townhall.pages.dev/api/pay/webhook');
UPDATE site SET key_hash='ec03c255f6a5e3346fa971fcd726f8a31fb4ea1e1cd9f69718bae4951e9868c4', active=1, name='Townhall (society meetings and elections)', webhook_url='https://townhall.pages.dev/api/pay/webhook' WHERE host='townhall.pages.dev';
INSERT OR IGNORE INTO plan_catalog(site,stream,plan,name,currency,amount_minor,notes) VALUES
('townhall.pages.dev','sales','meeting','Meeting (one event)','INR',49900,'US$5 abroad'),
('townhall.pages.dev','sales','election','Election (one event)','INR',149900,'US$15 abroad'),
('townhall.pages.dev','sales','reschedule_meeting','Postponement of a meeting after its start (second and later)','INR',24950,'half the event price; US$2.50 abroad'),
('townhall.pages.dev','sales','reschedule_election','Postponement of an election after its start (second and later)','INR',74950,'half the event price; US$7.50 abroad');
INSERT OR IGNORE INTO product_catalog(product,product_type,site,name,seller,notes) VALUES
('townhall','event','townhall.pages.dev','Townhall meeting or election','IT Services by Rajat Agarwal','plan = meeting | election | reschedule_meeting | reschedule_election; no refunds');

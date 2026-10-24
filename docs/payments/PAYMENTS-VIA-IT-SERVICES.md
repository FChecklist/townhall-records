# Payments of this product go through IT SERVICES BY RAJAT AGARWAL (ledgers A / B / C)

Owner order (2026-10-24, and the 2026-10-13 ledger order): ALL payment goes through IT SERVICES BY RAJAT AGARWAL, exactly like Corporate Tambola. This product is one more "website" of that service.
Spec of the three ledgers: `C:\ct\ct\PAYMENT_LEDGER_ABC_SPEC_2026-10-13.md`. Central code: `C:\ct\itservices-site` (D1 `itservices-payments`).

| Ledger | What | Where | In this product |
|---|---|---|---|
| A | Razorpay's own records | Razorpay | every order carries our ids in its notes (`payment_ref`, `txn_id`) |
| B | the central ledger | IT Services (Cloudflare D1) | order, verify, forwarded webhook, site-summary |
| C | this product's own ledger | this product's D1 | `payments` (+ `txn_id`), `payment_attempt`, `payment_refund`, `webhook_log`, `GET /api/owner/ledger` |

Ledger path of every line: `razorpay / IT Services / <this product's host> / sales / <meeting | election | reschedule_meeting | reschedule_election>`.
`txn_id = TWN-<our payment id>` is made by the central service and stored in A (order notes), B and C. One payment can have several attempts (failed, then paid); money-in exists only for the captured attempt.

## What the code does (apps/api/src/payments.ts, covered by apps/api/test/ledger.test.ts, 10 tests)
1. **Order**: `POST {central}/api/pay/order` with header `x-site-key`, body `{ site, product: "townhall", plan, amount_minor, currency, payment_ref: <our payment id>, user, label, extra_notes }`. A failure means nothing is created and the Organizer is told to try again (502).
2. **Checkout** runs on the registered central address (the same frame Corporate Tambola uses); the payment link page gets `orderId`, `txnId`, `checkoutOrigin`.
3. **Verify**: `POST /api/pay/link/:token/verify` forwards the checkout result to `{central}/api/pay/verify` (signature + what Razorpay really holds). Paid -> the payment is marked paid and the attempt is filed with fee, tax and method.
4. **Webhook**: the central service forwards each Razorpay webhook to `/api/pay/webhook` (raw body, `X-Razorpay-Signature`, `X-Razorpay-Event-Id`). We check the signature on the raw body with `RAZORPAY_WEBHOOK_SECRET`, process each event id once, and never mark paid unless the amount and order match. A late failure never turns a paid attempt back. Refund events are filed in `payment_refund`.
5. **Summary C -> B**: every scheduler tick sends this and last month's totals (per currency) to `{central}/api/pay/site-summary`.
6. **Owner ledger**: `GET /api/owner/ledger?month=YYYY-MM` with `Authorization: Bearer <OWNER_LEDGER_KEY>`; masked payer only.
7. Postponement fees are ordinary payments of plan `reschedule_<kind>` (half the price) through the same path; no refunds [owner decision].
8. No card data and no payer e-mail or mobile in full is kept here: only masked forms (full values live in B and at Razorpay).

## Settings this product needs (Pages secrets, never in git)
`PAY_SITE` (the product's registered host), `PAY_SERVICE_KEY` (site key, step 2), `RAZORPAY_WEBHOOK_SECRET` (the same value as the central service), `OWNER_LEDGER_KEY`; optional `PAY_SERVICE_URL` (defaults to https://itservices-rajat-agarwal.pages.dev).

## Steps to switch it on (NOTHING below has been run; each step changes live infrastructure; run only when the owner says go)
1. Decide the product's host name (for example `townhall.pages.dev` or its own domain).
2. `bun scripts/make-site-key.ts <host> docs/payments` writes the secret key to `docs/payments/.site-key.txt` (git-ignored, not printed) and `0013_townhall_site.sql`.
3. In `C:\ct\itservices-site`: copy `0013_townhall_site.sql` to `migrations/`, add `"<host>": "TWN"` to `SITE_CODES` in `functions/_lib.js`, apply the migration with the PM's `mig_all.py`, deploy the central site.
4. Set this product's Pages secrets (step "Settings"), apply migrations 0001-0010 to this product's D1, deploy it.
5. Allow the product's address to open the secure payment window on the central site (the `Pay frame` allow-list, as was done for the corporatetambola.com addresses).
6. Webhook: nothing to change at Razorpay (the central URL already receives everything and passes it on to `webhook_url`).
7. Prove it with one real Rs 1 payment from the central payment-test page (`?from=`), check A = B = C, `view=issues` empty.
8. Add this product to the nightly owner report and the 30-minute reconcile (central side, same as the other websites).

## Known limits
- Tests use a stub that follows the central service's real contract; the live service has not been called by this product yet.
- The checkout page itself (UI) is not built.
- Invoices and refunds: none by decision; commission/refer-and-earn: not used by this product.

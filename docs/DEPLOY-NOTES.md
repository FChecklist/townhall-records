# DEPLOY NOTES (written, NOT executed; the deployment session acts only on the owner's order)

1. Create the D1 database; apply `migrations/0001_records.sql` then `0002_operational.sql` (`wrangler d1 migrations apply`). Never edit an applied migration; add 0003 and later.
2. Pages project `aoa-rwa`; set Pages **secrets**: `SIGNING_KEY` (Ed25519 PKCS8 base64url, from `generateSigningKey()`), `PEPPER`, `MASTER_SECRET`, `INTERNAL_SECRET`, `SUPER_EMAIL`, `RESEND_API_KEY`, `MAIL_FROM`, `TURNSTILE_SECRET`; later `PAY_SERVICE_KEY`, `PAY_SERVICE_URL`, `PAY_SITE`. **Do not set `TEST_MODE` in production** (it enables the Turnstile test token and the test payment).
3. Back up the signing key off-machine before the first event; losing it makes new entries impossible to sign consistently; leaking it lets history be re-signed.
4. Publish the public key (`/api/pubkey`) and plan the anchor repo; schedule `POST /api/internal/anchor` (header `x-internal-secret`) daily from the owner-only scheduler.
5. Smoke test after deploy: health, pubkey, create event with Turnstile, check the code mail arrives (Resend), run a tiny meeting, verify the sealed report offline.
6. Rollback: the log is append-only; roll back code, never data. Re-measure CPU time per request on the real runtime (free plan limit) before opening to customers.

7. **Scheduler**: call `POST /api/internal/tick` (header `x-internal-secret`, and an `x-device-id`) at least once a MINUTE from the owner-only scheduler: it closes live events at their scheduled end and publishes the report (the 120-second promise depends on it). Call `POST /api/internal/anchor` once a day.
8. Migrations in order: 0001 records, 0002 operational, 0003 access audit, 0004 freeze after publication, 0005 handshake + paper.
9. Before any customer: complete the gates in `docs/CONFIDENCE.md` section 6.

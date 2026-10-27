// Townhall scheduler (Cloudflare Worker, cron trigger). Pages cannot run cron jobs, so this tiny worker calls the site's internal endpoints:
//   every minute: POST /api/internal/tick   (closes live events at their scheduled end and publishes the report; the 120-second promise depends on it)
//   daily 03:00 UTC: POST /api/internal/anchor
// The shared secret INTERNAL_SECRET is a Worker secret (set with `wrangler secret put`), never in this file.
export default {
  async scheduled(event, env, ctx) {
    const path = event.cron === "0 3 * * *" ? "/api/internal/anchor" : "/api/internal/tick";
    ctx.waitUntil(
      fetch(env.TARGET + path, { method: "POST", headers: { "x-internal-secret": env.INTERNAL_SECRET, "x-device-id": "cronworker00000001", "content-type": "application/json" }, body: "{}" })
        .then(async (r) => { if (!r.ok) console.error("townhall cron", path, r.status, (await r.text()).slice(0, 200)); })
        .catch((e) => console.error("townhall cron failed", path, String(e))),
    );
  },
  async fetch() { return new Response("Townhall scheduler. Nothing to see here.", { status: 200 }); },
};

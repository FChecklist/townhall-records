# PERF (measured with `bun scripts/perf.ts`; in-memory SQLite stand-in for D1, so network and D1 latency are NOT included)

120 flats, 5 resolutions (2 secret), 100 voters present, 500 ballots, 736 log entries (`docs/evidence/perf.txt`):
* vote cast: p50 5 ms, p95 15 ms (includes a full log replay) · closing the event incl. report build and signing: 64 ms
* replay of 736 entries: 9 ms · full chain + signature verification of 736 entries: 366 ms (this is what the browser does on "Verify")
* sealed report: 588 KB HTML (it embeds the whole log so it is self-contained). Fine on a laptop, heavy on a slow phone; a trimmed live view is a UI option.
* Embedded verifier bundle: 28 KB.
* **Not measured:** real D1 latency, Cloudflare CPU limits (free plan: 10 ms CPU per request - signing and replay work per request must be re-measured on the real runtime; this is the main performance risk), mobile Lighthouse (no UI yet).
* **Known scaling cost:** every request replays the whole event log, so a vote reads up to ~736 D1 rows; 500 votes is ~370k rows read for one event. A signed state checkpoint every N entries is the planned optimisation.

// Test stand-in for Cloudflare D1, backed by bun:sqlite, loading the REAL migrations (so the append-only triggers are the real ones).
import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import type { D1, D1Stmt } from "../src/core";

export const MIGRATIONS = ["migrations/0001_records.sql", "migrations/0002_operational.sql"];
export function makeD1(): { db: D1; raw: Database } {
  const raw = new Database(":memory:");
  for (const f of MIGRATIONS) raw.exec(readFileSync(f, "utf8"));
  const mk = (sql: string, vals: unknown[] = []): D1Stmt & { _sql: string; _vals: unknown[] } => ({
    _sql: sql, _vals: vals,
    bind: (...v: unknown[]) => mk(sql, v),
    run: async () => { const r = raw.query(sql).run(...(vals as any[])); return { meta: { changes: r.changes } }; },
    all: async <T = any>() => ({ results: raw.query(sql).all(...(vals as any[])) as T[] }),
    first: async <T = any>() => (raw.query(sql).get(...(vals as any[])) as T) ?? null,
  });
  const db: D1 = {
    prepare: (s) => mk(s),
    batch: async (xs) => { // atomic, like D1: all or nothing
      raw.exec("BEGIN");
      try { const out = xs.map((x: any) => raw.query(x._sql).run(...(x._vals as any[]))); raw.exec("COMMIT"); return out; } catch (e) { raw.exec("ROLLBACK"); throw e; }
    },
  };
  return { db, raw };
}

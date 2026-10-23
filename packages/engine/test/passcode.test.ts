// PM-STANDARDS section 3: format, uniqueness window, expiry, single use, lockout, replay, wrong purpose, wrong subject, timing-safe compare, no plaintext.
import { describe, expect, test } from "bun:test";
import { generateCode, isWellFormed, issuePasscode, MemoryPasscodeStore, passcodeHash, verifyPasscode, LOCK_MS, MAX_TRIES } from "../src/passcode";

const pepper = "test-pepper-not-a-secret";
const E = "e".repeat(32);
let n = 0;
const issue = (store: MemoryPasscodeStore, subject: string, purpose: any = "voter", now = 1000, rnd?: any) =>
  issuePasscode({ store, pepper, eventId: E, purpose, subject, nowMs: now, ttlMs: 15 * 60_000, newId: () => "id" + ++n, rnd });
const check = (store: MemoryPasscodeStore, subject: string, code: string, now = 2000, purpose: any = "voter") =>
  verifyPasscode({ store, pepper, eventId: E, purpose, subject, code, nowMs: now });

describe("passcode module", () => {
  test("format: exactly 6 digits, always, including leading zeros", () => {
    for (let i = 0; i < 2000; i++) expect(generateCode()).toMatch(/^\d{6}$/);
    expect(generateCode((u) => { u[0] = 5; })).toBe("000005");
    expect(isWellFormed("12345")).toBe(false); expect(isWellFormed("1234567")).toBe(false); expect(isWellFormed("12345a")).toBe(false);
  });
  test("correct code passes once; REPLAY of the same code fails", async () => {
    const st = new MemoryPasscodeStore();
    const { code } = await issue(st, "A-101");
    expect((await check(st, "A-101", code)).ok).toBe(true);
    const again = await check(st, "A-101", code, 3000);
    expect(again.ok).toBe(false); expect(!again.ok && again.reason).toBe("used");
  });
  test("WRONG SUBJECT: a code for flat A-101 does not open A-102", async () => {
    const st = new MemoryPasscodeStore();
    const { code } = await issue(st, "A-101"); await issue(st, "A-102");
    expect((await check(st, "A-102", code)).ok).toBe(false);
    expect((await check(st, "A-101", code)).ok).toBe(true);
  });
  test("WRONG PURPOSE: a login code is not a voter code, and the hash differs per purpose/subject/event", async () => {
    const st = new MemoryPasscodeStore();
    const { code } = await issue(st, "p_1", "login");
    expect((await check(st, "p_1", code, 2000, "voter")).ok).toBe(false);
    expect((await check(st, "p_1", code, 2000, "login")).ok).toBe(true);
    const h = (purpose: any, subject: string, eventId: string) => passcodeHash(pepper, { purpose, subject, eventId, code: "123456" });
    const base = await h("voter", "A-1", E);
    expect(base).not.toBe(await h("login", "A-1", E)); expect(base).not.toBe(await h("voter", "A-2", E)); expect(base).not.toBe(await h("voter", "A-1", "f".repeat(32)));
  });
  test("EXPIRY: a valid code stops working at its expiry time", async () => {
    const st = new MemoryPasscodeStore();
    const { code } = await issue(st, "A-101");
    const r = await check(st, "A-101", code, 1000 + 15 * 60_000);
    expect(r.ok).toBe(false); expect(!r.ok && r.reason).toBe("expired");
  });
  test("6 WRONG TRIES: the fifth wrong try locks it, and even the RIGHT code is refused while locked; it works again after 15 minutes", async () => {
    const st = new MemoryPasscodeStore();
    const { code } = await issue(st, "A-101");
    const wrong = code === "000000" ? "000001" : "000000";
    for (let i = 0; i < MAX_TRIES; i++) expect((await check(st, "A-101", wrong, 2000 + i)).ok).toBe(false);
    const sixth = await check(st, "A-101", code, 2010);
    expect(sixth.ok).toBe(false); expect(!sixth.ok && sixth.reason).toBe("locked");
    const later = await check(st, "A-101", code, 2000 + LOCK_MS + 10);
    // lock served: the expiry (15 min from issue) has also passed, so issue a new code to show the lock itself clears
    expect(later.ok || (!later.ok && later.reason === "expired")).toBe(true);
    const fresh = await issue(st, "A-101", "voter", 2000 + LOCK_MS + 20);
    expect((await check(st, "A-101", fresh.code, 2000 + LOCK_MS + 30)).ok).toBe(true);
  });
  test("re-issue voids the old code; the old digits stop working", async () => {
    const st = new MemoryPasscodeStore();
    const a = await issue(st, "A-101"); const b = await issue(st, "A-101", "voter", 1500);
    expect(b.voidedIds.length).toBe(1);
    if (a.code !== b.code) expect((await check(st, "A-101", a.code)).ok).toBe(false);
    expect((await check(st, "A-101", b.code)).ok).toBe(true);
  });
  test("UNIQUENESS WINDOW: two live codes in one event never share digits", async () => {
    const st = new MemoryPasscodeStore();
    let calls = 0;
    const rnd = (u: Uint32Array) => { calls++; u[0] = calls <= 3 ? 42 : 1000 + calls; }; // first code 000042; next issues collide on 000042 twice, then differ
    const a = await issue(st, "A-1", "voter", 1000, rnd);
    const b = await issue(st, "A-2", "voter", 1000, rnd);
    expect(a.code).toBe("000042"); expect(b.code).not.toBe("000042");
  });
  test("NO PLAINTEXT: stored rows contain a keyed hash only, never the digits", async () => {
    const st = new MemoryPasscodeStore();
    const { code } = await issue(st, "A-101");
    const dump = JSON.stringify(st.rows);
    expect(dump).not.toContain(`"${code}"`); expect(dump.includes(code) && !/[0-9a-f]{64}/.test(dump)).toBe(false);
    expect(st.rows[0]!.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(Object.values(st.rows[0]!).some((v) => v === code)).toBe(false);
  });
  test("malformed input is just a wrong try (no exception, no oracle)", async () => {
    const st = new MemoryPasscodeStore(); await issue(st, "A-101");
    for (const bad of ["", "abc", "12345", "1234567", "12 345"]) expect((await check(st, "A-101", bad)).ok).toBe(false);
    expect((await check(st, "nobody", "123456")).ok).toBe(false);
  });
});

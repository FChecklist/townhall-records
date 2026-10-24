import { describe, expect, test } from "bun:test";
import { canonical } from "../src/canonical";
import { maskEmail, maskName, maskPhone, scanPublic } from "../src/masking";
import { generateSigningKey, signMessage, verifyMessage, randomInt, sha256Hex, timingSafeEqual, aesEncrypt, aesDecrypt } from "../src/crypto";

describe("canonical JSON", () => {
  test("sorts keys, no whitespace, stable", () => {
    expect(canonical({ b: 1, a: [true, null, "x"], c: { z: 1, y: 2 } })).toBe('{"a":[true,null,"x"],"b":1,"c":{"y":2,"z":1}}');
    expect(canonical({ a: 1, b: 2 })).toBe(canonical({ b: 2, a: 1 }));
  });
  test("refuses floats, NaN, undefined", () => {
    expect(() => canonical({ a: 1.5 })).toThrow();
    expect(() => canonical({ a: NaN })).toThrow();
    expect(() => canonical({ a: undefined })).toThrow();
  });
  test("escapes control characters and quotes", () => {
    expect(canonical("a\"b\\c\n\u0001")).toBe('"a\\"b\\\\c\\n\\u0001"');
  });
});

describe("masking (Amendment A6 examples)", () => {
  test("e-mail, phone, name match the owner's examples", () => {
    expect(maskEmail("raajat.agarwal@gmail.com")).toBe("********rwal@gmail.com");
    expect(maskEmail("rajat@gmail.com")).toBe("********at@gmail.com");
    expect(maskPhone("9876543210")).toBe("******3210");
    expect(maskName("Rajat Agarwal")).toBe("Raj****** Aga******");
    expect(maskName("Rajat Kumar Agarwal")).toBe("Raj****** Kum****** Aga******");
    expect(maskName("Anil")).toBe("Ani******"); expect(maskName("Om Rao")).toBe("O****** R******");
  });
  test("odd inputs never leak", () => {
    expect(maskEmail("a@b.co.in")).toBe("********a@b.co.in");
    expect(maskEmail("not an email")).toBe("********@****");
    expect(maskPhone("+91 98765 43210")).toBe("******3210");
    expect(maskPhone("123")).toBe("******");
    expect(maskName("  ")).toBe("*");
  });
  test("masked values pass the scanner; complete ones are caught", () => {
    const masked = [maskEmail("rajat@gmail.com"), maskPhone("9876543210"), maskName("Rajat Agarwal")].join(" ");
    expect(scanPublic(masked)).toEqual([]);
    expect(scanPublic("write to rajat@gmail.com").some((f) => f.kind === "email")).toBe(true);
    for (const p of ["9876543210", "98765 43210", "98765-43210", "+91 98765 43210", "987-654-3210", "919876543210", "09876543210"]) expect(scanPublic("call " + p).some((f) => f.kind === "phone")).toBe(true);
  });
  test("hashes, ids and 13-digit timestamps are not mistaken for phone numbers", () => {
    const hash = "a1234567890b".repeat(5) + "abcd", ts = '"ts":1790000000000', id = "p_1234567890abcdef";
    expect(scanPublic(`${hash} ${ts} ${id}`)).toEqual([]);
    expect(scanPublic("Event 9761113379ed... and 9761113379ed0885690c")).toEqual([]); // the start of an id is not a phone number
    expect(scanPublic("tel9876543210").length).toBeGreaterThan(0);
  });
  test("allow-list lets a public 10-digit registration number through; forbidden strings are caught", () => {
    expect(scanPublic("Reg 1234567890", { allow: ["1234567890"] })).toEqual([]);
    expect(scanPublic("Mr Rajat Agarwal attended", { forbidden: ["Rajat Agarwal"] }).length).toBe(1);
  });
});

describe("crypto helpers", () => {
  test("Ed25519 sign/verify, wrong message and wrong key fail", async () => {
    const k = await generateSigningKey(), k2 = await generateSigningKey();
    const sig = await signMessage(k.privateKeyPkcs8, "hello");
    expect(await verifyMessage(k.publicKeyRaw, "hello", sig)).toBe(true);
    expect(await verifyMessage(k.publicKeyRaw, "hellp", sig)).toBe(false);
    expect(await verifyMessage(k2.publicKeyRaw, "hello", sig)).toBe(false);
    expect(await verifyMessage("garbage", "hello", sig)).toBe(false);
  });
  test("randomInt is unbiased: rejection sampling discards values above the limit", () => {
    let calls = 0;
    const rnd = (u: Uint32Array) => { calls++; u[0] = calls === 1 ? 0xffffffff : 7; };
    expect(randomInt(1_000_000, rnd)).toBe(7);
    expect(calls).toBe(2);
  });
  test("timing-safe compare and AES-GCM round trip", async () => {
    expect(timingSafeEqual("abc", "abc")).toBe(true);
    expect(timingSafeEqual("abc", "abd")).toBe(false);
    expect(timingSafeEqual("abc", "abcd")).toBe(false);
    const key = new Uint8Array(32).fill(7);
    const ct = await aesEncrypt(key, "secret", "aad");
    expect(await aesDecrypt(key, ct, "aad")).toBe("secret");
    await expect(aesDecrypt(key, ct, "other")).rejects.toThrow();
    expect(await sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});

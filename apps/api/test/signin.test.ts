// Sign-in for team members: the e-mail carries the 6-digit code AND a one-tap link; a lost link can be recovered with event code + e-mail, with the same answer whether or not it matches.
import { describe, expect, test } from "bun:test";
import { H, ORG, newEvent } from "./harness";

const mailBody = (h: H, to: string) => (h.raw.query("SELECT body FROM mail_outbox WHERE to_addr=? ORDER BY id DESC").get(to) as any).body as string;

describe("sign-in mail and lookup", () => {
  test("the code mail carries a one-tap link that holds event, person and the same code", async () => {
    const h = await H.make(); const e = await newEvent(h);
    const r = await h.call("POST", "/api/auth/request", { eventId: e.eid, personId: e.pid, turnstile: "test-ok" }); expect(r.status).toBe(200);
    const body = mailBody(h, ORG.email); const code = h.codeFor(ORG.email);
    expect(body).toContain(`/desk/#e=${e.eid}&p=${e.pid}&c=${code}`);
    const v = await h.call("POST", "/api/auth/verify", { eventId: e.eid, personId: e.pid, code }); expect(v.status).toBe(200); expect(v.body.token).toMatch(/^[0-9a-f]{64}$/);
  });
  test("lost link: event code + e-mail mails a fresh code; an unknown e-mail gets the same answer and no mail", async () => {
    const h = await H.make(); const e = await newEvent(h);
    const before = h.count("SELECT COUNT(*) c FROM mail_outbox");
    const ok = await h.call("POST", "/api/auth/lookup", { eventId: e.eid, email: ORG.email, turnstile: "test-ok" });
    const no = await h.call("POST", "/api/auth/lookup", { eventId: e.eid, email: "stranger@example.org", turnstile: "test-ok" });
    expect(ok.status).toBe(200); expect(no.status).toBe(200); expect(ok.body).toEqual(no.body);
    expect(h.count("SELECT COUNT(*) c FROM mail_outbox")).toBe(before + 1);
    const v = await h.call("POST", "/api/auth/verify", { eventId: e.eid, personId: e.pid, code: h.codeFor(ORG.email) }); expect(v.status).toBe(200);
  });
  test("lookup does not work across events (the e-mail index is per event) and is rate limited", async () => {
    const h = await H.make(); const a = await newEvent(h);
    const mk = await h.call("POST", "/api/events", { kind: "meeting", eventType: "agm", title: "Other society meeting", venue: "Hall", scheduledMs: h.now + 864e5 * 10, packId: "in-up-aoa", country: "IN", useRecommended: true, society: { name: "Blue Park", address: "1 Road, Lucknow", registrationNo: "REG/1", kind: "AOA" }, organizer: { name: "Other Person", email: "other.person@example.org", phone: "9000000001" }, turnstile: "test-ok" });
    const b = { eid: mk.body.eventId as string };
    const before = h.count("SELECT COUNT(*) c FROM mail_outbox");
    await h.call("POST", "/api/auth/lookup", { eventId: b.eid, email: ORG.email, turnstile: "test-ok" }); // ORG is not in event b
    expect(h.count("SELECT COUNT(*) c FROM mail_outbox")).toBe(before);
    let last = 200; for (let i = 0; i < 7; i++) last = (await h.call("POST", "/api/auth/lookup", { eventId: a.eid, email: ORG.email, turnstile: "test-ok" }, undefined, "7.7.7.7")).status;
    expect(last).toBe(429);
  });
  test("the Turnstile check applies to lookup", async () => {
    const h = await H.make(); const e = await newEvent(h);
    const r = await h.call("POST", "/api/auth/lookup", { eventId: e.eid, email: ORG.email, turnstile: "bad" }); expect(r.status).toBe(403);
  });
});

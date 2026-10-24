// Owner directive: everything is configurable. Where the society's own bye-laws differ from the law pack, the Organizer can say so (with a declaration shown on the report),
// and can add any extra rule the pack has no field for. Nothing is hidden: both appear on the public page.
import { describe, expect, test } from "bun:test";
import { H, getLog, newEvent } from "./harness";

const ca = { packId: "us-ca", country: "US" };
describe("the society's own rules", () => {
  test("a locked option can be overridden only with a declaration, and the report shows both sides", async () => {
    const h = await H.make(); const e = await newEvent(h, ca); const url = `/api/events/${e.eid}/options/override`;
    expect((await h.call("PUT", `/api/events/${e.eid}/options`, { options: { secret_ballot: false } }, e.org)).status).toBe(403); // the normal route still refuses
    expect((await h.call("POST", url, { key: "minutes", value: false, declaration: "we do not keep minutes" }, e.org)).body.error).toBe("not_locked");
    expect((await h.call("POST", url, { key: "secret_ballot", value: false, declaration: "short" }, e.org)).status).toBe(400);
    const ok = await h.call("POST", url, { key: "secret_ballot", value: false, declaration: "Our registered bye-laws, clause 14, say a show of hands." }, e.org); expect(ok.status).toBe(200);
    const ent = (await getLog(h, e.eid)).entries.find((x) => x.entry.type === "option_overridden")!.entry.payload as any; expect(ent).toMatchObject({ key: "secret_ballot", value: false }); expect(ent.lawReason).toContain("California");
    const page = (await h.call("GET", `/api/r/${e.eid}`)).text; expect(page).toContain("The society's own rules"); expect(page).toContain("clause 14"); expect(page).toContain("California");
    expect((await h.call("GET", `/api/events/${e.eid}`)).body.model.options.find((o: any) => o.key === "secret_ballot")).toMatchObject({ value: false, locked: false });
  });
  test("extra rules of three kinds can be added, changed and withdrawn; they show on the page", async () => {
    const h = await H.make(); const e = await newEvent(h); const url = `/api/events/${e.eid}/custom-rules`;
    expect((await h.call("POST", url, { title: "Guests may attend", kind: "yes_no", value: true, note: "bye-law 9" }, e.org)).status).toBe(200);
    expect((await h.call("POST", url, { title: "Maximum speaking minutes", kind: "number", value: 3 }, e.org)).status).toBe(200);
    expect((await h.call("POST", url, { title: "Dress code", kind: "text", value: "Formal" }, e.org)).body.count).toBe(3);
    expect((await h.call("POST", url, { title: "Maximum speaking minutes", kind: "number", value: "many" }, e.org)).status).toBe(400);
    await h.call("POST", url, { title: "Dress code", remove: true }, e.org);
    const page = (await h.call("GET", `/api/r/${e.eid}`)).text; expect(page).toContain("Guests may attend"); expect(page).toContain("bye-law 9"); expect(page).toContain("Maximum speaking minutes"); expect((await h.call("GET", `/api/events/${e.eid}`)).body.model.customRules.map((r: any) => r.title)).toEqual(["Guests may attend", "Maximum speaking minutes"]); // withdrawn rule is gone from the current list (it stays in the log)
    expect((await h.call("POST", url, { title: "x", kind: "text", value: "y" }, e.org)).status).toBe(400); // title too short
    expect((await h.call("POST", url, { title: "Late rule", kind: "text", value: "y" })).status).toBeGreaterThanOrEqual(401);
  });
});

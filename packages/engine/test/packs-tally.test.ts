import { describe, expect, test } from "bun:test";
import rulePacks from "../../../docs/research/rule-packs.json";
import { CUSTOM_WORLD_PACK, PackError, applyRecommended, checkNotice, loadAllPacks, loadResearchPacks, newRuleSet, parseCustomPack } from "../src/packs";
import { RuleError, missingRequired, setOption, setParam } from "../src/rules";
import { adjournedQuorumMet, anonymitySets, computeQuorum, proxyAllowed, tallyPoint, validateBallot, bp, percentText, type Flat, type PointDef } from "../src/tally";

const packs = loadAllPacks(rulePacks);
const flats = (n: number, w = (i: number) => 1): Flat[] => Array.from({ length: n }, (_, i) => ({ flatNo: `F${i + 1}`, weight: w(i), eligible: true }));
const resolution = (cls = "simple"): PointDef => ({ pointId: "pt_1", kind: "resolution", options: ["yes", "no", "abstain"], maxChoices: 1, majorityClass: cls, secret: false });

describe("rule packs", () => {
  test("the research file loads: 7 packs derive + 1 worldwide custom pack", () => {
    expect(loadResearchPacks(rulePacks).length).toBe(7);
    expect([...packs.keys()].sort()).toEqual(["custom-world", "in-generic-rwa-societies-act-1860", "in-mh-coop-society", "in-up-aoa", "us-ca", "us-fl", "us-hoa-generic", "us-tx"]);
  });
  test("a damaged research file is refused with a precise reason", () => {
    expect(() => loadResearchPacks({ _schemaVersion: 2, packs: [] })).toThrow(PackError);
    const broken = JSON.parse(JSON.stringify(rulePacks)); delete broken.packs[0].quorum;
    expect(() => loadResearchPacks(broken)).toThrow(/missing quorum/);
  });
  test("REFUSE TO START: the worldwide pack has nothing set, so required values block the start", () => {
    const rs = newRuleSet(CUSTOM_WORLD_PACK, "meeting", "agm");
    expect(missingRequired(rs)).toEqual(expect.arrayContaining(["notice.minDays", "quorum.basis", "quorum.percentBp", "option:proxy_voting"]));
    let r = setParam(rs, "notice.minDays", 7); r = setParam(r, "quorum.basis", "flats"); r = setParam(r, "quorum.percentBp", 5000); r = setOption(r, "proxy_voting", false);
    expect(missingRequired(r)).toEqual([]);
  });
  test("UP pack: proxy is 'unclear' in the research, so the Organizer MUST decide; recommended settings choose no proxy", () => {
    const rs = newRuleSet(packs.get("in-up-aoa")!, "meeting", "agm");
    expect(missingRequired(rs)).toEqual(["option:proxy_voting"]);
    expect(missingRequired(applyRecommended(rs))).toEqual([]);
    expect(applyRecommended(rs).options.proxy_voting).toBe(false);
  });
  test("turning quorum off removes the quorum requirement", () => {
    let rs = newRuleSet(CUSTOM_WORLD_PACK, "meeting", "agm"); rs = setOption(rs, "quorum_check", false);
    expect(missingRequired(rs)).not.toContain("quorum.basis");
  });
  test("LOCKED BY LAW: Maharashtra proxy cannot be ticked; California director elections keep secret ballot ON", () => {
    const mh = newRuleSet(packs.get("in-mh-coop-society")!, "meeting", "agm");
    expect(() => setOption(mh, "proxy_voting", true)).toThrow(RuleError);
    try { setOption(mh, "proxy_voting", true); } catch (e: any) { expect(e.code).toBe("locked_by_law"); expect(e.message).toContain("Election Rules"); }
    expect(setOption(mh, "proxy_voting", false).options.proxy_voting).toBe(false); // restating the locked value is fine
    const ca = newRuleSet(packs.get("us-ca")!, "election", "agm");
    expect(ca.options.secret_ballot).toBe(true); expect(() => setOption(ca, "secret_ballot", false)).toThrow();
  });
  test("elections default to a secret ballot, meetings do not (A8)", () => {
    expect(newRuleSet(packs.get("in-up-aoa")!, "election", "sgm").options.secret_ballot).toBe(true);
    expect(newRuleSet(packs.get("in-up-aoa")!, "meeting", "agm").options.secret_ballot).toBe(false);
  });
  test("notice days come from the research per meeting type, and the check is computed", () => {
    expect(packs.get("in-up-aoa")!.notice.agm).toEqual({ min: 2, max: 7 });
    expect(packs.get("in-mh-coop-society")!.notice.agm?.min).toBe(14);
    expect(packs.get("in-mh-coop-society")!.notice.sgm?.min).toBe(5);
    const rs = newRuleSet(packs.get("in-mh-coop-society")!, "meeting", "agm");
    const day = 86_400_000;
    expect(checkNotice(rs, 0, 13 * day).met).toBe(false);
    expect(checkNotice(rs, 0, 14 * day).met).toBe(true);
    expect(checkNotice(newRuleSet(CUSTOM_WORLD_PACK, "meeting", "agm"), 0, day).met).toBeNull();
  });
  test("WORLDWIDE: any society can add its own pack as data; bad packs are refused", () => {
    const p = parseCustomPack({ id: "gb-leasehold-demo", name: "Demo", jurisdiction: "GB", params: { "notice.minDays": 21, "quorum.basis": "weight", "quorum.percentBp": 2500 }, options: { proxy_voting: true } });
    expect(p.params["notice.minDays"]).toBe(21);
    expect(() => parseCustomPack({ id: "Bad Id", name: "x", jurisdiction: "x" })).toThrow(PackError);
    expect(() => parseCustomPack({ id: "ok-id", name: "x", jurisdiction: "x", params: { "quorum.percentBp": 99999 } })).toThrow(RuleError);
    expect(() => parseCustomPack({ id: "ok-id", name: "x", jurisdiction: "x", options: { nonsense: true } })).toThrow(PackError);
    expect(() => loadAllPacks(rulePacks, [{ id: "in-up-aoa", name: "dup", jurisdiction: "x" }])).toThrow(/duplicate/);
    expect(loadAllPacks(rulePacks, [{ id: "gb-demo", name: "g", jurisdiction: "GB" }]).has("gb-demo")).toBe(true);
  });
  test("parameter validation", () => {
    const rs = newRuleSet(CUSTOM_WORLD_PACK, "meeting", "agm");
    expect(() => setParam(rs, "quorum.percentBp", 0)).toThrow(); expect(() => setParam(rs, "quorum.percentBp", 5000.5)).toThrow();
    expect(() => setParam(rs, "tie.break", "coin")).toThrow(); expect(() => setParam(rs, "nope", 1)).toThrow();
  });
});

describe("quorum", () => {
  test("30% of weight: 10 flats need 3; weighted flats count by weight", () => {
    let rs = newRuleSet(packs.get("in-up-aoa")!, "meeting", "agm"); rs = applyRecommended(rs);
    const f = flats(10);
    expect(computeQuorum(rs, f, ["F1", "F2"]).met).toBe(false);
    expect(computeQuorum(rs, f, ["F1", "F2", "F3"])).toMatchObject({ required: 3, present: 3, met: true });
    const heavy = flats(10, (i) => (i === 0 ? 8 : 1)); // total 17, 30% = 5.1 -> 6
    expect(computeQuorum(rs, heavy, ["F1"])).toMatchObject({ required: 6, present: 8, met: true });
    expect(computeQuorum(rs, heavy, ["F2", "F3", "F4", "F5", "F6"]).met).toBe(false);
  });
  test("Maharashtra: two-thirds of members or 20, whichever is less (cap applies for big societies)", () => {
    const rs = applyRecommended(newRuleSet(packs.get("in-mh-coop-society")!, "meeting", "agm"));
    expect(computeQuorum(rs, flats(30), []).required).toBe(20);
    expect(computeQuorum(rs, flats(9), []).required).toBe(6);
  });
  test("'more than 20%' is strict: exactly 20% is not enough", () => {
    const rs = applyRecommended(newRuleSet(packs.get("us-hoa-generic")!, "meeting", "annual" as any));
    expect(computeQuorum(rs, flats(10), ["F1", "F2"]).met).toBe(false);
    expect(computeQuorum(rs, flats(10), ["F1", "F2", "F3"]).met).toBe(true);
  });
  test("ineligible flats are not in the base; quorum off is always met; unset quorum throws", () => {
    let rs = applyRecommended(newRuleSet(packs.get("in-up-aoa")!, "meeting", "agm"));
    const f = flats(10); f[9]!.eligible = false;
    expect(computeQuorum(rs, f, []).totalFlats).toBe(9);
    expect(computeQuorum(setOption(rs, "quorum_check", false), f, []).met).toBe(true);
    expect(() => computeQuorum(newRuleSet(CUSTOM_WORLD_PACK, "meeting", "agm"), f, [])).toThrow(/not set/);
  });
  test("adjourned quorum: none (MH) or a minimum number of flats (UP: 2)", () => {
    expect(adjournedQuorumMet(applyRecommended(newRuleSet(packs.get("in-mh-coop-society")!, "meeting", "agm")), 0)).toBe(true);
    const up = applyRecommended(newRuleSet(packs.get("in-up-aoa")!, "meeting", "agm"));
    expect(adjournedQuorumMet(up, 1)).toBe(false); expect(adjournedQuorumMet(up, 2)).toBe(true);
  });
});

describe("majority, weightage, vote %", () => {
  const rs = applyRecommended(newRuleSet(packs.get("in-up-aoa")!, "meeting", "agm"));
  const b = (c: string, w = 1) => ({ choices: [c], weight: w });
  test("simple majority of votes cast; abstentions are outside the base; tie is not carried", () => {
    expect(tallyPoint(resolution(), [b("yes"), b("yes"), b("no"), b("abstain"), b("abstain")], rs, 5, 10).outcome).toBe("carried");
    expect(tallyPoint(resolution(), [b("yes"), b("no")], rs, 2, 10).outcome).toBe("not_carried");
    expect(tallyPoint(resolution(), [b("no"), b("no"), b("yes")], rs, 3, 10).outcome).toBe("not_carried");
  });
  test("tie with a chair casting vote rule reports 'tie' for the chair to settle", () => {
    const mh = applyRecommended(newRuleSet(packs.get("in-mh-coop-society")!, "meeting", "agm"));
    expect(tallyPoint(resolution(), [b("yes"), b("no")], mh, 2, 10).outcome).toBe("tie");
  });
  test("two-thirds boundary is exact (integer maths): 2 of 3 passes, 66.6% of 1000 weight does not", () => {
    const sp = setParam(rs, "majority.special.basis", "cast");
    expect(tallyPoint(resolution("two_thirds"), [b("yes"), b("yes"), b("no")], sp, 3, 3).outcome).toBe("carried");
    expect(tallyPoint(resolution("two_thirds"), [b("yes", 666), b("no", 334)], sp, 2, 2).outcome).toBe("not_carried");
    expect(tallyPoint(resolution("three_quarters"), [b("yes", 3), b("no", 1)], sp, 2, 2).outcome).toBe("carried");
  });
  test("majority counted on TOTAL weight (e.g. 51% of all members)", () => {
    const tot = setParam(rs, "majority.simple.basis", "total");
    expect(tallyPoint(resolution(), [b("yes"), b("yes"), b("yes")], tot, 3, 10).outcome).toBe("not_carried"); // 3 of 10 total
    expect(tallyPoint(resolution(), Array.from({ length: 6 }, () => b("yes")), tot, 6, 10).outcome).toBe("carried");
  });
  test("weightage: a heavy flat outweighs several light ones, and each option shows its individual vote %", () => {
    const t = tallyPoint(resolution(), [b("yes", 500), b("no", 100), b("no", 100), b("no", 100)], rs, 4, 4);
    expect(t.outcome).toBe("carried");
    expect(t.options.find((o) => o.option === "yes")!.percentBp).toBe(6250);
    expect(percentText(6250)).toBe("62.50%"); expect(bp(1, 3)).toBe(3333);
  });
  test("ELECTION: numbers only, no winner named unless the pack says so", () => {
    const post: PointDef = { pointId: "pt_2", kind: "election_post", options: ["asha", "bimal", "chitra"], maxChoices: 2, majorityClass: "simple", secret: true };
    const ballots = [{ choices: ["asha", "bimal"], weight: 1 }, { choices: ["asha"], weight: 1 }, { choices: ["chitra"], weight: 1 }];
    const t = tallyPoint(post, ballots, rs, 3, 10);
    expect(t.outcome).toBe("counted"); expect(t.leaders).toBeNull();
    expect(t.options.map((o) => [o.option, o.count])).toEqual([["asha", 2], ["bimal", 1], ["chitra", 1]]);
    expect(tallyPoint(post, ballots, setParam(rs, "election.declareWinner", true), 3, 10).leaders).toEqual(["asha", "bimal"]);
  });
  test("small-cell rule: official/proxy split hidden when a side has fewer than 5 ballots", () => {
    const mixed = [...Array.from({ length: 6 }, () => ({ choices: ["yes"], weight: 1, kind: "official" as const })), { choices: ["no"], weight: 1, kind: "proxy" as const }];
    expect(tallyPoint(resolution(), mixed, rs, 7, 10).split).toBeNull();
    const many = [...Array.from({ length: 6 }, () => ({ choices: ["yes"], weight: 1, kind: "official" as const })), ...Array.from({ length: 5 }, () => ({ choices: ["no"], weight: 1, kind: "proxy" as const }))];
    expect(tallyPoint(resolution(), many, rs, 11, 12).split).not.toBeNull();
  });
});

describe("ballots, proxy, anonymity", () => {
  const post: PointDef = { pointId: "p", kind: "election_post", options: ["a", "b", "c"], maxChoices: 2, majorityClass: "simple", secret: true };
  test("ballot validation", () => {
    expect(validateBallot(post, ["a", "b"])).toMatchObject({ ok: true });
    expect(validateBallot(post, [])).toMatchObject({ ok: false, reason: "no_choice" });
    expect(validateBallot(post, ["a", "b", "c"])).toMatchObject({ ok: false, reason: "too_many" });
    expect(validateBallot(post, ["a", "a"])).toMatchObject({ ok: false, reason: "duplicate" });
    expect(validateBallot(post, ["z"])).toMatchObject({ ok: false, reason: "unknown_option" });
    expect(validateBallot(post, "a")).toMatchObject({ ok: false, reason: "bad_shape" });
    expect(validateBallot({ ...post, kind: "discussion" }, ["a"])).toMatchObject({ ok: false, reason: "not_votable" });
  });
  test("proxy rules: off unless ticked; holder limit", () => {
    const rs = applyRecommended(newRuleSet(packs.get("in-up-aoa")!, "meeting", "agm"));
    expect(proxyAllowed(rs, 0)).toEqual({ ok: false, reason: "proxy_off" });
    const on = setParam(setOption(rs, "proxy_voting", true), "proxy.maxPerHolder", 2);
    expect(proxyAllowed(on, 1).ok).toBe(true); expect(proxyAllowed(on, 2)).toEqual({ ok: false, reason: "holder_limit" });
  });
  test("one-flat-one-vote needs no warning; unique weights are reported as an anonymity risk", () => {
    expect(anonymitySets(flats(20))[0]).toEqual({ weight: 1, flats: 20 });
    const uneven = anonymitySets(flats(5, (i) => 100 + i));
    expect(uneven[0]!.flats).toBe(1);
  });
});

import { describe, expect, test } from "bun:test";
import { ballotInstruction, defaultBallotDesign, normalizeBallotDesign } from "../src/ballot";
import { applyRecommended, newRuleSet } from "../src/packs";
import { setParam } from "../src/rules";
import { tallyPoint, validateBallot, type PointDef } from "../src/tally";
import { PACKS } from "./helpers";

const rs = applyRecommended(newRuleSet(PACKS.get("in-up-aoa")!, "election", "sgm"));
const post = (o: Partial<PointDef> = {}): PointDef => ({ pointId: "pt_1", kind: "election_post", options: ["c_a", "c_b", "c_c", "c_d", "c_e"], labels: { c_a: "Asha", c_b: "Bimal", c_c: "Chitra", c_d: "Dev", c_e: "Esha" }, maxChoices: 1, minChoices: 1, majorityClass: "simple", secret: true, format: "single_post", seats: [], topN: null, ...o });
const ballots = (spec: Array<[string[], number?]>) => spec.map(([choices, w]) => ({ choices, weight: w ?? 1 }));

describe("ballot paper design (the Organizer chooses; mobile friendly)", () => {
  test("defaults are phone-friendly: one column, large tick boxes", () => {
    expect(defaultBallotDesign()).toMatchObject({ layout: "list", columns: 1, size: "large", showNumbers: true, order: "listed" });
    expect(normalizeBallotDesign(undefined)).toEqual(defaultBallotDesign());
  });
  test("a valid design is kept; anything unusable is refused in plain words", () => {
    expect(normalizeBallotDesign({ layout: "cards", columns: 2, order: "shuffled", accent: "#AA3300", title: "President", instruction: "One only", showNumbers: false, size: "normal" })).toMatchObject({ layout: "cards", accent: "#aa3300", order: "shuffled" });
    for (const bad of [{ layout: "carousel" }, { columns: 3 }, { accent: "red" }, { accent: "#12345" }, { order: "random" }, { size: "huge" }, { title: "x".repeat(300) }, { showNumbers: "yes" }, "string"]) expect(() => normalizeBallotDesign(bad)).toThrow();
  });
  test("the printed instruction says what a tick means (ticked = yes, not ticked = no)", () => {
    expect(ballotInstruction(1, 1)).toBe("Tick 1. A ticked box means yes (selected). A box not ticked means no (not selected).");
    expect(ballotInstruction(2, 2)).toContain("Tick exactly 2."); expect(ballotInstruction(1, 3)).toContain("Tick 1 to 3."); expect(ballotInstruction(0, 3)).toContain("up to 3 (or none)"); expect(ballotInstruction(0, 1)).toContain("at most 1");
  });
});

describe("how many candidates a voter may tick (decided by the Organizer)", () => {
  test("minimum and maximum are enforced; 0 allows a blank ballot", () => {
    const p = post({ maxChoices: 3, minChoices: 2 });
    expect(validateBallot(p, ["c_a", "c_b"])).toMatchObject({ ok: true }); expect(validateBallot(p, ["c_a", "c_b", "c_c"])).toMatchObject({ ok: true });
    expect(validateBallot(p, ["c_a"])).toMatchObject({ ok: false, reason: "too_few" }); expect(validateBallot(p, [])).toMatchObject({ ok: false, reason: "no_choice" });
    expect(validateBallot(p, ["c_a", "c_b", "c_c", "c_d"])).toMatchObject({ ok: false, reason: "too_many" });
    expect(validateBallot(post({ maxChoices: 2, minChoices: 0 }), [])).toMatchObject({ ok: true, choices: [] });
  });
});

describe("ticked = yes, not ticked = no, in the counts", () => {
  test("every option shows how many ballots ticked it and how many did not", () => {
    const t = tallyPoint(post({ maxChoices: 2 }), ballots([[["c_a", "c_b"]], [["c_a"]], [["c_c"]], [["c_a", "c_c"]]]), rs, 4, 10);
    const row = (id: string) => t.options.find((o) => o.option === id)!;
    expect([row("c_a").count, row("c_a").notSelected]).toEqual([3, 1]); expect([row("c_b").count, row("c_b").notSelected]).toEqual([1, 3]); expect([row("c_e").count, row("c_e").notSelected]).toEqual([0, 4]);
  });
});

describe("election formats", () => {
  test("ONE POST PER ELECTION: ranking with ties sharing a rank; numbers only, no winner named", () => {
    const t = tallyPoint(post(), ballots([[["c_a"]], [["c_a"]], [["c_b"]], [["c_c"]]]), rs, 4, 10);
    expect(t.ranking!.map((r) => [r.option, r.rank, r.tied])).toEqual([["c_a", 1, false], ["c_b", 2, true], ["c_c", 2, true], ["c_d", 4, true], ["c_e", 4, true]]);
    expect(t.leaders).toBeNull(); expect(t.assignment).toBeNull(); expect(t.outcome).toBe("counted");
  });
  test("ONE ELECTION FOR ALL POSTS: the highest vote gets the first post, the next the second ... and a tie is flagged for the Returning Officer", () => {
    const p = post({ format: "ranked_posts", seats: ["President", "Vice President", "Secretary"], maxChoices: 3, minChoices: 1 });
    const clear = tallyPoint(p, ballots([[["c_a", "c_b"]], [["c_a", "c_b", "c_c"]], [["c_a"]], [["c_b"]], [["c_a", "c_d"]]]), rs, 5, 10);
    expect(clear.assignment!.seats!.map((x) => [x.seat, x.option, x.tied])).toEqual([["President", "c_a", false], ["Vice President", "c_b", false], ["Secretary", "c_c", true]]); // c_c and c_d tie for third (1 each)
    expect(clear.assignment!.needsReturningOfficer).toBe(true);
    const tidy = tallyPoint(p, ballots([[["c_a", "c_b", "c_c"]], [["c_a", "c_b", "c_c"]], [["c_a", "c_b"]], [["c_a"]]]), rs, 4, 10);
    expect(tidy.assignment!.seats!.map((x) => x.option)).toEqual(["c_a", "c_b", "c_c"]); expect(tidy.assignment!.needsReturningOfficer).toBe(false);
  });
  test("SELECTION OF THE FIRST N: the top N by votes; a tie at the cut-off is flagged", () => {
    const p = post({ format: "top_n", topN: 2, maxChoices: 3 });
    const a = tallyPoint(p, ballots([[["c_a", "c_b", "c_c"]], [["c_a", "c_b"]], [["c_a"]]]), rs, 3, 10);
    expect(a.assignment).toMatchObject({ format: "top_n", selected: ["c_a", "c_b"], tieAtCutoff: false, needsReturningOfficer: false });
    const b = tallyPoint(p, ballots([[["c_a", "c_b", "c_c"]], [["c_a", "c_b", "c_c"]], [["c_a"]]]), rs, 3, 10);
    expect(b.assignment).toMatchObject({ selected: ["c_a", "c_b"], tieAtCutoff: true, needsReturningOfficer: true });
  });
  test("with the pack permission the leaders are named; weights count; nothing is assigned without any ballot", () => {
    const named = setParam(rs, "election.declareWinner", true);
    expect(tallyPoint(post(), ballots([[["c_b"], 5], [["c_a"], 2]]), named, 2, 10).leaders).toEqual(["c_b"]);
    expect(tallyPoint(post({ format: "ranked_posts", seats: ["President"] }), [], rs, 0, 10).assignment).toBeNull();
  });
});

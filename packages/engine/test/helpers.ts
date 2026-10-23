// Test scenario driver: writes real signed log entries the way the API does, so engine tests exercise the real replay/report/verify code.
import { TERMS_VERSION, termsSha256, appendEntry, generateSigningKey, replayLog, loadAllPacks, newRuleSet, applyRecommended, setOption, setParam, type Actor, type SignedEntry, type KeyMaterial, type EventState, type RuleSet, type EnginePack } from "../src";
import { agendaPayload, openPointPayload, receiptOf, resultPayload, sealBoxPayload, type BoxBallot } from "../src/commands";
import { maskEmail, maskName } from "../src/masking";
import rulePacks from "../../../docs/research/rule-packs.json";

export const PACKS = loadAllPacks(rulePacks);
let keyP: Promise<KeyMaterial> | null = null;
export const testKey = () => (keyP ??= generateSigningKey());

export const ORG = { pid: "p_org0000000000001", name: "Rajat Agarwal", email: "rajat.agarwal@example.org", phone: "9876543210" };
export const HOST = { pid: "p_host000000000001", name: "Neha Gupta", email: "neha.gupta@example.org", phone: "9123456780" };
export const OFFICER = { pid: "p_offr000000000001", name: "Sunil Verma", email: "sunil.verma@example.org", phone: "9988776655" };
export const PRIVATE_STRINGS = [ORG, HOST, OFFICER].flatMap((p) => [p.name, p.email, p.phone, ...p.name.split(" ")]);

export class Scenario {
  entries: SignedEntry[] = [];
  t = 1_790_000_000_000;
  key!: KeyMaterial;
  eid = "e".repeat(32);
  ballots = new Map<string, BoxBallot[]>();
  private constructor() {}
  static async create(opts: { pack?: string; kind?: "meeting" | "election"; flats?: number; weights?: (i: number) => number; eventType?: string; schedule?: unknown } = {}) {
    const s = new Scenario(); s.key = await testKey();
    await s.add("event_created", { pid: ORG.pid, role: "organizer" }, { kind: opts.kind ?? "meeting", eventType: opts.eventType ?? "agm", title: "Annual General Meeting 2026", venue: "Clubhouse", scheduledMs: opts.schedule ? (opts.schedule as any).start.atMs : s.t + 10 * 86_400_000, packId: opts.pack ?? "in-up-aoa", timezone: "Asia/Kolkata", society: { name: "Green Park Apartments", address: "12 Park Road, Lucknow", registrationNo: "REG/2020/118", kind: "AOA" }, createdFrom: null, ...(opts.schedule ? { schedule: opts.schedule } : {}) });
    const pack = PACKS.get(opts.pack ?? "in-up-aoa")!;
    s.rules0 = applyRecommended(newRuleSet(pack, opts.kind ?? "meeting", (opts.eventType ?? "agm") as any));
    await s.add("rules_initialized", { system: true }, { packId: s.rules0.packId, packName: pack.name, packConfidence: pack.confidence, packNeedsLawyer: pack.needsLawyer, params: s.rules0.params as any, options: s.rules0.options as any, locked: s.rules0.locked as any });
    await s.appoint(ORG, "organizer", null);
    const n = opts.flats ?? 10;
    await s.add("roll_set", { pid: ORG.pid, role: "organizer" }, { rev: 1, flats: Array.from({ length: n }, (_, i) => ({ flatNo: `A-${101 + i}`, weight: opts.weights ? opts.weights(i) : 1, eligible: true })) });
    return s;
  }
  rules0!: RuleSet;
  async add(type: string, actor: Actor, payload: Record<string, any>, tsAdd = 1000): Promise<SignedEntry> {
    this.t += tsAdd;
    const e = await appendEntry({ eid: this.eid, prev: this.entries.at(-1) ?? null, type, actor, payload, ts: this.t, privateKey: this.key.privateKeyPkcs8, scanAllow: ["REG/2020/118"] });
    this.entries.push(e); return e;
  }
  async appoint(p: { pid: string; name: string; email: string }, role: string, by: string | null, verify = true) {
    await this.add("role_appointed", by ? { pid: by, role: "organizer" } : { system: true }, { pid: p.pid, role, appointedBy: by, maskedName: maskName(p.name), maskedEmail: maskEmail(p.email) });
    if (verify) {
      await this.add("terms_accepted", { pid: p.pid, role }, { subject: "pid", ref: p.pid, version: TERMS_VERSION, termsSha256: await termsSha256() });
      await this.add("email_verified", { pid: p.pid, role }, { pid: p.pid });
    }
  }
  state(): Promise<EventState> { return replayLog(this.entries); }
  org: Actor = { pid: ORG.pid, role: "organizer" };

  async addPoint(id: string, number: string, o: Partial<{ kind: string; options: string[]; maxChoices: number; majorityClass: string; secret: boolean; title: string }> = {}) {
    await this.add("point_added", this.org, { pointId: id, number, title: o.title ?? "Approve the accounts", body: "", kind: o.kind ?? "resolution", options: o.options ?? ["yes", "no", "abstain"], maxChoices: o.maxChoices ?? 1, majorityClass: o.majorityClass ?? "simple", secret: o.secret ?? false, rev: 1 });
  }
  async pay() { await this.add("payment_state", this.org, { paymentId: "pay_1", state: "paid", amountMinor: 19900, mode: "test" }); }
  async publish() { const st = await this.state(); await this.add("agenda_published", this.org, agendaPayload(st, this.t)); }
  async start() { await this.add("event_started", this.org, {}); }
  async attend(flat: string, by = this.org, independent = false) { await this.add("attendance_marked", by, { flatNo: flat, mode: "physical", method: "visual", docType: null, docLast4: null, maskedName: "A****", by: "pid" in by ? by.pid : "", independent, evidenceHash: null, present: true }); }
  async open(pointId: string, minutes = 30) { const st = await this.state(); await this.add("point_opened", this.org, await openPointPayload(st, pointId, this.t + minutes * 60_000)); }
  private accepted = new Set<string>();
  async acceptFlat(flat: string) { if (this.accepted.has(flat)) return; this.accepted.add(flat); await this.add("terms_accepted", { flat }, { subject: "flat", ref: flat, version: TERMS_VERSION, termsSha256: await termsSha256() }); }
  async voteOpen(flat: string, pointId: string, choices: string[], kind: "official" | "proxy" = "official") { await this.acceptFlat(flat); await this.add("vote_cast_open", { flat }, { pointId, flatNo: flat, kind, choices }); }
  async voteSecret(flat: string, pointId: string, choices: string[], weight = 1, kind: "official" | "proxy" = "official") {
    await this.acceptFlat(flat);
    await this.add("vote_recorded", { flat }, { pointId, flatNo: flat, kind });
    const nonce = `n${this.entries.length}-${flat}`;
    const arr = this.ballots.get(pointId) ?? []; arr.push({ receipt: await receiptOf(pointId, choices, nonce), choices, weight, kind }); this.ballots.set(pointId, arr);
  }
  async close(pointId: string) {
    await this.add("point_closed", this.org, { pointId, by: ORG.pid });
    let st = await this.state(); const pt = st.points.get(pointId)!;
    if (pt.def.secret) { await this.add("ballot_box_sealed", { system: true }, await sealBoxPayload(st, pointId, this.ballots.get(pointId) ?? [])); st = await this.state(); }
    await this.add("result_computed", { system: true }, resultPayload(st, pointId));
  }
  async closeEvent() { await this.add("event_closed", this.org, { headSeq: this.entries.length }); }
  /** A complete small meeting: 10 flats, 8 present, one open resolution voted 6 yes / 1 no / 1 abstain. */
  static async fullMeeting(secret = false, opts: Parameters<typeof Scenario.create>[0] = {}) {
    const s = await Scenario.create(opts);
    await s.addPoint("pt_1", "1", { secret });
    await s.pay(); await s.publish(); await s.start();
    for (let i = 0; i < 8; i++) await s.attend(`A-${101 + i}`);
    await s.open("pt_1");
    const votes = ["yes", "yes", "yes", "yes", "yes", "yes", "no", "abstain"];
    for (let i = 0; i < 8; i++) await (secret ? s.voteSecret(`A-${101 + i}`, "pt_1", [votes[i]!]) : s.voteOpen(`A-${101 + i}`, "pt_1", [votes[i]!]));
    await s.close("pt_1"); await s.closeEvent();
    return s;
  }
}
export { setOption, setParam };
export type { EnginePack };

// "Checked against the rules": the numbers of an event compared with the rule set chosen for it. Pure function of the replayed log.
// Honest scope: this checks the event against the RULES ENTERED (a research pack or the society's own values). It is not a legal opinion;
// the pack's confidence and the "have a lawyer check" flag are shown with the result.
import { computeQuorum } from "./tally";
import { presentFlatNos, type EventState } from "./replay";

export type CheckStatus = "pass" | "fail" | "not_set" | "info";
export interface Check { id: string; label: string; status: CheckStatus; detail: string }
export interface Compliance { packId: string; packName: string; packConfidence: string; needsLawyer: boolean; checks: Check[]; failed: number; disclaimer: string }

export const DISCLAIMER = "This page checks the event against the rules chosen for it (the rule pack or the society's own values). It is a record and a check, not legal advice, and it does not replace the society's own bye-laws.";

export function complianceChecks(s: EventState): Compliance {
  const rs = s.rules, checks: Check[] = [];
  const add = (id: string, label: string, status: CheckStatus, detail: string) => checks.push({ id, label, status, detail });
  const pts = s.pointOrder.map((id) => s.points.get(id)!);
  const votable = pts.filter((p) => p.def.kind !== "discussion");

  if (!s.agenda) add("notice", "Notice period", "not_set", "The agenda has not been published yet.");
  else if (s.agenda.met === null) add("notice", "Notice period", "not_set", `${s.agenda.givenDays} days given; the rules in use set no minimum.`);
  else add("notice", "Notice period", s.agenda.met ? "pass" : "fail", `${s.agenda.givenDays} days given; required ${s.agenda.minDays}${s.agenda.maxDays !== null ? ` to ${s.agenda.maxDays}` : " or more"}.`);

  for (const p of votable) {
    if (!p.quorumAtOpen && rs?.options.quorum_check) { if (p.state !== "pending") add(`quorum:${p.def.pointId}`, `Quorum before point ${p.def.number}`, "not_set", "Quorum was not computed."); continue; }
    if (p.quorumAtOpen) {
      const q = p.quorumAtOpen;
      add(`quorum:${p.def.pointId}`, `Quorum before point ${p.def.number}`, q.enabled ? (q.met ? "pass" : "fail") : "info", q.enabled ? `${q.present} present, ${q.required} needed (${q.basis}).` : "Quorum check was switched off.");
    }
  }
  if (rs && !rs.options.quorum_check) add("quorum_off", "Quorum", "info", "The quorum check was switched off for this event.");

  for (const p of votable) {
    if (p.def.kind === "resolution") add(`majority:${p.def.pointId}`, `Majority class for point ${p.def.number}`, "info", `Needs ${p.def.majorityClass.replace(/_/g, " ")}${s.results.get(p.def.pointId) ? `; result: ${s.results.get(p.def.pointId)!.outcome.replace(/_/g, " ")}` : ""}.`);
  }

  // proxy ballots while proxies are off
  const proxyVotes = [...s.ledger.values()].reduce((n, m) => n + [...m.values()].filter((v) => v.kind === "proxy").length, 0);
  if (rs) add("proxy", "Proxy voting", rs.options.proxy_voting === true ? "info" : proxyVotes ? "fail" : "pass", rs.options.proxy_voting === true ? `Proxy voting was allowed; ${proxyVotes} proxy ballot(s).` : proxyVotes ? `${proxyVotes} proxy ballot(s) were cast although proxy voting was off.` : "Proxy voting was off and none was used.");

  // secret ballot where the law pack requires it
  if (rs?.locked.secret_ballot?.value) {
    const open = votable.filter((p) => p.def.kind === "election_post" && !p.def.secret);
    add("secret", "Secret ballot where the rules require it", open.length ? "fail" : "pass", open.length ? `Point(s) ${open.map((p) => p.def.number).join(", ")} were not secret ballots.` : rs.locked.secret_ballot.reason);
  }
  const elections = votable.filter((p) => p.def.kind === "election_post");
  if (elections.length && !rs?.locked.secret_ballot) add("secret_elec", "Secret ballot in elections", elections.every((p) => p.def.secret) ? "pass" : "info", elections.every((p) => p.def.secret) ? "All election posts used a secret ballot." : "Some election posts were open votes.");

  // eligibility: only eligible, present flats voted
  const eligible = new Set(s.roll.filter((f) => f.eligible).map((f) => f.flatNo));
  const bad = [...s.ledger.values()].flatMap((m) => [...m.keys()]).filter((f) => !eligible.has(f));
  add("eligibility", "Only eligible flats voted", bad.length ? "fail" : "pass", bad.length ? `Flat(s) ${[...new Set(bad)].join(", ")} voted but are not on the voting list.` : "Every ballot came from a flat on the voting list.");

  add("one_vote", "One vote per flat per point", s.problems.some((x) => /voted twice/.test(x)) ? "fail" : "pass", s.problems.some((x) => /voted twice/.test(x)) ? "A flat voted twice." : "No flat voted twice on any point.");
  add("attendance", "Attendance", "info", s.attendance.size ? `${s.attendance.size} flat(s) present; ${[...s.attendance.values()].filter((a) => a.independent).length} marked by an Attendance Officer.` : "No attendance recorded yet.");
  add("rules_frozen", "Rules unchanged once voting opened", s.problems.some((x) => /rule changed after point|frozen rules/.test(x)) ? "fail" : "pass", s.rejectedChanges.length ? `${s.rejectedChanges.length} attempt(s) to change rules after voting opened were refused.` : "No rule was changed after voting opened.");
  add("terms", "Everyone accepted the terms before acting", s.problems.some((x) => /without accepting the terms/.test(x)) ? "fail" : "pass", `${s.terms.size} acceptance(s) recorded.`);
  add("log", "Log consistent", s.problems.length ? "fail" : "pass", s.problems.length ? `${s.problems.length} problem(s) found when replaying the log.` : "The log replays without any problem.");
  void computeQuorum; void presentFlatNos;
  return { packId: rs?.packId ?? "", packName: s.packInfo.name, packConfidence: s.packInfo.confidence, needsLawyer: s.packInfo.needsLawyer, checks, failed: checks.filter((c) => c.status === "fail").length, disclaimer: DISCLAIMER };
}

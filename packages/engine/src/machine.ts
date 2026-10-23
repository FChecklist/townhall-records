// Event and point state machine + permission rules (Amendment A1/A3). Pure: takes the replayed state, answers "may this actor do this now, and if not why".
import { missingRequired } from "./rules";
import { computeQuorum, adjournedQuorumMet } from "./tally";
import { currentRoles, hasRole, presentFlatNos, type EventState, type Role } from "./replay";

export type Action =
  | "edit_setup" | "pay" | "publish_agenda" | "start" | "open_point" | "close_point" | "extend_point" | "close_event"
  | "mark_attendance" | "issue_voter_code" | "read_contacts" | "change_rules" | "erase_data";
export type Refusal = { ok: false; code: string; message: string };
export type Allowed = { ok: true };
export type Decision = Allowed | Refusal;
const no = (code: string, message: string): Refusal => ({ ok: false, code, message });
const yes: Allowed = { ok: true };

export const anyOfficer = (s: EventState) => currentRoles(s).some((p) => p.roles.includes("attendance_officer"));

/** Who may do what. Organizer and Host have the same rights. An Attendance Officer does attendance and voter codes; if NO officer exists the Organizer/Host do them (the report then says attendance was not independently verified). */
export function canDo(s: EventState, pid: string | null, action: Action, ctx: { pointId?: string; adjourned?: boolean; nowMs?: number } = {}): Decision {
  const p = pid ? s.people.get(pid) : undefined;
  if (!p) return no("unknown_person", "You are not part of this event.");
  if (!p.verified) return no("email_not_verified", "Confirm your e-mail first. Until then you cannot act."); // O11: nobody acts unverified, not even a lone Organizer
  const roles = p.roles;
  if (!roles.length) return no("no_role", "You have no role in this event.");
  const isOH = roles.includes("organizer") || roles.includes("host");
  const isOfficer = roles.includes("attendance_officer");
  if (s.status === "suspended") return no("suspended", "This event has been suspended.");
  if (s.status === "closed" && action !== "read_contacts" && action !== "erase_data") return no("event_closed", "This event is closed.");

  switch (action) {
    case "edit_setup": case "change_rules":
      if (!isOH) return no("not_allowed", "Only the Organizer or a Host can do this.");
      return yes;
    case "pay": return hasRole(s, p.pid, "organizer") ? yes : no("not_allowed", "Only the Organizer pays.");
    case "erase_data": return hasRole(s, p.pid, "organizer") ? yes : no("not_allowed", "Only the Organizer can erase the private details.");
    case "read_contacts": return isOH ? yes : no("not_allowed", "Only the Organizer or a Host can see contact details.");
    case "publish_agenda": {
      if (!isOH) return no("not_allowed", "Only the Organizer or a Host can do this.");
      if (s.status !== "setup") return no("bad_state", "The agenda is already published.");
      if (!s.paid) return no("not_paid", "Pay for this event first.");
      const miss = s.rules ? missingRequired(s.rules) : ["rules"];
      if (miss.length) return no("rules_unset", "Some required rules are not set yet: " + miss.join(", "));
      if (![...s.points.values()].length) return no("no_points", "Add at least one agenda point.");
      if (!s.roll.some((f) => f.eligible)) return no("no_flats", "Add the flats first.");
      return yes;
    }
    case "start":
      if (!isOH) return no("not_allowed", "Only the Organizer or a Host can do this.");
      return s.status === "agenda_published" ? yes : no("bad_state", "Publish the agenda before starting.");
    case "mark_attendance": case "issue_voter_code": {
      if (s.status !== "agenda_published" && s.status !== "live") return no("bad_state", "Attendance opens once the agenda is published.");
      if (isOfficer) return yes;
      if (isOH && !anyOfficer(s)) return yes;
      return no("not_allowed", anyOfficer(s) ? "An Attendance Officer does this for this event." : "Not allowed.");
    }
    case "open_point": case "close_point": case "extend_point": {
      if (!isOH) return no("not_allowed", "Only the Organizer or a Host can do this.");
      if (s.status !== "live") return no("bad_state", "Start the meeting first.");
      const pt = ctx.pointId ? s.points.get(ctx.pointId) : undefined;
      if (!pt) return no("unknown_point", "No such agenda point.");
      if (action === "open_point") {
        if (pt.state !== "pending") return no("bad_state", "This point was already opened.");
        if ([...s.points.values()].some((x) => x.state === "open")) return no("another_open", "Close the point that is open first.");
        if (s.rules && pt.def.kind !== "discussion") {
          const q = computeQuorum(s.rules, s.roll, presentFlatNos(s));
          if (q.enabled && !q.met && !(ctx.adjourned && adjournedQuorumMet(s.rules, q.presentFlats))) return no("quorum_not_met", `Quorum not met: ${q.present} of ${q.required} needed.`);
        }
        return yes;
      }
      if (pt.state !== "open") return no("bad_state", "This point is not open.");
      if (action === "extend_point") {
        if (!s.rules?.options.extensions) return no("extensions_off", "Extensions are switched off for this event.");
        const max = (s.rules.params["window.maxExtensions"] as number) ?? 0;
        if (pt.extensions >= max) return no("extension_limit", `At most ${max} extensions are allowed.`);
      }
      return yes;
    }
    case "close_event":
      if (!isOH) return no("not_allowed", "Only the Organizer or a Host can do this.");
      return s.status === "live" ? yes : no("bad_state", "The meeting is not running.");
  }
}

/** May this flat cast a ballot on this point right now? The server clock decides the window. */
export function canVote(s: EventState, flatNo: string, pointId: string, nowMs: number): Decision {
  if (s.status !== "live") return no("not_live", "Voting is not open.");
  const pt = s.points.get(pointId);
  if (!pt) return no("unknown_point", "No such agenda point.");
  if (pt.state === "closed") return no("point_closed", "Voting on this point is closed.");
  if (pt.state !== "open") return no("point_not_open", "Voting on this point has not opened.");
  if (pt.endsMs !== null && nowMs > pt.endsMs) return no("window_ended", "The voting time for this point is over.");
  const f = s.roll.find((x) => x.flatNo === flatNo);
  if (!f || !f.eligible) return no("not_eligible", "This flat is not on the voting list.");
  if (!s.attendance.has(flatNo)) return no("not_present", "You must be marked present before you can vote.");
  if (s.ledger.get(pointId)?.has(flatNo)) return no("already_voted", "This flat has already voted on this point.");
  return yes;
}

/** Rule-change guard: a change scoped to a point is refused once it opened (O1). */
export function canChangeRule(s: EventState, scope: string): Decision {
  if (s.status === "closed" || s.status === "suspended") return no("bad_state", "This event can no longer be changed.");
  if (scope !== "event") {
    const pt = s.points.get(scope);
    if (!pt) return no("unknown_point", "No such agenda point.");
    if (pt.state !== "pending") return no("frozen", "Voting on this point has opened: its rules are frozen.");
  }
  return yes;
}

/** Roll edits only before any voting. */
export function canChangeRoll(s: EventState): Decision {
  if (s.status === "live" || s.status === "closed" || s.status === "suspended" || [...s.points.values()].some((x) => x.state !== "pending")) return no("frozen", "The voter list can no longer be changed.");
  return yes;
}
export function canAmendPoint(s: EventState, pointId: string | null): Decision {
  if (s.status === "closed" || s.status === "suspended") return no("bad_state", "This event can no longer be changed.");
  if (pointId) { const pt = s.points.get(pointId); if (pt && pt.state !== "pending") return no("frozen", "Voting on this point has opened: it can no longer be changed."); }
  return yes;
}

export type { Role };

// Team Desk: who may work on which section. ONE table that the tab bar, the Home page and the greyed-out panel all read.
// It only decides what to DRAW. The server checks every action again (canDo in the engine), so a wrong guess here can never give anyone more rights.
// No DOM and no imports on purpose: it is plain data plus one pure function, so a test can run it without a browser.
// Co-host is not a separate right: it is another word for Host (see docs/spec/AMENDMENT-1-SIMPLICITY-AND-PRIVACY.md), so the word is shown next to Host.

export const ROLE_WORD = { organizer: "Organizer", host: "Host / Co-host", attendance_officer: "Attendance Monitor" };

/** Left to right in the tab bar and top to bottom on the Home page. */
export const ORDER = ["home", "setup", "day", "team", "checkin", "end", "record"];

export const SECTIONS = {
  home: {
    label: "Home", who: "Everyone on the team", open: "Back to Home",
    what: "Your whole desk on one page: what you can work on, and what belongs to someone else.",
    items: [],
  },
  setup: {
    label: "Setup", who: "Organizer or Host", open: "Go to Setup",
    what: "Get the meeting ready: dates, rules, the flat list, the agenda, helpers, payment and the notice.",
    items: ["Basics and dates", "Rules", "Flat list", "Agenda and ballot", "Helpers", "Payment", "Publish the notice"],
  },
  day: {
    label: "Voting day", who: "Organizer or Host", open: "Go to Voting day",
    what: "Run the meeting: start it, open and close each question, then close it and publish the result.",
    items: ["Start the meeting", "Open, extend and close each question", "Printed ballots", "Close and publish"],
  },
  team: {
    label: "Team", who: "Organizer or Host", open: "Go to Team",
    what: "Add the people who help: Hosts, Attendance Monitors and the committee list.",
    items: ["Add a Host or Co-host", "Add an Attendance Monitor", "Titles such as Secretary", "Committee, officers and observers"],
  },
  checkin: {
    label: "Check-in", who: "Attendance Monitor", open: "Start check-in",
    what: "Welcome people at the door: check each person, mark the flat present and give out voter codes.",
    items: ["Find the flat", "Check the person", "Photo", "Number exchange on the person's phone", "Mark present", "Voter code"],
  },
  end: {
    label: "End or move", who: "Organizer or Host", open: "Go to End or move",
    what: "End, postpone or cancel the meeting, share the payment link, answer privacy requests and e-mail the report.",
    items: ["End, stop, postpone or cancel", "Payment link", "Start again from this event", "Erase private details (Organizer only)", "Privacy requests", "E-mail the report"],
  },
  record: {
    label: "Record", who: "Everyone on the team", open: "Open the Record",
    what: "The record nobody can change: who did what, and when.",
    items: ["Time-line", "Who did what", "What was refused", "Audit trail (Organizer and Host)"],
  },
};

const STAFF_ONLY = ["setup", "day", "team", "end"];

/**
 * What may these roles work on? Returns { home|setup|day|team|checkin|end|record: { ok, why } }.
 * - Setup, Voting day, Team and End or move belong to the Organizer and Hosts.
 * - Check-in belongs to an Attendance Monitor. If NO Attendance Monitor has been appointed, the Organizer and Hosts do the check-in themselves
 *   (the engine's rule: canDo "mark_attendance"); once one is appointed, it is theirs and the Organizer and Hosts see it greyed out,
 *   UNLESS they have taken the check-in over because the Monitor is absent (model.checkinTakeover, a logged and reversible act: then it is open for them too).
 * - Home and Record are for everyone (the audit trail inside Record is limited by the Record screen itself).
 * `model` is the public event model; only model.people[].roles is read.
 */
export function rightsOf(roles, model) {
  const r = Array.isArray(roles) ? roles : [];
  const staff = r.includes("organizer") || r.includes("host");
  const monitor = r.includes("attendance_officer");
  const monitorAppointed = ((model && model.people) || []).some((p) => (p.roles || []).includes("attendance_officer"));
  const out = {};
  for (const k of ORDER) out[k] = { ok: true, why: "" };
  if (!staff) for (const k of STAFF_ONLY) out[k] = { ok: false, why: "This part belongs to the Organizer or a Host." };
  const takenOver = !!(model && model.checkinTakeover);
  if (!monitor && !(staff && (!monitorAppointed || takenOver))) out.checkin = { ok: false, why: staff ? "An Attendance Monitor does the check-in for this event. If the Monitor is absent, take it over or replace them in Team." : "This part belongs to an Attendance Monitor." };
  return out;
}

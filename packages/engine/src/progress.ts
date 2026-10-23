// Step-by-step organizer console (like the Corporate Tambola console): 8 big steps, each with an image key, one plain sentence (English + Hindi), a status and a percentage.
// The UI draws one picture per step (icon key) and one big button; nothing else is needed on the screen.
import { missingRequired } from "./rules";
import { computeQuorum } from "./tally";
import { officerCount, presentFlatNos, type EventState } from "./replay";

export type StepStatus = "done" | "current" | "todo" | "blocked" | "optional";
export interface Step {
  n: number; id: string; icon: string; optional: boolean; status: StepStatus;
  title: { en: string; hi: string }; hint: { en: string; hi: string };
  detail?: string;
}
export interface Progress { steps: Step[]; percent: number; currentId: string | null; phase: "setup" | "ready" | "voting_day" | "report"; voting?: VotingDayProgress }
export interface VotingDayProgress { flatsTotal: number; flatsPresent: number; quorumMet: boolean | null; pointsTotal: number; pointsClosed: number; openPointId: string | null; votedOnOpen: number | null }

const T = (en: string, hi: string) => ({ en, hi });

export function progressOf(s: EventState): Progress {
  const organizerVerified = [...s.people.values()].some((p) => p.roles.includes("organizer") && p.verified);
  const missing = s.rules ? missingRequired(s.rules) : ["rules"];
  const eligible = s.roll.filter((f) => f.eligible).length;
  const pts = [...s.points.values()];
  const published = s.status === "agenda_published" || s.status === "live" || s.status === "closed";
  const helpers = [...s.people.values()].filter((p) => p.roles.includes("host") || p.roles.includes("attendance_officer")).length;
  const closed = s.status === "closed";

  const raw: Array<Omit<Step, "n" | "status"> & { done: boolean; needs: string[] }> = [
    { id: "email", icon: "mail", optional: false, title: T("Confirm your e-mail", "अपना ई-मेल पक्का करें"), hint: T("We send a 6-digit code to your e-mail.", "आपके ई-मेल पर 6 अंकों का कोड भेजा जाता है।"), done: organizerVerified, needs: [] },
    { id: "rules", icon: "rules", optional: false, title: T("Choose your rules", "अपने नियम चुनें"), hint: T("Pick the country pack or type your bye-law numbers. Tick what you need.", "देश का पैक चुनें या अपने उप-नियम के अंक भरें। जो चाहिए उस पर निशान लगाएँ।"), done: missing.length === 0, needs: ["email"], detail: missing.length ? "Still needed: " + missing.join(", ") : undefined },
    { id: "flats", icon: "building", optional: false, title: T("Add the flats", "फ्लैट जोड़ें"), hint: T("Paste or upload the list of flat numbers.", "फ्लैट नंबर की सूची चिपकाएँ या अपलोड करें।"), done: eligible > 0, needs: ["email"], detail: eligible ? `${eligible} flats` : undefined },
    { id: "agenda", icon: "agenda", optional: false, title: T("Write the agenda or ballot", "एजेंडा या मतपत्र लिखें"), hint: T("One point per question. Yes / No, or a list of candidates.", "हर सवाल का एक बिंदु। हाँ / ना, या उम्मीदवारों की सूची।"), done: pts.length > 0, needs: ["email"], detail: pts.length ? `${pts.length} points` : undefined },
    { id: "helpers", icon: "people", optional: true, title: T("Add helpers (optional)", "सहायक जोड़ें (वैकल्पिक)"), hint: T("A Host or an Attendance Officer. You can skip this.", "होस्ट या उपस्थिति अधिकारी। चाहें तो छोड़ दें।"), done: helpers > 0, needs: ["email"], detail: helpers ? `${helpers} helpers` : undefined },
    { id: "pay", icon: "pay", optional: false, title: T("Pay for this event", "इस कार्यक्रम का भुगतान करें"), hint: T("One payment for this one event.", "इस एक कार्यक्रम के लिए एक भुगतान।"), done: s.paid, needs: ["email"] },
    { id: "publish", icon: "notice", optional: false, title: T("Publish the notice", "सूचना प्रकाशित करें"), hint: T("Members get the link. The notice period is checked for you.", "सदस्यों को लिंक मिलता है। सूचना की अवधि अपने आप जाँची जाती है।"), done: published, needs: ["rules", "flats", "agenda", "pay"], detail: s.agenda ? (s.agenda.met === false ? `Notice too short: ${s.agenda.givenDays} days given` : `${s.agenda.givenDays} days notice`) : undefined },
    { id: "day", icon: "vote", optional: false, title: T("Voting day, then the report", "मतदान का दिन, फिर रिपोर्ट"), hint: T("Check people in, open each point, close, and the report is ready.", "लोगों की उपस्थिति लें, हर बिंदु खोलें, बंद करें, रिपोर्ट तैयार।"), done: closed, needs: ["publish"] },
  ];
  const doneIds = new Set(raw.filter((r) => r.done).map((r) => r.id));
  let currentId: string | null = null;
  const steps: Step[] = raw.map((r, i) => {
    let status: StepStatus;
    if (r.done) status = "done";
    else if (r.needs.some((n) => !doneIds.has(n))) status = r.optional ? "optional" : "blocked";
    else if (r.optional) status = "optional";
    else status = "todo";
    return { n: i + 1, id: r.id, icon: r.icon, optional: r.optional, status, title: r.title, hint: r.hint, ...(r.detail ? { detail: r.detail } : {}) };
  });
  const firstOpen = steps.find((x) => !x.optional && x.status !== "done" && x.status !== "blocked");
  if (firstOpen) { firstOpen.status = "current"; currentId = firstOpen.id; }
  const required = steps.filter((x) => !x.optional);
  const percent = Math.round((required.filter((x) => x.status === "done").length * 100) / required.length);
  const phase: Progress["phase"] = closed ? "report" : s.status === "live" ? "voting_day" : published ? "ready" : "setup";

  let voting: VotingDayProgress | undefined;
  if (published) {
    const q = s.rules && s.rules.options.quorum_check && eligible ? (() => { try { return computeQuorum(s.rules, s.roll, presentFlatNos(s)).met; } catch { return null; } })() : null;
    const open = pts.find((p) => p.state === "open");
    voting = { flatsTotal: eligible, flatsPresent: s.attendance.size, quorumMet: q, pointsTotal: pts.length, pointsClosed: pts.filter((p) => p.state === "closed").length, openPointId: open?.def.pointId ?? null, votedOnOpen: open ? (s.ledger.get(open.def.pointId)?.size ?? 0) : null };
  }
  void officerCount;
  return { steps, percent, currentId, phase, ...(voting ? { voting } : {}) };
}

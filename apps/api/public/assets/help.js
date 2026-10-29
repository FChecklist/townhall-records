import { h, frame, app, mount, t, get, lang, errorBox, loading } from "/assets/core.js";
await frame({ active: "/help/" });

const ROLES = [
  ["organizer", "Organizer", "You set up the meeting or election and sign off the result."],
  ["host", "Host", "You run the meeting in the room and keep order."],
  ["attendance_officer", "Attendance Monitor", "You check people in at the door."],
  ["voter", "Voter", "You vote for your flat."],
  ["watching", "Resident watching", "You want to see what is happening, not vote."],
];
const WATCH = [
  { title: "Open the notice", what: "Open the event link or type the event code on the Home page.", how: "Press Open. No sign-in is needed.", where: "Home page, box called Join an event.", when: "Any time. Before, during and after the event.", why: "The notice shows the agenda, the rules and the dates, so nobody is surprised.", withWhom: "Nobody. It is public.", which: "You only see hidden forms of names, e-mails and mobile numbers." },
  { title: "Watch the count", what: "See how many flats are checked in and whether the quorum is reached.", how: "Keep the page open. It refreshes by itself.", where: "The event page.", when: "On the meeting day.", why: "Quorum decides if the meeting can make decisions.", withWhom: "The Host and the Attendance Monitors.", which: "Nothing to choose." },
  { title: "Check the result", what: "Read the published report and check that it has not been changed.", how: "Open the event page after it says Published. Use Verify a report to check the signature.", where: "The event page, and the Verify a report page.", when: "After the Organizer publishes, usually within two minutes of the count.", why: "Anyone can check the result. That is the point of the record.", withWhom: "Anyone.", which: "You may download the PDF report." },
];
const FAQ = [
  ["What if the internet drops?", "What you typed stays on the screen. Press Try again when you are back online. On voting day, tell the Attendance Monitor. A paper ballot is the back-up, and the Host can add it to the count."],
  ["What if I lose my code?", "Ask the Attendance Monitor at the desk for a new one. The old code stops working when a new one is made. For team sign-in, press Send code again on the sign-in page and use the newest e-mail."],
  ["Can I change my vote?", "No. Once you press Vote, your vote is final. This keeps the result fair for every flat. You get a receipt code to keep."],
  ["What is a secret ballot?", "Your vote is counted but nobody can see which option your flat chose. The record shows only that your flat voted. Your receipt code lets you check that your vote was counted, without showing the choice to anyone else."],
  ["How do I check the result?", "Open the event page after it is published. The report has a signature. On the Verify a report page, you can check that the report has not been changed since it was signed."],
  ["Who can see my name and phone number?", "Public pages show only a hidden form, like ******3210. The person checking you in sees the full value while checking. See the Privacy page for the full story."],
  ["Who do I write to if something is wrong?", "First the Organizer of your society. If that does not help, the Grievance Officer. Both are named below."],
];

let active = "organizer"; const cache = {}; let officer = null;
const body = h("div", { id: "guide" });
const tabs = h("div", { class: "tabs noprint", role: "tablist" });

function stepCard(n, s) {
  const rows = [["What", s.what], ["How", s.how], ["Where", s.where], ["When", s.when], ["Why", s.why], ["With whom", s.withWhom]];
  return h("div", { class: "card guide-step", "data-test": "guide-step" }, h("h3", null, h("em", null, n + 1 + "."), " ", s.title),
    h("dl", null, rows.filter(([, v]) => v).map(([k, v]) => [h("dt", null, t(k)), h("dd", null, v)])),
    s.which ? h("div", { class: "msg info", style: "margin-bottom:0" }, h("div", null, h("span", { class: "ti" }, t("Your choice")), h("span", null, s.which))) : null);
}
async function show(key) {
  active = key; drawTabs();
  const meta = ROLES.find((r) => r[0] === key);
  const head = h("div", { class: "row", style: "justify-content:space-between" }, h("div", null, h("h2", { style: "margin:0" }, t(meta[1]) + " - " + t("Townhall guide")), h("p", { class: "muted", style: "margin:4px 0 0" }, t(meta[2]))), h("button", { class: "btn ghost noprint", "data-test": "print-card", onclick: () => window.print() }, t("Print this card")));
  mount(body, head, loading());
  try {
    let steps;
    if (key === "watching") steps = WATCH.map((s) => ({ ...s, title: t(s.title), what: t(s.what), how: t(s.how), where: t(s.where), when: t(s.when), why: t(s.why), withWhom: t(s.withWhom), which: t(s.which) }));
    else steps = cache[key] || (cache[key] = (await get(`/api/guide/${key}?lang=${lang()}`)).steps);
    if (key !== active) return;
    mount(body, head, h("p", { class: "muted" }, t("Each step tells you what to do, how, where, when, why, and with whom.")), steps.map((s, i) => stepCard(i, s)));
  } catch (e) { mount(body, head, errorBox(e, () => show(key))); }
}
function drawTabs() {
  mount(tabs, ROLES.map(([k, label]) => h("button", { role: "tab", "aria-selected": k === active ? "true" : "false", class: k === active ? "on" : "", "data-test": "tab-" + k, onclick: () => show(k) }, t(label))));
}

officer = await get("/api/privacy/officer").catch(() => null);
mount(app(),
  h("div", { class: "noprint" }, h("h1", null, t("Help and guides")), h("p", { class: "muted" }, t("Pick your role. Follow the steps one by one. You can print the card and keep it at the desk."))),
  tabs, body,
  h("section", { class: "noprint", style: "margin-top:34px" }, h("h2", null, t("Questions people ask")),
    FAQ.map(([q, a]) => h("details", { class: "card", style: "padding:14px 18px;margin:10px 0" }, h("summary", { style: "font-weight:700;cursor:pointer;min-height:36px" }, t(q)), h("p", { style: "margin-bottom:0" }, t(a))))),
  h("section", { class: "card noprint", "data-test": "contact" }, h("h2", null, t("Need a person?")),
    h("p", null, t("Write to the Organizer of your society first. For anything about personal data, or if you are not satisfied:")),
    h("dl", { class: "kv" }, h("dt", null, t("Grievance Officer")), h("dd", null, officer?.grievanceOfficer || "Rajat Agarwal"),
      h("dt", null, t("E-mail")), h("dd", null, officer?.email || "(+91) 96503 97480"),
      h("dt", null, t("Privacy form")), h("dd", null, h("a", { href: "/privacy/#form" }, t("Make a privacy request")))),
    h("p", { class: "muted" }, t("We acknowledge within 3 days and answer within 30 days."))));
show("organizer");

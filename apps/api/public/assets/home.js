import { h, frame, app, mount, t, get, STAGES, shortCode, field, msg } from "/assets/core.js";
await frame({ active: "/" });
const price = await get("/api/schema").then((s) => s.priceText).catch(() => null);
const steps = [["Rules", "Your bye-laws set the rules before anyone votes."], ["Attendance", "Every person is checked in by an officer."], ["Quorum", "The count of who is present is shown live."], ["Vote", "Online on the phone, on paper, or both."], ["Count", "The count is done by the system, not by a person."], ["Publish", "A signed report is published within two minutes."]];
const find = h("input", { type: "text", id: "code", placeholder: "e.g. the event link or code", "aria-label": "Event code" });
mount(app(),
  h("section", { class: "hero" }, h("div", { class: "eyebrow", style: "color:var(--gold2)" }, t("Rules · Attendance · Quorum · Vote · Count · Publish")),
    h("h1", null, t("Order in every meeting."), h("br"), h("em", null, t("Proof in every vote."))),
    h("p", null, t("Specialized software for the meetings and elections of your society, association, HOA, AOA or RWA. Members vote on their phone or on paper, following the same steps as your real process. Every rule can be configured as needed, and every step is validated, authenticated and auditable.")),
    h("div", { class: "row" }, h("a", { class: "btn gold big", href: "/start/" }, t("Start a meeting or election")), h("a", { class: "btn ghost big", style: "color:#fff;border-color:#fff", href: "/help/" }, t("See how it works")))),
  h("div", { class: "grid g2", style: "margin-top:26px" },
    h("div", { class: "card" }, h("h3", null, t("Join an event")), h("p", { class: "muted" }, t("Voters: use the link your society sent you. Or type the event code to see the notice and the result.")),
      field(t("Event code or link"), find), h("div", { style: "margin-top:12px" }, h("button", { class: "btn", onclick: go }, t("Open")))),
    h("div", { class: "card" }, h("h3", null, t("Team members")), h("p", { class: "muted" }, t("Organizer, Host or Attendance Monitor: sign in with your e-mail. We send a 6-digit code.")), h("a", { class: "btn", href: "/desk/" }, t("Open the Team Desk")))),
  h("h2", { style: "margin-top:30px" }, t("The same order as the real room")),
  h("div", { class: "stages" }, steps.map(([a], i) => h("div", { class: i === 0 ? "cur" : "" }, h("b", null, i + 1), t(a)))),
  h("div", { class: "grid g3" }, steps.slice(0, 3).concat(steps.slice(3)).map(([a, b], i) => h("div", { class: "card" }, h("h3", null, h("em", null, i + 1 + "."), " ", t(a)), h("p", { class: "muted" }, t(b))))),
  h("h2", null, t("Simple price, paid per event")), h("p", { class: "muted" }, t("Payment is collected by IT Services by Rajat Agarwal, through Razorpay.")),
  h("div", { class: "grid g2" },
    h("div", { class: "card tint" }, h("div", { class: "eyebrow" }, t("Meeting")), h("h2", null, price ? price.india[0] : "Rs 499"), h("p", { class: "muted" }, t("One general or committee meeting. Outside India: ") + (price ? price.world[0] : "USD 5"))),
    h("div", { class: "card tint" }, h("div", { class: "eyebrow" }, t("Election")), h("h2", null, price ? price.india[1] : "Rs 1499"), h("p", { class: "muted" }, t("One election, any number of posts. Outside India: ") + (price ? price.world[1] : "USD 15")))),
  h("h2", null, t("Made for associations")),
  h("div", { class: "grid g2" },
    h("div", { class: "card" }, h("h3", null, t("Who it is for")), h("p", { class: "muted" }, t("Residents' societies, HOAs, AOAs and RWAs; professional and trade associations such as dental or medical associations; and associations of any size, from one building to a whole country or the world.")), h("p", { class: "muted" }, t("Annual general meetings, special meetings, committee meetings and elections."))),
    h("div", { class: "card" }, h("h3", null, t("What you can count on")), h("ul", { class: "muted", style: "margin:0;padding-left:20px" },
      [["A close group: only the people on your list can join, each with their own link and code."], ["Every role is yours to name: Organizer, Host or Co-host, Attendance Monitor, Chairman, General Secretary, Treasurer and more."], ["No app to install. It works on any phone."], ["Names and numbers are hidden on every public page."], ["Private details are encrypted and erased on request or after one year."], ["The complete record, with personal details hidden as ****, can be downloaded by anyone and saved as a PDF."], ["We provide software only. Your society decides the rules."]].map(([x]) => h("li", null, t(x)))))),
  h("div", { class: "card tint", style: "margin-top:16px;text-align:center" }, h("h3", null, t("Ready to start? Or talk to a person first.")),
    h("p", { class: "muted" }, t("We will help you set up your first meeting."), " ", h("a", { href: "tel:+919650397480" }, "(+91) 96503 97480")),
    h("a", { class: "btn gold big", href: "/start/" }, t("Start a meeting or election"))),
  msg("info", t("Software only."), t("Townhall is software made by IT Services by Rajat Agarwal. Your society runs its own meetings and elections and decides its own rules. How the software performs depends on many things, including your internet connection and the local laws that apply to you."), null));
function go() { const v = find.value.trim(); const m = /[0-9a-f]{32}/.exec(v.replace(/-/g, "")); if (m) location.href = "/e/" + m[0]; else find.classList.add("err"); }

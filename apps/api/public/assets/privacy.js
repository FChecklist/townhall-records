import { h, frame, app, mount, t, get, post, field, radios, errorBox, msg, busy, qs, eventIdFromUrl, shortCode, turnstileToken, store } from "/assets/core.js";
await frame({ active: "/privacy/" });

const officer = await get("/api/privacy/officer").catch(() => null);
const TBC = h("span", { class: "badge warn" }, t("to be confirmed"));
const li = (...k) => h("li", null, ...k);

// ---------------------------------------------------------------- the notice
const notice = [
  h("section", { class: "card" }, h("h2", null, t("What we collect")),
    h("ul", null,
      li(t("Society and event details you type: society name, address, flat numbers, agenda text, rules.")),
      li(t("Names, e-mail addresses and mobile numbers of the team and of flat holders, so that codes and reports can be sent and people can be checked in.")),
      li(t("What happens in an event: who was checked in, who voted (by flat number, never which option a secret ballot gave), and the time of each action.")),
      li(t("Technical details of each action: the IP address, a device number and the browser type. These are used to protect votes from misuse.")),
      li(t("Optional photos taken at check-in, if the society uses them.")))),
  h("section", { class: "card" }, h("h2", null, t("What is public and what is private")),
    h("div", { class: "grid g2" },
      h("div", { class: "msg info" }, h("div", null, h("span", { class: "ti" }, t("Public, but hidden with stars")),
        h("span", null, t("Names, e-mails and mobile numbers are only ever shown on a public page in a hidden form, for example Raj****** Aga******, ********rwal@gmail.com and ******3210. The hiding is done on the server before anything is written to the public record.")),
        h("span", null, t("Also public: flat numbers, event details, agenda, vote counts, quorum figures, rule texts and the dated log of actions.")))),
      h("div", { class: "msg ok" }, h("div", null, h("span", { class: "ti" }, t("Private and encrypted")),
        h("span", null, t("Full contact details, the name written at check-in, photos and the technical details above are stored encrypted. Only the person doing a check can see a full value, and only while doing it. Every such look is written in the log.")),
        h("span", null, t("Never stored: passcode digits, card numbers, or a ballot choice next to a person.")))))),
  h("section", { class: "card" }, h("h2", null, t("How long we keep it")),
    h("p", null, t("Private details are kept for the retention period, which is 365 days after the report is published unless your society chose a longer time. After that they are erased by destroying the event key, so the encrypted copies can no longer be opened by anyone. The destruction is itself written in the log.")),
    h("p", null, t("The public record stays, because it is how anyone can check a result. It contains only the hidden forms of personal data. Erasure removes the ability to read private data; we do not promise that every trace on every backup disappears at the same moment.")),
    h("p", { class: "muted" }, t("An Organizer can also erase one person's details earlier, with a reason."))),
  h("section", { class: "card" }, h("h2", null, t("Who handles your data for us")),
    h("div", { class: "tw" }, h("table", { class: "t", "data-test": "processors" },
      h("thead", null, h("tr", null, ["Who", "What they do", "What they can see", "Status"].map((x) => h("th", null, t(x))))),
      h("tbody", null,
        [["Cloudflare", "Runs the service, stores the encrypted data, checks that you are a person.", "Encrypted data, fingerprints, IP addresses of requests, hidden forms."],
         ["E-mail provider (Resend or the one chosen)", "Sends sign-in codes and the report.", "The recipient's e-mail address and the message."],
         ["Razorpay, through IT Services by Rajat Agarwal", "Takes payment for an event.", "The payer's name, e-mail, mobile and card or UPI details (Razorpay); the order data (IT Services)."],
         ["IT Services by Rajat Agarwal", "Keeps the central payment ledger.", "Payer e-mail and mobile, amounts, ids."]]
          .map(([a, b, c]) => h("tr", null, h("td", null, h("b", null, t(a))), h("td", null, t(b)), h("td", null, t(c)), h("td", null, TBC.cloneNode(true))))))),
    h("p", { class: "muted" }, t("We do not send personal data to any other service. Status shows where the owner still has to accept each provider's data-processing terms.")),
    h("p", { class: "muted" }, t("Where the servers are located: to be confirmed."))),
  h("section", { class: "card" }, h("h2", null, t("Your rights")),
    h("ul", null,
      li(h("b", null, t("See your data. ")), t("Ask what we hold about you for an event.")),
      li(h("b", null, t("Correct it. ")), t("Ask us to fix a wrong detail.")),
      li(h("b", null, t("Erase it. ")), t("Ask us to make your private details unreadable.")),
      li(h("b", null, t("Object or complain. ")), t("Tell us if you do not agree with how your data is used.")),
      li(h("b", null, t("Withdraw consent. ")), t("You may stop at any time. Votes already cast stay on the record, hidden.")))
    , h("p", null, t("We acknowledge a request within 3 days and answer within 30 days. Every request and every answer, including a refusal, is a dated entry in the event's log, so anyone can see that we kept the promise.")),
    h("p", { class: "muted" }, t("This service is designed around the Digital Personal Data Protection Act (India) and the GDPR. It is not legal advice, and a lawyer should read the terms before you rely on them."))),
  h("section", { class: "card" }, h("h2", null, t("Grievance Officer")),
    h("dl", { class: "kv", "data-test": "officer" },
      h("dt", null, t("Name")), h("dd", null, officer?.grievanceOfficer || "Rajat Agarwal"),
      h("dt", null, t("Contact e-mail")), h("dd", null, officer?.email ? officer.email : [t("Not published yet "), TBC.cloneNode(true)]),
      h("dt", null, t("We answer within")), h("dd", null, officer?.answerWithin || t("30 days"))),
    h("p", { class: "muted" }, t("Until an e-mail address is published, use the form below. It reaches the Organizer of the event, who answers first; if you are not satisfied, write to the Grievance Officer."))),
];

// ---------------------------------------------------------------- the request form
const fromUrl = qs("e") || eventIdFromUrl() || "";
const eventInp = h("input", { type: "text", id: "p-event", value: fromUrl, "aria-label": t("Event code"), autocomplete: "off", "data-test": "pf-event" });
const kinds = radios("pkind", [
  { value: "access", label: t("See my data"), desc: t("Tell me what you hold about me.") },
  { value: "correct", label: t("Correct my data"), desc: t("Something about me is wrong.") },
  { value: "erase", label: t("Erase my data"), desc: t("Make my private details unreadable.") },
  { value: "object", label: t("I object"), desc: t("I do not agree with how my data is used.") },
], "access");
const nameInp = h("input", { type: "text", id: "p-name", autocomplete: "name", maxlength: 80, "data-test": "pf-name" });
const mailInp = h("input", { type: "email", id: "p-mail", autocomplete: "email", "data-test": "pf-email" });
const noteInp = h("textarea", { id: "p-note", rows: 4, maxlength: 1000, "data-test": "pf-details" });
const box = h("div"); const sendBtn = h("button", { class: "btn big", "data-test": "pf-send", onclick: () => busy(sendBtn, send) }, t("Send my request"));
const whyOff = h("div", { class: "why-off", "data-test": "pf-why" });
function parseEid(v) { const m = /[0-9a-f]{32}/.exec(String(v).toLowerCase().replace(/[-\s]/g, "")); return m ? m[0] : null; }
async function send() {
  mount(box); whyOff.textContent = "";
  const eid = parseEid(eventInp.value); const name = nameInp.value.trim(), email = mailInp.value.trim(), note = noteInp.value.trim();
  const miss = !eid ? t("Type the event code (the 32 letters and numbers, or the event link).") : name.length < 2 ? t("Type your name.") : !/^\S+@\S+\.\S+$/.test(email) ? t("Type an e-mail address we can reply to.") : note.length < 3 ? t("Write a few words about your request.") : "";
  if (miss) { whyOff.textContent = miss; for (const [el, bad] of [[eventInp, !eid], [nameInp, name.length < 2], [mailInp, !/^\S+@\S+\.\S+$/.test(email)], [noteInp, note.length < 3]]) el.classList.toggle("err", bad); return; }
  for (const el of [eventInp, nameInp, mailInp, noteInp]) el.classList.remove("err");
  const k = kinds.value(); const type = k === "object" ? "grievance" : k;
  try {
    const r = await post(`/api/events/${eid}/privacy/contact`, { type, name, email, note: (k === "object" ? "Objection: " : "") + note, turnstile: await turnstileToken() });
    store.set("privacy_last", { id: r.requestId });
    mount(box, h("div", { class: "msg ok", role: "status", "data-test": "pf-done" }, h("div", null, h("span", { class: "ti" }, t("We received your request.")),
      h("span", null, t("Your reference is ") + r.requestId + t(". The date is now on the event's record.")),
      h("span", null, t("The Organizer will reply to the e-mail you gave. We acknowledge within 3 days and answer within 30 days.")),
      h("span", { class: "fix" }, t("Keep the reference. Nothing else is needed from you.")))));
    sendBtn.disabled = true; for (const el of [eventInp, nameInp, mailInp, noteInp]) el.disabled = true;
  } catch (e) { mount(box, errorBox(e, () => busy(sendBtn, send))); }
}
const form = h("section", { class: "card", id: "form" }, h("h2", null, t("Make a privacy request")),
  h("p", { class: "muted" }, t("No sign-in needed. Your details are used only to answer you.")),
  field(t("Event code or link"), eventInp, t("It is on the notice or the e-mail you got. Already filled in if you came from an event page.")),
  h("label", { class: "f" }, t("What do you want?")), kinds,
  field(t("Your name"), nameInp), field(t("Your e-mail (we reply here)"), mailInp),
  field(t("Details"), noteInp, t("Say which flat or event, and what you want. Do not type passwords or ID numbers.")),
  h("div", { style: "margin-top:16px" }, sendBtn, whyOff), box);

mount(app(),
  h("h1", null, t("Privacy, in plain words")),
  h("p", { class: "muted" }, t("Townhall is designed around DPDP (India) and GDPR. These words describe what the service does today.")),
  h("div", { class: "row" }, h("a", { class: "btn", href: "#form", "data-test": "to-form" }, t("Make a privacy request")), h("a", { class: "btn ghost", href: "/terms/" }, t("Read the terms"))),
  ...notice, form);
if (location.hash === "#form") document.getElementById("form")?.scrollIntoView();

// Builds the Townhall website (site/*.html) from one template. Run: bun scripts/make-site.ts
import { TERMS_TEXT } from "../packages/engine/src/terms";
import { writeFileSync, copyFileSync } from "node:fs";
const APP = "https://aoa-rwa.pages.dev";
const PHONE = "(+91) 96503 97480", TEL = "+919650397480";
const OWNER = "IT Services by Rajat Agarwal";
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

const page = (file: string, title: string, desc: string, body: string) => writeFileSync(`site/${file}`, `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title><meta name="description" content="${desc}"><meta name="theme-color" content="#0F2A5C">
<link rel="icon" href="/logo-mark.svg" type="image/svg+xml"><link rel="stylesheet" href="/site.css"></head><body>
<a class="skip" href="#main">Skip to the content</a>
<header class="top"><div class="wrap"><a href="/"><img src="/logo-mark.svg" alt="Townhall, home" style="height:42px"></a>
<nav aria-label="Main"><a href="/#how">How it works</a><a href="/#price">Price</a><a href="/privacy.html">Data and privacy</a><a href="/#contact">Contact</a><a class="btn gold" style="min-height:40px;padding:6px 16px;color:#091A3E" href="${APP}/start/">Start</a></nav></div></header>
<main id="main">${body}</main>
<footer><div class="wrap"><span>Townhall is software owned by ${OWNER}.</span><a href="/privacy.html">Data and privacy</a><a href="/terms.html">Terms</a><a href="${APP}/verify/">Verify a report</a><span>${OWNER}, B-1105, Shipra Krishna Vista, Indirapuram, Ghaziabad, Uttar Pradesh 201014, India. GST is not charged.</span><span>&copy; 2026 Rajat Agarwal. All rights reserved.</span></div></footer>
</body></html>
`);

const steps = [["Rules", "Your bye-laws set the rules before anyone votes."], ["Attendance", "Each person is checked in at the door."], ["Quorum", "Who is present is counted and shown live."], ["Vote", "On the phone, on paper, or both."], ["Count", "The software counts. Nobody counts by hand."], ["Publish", "The complete record is published as soon as the event ends."]];

page("index.html", "Townhall | Software for society meetings and elections", `Townhall is software by ${OWNER}. Run your meeting or election online, on paper, or both, with a complete record anyone can download.`, `
<section class="hero"><div class="wrap"><div class="kicker">Software for associations and societies</div>
<h1>Order in every meeting.<br><em>Proof in every vote.</em></h1>
<p>Townhall is simple software for your society's meeting or election. Residents vote on their phone or on paper. Every step is recorded, and anyone can download the complete record.</p>
<div class="row"><a class="btn gold" href="${APP}/start/">Start a meeting or election</a><a class="btn ghost" href="#how">See how it works</a></div></div></section>

<section class="s" id="how"><div class="wrap"><h2>Six steps, <em>the same as the real room</em></h2>
<div class="grid g3">${steps.map(([a, b], i) => `<div class="card"><span class="n">${i + 1}</span><h3>${a}</h3><p class="muted">${b}</p></div>`).join("")}</div></div></section>

<section class="s"><div class="wrap grid g2">
<div class="card"><h3>Who it is for</h3><p class="muted">Apartment owners' associations, resident welfare associations, housing societies and co-operative societies. Annual meetings, special meetings, committee meetings and elections.</p></div>
<div class="card"><h3>What you can count on</h3><ul class="tick">
<li>Residents need no account: one link, one code.</li><li>No app to install. It works on any phone.</li>
<li>Names and numbers are hidden as **** on every public page.</li>
<li>The complete record, with every detail, can be downloaded by anyone and saved as a PDF.</li>
<li>Private details are encrypted and erased on request or after one year.</li></ul></div></div></section>

<section class="s" id="price"><div class="wrap"><h2>Simple price, <em>paid per event</em></h2><div class="grid g2">
<div class="card tint"><div class="kicker" style="color:var(--goldd)">Meeting</div><div class="price">Rs 499</div><p class="muted">One general or committee meeting. Outside India: USD 5.</p></div>
<div class="card tint"><div class="kicker" style="color:var(--goldd)">Election</div><div class="price">Rs 1,499</div><p class="muted">One election, any number of posts. Outside India: USD 15.</p></div></div></div></section>

<section class="s"><div class="wrap"><div class="card"><h3>Software only</h3>
<p class="muted">We make software. Your society runs its own meetings and elections, decides its own rules, and handles any disagreement or legal matter among its members. How the software performs depends on many things, including your internet connection and the local laws that apply to you.</p></div></div></section>

<section class="s" id="contact"><div class="wrap"><div class="card tint" style="text-align:center"><h2>Ready to start? Or talk to a person first.</h2>
<p class="muted">We will help you set up your first meeting.</p><p><a href="tel:${TEL}"><b>${PHONE}</b></a></p>
<a class="btn" href="${APP}/start/">Start a meeting or election</a></div></div></section>`);

page("privacy.html", "Data and privacy | Townhall", "What Townhall keeps, for how long, and how to ask about it.", `
<div class="wrap legal"><h1>Data and <em>privacy</em></h1>
<div class="card"><h3>What you can count on</h3><ul class="tick">
<li>Names, e-mails and phone numbers are hidden as **** on every public page, PDF and log, for everyone.</li>
<li>Full details appear only on the working screen of the person doing a check, only while doing it.</li>
<li>Private details are encrypted. They are erased on request or after one year.</li>
<li>No advertising trackers. We never sell data.</li>
<li>The complete record of each event, with every detail and personal details hidden as ****, can be downloaded by anyone and saved as a PDF.</li></ul></div>
<div class="card" style="margin-top:16px"><h3>Your rights</h3><p class="muted">You can ask what we hold about you, ask us to correct or erase it, or withdraw consent. Use the form on the event page, or call ${PHONE}. We acknowledge a request within 3 days and answer within 30 days.</p></div>
<div class="card" style="margin-top:16px"><h3>Grievance Officer</h3><p class="muted">Rajat Agarwal, ${OWNER}. Phone <a href="tel:${TEL}">${PHONE}</a>.</p></div>
<p class="muted" style="margin-top:16px">Townhall is designed around India's Digital Personal Data Protection Act and the GDPR. Your society decides its own rules; we provide software only.</p></div>`);

page("terms.html", "Terms | Townhall", "The terms every person accepts before using Townhall.", `<div class="wrap legal"><h1>Terms</h1><div class="card"><p>${esc(TERMS_TEXT).replace(/\$\{[^}]*\}/g, "Townhall")}</p></div></div>`);

copyFileSync("site/logo-mark.svg", "apps/api/public/assets/icon.svg");
writeFileSync("site/robots.txt", "User-agent: *\nAllow: /\n");
writeFileSync("site/_headers", "/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  X-Frame-Options: DENY\n  Content-Security-Policy: default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'\n");
console.log("site built");

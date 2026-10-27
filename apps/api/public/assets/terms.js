import { h, frame, app, mount, t, get, errorBox, loading } from "/assets/core.js";
await frame({ active: "/terms/" });
async function draw() {
  mount(app(), loading());
  try {
    const r = await get("/api/terms");
    const paras = String(r.text).split(/\n{2,}/);
    mount(app(),
      h("div", { class: "row noprint", style: "justify-content:space-between" }, h("h1", { style: "margin:0" }, t("Terms of use")), h("button", { class: "btn ghost", "data-test": "terms-print", onclick: () => window.print() }, t("Print"))),
      h("dl", { class: "kv", style: "margin:14px 0" },
        h("dt", null, t("Version")), h("dd", { "data-test": "terms-version" }, r.version),
        h("dt", null, t("Fingerprint (SHA-256)")), h("dd", { class: "code s", "data-test": "terms-sha", style: "font-size:13px;letter-spacing:0;padding:8px 10px;text-align:left;word-break:break-all" }, r.sha256)),
      h("p", { class: "muted" }, t("The fingerprint is a short code made from the exact text below. If one letter of the terms changed, the fingerprint would change. When you tick \"I agree\", this version is written next to your action.")),
      h("section", { class: "card", "data-test": "terms-text" }, paras.map((p) => h("p", { style: "white-space:pre-wrap" }, p))));
  } catch (e) { mount(app(), h("h1", null, t("Terms of use")), errorBox(e, draw)); }
}
draw();

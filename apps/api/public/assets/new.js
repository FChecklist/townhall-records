import { h, frame, app, mount, t, get, errorBox, loading } from "/assets/core.js";
await frame({ active: "/new/" });
async function draw() {
  mount(app(), loading());
  try {
    const r = await get("/release.json");
    const notes = [...(r.notes || [])].sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.version).localeCompare(String(a.version), undefined, { numeric: true }));
    mount(app(),
      h("h1", null, t("What's new")),
      h("div", { class: "msg info", "data-test": "current-version" }, h("div", null, h("span", { class: "ti" }, t("You are on version ") + r.version), h("span", null, t("Released ") + r.date + (r.stage ? " · " + r.stage : "")))),
      notes.map((n, i) => h("section", { class: "card", "data-test": "release" }, h("div", { class: "row", style: "justify-content:space-between" }, h("h2", { style: "margin:0" }, n.title || n.version), h("span", null, i === 0 ? h("span", { class: "badge ok" }, t("Newest")) : null, " ", h("span", { class: "badge" }, "v" + n.version), " ", h("span", { class: "muted" }, n.date))),
        h("ul", null, (n.items || []).map((x) => h("li", null, x))))),
      h("p", { class: "muted" }, t("Questions? See Help.")));
  } catch (e) { mount(app(), h("h1", null, t("What's new")), errorBox(e, draw)); }
}
draw();

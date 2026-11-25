// view-peers.js: "Compare with peers" on the Company rating page.
//
// UI only. Up to three peers are kept in localStorage (rating/peers) and
// rated with comparePeers on the industry chosen in the form.

import { comparePeers, addPeer, MAX_PEERS } from "./compare.js";
import { importJson } from "./fields.js";
import { chainYears } from "./years.js";
import { SAMPLES } from "./samples.js";
import { formatPct, formatEurFull } from "../shared/format.js";
import { t } from "../shared/i18n.js";
import { h } from "../shared/dom.js";
import { bandPill, pill, GRADE_TONES } from "../shared/status.js";
import { readJson, writeJson } from "../shared/prefs.js";

const STORAGE_KEY = "rating/peers";
const STORAGE_VERSION = 1;

/** The stored peers, or none. */
export function loadPeers() {
  const saved = readJson(STORAGE_KEY);
  if (saved?.version !== STORAGE_VERSION || !Array.isArray(saved.peers)) return [];
  return saved.peers
    .filter((p) => p && typeof p.name === "string" && typeof p.values === "object" && p.values !== null && typeof p.id === "string")
    .slice(0, MAX_PEERS);
}

function savePeers(peers) {
  writeJson(STORAGE_KEY, { version: STORAGE_VERSION, peers });
}

/**
 * Builds the peer block.
 * @param {object} ctx view context (see view-results.js)
 * @param {{industryId: string, industryLabel: string, onChange: () => void, announce: (text: string) => void}} options
 *   onChange: called after the list changes, so the page re-renders the block
 */
export function renderPeers(ctx, { industryId, industryLabel, onChange, announce }) {
  let peers = loadPeers();
  const message = h("p", { class: "peers__message", role: "status" });

  const add = (peer) => {
    const result = addPeer(peers, peer);
    if (!result.added) {
      message.textContent = t(result.reason === "full" ? "rating.peers.full" : "rating.peers.duplicate", { max: MAX_PEERS });
      return;
    }
    peers = result.peers;
    savePeers(peers);
    announce(t("rating.peers.added", { name: peer.name }));
    onChange();
  };
  const remove = (id) => {
    const peer = peers.find((p) => p.id === id);
    peers = peers.filter((p) => p.id !== id);
    savePeers(peers);
    announce(t("rating.peers.removed", { name: peer?.name ?? "" }));
    onChange();
  };

  const fileInput = h("input", {
    type: "file", accept: ".json,application/json", hidden: true,
    on: {
      change: async (event) => {
        const file = event.target.files[0];
        event.target.value = "";
        if (!file) return;
        try {
          const imported = importJson(await file.text());
          const values = chainYears(imported.years.map((y, i) => ({ year: i, values: y.values })))[0];
          add({ name: imported.companyName || file.name.replace(/\.json$/i, ""), origin: "file", values });
        } catch (error) {
          message.textContent = t("rating.peers.importFailed", { reason: error.message });
        }
      },
    },
  });

  const full = peers.length >= MAX_PEERS;
  const kept = ctx.name || t("rating.peers.keptName", { year: ctx.trend.years[0].year });
  const actions = h("div", { class: "peers__actions" },
    h("button", {
      type: "button", class: "button", disabled: full,
      on: { click: () => add({ name: kept, origin: "kept", values: ctx.values }) },
    }, t("rating.peers.keep")),
    h("button", { type: "button", class: "button", disabled: full, on: { click: () => fileInput.click() } }, t("rating.peers.import")),
    fileInput,
    h("div", { class: "peers__examples", role: "group", "aria-label": t("rating.peers.examplesLabel") },
      h("span", { class: "peers__examples-label", "aria-hidden": "true" }, t("rating.peers.examplesLabel")),
      SAMPLES.map((s) => h("button", {
        type: "button", class: "chip", disabled: full, title: s.description,
        on: { click: () => add({ name: t("rating.samples.nameFictional", { name: s.name }), origin: "example", values: s.values }) },
      }, s.name, h("span", { class: "chip__tag" }, t("common.fictional"))))));

  const body = peers.length === 0
    ? h("p", { class: "peers__empty" }, t("rating.peers.empty"))
    : renderTable(comparePeers({ name: ctx.name || t("rating.page.yourCompany"), values: ctx.values }, peers, industryId), remove);

  return h("section", { class: "block", "aria-labelledby": "peers-title" },
    h("h3", { id: "peers-title", class: "block-title" }, t("rating.peers.title"), " ",
      h("span", { class: "count" }, t("rating.peers.count", { count: peers.length, max: MAX_PEERS }))),
    h("p", { class: "block-note" }, t("rating.peers.lede", { industry: industryLabel })),
    h("div", { class: "card peers" }, actions, message, body),
    h("p", { class: "learn-note learn-only" }, t("rating.peers.learn")));
}

/** The comparison table: one column per company, ★ on the highest value of each row. */
function renderTable({ columns, best }, remove) {
  const star = (key, i) => (best[key]?.includes(i)
    ? h("span", { class: "peers__best", title: t("rating.peers.best") }, "★", h("span", { class: "sr-only" }, t("rating.peers.bestSr")))
    : null);
  const ratioIds = columns[0].rating.ratios.map((r) => r.id);
  const ratioLabels = columns[0].rating.ratios.map((r) => r.label);

  const headCells = columns.map((c, i) => h("th", { scope: "col" },
    h("span", { class: "peers__name" }, c.name),
    i === 0 ? h("span", { class: "peers__tag" }, t("rating.peers.onForm")) : h("button", {
      type: "button", class: "button-quiet peers__remove",
      "aria-label": t("rating.peers.removeLabel", { name: c.name }),
      on: { click: () => remove(c.peerId) },
    }, t("rating.peers.remove"))));

  const row = (label, cells) => h("tr", {}, h("th", { scope: "row" }, label), cells);
  const invalid = (c) => h("td", { class: "peers__invalid" }, t("rating.peers.invalid"));

  return h("div", { class: "table-scroll" },
    h("table", { class: "peers__table" },
      h("caption", { class: "sr-only" }, t("rating.peers.caption")),
      h("thead", {}, h("tr", {}, h("td", {}), headCells)),
      h("tbody", {},
        row(t("rating.peers.grade"), columns.map((c, i) => (c.rating
          ? h("td", {}, h("span", { class: `peers__grade tone-${GRADE_TONES[c.rating.grade.letter]}` }, c.rating.grade.letter),
            ` ${c.rating.score}/100 `, star("score", i))
          : invalid(c)))),
        ratioIds.map((id, k) => row(ratioLabels[k], columns.map((c, i) => {
          if (!c.rating) return invalid(c);
          const r = c.rating.ratios[k];
          return h("td", {}, r.status === "ok"
            ? [h("span", { class: "peers__value" }, formatPct(r.value)), star(id, i), h("br"), bandPill(r.band)]
            : pill("none", t("common.dash"), t(r.status === "missing" ? "rating.page.missingPill" : "rating.page.notMeaningfulPill")));
        }))),
        row(t("rating.keyFigures.revenue"), columns.map((c) => (c.rating ? h("td", {}, formatEurFull(c.rating.keyFigures.revenue)) : invalid(c)))),
        row(t("rating.keyFigures.netIncome"), columns.map((c) => (c.rating ? h("td", { class: c.rating.keyFigures.netIncome < 0 ? "neg" : "" }, formatEurFull(c.rating.keyFigures.netIncome)) : invalid(c)))))));
}

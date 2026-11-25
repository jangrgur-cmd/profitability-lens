// view-path.js: the "How to reach grade X" block of the Company rating page.
//
// UI only: pathToNextGrade (src/rating/path.js) works out, for the latest
// year, the smallest move of each What if… lever that reaches the next grade
// and where the score's points are lost. "Try it" moves that lever in the
// What if… panel.

import { pathToNextGrade } from "./path.js";
import { MINUS, formatNumber } from "../shared/format.js";
import { t } from "../shared/i18n.js";
import { h } from "../shared/dom.js";

/** A lever move: "+3%", "−5%". */
function moveText(percent) {
  const text = t("format.pct", { n: formatNumber(Math.abs(percent), 0) });
  return percent > 0 ? `+${text}` : `${MINUS}${text}`;
}

/** Points with one decimal; a plus sign for "per +1 pp". */
const points = (value, plus = false) => `${plus && value > 0.05 ? "+" : ""}${formatNumber(value, 1)}`;

function leverItem(lever, next, onTry) {
  let detail;
  if (lever.status === "ok") {
    detail = [
      h("span", { class: "path__result" }, t("rating.path.leverOk", { change: moveText(lever.change), letter: lever.rating.grade.letter, score: lever.rating.score })),
      h("button", {
        type: "button", class: "button-quiet path__try",
        "aria-label": t("rating.path.tryLabel", { lever: lever.label, change: moveText(lever.change) }),
        on: { click: () => onTry({ [lever.id]: lever.change }, lever.id) },
      }, t("rating.path.try")),
    ];
  } else if (lever.status === "needs_input") {
    detail = h("span", { class: "path__off" }, t("rating.path.leverNeedsCogs"));
  } else {
    detail = h("span", { class: "path__off" }, t("rating.path.leverOut", { letter: next.letter, min: moveText(lever.min), max: moveText(lever.max) }));
  }
  return h("li", { class: `path__lever${lever.status === "ok" ? "" : " path__lever--off"}` },
    h("span", { class: "path__label" }, lever.label), h("span", { class: "path__detail" }, detail));
}

function pointsTable(path) {
  const raw = path.rating.rawScore;
  return h("div", { class: "table-scroll" },
    h("table", { class: "path__table" },
      h("caption", { class: "sr-only" }, t("rating.path.pointsCaption")),
      h("thead", {}, h("tr", {},
        ["colRatio", "colScore", "colPoints", "colMissed", "colPerPp"].map((key) => h("th", { scope: "col" }, t(`rating.path.${key}`))))),
      h("tbody", {}, path.points.map((row) => h("tr", {},
        h("th", { scope: "row" }, row.label),
        h("td", {}, formatNumber(row.score, 0)),
        h("td", {}, points(row.points)),
        h("td", {}, points(row.missed)),
        h("td", {}, points(row.perPp, true))))),
      h("tfoot", {}, h("tr", {},
        h("th", { scope: "row" }, t("rating.path.total")),
        h("td", {}),
        h("td", {}, points(raw)),
        h("td", {}, points(100 - raw)),
        h("td", {})))));
}

/**
 * Builds the block for one rating.
 * @param {object} ctx view context (see view-results.js)
 * @param {{industryId: string, onTry: (levers: Record<string, number>, leverId: string) => void}} options
 *   onTry moves the What if… panel to these levers
 * @returns {HTMLElement}
 */
export function renderPath(ctx, { industryId, onTry }) {
  const path = pathToNextGrade(ctx.values, industryId);
  const { next } = path;
  const year = ctx.trend.years[0].year;
  const reachable = next ? path.levers.some((l) => l.status === "ok") : false;

  return h("section", { class: "block path-block", "aria-labelledby": "path-title" },
    h("h3", { id: "path-title", class: "block-title" }, next ? t("rating.path.title", { letter: next.letter }) : t("rating.path.titleTop")),
    h("p", { class: "block-note" }, next
      ? t("rating.path.lede", { count: path.gap, letter: next.letter, min: next.min, year, score: path.rating.score })
      : t("rating.path.ledeTop", { year, score: path.rating.score })),
    h("div", { class: "card path" },
      next ? h("div", { class: "path__levers" },
        h("h4", { class: "path__heading" }, t("rating.path.leversTitle")),
        h("ul", { class: "path__list" }, path.levers.map((lever) => leverItem(lever, next, onTry))),
        h("p", { class: "path__note" }, reachable ? t("rating.path.leversNote") : t("rating.path.noneReach", { letter: next.letter }))) : null,
      h("div", { class: "path__points" },
        h("h4", { class: "path__heading" }, t("rating.path.pointsTitle")),
        pointsTable(path))),
    h("p", { class: "learn-note learn-only" }, t("rating.path.learn")));
}

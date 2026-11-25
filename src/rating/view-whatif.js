// view-whatif.js: the "What if…" panel of the Company rating page.
//
// UI only: four sliders (src/rating/whatif.js LEVERS); every move re-rates
// the latest year with runWhatIf and shows the new grade next to the old one.

import { LEVERS, NO_CHANGE, runWhatIf, hasChanges } from "./whatif.js";
import { MINUS, formatPct, formatPp, formatNumber, toneClass } from "../shared/format.js";
import { t } from "../shared/i18n.js";
import { h, replaceChildren } from "../shared/dom.js";
import { gradeRing } from "./view-results.js";

/** "+5%", "−10%", "0%". */
function leverText(value) {
  const text = t("format.pct", { n: formatNumber(Math.abs(value), 0) });
  if (value > 0) return `+${text}`;
  return value < 0 ? `${MINUS}${text}` : text;
}

/**
 * Builds the panel for one rating. Lever positions live in the panel and
 * start at zero; a new rating builds a new panel.
 * @param {object} ctx view context (see view-results.js)
 * @param {{industryId: string}} options
 * @returns {HTMLElement}
 */
export function renderWhatIf(ctx, { industryId }) {
  const levers = { ...NO_CHANGE };
  const output = h("div", { class: "whatif__result", "aria-live": "polite" });
  const inputs = {};

  const update = () => {
    const run = runWhatIf(ctx.values, levers, industryId);
    const changed = run.ratioChanges.filter((c) => c.change !== null && Math.abs(c.change) >= 0.00005);
    const after = run.rating;
    replaceChildren(output,
      h("div", { class: "whatif__grades" },
        h("div", { class: "whatif__grade" }, h("span", { class: "whatif__caption" }, t("rating.whatif.now")), gradeRing(run.base, { small: true })),
        h("span", { class: "whatif__arrow", "aria-hidden": "true" }, "→"),
        h("div", { class: "whatif__grade" }, h("span", { class: "whatif__caption" }, t("rating.whatif.then")), gradeRing(after, { small: true }))),
      h("p", { class: "whatif__headline" }, hasChanges(levers)
        ? t("rating.whatif.headline", {
          letter: after.grade.letter, label: after.grade.label, score: after.score,
          change: `${run.scoreChange > 0 ? "+" : ""}${formatNumber(run.scoreChange, 0)}`,
        })
        : t("rating.whatif.headlineNone")),
      changed.length > 0 ? h("ul", { class: "whatif__changes" }, changed.map((c) => h("li", {},
        h("span", {}, c.label),
        h("span", { class: "whatif__values" }, t("rating.whatif.change", { before: formatPct(c.before), after: formatPct(c.after) }), " ",
          h("span", { class: toneClass(c.change) }, `(${formatPp(c.change)})`))))) : null,
      run.noTaxAssumed && after.statement.ebt > 0 ? h("p", { class: "whatif__note" }, t("rating.whatif.noTax")) : null);
  };

  const sliders = LEVERS.map((lever) => {
    const id = `whatif-${lever.id}`;
    const disabled = lever.needs !== null && (ctx.values[lever.needs] === null || ctx.values[lever.needs] === undefined);
    const value = h("output", { class: "whatif__value", for: id }, leverText(0));
    const input = h("input", {
      id, type: "range", min: lever.min, max: lever.max, step: lever.step, value: 0,
      disabled, "aria-describedby": `${id}-help`, "aria-valuetext": leverText(0),
      on: {
        input: (event) => {
          levers[lever.id] = Number(event.target.value);
          value.textContent = leverText(levers[lever.id]);
          event.target.setAttribute("aria-valuetext", leverText(levers[lever.id]));
          update();
        },
      },
    });
    inputs[lever.id] = { input, value };
    return h("div", { class: `whatif__lever${disabled ? " whatif__lever--off" : ""}` },
      h("div", { class: "whatif__label" }, h("label", { for: id }, lever.label), value),
      input,
      h("p", { class: "whatif__help", id: `${id}-help` }, disabled ? t("rating.whatif.needsCogs") : lever.help));
  });

  const reset = h("button", {
    type: "button", class: "button-quiet",
    on: {
      click: () => {
        for (const lever of LEVERS) {
          levers[lever.id] = 0;
          inputs[lever.id].input.value = "0";
          inputs[lever.id].input.setAttribute("aria-valuetext", leverText(0));
          inputs[lever.id].value.textContent = leverText(0);
        }
        update();
      },
    },
  }, t("rating.whatif.reset"));

  update();
  return h("section", { class: "block whatif-block", "aria-labelledby": "whatif-title" },
    h("h3", { id: "whatif-title", class: "block-title" }, t("rating.whatif.title")),
    h("p", { class: "block-note" }, t("rating.whatif.lede", { year: ctx.trend.years[0].year })),
    h("div", { class: "card whatif" },
      h("div", { class: "whatif__levers" }, sliders, reset),
      output),
    h("p", { class: "learn-note learn-only" }, t("rating.whatif.learn")));
}

// scenarios-view.js: the Scenarios tab (presets, controls, comparison, bridge, most affected).

import { filterRows } from "./calc.js";
import { runScenario, marginBridge, mostAffected, makeScenario, isDefaultScenario, PRESETS, LIMITS } from "./scenarios.js";
import { createBridgeChart, updateBridgeChart } from "./charts.js";
import { formatEur, formatPct, formatCount, formatSignedPct, formatSignedEur, formatPp, toneClass } from "../../../src/shared/format.js";

const $ = (id) => document.getElementById(id);

/** Creates an element with optional class and text. */
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Step name inside a sentence: "Operator cost" → "operator cost"; "SMS → WhatsApp" stays as is. */
const inSentence = (label) => label.replace(/^([A-Z])(?=[a-z])/, (c) => c.toLowerCase());

/** Fills an element with plain text and coloured figures: parts are strings or { text, cls }. */
function setSentence(target, parts) {
  target.replaceChildren(...parts.map((p) => {
    if (typeof p === "string") return document.createTextNode(p);
    return el("span", p.cls, p.text);
  }));
}

/** Same scenario? Used to highlight the active preset. */
function sameScenario(a, b) {
  return JSON.stringify(makeScenario(a)) === JSON.stringify(makeScenario(b));
}

/**
 * @param {object} model from data.js
 * @param {(scenario: object) => void} onChange called with a new scenario when the user changes a control
 */
export function createScenariosView(model, onChange) {
  const { dimensions, countryNames, customersById } = model;
  const form = $("scenario-form");
  let chart = null;
  let current = makeScenario();

  // --- Build controls -----------------------------------------------------------

  const fill = (select, allLabel, options) => {
    select.replaceChildren(el("option", "", allLabel), ...options.map(([value, label]) => {
      const o = el("option", "", label);
      o.value = value;
      return o;
    }));
    select.options[0].value = "all";
  };
  fill(form.elements.volumeCategory, "All categories", dimensions.categories.map((c) => [c.id, c.label]));
  fill(form.elements.priceChannel, "All channels", dimensions.channels.map((c) => [c, c]));
  fill(form.elements.costChannel, "All channels", dimensions.channels.map((c) => [c, c]));
  $("cost-countries").replaceChildren(
    ...dimensions.countries.map(({ code }) => {
      const label = el("label");
      const box = el("input");
      box.type = "checkbox";
      box.name = "costCountries";
      box.value = code;
      label.append(box, countryNames[code]);
      return label;
    }),
  );

  const presetButtons = PRESETS.map((preset) => {
    const button = el("button", "preset");
    button.type = "button";
    button.append(el("strong", "", preset.label), el("span", "", preset.description));
    button.addEventListener("click", () => onChange(makeScenario(preset.scenario)));
    return { preset, button };
  });
  const reset = el("button", "preset preset--reset");
  reset.type = "button";
  reset.append(el("strong", "", "Reset scenario"), el("span", "", "Back to the baseline."));
  reset.addEventListener("click", () => onChange(makeScenario()));
  $("presets").replaceChildren(...presetButtons.map((p) => p.button), reset);

  // --- Read and write controls ---------------------------------------------------

  /** Reads the form into a scenario. Sliders hold whole percentages. */
  function readForm() {
    const pct = (name) => Number(form.elements[name].value) / 100;
    const ratio = Number(form.elements.conversionRatio.value);
    const [minRatio, maxRatio] = LIMITS.conversionRatio;
    return makeScenario({
      volumeChange: pct("volumeChange"),
      volumeCategory: form.elements.volumeCategory.value,
      migration: {
        authentication: pct("migration.authentication"),
        utility: pct("migration.utility"),
        marketing: pct("migration.marketing"),
      },
      // Keep the previous ratio while the field is empty or out of range (e.g. mid-typing).
      conversionRatio: ratio >= minRatio && ratio <= maxRatio ? ratio : current.conversionRatio,
      priceChange: pct("priceChange"),
      priceChannel: form.elements.priceChannel.value,
      costChange: pct("costChange"),
      costChannel: form.elements.costChannel.value,
      costCountries: [...form.querySelectorAll("input[name=costCountries]:checked")].map((b) => b.value),
      fxChange: pct("fxChange"),
    });
  }

  let pending = false;
  form.addEventListener("input", () => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      onChange(readForm());
    });
  });
  form.addEventListener("submit", (event) => event.preventDefault());
  // When the conversion-ratio field is left with an empty or out-of-range value,
  // show the value the model is actually using instead of the rejected one.
  form.elements.conversionRatio.addEventListener("change", (event) => {
    if (!event.target.checkValidity() || event.target.value === "") event.target.value = String(current.conversionRatio);
  });

  /** Writes a scenario into the controls and their read-outs. */
  function syncControls(s) {
    // Read-outs are green when the change raises profit and red when it lowers it
    // (higherIsBetter = false for costs); migration can go either way, so it stays neutral.
    const setRange = (name, share, outputId, text, higherIsBetter = null) => {
      form.elements[name].value = String(Math.round(share * 100));
      const out = $(outputId);
      out.textContent = text ?? formatSignedPct(share);
      out.className = higherIsBetter === null ? (share !== 0 ? "is-changed" : "") : toneClass(share, higherIsBetter);
    };
    setRange("volumeChange", s.volumeChange, "o-volume", undefined, true);
    setRange("migration.authentication", s.migration.authentication, "o-ma", formatPct(s.migration.authentication));
    setRange("migration.utility", s.migration.utility, "o-mu", formatPct(s.migration.utility));
    setRange("migration.marketing", s.migration.marketing, "o-mm", formatPct(s.migration.marketing));
    setRange("priceChange", s.priceChange, "o-price", undefined, true);
    setRange("costChange", s.costChange, "o-cost", undefined, false);
    const rate = model.ctx.eurUsd * (1 + s.fxChange);
    // A higher EUR/USD (stronger euro) makes dollar costs cheaper, so it raises profit.
    setRange("fxChange", s.fxChange, "o-fx", `${formatSignedPct(s.fxChange)} (${rate.toFixed(3)} USD per EUR)`, true);
    if (document.activeElement !== form.elements.conversionRatio) form.elements.conversionRatio.value = String(s.conversionRatio);
    form.elements.volumeCategory.value = s.volumeCategory;
    form.elements.priceChannel.value = s.priceChannel;
    form.elements.costChannel.value = s.costChannel;
    for (const box of form.querySelectorAll("input[name=costCountries]")) box.checked = s.costCountries.includes(box.value);
    for (const { preset, button } of presetButtons) button.setAttribute("aria-pressed", String(sameScenario(preset.scenario, s)));
  }

  // --- Results ----------------------------------------------------------------------

  function renderSummary(bridge, s, filters) {
    const { baseline, scenario, steps } = bridge;
    const box = $("scenario-summary");
    if (baseline.volume === 0) {
      box.textContent = "No traffic matches these filters. Widen the filters above to run a scenario.";
      return;
    }
    if (isDefaultScenario(s)) {
      box.textContent = `Pick a preset or move a slider to see how gross profit responds. With no changes, the scenario equals the baseline: ${formatEur(baseline.grossProfit)} gross profit, a ${formatPct(baseline.grossMarginPct)} margin.`;
      return;
    }
    const delta = scenario.grossProfit - baseline.grossProfit;
    const rel = baseline.grossProfit !== 0 ? delta / Math.abs(baseline.grossProfit) : null;
    const tone = toneClass(delta);
    const biggest = steps.reduce((x, y) => (Math.abs(y.delta) > Math.abs(x.delta) ? y : x));
    // Migration moves volume between SMS and WhatsApp; a channel filter hides one side of that move.
    const migrating = Object.values(s.migration).some((v) => v > 0);
    const parts = [
      `In this scenario gross profit ${delta >= 0 ? "rises" : "falls"} by `,
      { text: formatEur(Math.abs(delta)) + (rel === null ? "" : ` (${formatSignedPct(rel)})`), cls: tone },
      ` to ${formatEur(scenario.grossProfit)}, and the margin moves from `,
      { text: formatPct(baseline.grossMarginPct), cls: toneClass(baseline.grossMarginPct) },
      " to ",
      { text: formatPct(scenario.grossMarginPct), cls: toneClass(scenario.grossMarginPct) },
      ".",
    ];
    if (Math.abs(biggest.delta) > 0.5) parts.push(` The largest effect comes from ${inSentence(biggest.label)} (`, { text: formatSignedEur(biggest.delta), cls: toneClass(biggest.delta) }, ").");
    if (migrating && filters.channel !== "all") {
      parts.push(` Note: the channel filter shows only ${filters.channel}, so traffic moving between SMS and WhatsApp is only half visible; set Channel to "All channels" to see the full effect.`);
    }
    setSentence(box, parts);
  }

  function renderCompare({ baseline, scenario }) {
    const rows = [
      ["Messages", baseline.volume, scenario.volume, formatCount, true, false],
      ["Revenue", baseline.revenue, scenario.revenue, formatEur, true, false],
      ["Delivery and platform cost", baseline.totalCost, scenario.totalCost, formatEur, false, false],
      ["Gross profit", baseline.grossProfit, scenario.grossProfit, formatEur, true, false],
      ["Gross margin", baseline.grossMarginPct, scenario.grossMarginPct, formatPct, true, true],
    ];
    const table = el("table", "compare");
    const head = el("tr");
    for (const label of ["", "Baseline", "Scenario", "Change"]) {
      const th = el("th", "", label);
      th.scope = "col";
      head.append(th);
    }
    const thead = el("thead");
    thead.append(head);
    const tbody = el("tbody");
    for (const [label, b, s, format, higherIsBetter, isMargin] of rows) {
      const tr = el("tr");
      const th = el("th", "", label);
      th.scope = "row";
      let changeText = "—";
      let changeClass = "";
      if (b !== null && s !== null && Math.abs(s - b) > 1e-9) {
        const diff = s - b;
        if (isMargin) changeText = formatPp(diff);
        else if (format === formatCount) changeText = `${diff > 0 ? "+" : ""}${formatCount(diff)}`;
        else changeText = `${formatSignedEur(diff)}${b !== 0 ? ` (${formatSignedPct(diff / Math.abs(b))})` : ""}`;
        changeClass = (diff > 0) === higherIsBetter ? "up" : "down";
      }
      tr.append(th, el("td", "", format(b)), el("td", "", format(s)), el("td", changeClass, changeText));
      tbody.append(tr);
    }
    table.append(thead, tbody);
    $("scenario-compare").replaceChildren(table);
  }

  function renderAffected(containerId, items, nameOf) {
    const box = $(containerId);
    if (items.length === 0) {
      box.replaceChildren(el("p", "none", "Nothing changes with the current settings."));
      return;
    }
    const table = el("table");
    const head = el("tr");
    for (const label of ["", "Baseline", "Scenario", "Change"]) {
      const th = el("th", "", label);
      th.scope = "col";
      head.append(th);
    }
    const thead = el("thead");
    thead.append(head);
    const tbody = el("tbody");
    for (const item of items) {
      const tr = el("tr");
      const name = el("td", "", nameOf(item.key));
      tr.append(
        name,
        el("td", "", formatEur(item.baseline)),
        el("td", "", formatEur(item.scenario)),
        el("td", item.delta >= 0 ? "up" : "down", formatSignedEur(item.delta)),
      );
      tbody.append(tr);
    }
    table.append(thead, tbody);
    box.replaceChildren(table);
  }

  /**
   * @param {{filters: object, scenario: object}} state
   */
  function render({ filters, scenario }) {
    current = makeScenario(scenario);
    syncControls(current);
    const select = (rows) => filterRows(rows, filters, customersById);
    const states = runScenario(model.rows, model.ctx, current, model.rates);
    const bridge = marginBridge(states, select);
    renderSummary(bridge, current, filters);
    renderCompare(bridge);
    if (!chart) chart = createBridgeChart($("bridge-chart"));
    updateBridgeChart(chart, bridge);

    const base = states[0];
    const last = states[states.length - 1];
    const baseRows = select(base.rows);
    const lastRows = select(last.rows);
    const routes = mostAffected(baseRows, base.ctx, lastRows, last.ctx, (r) => `${r.country}|${r.channel}`);
    const customers = mostAffected(baseRows, base.ctx, lastRows, last.ctx, (r) => r.customer_id);
    renderAffected("affected-routes", routes, (key) => {
      const [country, channel] = key.split("|");
      return `${countryNames[country]} ${channel}`;
    });
    renderAffected("affected-customers", customers, (id) => customersById[id]?.name ?? id);
  }

  return { render };
}

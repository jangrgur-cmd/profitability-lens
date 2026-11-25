// charts.js: thin wrappers around Chart.js (loaded globally from lib/).
// Each chart is created once and then updated in place when filters change.

import { formatEur, formatPct, formatCount } from "../../../src/shared/format.js";
import { t } from "../../../src/shared/i18n.js";

const Chart = window.Chart;

/**
 * Reads a colour token from the CSS custom properties, resolved for the
 * current light or dark theme. Tokens are written as light-dark(…, …) in
 * theme.css, which only resolves when used as a colour, so a hidden probe
 * element applies the token and reports the computed colour.
 */
function token(name) {
  const probe = document.createElement("span");
  probe.style.display = "none";
  probe.style.color = `var(${name})`;
  document.body.append(probe);
  const colour = getComputedStyle(probe).color;
  probe.remove();
  return colour;
}

/** Colours used by the charts, read from the CSS tokens so there is one source. */
function palette() {
  return {
    ink: token("--ink"),
    surface: token("--surface"),
    muted: token("--ink-muted"),
    rule: token("--rule"),
    profit: token("--profit"),
    loss: token("--loss"),
    revenue: token("--revenue"),
    channels: {
      SMS: token("--ch-sms"),
      WhatsApp: token("--ch-whatsapp"),
      Viber: token("--ch-viber"),
      Voice: token("--ch-voice"),
    },
  };
}

/** Shared Chart.js defaults so every chart looks the same. */
function applyDefaults() {
  const p = palette();
  Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
  Chart.defaults.font.size = 13;
  Chart.defaults.color = p.muted;
  Chart.defaults.borderColor = p.rule;
  // A short, smooth transition when filters change; none for people who ask
  // their system for reduced motion. Only change individual settings: replacing
  // the whole Chart.defaults.animation object drops Chart.js's colour
  // interpolation and crashes every colour transition.
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduceMotion) {
    Chart.defaults.animation = false;
  } else {
    Chart.defaults.animation.duration = 450;
    Chart.defaults.animation.easing = "easeOutCubic";
  }
  // Round legend markers, roomy tooltips, slightly rounded bars.
  Chart.defaults.plugins.legend.labels.usePointStyle = true;
  Chart.defaults.plugins.legend.labels.pointStyle = "circle";
  Chart.defaults.plugins.legend.labels.boxWidth = 8;
  Chart.defaults.plugins.legend.labels.boxHeight = 8;
  Chart.defaults.plugins.legend.labels.padding = 16;
  Chart.defaults.plugins.tooltip.backgroundColor = p.ink;
  // Tooltip text in the page colour, so it reads on the ink background in both themes.
  Chart.defaults.plugins.tooltip.titleColor = p.surface;
  Chart.defaults.plugins.tooltip.bodyColor = p.surface;
  Chart.defaults.plugins.tooltip.footerColor = p.surface;
  Chart.defaults.plugins.tooltip.padding = 12;
  Chart.defaults.plugins.tooltip.cornerRadius = 8;
  Chart.defaults.plugins.tooltip.titleFont = { weight: "600" };
  Chart.defaults.elements.bar.borderRadius = 4;
  Chart.defaults.scale.grid.color = p.rule;
  Chart.defaults.scale.border.display = false;
}

let defaultsApplied = false;
function ensureDefaults() {
  if (!defaultsApplied) {
    applyDefaults();
    defaultsApplied = true;
  }
}

/**
 * Destroys every chart so the next render creates it again in the current
 * theme's colours. Call after the light/dark theme changes.
 */
export function restyleCharts() {
  for (const chart of Object.values(Chart.instances)) chart.destroy();
  defaultsApplied = false;
}

/**
 * The live chart on a canvas, or null. Views use it instead of keeping their
 * own reference, so a chart destroyed by restyleCharts is created again.
 * @param {HTMLCanvasElement} canvas
 */
export function chartOn(canvas) {
  return Chart.getChart(canvas) ?? null;
}

// ---------------------------------------------------------------------------
// Monthly trend: revenue and gross profit bars, gross margin line on a second axis
// ---------------------------------------------------------------------------

/** Creates the monthly trend chart (empty until updateTrendChart is called). */
export function createTrendChart(canvas) {
  ensureDefaults();
  const p = palette();
  return new Chart(canvas, {
    data: {
      labels: [],
      datasets: [
        { type: "bar", label: t("seg.charts.revenue"), data: [], backgroundColor: p.revenue, yAxisID: "eur", order: 2, borderRadius: 4 },
        { type: "bar", label: t("seg.charts.grossProfit"), data: [], backgroundColor: [], yAxisID: "eur", order: 1, borderRadius: 4 },
        {
          type: "line", label: t("seg.charts.grossMargin"), data: [], yAxisID: "pct", order: 0,
          borderColor: p.ink, backgroundColor: p.ink, borderWidth: 2, pointRadius: 3, tension: 0.25,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      scales: {
        x: { grid: { display: false } },
        eur: {
          position: "left",
          ticks: { callback: (v) => formatEur(v), maxTicksLimit: 6 },
          grid: { color: p.rule },
        },
        pct: {
          // Start at 0% so small month-to-month margin moves are not exaggerated.
          position: "right",
          beginAtZero: true,
          suggestedMax: 0.3,
          ticks: { callback: (v) => formatPct(v), maxTicksLimit: 6 },
          grid: { display: false },
        },
      },
      plugins: {
        // Keep legend in dataset order (revenue, gross profit, margin), not drawing order.
        legend: { position: "bottom", align: "start", labels: { sort: (a, b) => a.datasetIndex - b.datasetIndex } },
        tooltip: {
          callbacks: {
            label: (item) =>
              item.dataset.yAxisID === "pct"
                ? ` ${item.dataset.label}: ${formatPct(item.raw)}`
                : ` ${item.dataset.label}: ${formatEur(item.raw)}`,
          },
        },
      },
    },
  });
}

/**
 * Updates the trend chart.
 * @param {object} chart from createTrendChart
 * @param {object[]} months output of calc.monthlyTotals, already limited to the month range
 * @param {string[]} monthLabels e.g. ["Jan", "Feb", ...]
 */
export function updateTrendChart(chart, months, monthLabels) {
  const p = palette();
  const [revenue, profit, margin] = chart.data.datasets;
  chart.data.labels = months.map((m) => monthLabels[m.month - 1]);
  revenue.data = months.map((m) => m.revenue);
  profit.data = months.map((m) => m.grossProfit);
  profit.backgroundColor = months.map((m) => (m.grossProfit < 0 ? p.loss : p.profit));
  margin.data = months.map((m) => m.grossMarginPct);
  chart.update();
  chart.canvas.setAttribute("aria-label", describeTrend(months, monthLabels));
}

/** Plain-language summary of the trend chart for screen readers. */
function describeTrend(months, monthLabels) {
  const withRevenue = months.filter((m) => m.revenue > 0);
  if (withRevenue.length === 0) return t("seg.charts.trendEmpty");
  const best = withRevenue.reduce((a, b) => (b.grossProfit > a.grossProfit ? b : a));
  const worst = withRevenue.reduce((a, b) => (b.grossProfit < a.grossProfit ? b : a));
  return t("seg.charts.trendSummary", {
    bestMonth: monthLabels[best.month - 1], bestProfit: formatEur(best.grossProfit), bestMargin: formatPct(best.grossMarginPct),
    worstMonth: monthLabels[worst.month - 1], worstProfit: formatEur(worst.grossProfit), worstMargin: formatPct(worst.grossMarginPct),
  });
}

// ---------------------------------------------------------------------------
// Channel mix: three 100% bars (messages, revenue, gross profit) split by channel
// ---------------------------------------------------------------------------

/**
 * Creates the channel mix chart with one dataset per channel.
 * @param {HTMLCanvasElement} canvas
 * @param {string[]} channels channel ids
 * @param {(channel: string) => string} channelName display name of a channel
 */
export function createMixChart(canvas, channels, channelName) {
  ensureDefaults();
  const p = palette();
  return new Chart(canvas, {
    type: "bar",
    data: {
      labels: [t("seg.charts.messages"), t("seg.charts.revenue"), t("seg.charts.grossProfit")],
      datasets: channels.map((channel) => ({
        channel,
        label: channelName(channel),
        data: [],
        raw: [],
        backgroundColor: p.channels[channel],
        borderColor: p.surface,
        borderWidth: 1,
      })),
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { stacked: true, min: 0, max: 1, ticks: { callback: (v) => formatPct(v), maxTicksLimit: 5 }, grid: { color: p.rule } },
        y: { stacked: true, grid: { display: false }, ticks: { color: p.ink } },
      },
      plugins: {
        legend: { position: "bottom", align: "start" },
        tooltip: {
          callbacks: {
            label: (item) => {
              const raw = item.dataset.raw[item.dataIndex];
              const amount = item.dataIndex === 0 ? t("seg.charts.mixMessages", { count: formatCount(raw) }) : formatEur(raw);
              return ` ${t("seg.charts.mixTooltip", { channel: item.dataset.label, share: formatPct(item.raw), amount })}`;
            },
          },
        },
      },
    },
  });
}

/**
 * Updates the channel mix chart.
 * Gross profit shares are only meaningful when every channel is profitable; if
 * any channel loses money in the selection, that bar is left empty and the
 * function returns a note to show under the chart.
 * @param {object} chart from createMixChart
 * @param {object[]} channelTotals output of calc.channelTotals
 * @returns {string|null} note to display, or null
 */
export function updateMixChart(chart, channelTotals) {
  const byChannel = Object.fromEntries(channelTotals.map((c) => [c.channel, c]));
  const sum = (field) => channelTotals.reduce((s, c) => s + c[field], 0);
  const totals = { volume: sum("volume"), revenue: sum("revenue"), grossProfit: sum("grossProfit") };
  const profitShareValid = channelTotals.every((c) => c.grossProfit >= 0) && totals.grossProfit > 0;
  const share = (value, total) => (total > 0 ? value / total : 0);

  for (const dataset of chart.data.datasets) {
    const c = byChannel[dataset.channel];
    const volume = c?.volume ?? 0;
    const revenue = c?.revenue ?? 0;
    const profit = c?.grossProfit ?? 0;
    dataset.raw = [volume, revenue, profit];
    dataset.data = [
      share(volume, totals.volume),
      share(revenue, totals.revenue),
      profitShareValid ? share(profit, totals.grossProfit) : 0,
    ];
  }
  chart.update();
  const nameOf = (channel) => chart.data.datasets.find((d) => d.channel === channel)?.label ?? channel;
  chart.canvas.setAttribute("aria-label", describeMix(channelTotals, totals, profitShareValid, nameOf));

  if (channelTotals.length === 0) return t("seg.noTraffic");
  if (!profitShareValid) {
    const losers = channelTotals.filter((c) => c.grossProfit < 0).map((c) => nameOf(c.channel));
    return t("seg.charts.mixLosers", { count: losers.length, channels: losers.join(t("common.and")) });
  }
  return null;
}

// ---------------------------------------------------------------------------
// Whale curve: cumulative share of customers (x) vs cumulative share of gross profit (y)
// ---------------------------------------------------------------------------

/** Creates the whale-curve chart (empty until updateWhaleChart is called). */
export function createWhaleChart(canvas) {
  ensureDefaults();
  const p = palette();
  return new Chart(canvas, {
    type: "line",
    data: {
      datasets: [
        {
          label: t("seg.charts.whaleLine"),
          data: [],
          names: [],
          borderColor: p.profit,
          backgroundColor: p.profit,
          borderWidth: 2,
          pointRadius: 2,
          tension: 0,
        },
        {
          label: t("seg.charts.whalePeak"),
          data: [],
          showLine: false,
          pointRadius: 6,
          pointStyle: "rectRot",
          borderColor: p.ink,
          backgroundColor: p.ink,
        },
        {
          label: t("seg.charts.whaleFull"),
          data: [{ x: 0, y: 1 }, { x: 1, y: 1 }],
          borderColor: p.muted,
          borderWidth: 1,
          borderDash: [4, 4],
          pointRadius: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      parsing: false,
      scales: {
        x: {
          type: "linear", min: 0, max: 1,
          title: { display: true, text: t("seg.charts.whaleX") },
          ticks: { callback: (v) => formatPct(v), maxTicksLimit: 6 },
          grid: { display: false },
        },
        y: {
          beginAtZero: true,
          title: { display: true, text: t("seg.charts.whaleY") },
          ticks: { callback: (v) => formatPct(v), maxTicksLimit: 6 },
          grid: { color: p.rule },
        },
      },
      plugins: {
        legend: { position: "bottom", align: "start" },
        tooltip: {
          filter: (item) => item.datasetIndex < 2,
          callbacks: {
            title: (items) => items[0]?.raw.name ?? "",
            label: (item) => ` ${t("seg.charts.whaleTooltip", { customers: formatPct(item.raw.x), profit: formatPct(item.raw.y) })}`,
          },
        },
      },
    },
  });
}

/**
 * Updates the whale-curve chart.
 * @param {object} chart from createWhaleChart
 * @param {{points: object[], peak: object|null, totalGrossProfit: number}} curve output of calc.whaleCurve
 * @param {(id: string) => string} nameOf customer id → display name
 * @returns {string} plain-English summary (also used as the chart's screen-reader label)
 */
export function updateWhaleChart(chart, curve, nameOf) {
  const [line, peak] = chart.data.datasets;
  const valid = curve.points.length > 0 && curve.points.every((pt) => pt.profitSharePct !== null);
  line.data = valid
    ? [{ x: 0, y: 0, name: t("seg.charts.whaleStart") }, ...curve.points.map((pt) => ({ x: pt.customerSharePct, y: pt.profitSharePct, name: nameOf(pt.customer_id) }))]
    : [];
  peak.data = valid && curve.peak
    ? [{ x: curve.peak.customerSharePct, y: curve.peak.profitSharePct, name: t("seg.charts.whalePeakName", { name: nameOf(curve.peak.customer_id) }) }]
    : [];
  chart.update();

  let summary;
  if (curve.points.length === 0) summary = t("seg.charts.whaleNoCustomers");
  else if (!valid) summary = t("seg.charts.whaleInvalid");
  else if (curve.peak.profitSharePct > 1 + 1e-9) {
    const leaders = curve.peak.rank === 1 ? t("seg.charts.whaleLeaderOne") : t("seg.charts.whaleLeaders", { count: curve.peak.rank });
    summary = t("seg.charts.whalePeaks", { share: formatPct(curve.peak.profitSharePct), leaders });
  } else {
    summary = t("seg.charts.whaleAllProfitable");
  }
  chart.canvas.setAttribute("aria-label", t("seg.charts.whaleLabel", { summary }));
  return summary;
}

// ---------------------------------------------------------------------------
// Margin bridge: waterfall from baseline to scenario gross profit
// ---------------------------------------------------------------------------

/** Splits a label at its middle space: "Customer price" → ["Customer", "price"]. */
function twoLines(label) {
  const words = String(label).split(" ");
  if (words.length < 2) return label;
  const half = Math.ceil(words.length / 2);
  return [words.slice(0, half).join(" "), words.slice(half).join(" ")];
}

/** Creates the margin-bridge (waterfall) chart. */
export function createBridgeChart(canvas) {
  ensureDefaults();
  return new Chart(canvas, {
    type: "bar",
    data: { labels: [], datasets: [{ label: t("seg.charts.grossProfit"), data: [], deltas: [], margins: [], backgroundColor: [], borderRadius: 6, barPercentage: 0.7 }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          grid: { display: false },
          // Two-word step names go on two lines, so the labels never need tilting.
          ticks: { maxRotation: 0, autoSkip: false, callback(value) { return twoLines(this.getLabelForValue(value)); } },
        },
        y: { ticks: { callback: (v) => formatEur(v), maxTicksLimit: 6 } },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (item) => {
              const ds = item.dataset;
              const delta = ds.deltas[item.dataIndex];
              const margin = ds.margins[item.dataIndex];
              const amount = delta === null ? formatEur(item.raw[1]) : `${delta >= 0 ? "+" : ""}${formatEur(delta)}`;
              return ` ${t("seg.charts.bridgeTooltip", { amount, margin: formatPct(margin) })}`;
            },
          },
        },
      },
    },
  });
}

/**
 * Updates the bridge chart.
 * Totals (baseline, scenario) are drawn from the axis floor; each step is a
 * floating bar from the running total before it to the running total after it.
 * The axis is zoomed to the range of the running totals so that effects of a
 * few percent are visible; the caption says the axis does not start at zero.
 * @param {object} chart from createBridgeChart
 * @param {{baseline: object, scenario: object, steps: object[]}} bridge output of scenarios.marginBridge
 */
export function updateBridgeChart(chart, bridge) {
  const p = palette();
  const ds = chart.data.datasets[0];
  const labels = [t("seg.charts.bridgeBaseline")];
  const bars = [];
  const colours = [p.muted];
  const deltas = [null];
  const margins = [bridge.baseline.grossMarginPct];

  let running = bridge.baseline.grossProfit;
  const levels = [running];
  for (const step of bridge.steps) {
    labels.push(step.label);
    bars.push([running, running + step.delta]);
    running += step.delta;
    levels.push(running);
    colours.push(step.delta < 0 ? p.loss : p.profit);
    deltas.push(step.delta);
    margins.push(step.marginAfter);
  }
  labels.push(t("seg.charts.bridgeScenario"));
  colours.push(p.ink);
  deltas.push(null);
  margins.push(bridge.scenario.grossMarginPct);

  const lo = Math.min(...levels);
  const hi = Math.max(...levels);
  const pad = Math.max((hi - lo) * 0.6, Math.abs(hi) * 0.02, 1);
  const floor = lo - pad;
  chart.options.scales.y.min = floor;
  chart.options.scales.y.max = hi + pad * 0.5;

  ds.data = [[floor, bridge.baseline.grossProfit], ...bars, [floor, bridge.scenario.grossProfit]];
  ds.backgroundColor = colours;
  ds.deltas = deltas;
  ds.margins = margins;
  chart.data.labels = labels;
  chart.update();

  const parts = bridge.steps.filter((s) => Math.abs(s.delta) > 0.5)
    .map((s) => t("seg.charts.bridgeEffect", { step: s.label, amount: `${s.delta >= 0 ? "+" : ""}${formatEur(s.delta)}` }));
  chart.canvas.setAttribute(
    "aria-label",
    t("seg.charts.bridgeSummary", { baseline: formatEur(bridge.baseline.grossProfit), scenario: formatEur(bridge.scenario.grossProfit) }) +
      (parts.length ? t("seg.charts.bridgeEffects", { effects: parts.join("; ") }) : t("seg.charts.bridgeNoEffects")),
  );
}

/** Plain-language summary of the channel mix chart for screen readers. */
function describeMix(channelTotals, totals, profitShareValid, nameOf) {
  if (channelTotals.length === 0) return t("seg.charts.mixEmpty");
  const parts = channelTotals.map((c) => {
    const profitPart = profitShareValid ? t("seg.charts.mixProfitPart", { profit: formatPct(c.grossProfit / totals.grossProfit) }) : "";
    return t("seg.charts.mixPart", {
      channel: nameOf(c.channel), messages: formatPct(c.volume / totals.volume), revenue: formatPct(c.revenue / totals.revenue),
    }) + profitPart;
  });
  return t("seg.charts.mixSummary", { parts: parts.join("; ") });
}

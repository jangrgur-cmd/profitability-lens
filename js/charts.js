// charts.js: thin wrappers around Chart.js (loaded globally from lib/).
// Each chart is created once and then updated in place when filters change.

import { formatEur, formatPct, formatCount } from "./format.js";

const Chart = window.Chart;

/** Reads a colour token from the CSS custom properties. */
function token(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** Colours used by the charts, read once from style.css so there is one source. */
function palette() {
  return {
    ink: token("--ink"),
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
  Chart.defaults.font.size = 12;
  Chart.defaults.color = p.muted;
  Chart.defaults.borderColor = p.rule;
  // No animation: figures should change instantly when filters change, and
  // Chart.js animations crash when a value changes type between updates.
  Chart.defaults.animation = false;
  Chart.defaults.plugins.legend.labels.boxWidth = 10;
  Chart.defaults.plugins.legend.labels.boxHeight = 10;
  Chart.defaults.plugins.tooltip.backgroundColor = p.ink;
  Chart.defaults.plugins.tooltip.padding = 10;
  Chart.defaults.plugins.tooltip.cornerRadius = 3;
}

let defaultsApplied = false;
function ensureDefaults() {
  if (!defaultsApplied) {
    applyDefaults();
    defaultsApplied = true;
  }
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
        { type: "bar", label: "Revenue", data: [], backgroundColor: p.revenue, yAxisID: "eur", order: 2, borderRadius: 2 },
        { type: "bar", label: "Gross profit", data: [], backgroundColor: [], yAxisID: "eur", order: 1, borderRadius: 2 },
        {
          type: "line", label: "Gross margin", data: [], yAxisID: "pct", order: 0,
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
          // Start at 0 % so small month-to-month margin moves are not exaggerated.
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

/** Plain-English summary of the trend chart for screen readers. */
function describeTrend(months, monthLabels) {
  const withRevenue = months.filter((m) => m.revenue > 0);
  if (withRevenue.length === 0) return "Monthly trend chart: no traffic in the selected filters.";
  const best = withRevenue.reduce((a, b) => (b.grossProfit > a.grossProfit ? b : a));
  const worst = withRevenue.reduce((a, b) => (b.grossProfit < a.grossProfit ? b : a));
  return (
    `Monthly revenue and gross profit bar chart with gross margin line. ` +
    `Highest gross profit in ${monthLabels[best.month - 1]} (${formatEur(best.grossProfit)}, margin ${formatPct(best.grossMarginPct)}); ` +
    `lowest in ${monthLabels[worst.month - 1]} (${formatEur(worst.grossProfit)}, margin ${formatPct(worst.grossMarginPct)}).`
  );
}

// ---------------------------------------------------------------------------
// Channel mix: three 100 % bars (messages, revenue, gross profit) split by channel
// ---------------------------------------------------------------------------

const MIX_ROWS = ["Messages", "Revenue", "Gross profit"];

/** Creates the channel mix chart with one dataset per channel. */
export function createMixChart(canvas, channels) {
  ensureDefaults();
  const p = palette();
  return new Chart(canvas, {
    type: "bar",
    data: {
      labels: MIX_ROWS,
      datasets: channels.map((channel) => ({
        label: channel,
        data: [],
        raw: [],
        backgroundColor: p.channels[channel],
        borderColor: "#ffffff",
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
              const amount = item.dataIndex === 0 ? `${formatCount(raw)} messages` : formatEur(raw);
              return ` ${item.dataset.label}: ${formatPct(item.raw)} (${amount})`;
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
    const c = byChannel[dataset.label];
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
  chart.canvas.setAttribute("aria-label", describeMix(channelTotals, totals, profitShareValid));

  if (channelTotals.length === 0) return "No traffic matches these filters.";
  if (!profitShareValid) {
    const losers = channelTotals.filter((c) => c.grossProfit < 0).map((c) => c.channel);
    return `Gross profit shares are not shown: ${losers.join(" and ")} ${losers.length === 1 ? "is" : "are"} loss-making in this selection.`;
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
          label: "Cumulative gross profit",
          data: [],
          names: [],
          borderColor: p.profit,
          backgroundColor: p.profit,
          borderWidth: 2,
          pointRadius: 2,
          tension: 0,
        },
        {
          label: "Peak",
          data: [],
          showLine: false,
          pointRadius: 6,
          pointStyle: "rectRot",
          borderColor: p.ink,
          backgroundColor: p.ink,
        },
        {
          label: "100 % of gross profit",
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
          title: { display: true, text: "Share of customers (most profitable first)" },
          ticks: { callback: (v) => formatPct(v), maxTicksLimit: 6 },
          grid: { display: false },
        },
        y: {
          beginAtZero: true,
          title: { display: true, text: "Share of gross profit" },
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
            label: (item) => ` ${formatPct(item.raw.x)} of customers earn ${formatPct(item.raw.y)} of gross profit`,
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
    ? [{ x: 0, y: 0, name: "Start" }, ...curve.points.map((pt) => ({ x: pt.customerSharePct, y: pt.profitSharePct, name: nameOf(pt.customer_id) }))]
    : [];
  peak.data = valid && curve.peak
    ? [{ x: curve.peak.customerSharePct, y: curve.peak.profitSharePct, name: `Peak: ${nameOf(curve.peak.customer_id)}` }]
    : [];
  chart.update();

  let summary;
  if (curve.points.length === 0) summary = "No customers match these filters.";
  else if (!valid) summary = "Total gross profit in this selection is zero or negative, so profit shares cannot be shown.";
  else if (curve.peak.profitSharePct > 1 + 1e-9) {
    summary = `The curve peaks at ${formatPct(curve.peak.profitSharePct)} of gross profit after the ${curve.peak.rank} most profitable customers; the remaining customers lose money and give back the difference.`;
  } else {
    summary = "Every customer in this selection is profitable, so the curve rises steadily to 100 % without overshooting.";
  }
  chart.canvas.setAttribute("aria-label", `Whale curve chart. ${summary}`);
  return summary;
}

/** Plain-English summary of the channel mix chart for screen readers. */
function describeMix(channelTotals, totals, profitShareValid) {
  if (channelTotals.length === 0) return "Channel mix chart: no traffic in the selected filters.";
  const parts = channelTotals.map((c) => {
    const profitPart = profitShareValid ? `, ${formatPct(c.grossProfit / totals.grossProfit)} of gross profit` : "";
    return `${c.channel}: ${formatPct(c.volume / totals.volume)} of messages, ${formatPct(c.revenue / totals.revenue)} of revenue${profitPart}`;
  });
  return `Channel mix stacked bar chart. ${parts.join("; ")}.`;
}

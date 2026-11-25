// view-results.js: the result blocks of the Company rating page (verdict, key
// figures, flags, ratios, trend, DuPont, method, printed inputs).
//
// UI only: each function takes a view context and returns a DOM node; every
// number and sentence comes from the pure modules and every other text from
// the language files.
//
// The view context:
//   { rating, values, name, source, trend }
//   rating  result of rate() for the latest year
//   values  the values that were rated (latest year, with prior-year fields)
//   name    company name as rated ("" when none)
//   source  HANDOFF_SOURCES entry when the figures came from another module, else null
//   trend   result of rateYears(); trend.years.length is 1 for a single year

import { FIELDS } from "./fields.js";
import { gradeScaleText } from "./rating.js";
import { RATIOS } from "./ratios.js";
import { INDUSTRY_BY_ID, BENCHMARK_SOURCE } from "./benchmarks.js";
import { KEY_FIGURES, keyFigureText, explainRatio, dupontSentences, ratioStatusText } from "./report.js";
import { trendSentence } from "./years.js";
import { formatPct, formatPp, formatMultiple, formatAmountInput, formatPercentValue, formatEurFull, formatSignedPct, formatNumber, toneClass } from "../shared/format.js";
import { t } from "../shared/i18n.js";
import { trackGeometry } from "../shared/track.js";
import { sparklineGeometry } from "../shared/sparkline.js";
import { h } from "../shared/dom.js";
import { bandPill, pill, severityPill, GRADE_TONES } from "../shared/status.js";

/** An element whose content is one of our own language texts with simple markup (<strong>). */
export function richText(tag, key, params) {
  const el = h(tag);
  el.innerHTML = t(key, params);
  return el;
}

const SVG_NS = "http://www.w3.org/2000/svg";
function svg(tag, attrs) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

/**
 * The grade ring: a circle filled to the score.
 * @param {{score: number, grade: {letter: string}}} r
 * @param {{small?: boolean}} [options] small: the compact ring of the what-if panel
 */
export function gradeRing(r, { small = false } = {}) {
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const ring = svg("svg", { viewBox: "0 0 120 120", class: "grade-ring__svg", "aria-hidden": "true" });
  ring.append(
    svg("circle", { cx: 60, cy: 60, r: radius, class: "grade-ring__track" }),
    svg("circle", {
      cx: 60, cy: 60, r: radius, class: "grade-ring__value",
      "stroke-dasharray": `${(circumference * r.score) / 100} ${circumference}`,
      transform: "rotate(-90 60 60)",
    }));
  return h("div", { class: `grade-ring${small ? " grade-ring--small" : ""} tone-${GRADE_TONES[r.grade.letter]}` },
    ring,
    h("div", { class: "grade-ring__label" },
      h("span", { class: "grade-ring__letter" }, r.grade.letter),
      h("span", { class: "grade-ring__score" }, `${r.score}/100`)));
}

/**
 * A small trend line, labelled for screen readers with every value.
 * @param {(number|null)[]} values oldest first
 * @param {string} label accessible description ("Net margin: 2023 7.0%, …")
 */
export function sparkline(values, label) {
  const g = sparklineGeometry(values);
  const el = svg("svg", { viewBox: "0 0 96 28", class: "sparkline", role: "img", "aria-label": label });
  if (g.zeroY !== null) el.append(svg("line", { x1: 0, x2: 96, y1: g.zeroY, y2: g.zeroY, class: "sparkline__zero" }));
  if (g.path) el.append(svg("path", { d: g.path, class: "sparkline__line" }));
  for (const p of g.points) el.append(svg("circle", { cx: p.x, cy: p.y, r: p === g.points.at(-1) ? 2.6 : 1.6, class: "sparkline__dot" }));
  return el;
}

/**
 * The verdict card: grade ring, title, summary and the actions.
 * @param {object} ctx view context
 * @param {{onCopy: (button: HTMLElement) => void}} actions
 */
export function renderVerdict(ctx, { onCopy }) {
  const r = ctx.rating;
  const latestYear = ctx.trend.years[0].year;
  return h("section", { class: "card verdict", "aria-labelledby": "verdict-title" },
    gradeRing(r),
    h("div", { class: "verdict__text" },
      h("p", { class: "verdict__eyebrow" }, t("rating.page.verdictEyebrow", { name: ctx.name || t("rating.page.yourCompany"), year: latestYear })),
      h("h3", { id: "verdict-title", class: "verdict__title" },
        h("span", { class: "sr-only" }, t("rating.page.gradeSr", { letter: r.grade.letter, score: r.score })),
        t("rating.page.verdictTitle", { grade: r.grade.label })),
      h("p", { class: "verdict__summary" }, r.summary),
      h("p", { class: "verdict__meta" },
        t("rating.page.verdictMeta", { coverage: r.coverage.label, industry: r.industry.label }),
        h("span", { class: "rule-of-thumb", title: BENCHMARK_SOURCE.note }, BENCHMARK_SOURCE.inlineLabel)),
      h("div", { class: "verdict__actions" },
        h("button", { type: "button", class: "button", on: { click: (e) => onCopy(e.currentTarget) } }, t("rating.page.copySummary")),
        h("button", { type: "button", class: "button", on: { click: () => window.print() } }, t("rating.page.print")))));
}

export function renderKeyFigures(ctx) {
  const r = ctx.rating;
  const yoy = ctx.trend.yoy;
  return h("section", { class: "block", "aria-labelledby": "kf-title" },
    h("h3", { id: "kf-title", class: "block-title" }, t("rating.keyFigures.title")),
    h("dl", { class: "tiles" }, KEY_FIGURES.map((k) => {
      const { text, note } = keyFigureText(k.id, r);
      const raw = r.keyFigures[k.id];
      const tone = k.kind === "eur" && raw !== null && raw < 0 ? "neg" : "";
      let change = null;
      if (yoy && yoy.keyFigures[k.id] !== null) {
        const value = yoy.keyFigures[k.id];
        change = h("dd", { class: `tile__change ${toneClass(value)}` }, t("rating.page.tileChange", {
          change: k.kind === "eur" ? formatSignedPct(value) : `${value > 0 ? "+" : ""}${formatMultiple(value, 1)}`,
          year: yoy.previousYear,
        }));
      }
      return h("div", { class: "tile" },
        h("dt", {}, k.label),
        h("dd", { class: `tile__value ${tone}` }, text),
        change,
        note ? h("dd", { class: "tile__note" }, note) : null);
    })));
}

export function renderFlags(ctx) {
  const r = ctx.rating;
  if (r.flags.length === 0) {
    return h("section", { class: "block", "aria-labelledby": "flags-title" },
      h("h3", { id: "flags-title", class: "block-title" }, t("rating.page.flagsTitle")),
      h("p", { class: "card no-flags" }, pill("excellent", "✓", t("rating.page.noFlagsPill")), t("rating.page.noFlags")));
  }
  return h("section", { class: "block", "aria-labelledby": "flags-title" },
    h("h3", { id: "flags-title", class: "block-title" }, t("rating.page.flagsTitle"), " ",
      h("span", { class: "count" }, t("rating.page.flagsCount", { count: r.flags.length }))),
    h("ul", { class: "flags card" }, r.flags.map((f) => h("li", { class: `flag tone-${f.severity}` },
      severityPill(f.severity),
      h("div", {}, h("p", { class: "flag__title" }, f.title), h("p", { class: "flag__detail" }, f.detail))))));
}

/** "Poor below 15%, Weak 15–25%, …" for the track's accessible name. */
function scaleText(thresholds) {
  const [poor, fair, good, excellent] = thresholds.map(formatPercentValue);
  return t("rating.page.scale", { poor, fair, good, excellent });
}

function renderTrack(ratio) {
  const valuePct = ratio.status === "ok" ? ratio.value * 100 : null;
  const g = trackGeometry(valuePct, ratio.thresholds);
  const label = ratio.status === "ok"
    ? t("rating.page.trackValue", { value: formatPct(ratio.value), ratio: ratio.shortLabel, scale: scaleText(ratio.thresholds) })
    : t("rating.page.trackScale", { scale: scaleText(ratio.thresholds) });
  return h("div", { class: "track", role: "img", "aria-label": label },
    h("div", { class: "track__bar" },
      g.segments.map((s) => h("span", { class: `track__seg tone-${s.id}`, style: `left:${s.from}%;width:${s.to - s.from}%` })),
      g.marker ? h("span", {
        class: `track__marker${g.marker.outside ? ` track__marker--${g.marker.outside}` : ""}`,
        style: `left:${g.marker.at}%`,
      }) : null),
    h("div", { class: "track__ticks", "aria-hidden": "true" },
      g.ticks.map((tick) => h("span", { class: "track__tick", style: `left:${tick.at}%` }, formatPercentValue(tick.value)))));
}

function renderMath(ratio, ctx) {
  const math = explainRatio(ratio, ctx.rating.statement, ctx.values);
  return h("div", { class: "ratio__learn learn-only" },
    h("div", { class: "math" },
      h("p", { class: "math__title" }, t("rating.math.title")),
      h("ol", { class: "math__steps" },
        h("li", {}, h("code", {}, math.formula)),
        math.substituted ? h("li", {}, h("code", {}, math.substituted)) : null,
        h("li", {}, h("code", { class: "math__result" }, math.result))),
      math.where.length > 0 ? h("ul", { class: "math__where" }, math.where.map((w) => h("li", {}, w))) : null),
    h("p", {}, h("strong", {}, t("rating.math.meaning")), ratio.meaning),
    h("p", {}, h("strong", {}, t("rating.math.improve")), ratio.improve));
}

function renderRatio(ratio, ctx) {
  const head = h("div", { class: "ratio__head" },
    h("h5", { class: "ratio__name" }, ratio.label),
    h("span", { class: "ratio__weight" }, t("rating.page.weight", { weight: ratio.weight })),
    h("span", { class: "ratio__score" }, ratio.status === "ok"
      ? [h("span", { class: "ratio__value" }, formatPct(ratio.value)), bandPill(ratio.band)]
      : [h("span", { class: "ratio__value ratio__value--none" }, t(ratio.status === "missing" ? "rating.page.notAvailable" : "rating.page.notMeaningful")),
        pill("none", t("common.dash"), t(ratio.status === "missing" ? "rating.page.missingPill" : "rating.page.notMeaningfulPill"))]));
  const source = ctx.source;
  return h("li", { class: `ratio ratio--${ratio.status}` },
    head,
    ratio.status === "ok" ? null : h("p", { class: "ratio__status" }, ratioStatusText(ratio)),
    renderTrack(ratio),
    ratio.id === "grossMargin" && source ? h("p", { class: "ratio__link" }, h("a", { href: source.backLink }, `${source.backLabel} →`)) : null,
    renderMath(ratio, ctx));
}

export function renderRatioGroup(ctx, group) {
  const id = `ratios-${group}`;
  return h("section", { class: "block", "aria-labelledby": id },
    h("h3", { id, class: "block-title" }, t(`rating.ratioGroups.${group}`)),
    h("p", { class: "block-note" }, t(`rating.ratioGroups.${group}Lede`)),
    h("ol", { class: "ratios card" }, ctx.rating.ratios.filter((x) => x.group === group).map((x) => renderRatio(x, ctx))));
}

/**
 * The trend over the years: a sentence and a table with one column per year,
 * the change on the year before and a sparkline. Null with one year.
 */
export function renderTrend(ctx) {
  const { trend } = ctx;
  if (trend.years.length < 2) return null;
  const years = [...trend.years].reverse();
  const yearLabels = years.map((y) => String(y.year));
  const { yoy } = trend;
  const label = (name, texts) => t("rating.trend.sparkLabel", {
    name, values: texts.map((text, i) => `${yearLabels[i]} ${text}`).join(t("common.listSeparator")),
  });
  const cell = (text, cls = "") => h("td", { class: cls }, text);

  const scoreRow = h("tr", { class: "trend__score" },
    h("th", { scope: "row" }, t("rating.trend.scoreRow")),
    years.map((y) => cell(t("rating.trend.scoreCell", { letter: y.rating.grade.letter, score: y.rating.score }))),
    cell(`${yoy.score > 0 ? "+" : ""}${formatNumber(yoy.score, 0)}`, toneClass(yoy.score)),
    h("td", {}, sparkline(trend.series.score, label(t("rating.trend.scoreRow"), trend.series.score.map(String)))));

  const ratioRows = RATIOS.map((def) => {
    const texts = years.map((y) => ratioStatusShort(y.rating.ratios.find((r) => r.id === def.id)));
    const change = yoy.ratios[def.id];
    return h("tr", {},
      h("th", { scope: "row" }, def.label),
      texts.map((text) => cell(text)),
      cell(change === null ? t("format.na") : formatPp(change), toneClass(change)),
      h("td", {}, sparkline(trend.series.ratios[def.id], label(def.label, texts))));
  });

  const amountRows = ["revenue", "ebitda", "netIncome"].map((id) => {
    const values = trend.series.keyFigures[id];
    const texts = values.map(formatEurFull);
    const change = yoy.keyFigures[id];
    const name = t(`rating.keyFigures.${id}`);
    return h("tr", {},
      h("th", { scope: "row" }, name),
      texts.map((text) => cell(text)),
      cell(change === null ? t("rating.page.notMeaningful") : formatSignedPct(change), toneClass(change)),
      h("td", {}, sparkline(values, label(name, texts))));
  });

  return h("section", { class: "block", "aria-labelledby": "trend-title" },
    h("h3", { id: "trend-title", class: "block-title" }, t("rating.trend.title", { count: years.length })),
    h("p", { class: "block-note" }, trendSentence(trend)),
    h("div", { class: "card table-scroll trend" },
      h("table", { class: "trend__table" },
        h("caption", { class: "sr-only" }, t("rating.trend.caption")),
        h("thead", {}, h("tr", {},
          h("th", { scope: "col" }, t("rating.trend.colMeasure")),
          yearLabels.map((y) => h("th", { scope: "col" }, y)),
          h("th", { scope: "col" }, t("rating.trend.colChange", { year: yoy.previousYear })),
          h("th", { scope: "col" }, t("rating.trend.colTrend")))),
        h("tbody", {}, scoreRow, ratioRows),
        h("tbody", { class: "trend__amounts" }, amountRows))),
    h("p", { class: "learn-note learn-only" }, t("rating.trend.learn")));
}

/** A ratio in a narrow table cell: "9.6%", "n/a" or "n/m". */
function ratioStatusShort(ratio) {
  if (ratio.status === "ok") return formatPct(ratio.value);
  return t(ratio.status === "missing" ? "rating.page.notAvailable" : "rating.page.notMeaningful");
}

export function renderDupont(ctx) {
  const d = ctx.rating.dupont;
  const factor = (label, value, op) => [
    op ? h("span", { class: "dupont__op", "aria-hidden": "true" }, op) : null,
    h("div", { class: "dupont__factor" }, h("span", { class: "dupont__label" }, label), h("span", { class: "dupont__value" }, value)),
  ];
  return h("section", { class: "block", "aria-labelledby": "dupont-title" },
    h("h3", { id: "dupont-title", class: "block-title" }, t("rating.dupont.title")),
    h("p", { class: "block-note" }, t("rating.dupont.lede")),
    h("div", { class: "card dupont-card" },
      h("div", { class: "dupont" },
        factor(t("rating.dupont.netMargin"), formatPct(d.netMargin)),
        factor(t("rating.dupont.assetTurnover"), formatMultiple(d.assetTurnover), "×"),
        factor(t("rating.dupont.equityMultiplier"), d.status === "ok" ? formatMultiple(d.equityMultiplier) : t("rating.dupont.notMeaningful"), "×"),
        factor(t("rating.dupont.roe"), d.status === "ok" ? formatPct(d.roe) : t("rating.dupont.notMeaningful"), "=")),
      d.status === "ok" ? null : h("p", { class: "ratio__status" }, d.reason),
      h("div", { class: "learn-note learn-only" }, dupontSentences(d).map((s) => h("p", {}, s)))));
}

export function renderMethod(ctx) {
  const r = ctx.rating;
  const thresholds = INDUSTRY_BY_ID[r.industry.id].thresholds;
  return h("section", { class: "block" },
    h("details", { class: "card method" },
      h("summary", {}, t("rating.page.methodTitle")),
      h("ol", { class: "method__steps" },
        h("li", {}, t("rating.page.methodStep1")),
        h("li", {}, t("rating.page.methodStep2")),
        h("li", {}, t("rating.page.methodStep3", { grades: gradeScaleText() })),
        h("li", {}, t("rating.page.methodStep4"))),
      h("div", { class: "table-scroll" },
        h("table", { class: "method__table" },
          h("caption", {}, t("rating.page.methodCaption", { industry: r.industry.label, source: BENCHMARK_SOURCE.label, note: BENCHMARK_SOURCE.note })),
          h("thead", {}, h("tr", {},
            ["colRatio", "colWeight", "colWeak", "colFair", "colGood", "colExcellent"].map((key) => h("th", { scope: "col" }, t(`rating.page.${key}`))))),
          h("tbody", {}, RATIOS.map((ratio) => h("tr", {},
            h("th", { scope: "row" }, ratio.label),
            h("td", {}, String(ratio.weight)),
            thresholds[ratio.id].map((value) => h("td", {}, formatPercentValue(value)))))))),
      h("p", {}, t("rating.page.methodLink"), h("a", { href: "docs/methodology.md" }, "docs/methodology.md"))));
}

/** The inputs of every year, printed with the results (hidden on screen). */
export function renderPrintInputs(ctx) {
  const years = ctx.trend.years;
  return h("section", { class: "print-only print-inputs" },
    h("h3", { class: "block-title" }, t("rating.page.printInputs")),
    h("table", {},
      h("thead", {}, h("tr", {}, h("th", {}), years.map((y) => h("th", { scope: "col" }, String(y.year))))),
      h("tbody", {}, FIELDS.map((f) => h("tr", {},
        h("th", { scope: "row" }, f.label),
        years.map((y) => h("td", {}, y.values[f.id] === null || y.values[f.id] === undefined ? t("common.dash") : formatAmountInput(y.values[f.id]))))))));
}

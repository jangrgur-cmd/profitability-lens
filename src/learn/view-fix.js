// view-fix.js: the "Fix the company" tab of the Glossary & practice page.
//
// UI only: the challenges, their ratings and the one-lever solution come
// from challenges.js (the Company rating engine through applyWhatIf). Lever
// positions live in the page; solved challenges are kept in localStorage.

import { CHALLENGES, challengeLevers, challengeSolution, cleanSolved, tryChallenge } from "./challenges.js";
import { INDUSTRY_BY_ID } from "../rating/benchmarks.js";
import { LEVERS } from "../rating/whatif.js";
import { gradeRing } from "../rating/view-results.js";
import { MINUS, formatNumber } from "../shared/format.js";
import { t } from "../shared/i18n.js";
import { h, replaceChildren } from "../shared/dom.js";
import { readJson, writeJson } from "../shared/prefs.js";

const STORAGE_KEY = "learn/fix";
const STORAGE_VERSION = 1;
const $ = (id) => document.getElementById(id);

const state = {
  /** ids of solved challenges */
  solved: [],
  /** index into CHALLENGES of the challenge on show */
  active: 0,
  /** lever id → percent, for the challenge on show */
  levers: {},
};

/** "+5%", "−3%", "0%". */
function moveText(value) {
  const text = t("format.pct", { n: formatNumber(Math.abs(value), 0) });
  if (value > 0) return `+${text}`;
  return value < 0 ? `${MINUS}${text}` : text;
}

function save() {
  writeJson(STORAGE_KEY, { version: STORAGE_VERSION, solved: state.solved });
}

function renderProgress() {
  $("fix-progress").textContent = t("learn.fix.progress", { solved: state.solved.length, total: CHALLENGES.length });
  $("fix-reset").hidden = state.solved.length === 0;
}

function renderList() {
  replaceChildren($("fix-list"), h("ol", { class: "quiz-cases__list" }, CHALLENGES.map((ch, i) => {
    const solved = state.solved.includes(ch.id);
    return h("li", {},
      h("button", {
        type: "button", class: `quiz-case-tab quiz-case-tab--${solved ? "right" : "open"}`,
        "aria-current": i === state.active ? "step" : null,
        on: { click: () => show(i, { focus: true }) },
      },
      solved ? h("span", { class: "quiz-case-tab__icon", "aria-hidden": "true" }, "✓") : null,
      t("learn.fix.tab", { n: i + 1 }),
      h("span", { class: "sr-only" }, ` (${t(solved ? "learn.fix.stateSolved" : "learn.fix.stateOpen")})`)));
  })));
}

/** The live part: grade rings, status line and, once reached, the lesson. */
function renderResult(ch, output, announce) {
  const start = tryChallenge(ch);
  const now = tryChallenge(ch, state.levers);
  const { rating } = now;
  if (now.reached && !state.solved.includes(ch.id)) {
    state.solved.push(ch.id);
    save();
    renderProgress();
    renderList();
    announce(t("learn.fix.announceReached", { letter: rating.grade.letter }));
  }
  const nextIndex = CHALLENGES.findIndex((c, i) => i > state.active && !state.solved.includes(c.id));
  const next = nextIndex >= 0 ? nextIndex : CHALLENGES.findIndex((c) => !state.solved.includes(c.id));
  replaceChildren(output,
    h("div", { class: "whatif__grades" },
      h("div", { class: "whatif__grade" }, h("span", { class: "whatif__caption" }, t("learn.fix.start")), gradeRing(start.rating, { small: true })),
      h("span", { class: "whatif__arrow", "aria-hidden": "true" }, "→"),
      h("div", { class: "whatif__grade" }, h("span", { class: "whatif__caption" }, t("learn.fix.now")), gradeRing(rating, { small: true }))),
    now.reached
      ? h("p", { class: "case-verdict case-verdict--right" }, h("span", { class: "case-verdict__icon", "aria-hidden": "true" }, "✓"),
        t("learn.fix.reached", { letter: rating.grade.letter, score: rating.score }))
      : h("p", { class: "whatif__headline" }, t("learn.fix.status", {
        count: ch.goal.min - rating.score, letter: rating.grade.letter, score: rating.score, goal: ch.goal.letter,
      })),
    now.reached ? h("div", { class: "case-lesson" },
      h("h3", { class: "case-section-title" }, t("learn.fix.lessonTitle")),
      h("p", {}, ch.lesson),
      next >= 0
        ? h("div", { class: "case-actions" }, h("button", { type: "button", class: "button button--primary", on: { click: () => show(next, { focus: true }) } }, t("learn.fix.next")))
        : h("p", { class: "case-done" }, t("learn.fix.allDone", { total: CHALLENGES.length }))) : null);
}

function render(announce) {
  const ch = CHALLENGES[state.active];
  const c = ch.practiceCase;
  const output = h("div", { class: "whatif__result", "aria-live": "polite" });
  const update = () => renderResult(ch, output, announce);
  const inputs = {};

  const sliders = challengeLevers(ch).map((lever) => {
    const id = `fix-${lever.id}`;
    const value = h("output", { class: "whatif__value", for: id }, moveText(state.levers[lever.id] ?? 0));
    const input = h("input", {
      id, type: "range", min: lever.min, max: lever.max, step: lever.step, value: state.levers[lever.id] ?? 0,
      "aria-describedby": `${id}-help`, "aria-valuetext": moveText(state.levers[lever.id] ?? 0),
      on: {
        input: (event) => {
          state.levers[lever.id] = Number(event.target.value);
          value.textContent = moveText(state.levers[lever.id]);
          event.target.setAttribute("aria-valuetext", value.textContent);
          update();
        },
      },
    });
    inputs[lever.id] = { input, value };
    return h("div", { class: "whatif__lever" },
      h("div", { class: "whatif__label" }, h("label", { for: id }, lever.label), value),
      input,
      h("p", { class: "whatif__help", id: `${id}-help` }, lever.help));
  });
  const fixed = Object.entries(ch.fixed).map(([id, change]) => h("p", { class: "fix__fixed" },
    t("learn.fix.fixed", { lever: LEVERS.find((l) => l.id === id).label, change: moveText(change) })));
  const resetLevers = h("button", {
    type: "button", class: "button-quiet",
    on: {
      click: () => {
        state.levers = {};
        for (const { input, value } of Object.values(inputs)) {
          input.value = "0";
          value.textContent = moveText(0);
          input.setAttribute("aria-valuetext", value.textContent);
        }
        update();
      },
    },
  }, t("learn.fix.resetLevers"));

  const solution = challengeSolution(ch);
  replaceChildren($("fix-challenge"), h("article", { class: "card case", "aria-labelledby": `fix-title-${ch.id}` },
    h("header", { class: "case__head" },
      h("p", { class: "case__eyebrow" }, t("learn.fix.challengeOf", { n: state.active + 1, total: CHALLENGES.length })),
      h("h2", { id: `fix-title-${ch.id}`, class: "case__title", tabindex: "-1" }, ch.title),
      h("p", { class: "case__industry" }, t("learn.fix.company", { name: c.name, industry: INDUSTRY_BY_ID[c.industryId].label }), " ",
        h("span", { class: "chip__tag" }, t("common.fictional"))),
      h("p", { class: "case__story" }, ch.task),
      h("p", { class: "fix__goal" }, t("learn.fix.goal", { letter: ch.goal.letter, label: ch.goal.label }))),
    h("div", { class: "card whatif fix" },
      h("div", { class: "whatif__levers" },
        h("h3", { class: "path__heading" }, t("learn.fix.leversTitle")),
        fixed, sliders, resetLevers),
      output),
    solution ? h("details", { class: "case-hint" },
      h("summary", {}, t("learn.fix.solutionShow")),
      h("p", {}, t("learn.fix.solution", {
        lever: solution.label, change: moveText(solution.change), letter: solution.rating.grade.letter, score: solution.rating.score,
      }))) : null,
    h("p", { class: "fix__case-link" }, h("a", { href: "#practice", on: { click: (e) => { e.preventDefault(); openCase(c.id); } } }, t("learn.fix.openCase")))));
  update();
}

let openCase = () => {};
let announceText = () => {};

/** Shows a challenge with its levers at zero; `focus` moves focus to its title. */
function show(index, { focus = false } = {}) {
  state.active = index;
  state.levers = {};
  renderList();
  render(announceText);
  if (focus) $(`fix-title-${CHALLENGES[index].id}`).focus();
}

/**
 * Sets up the tab.
 * @param {{announce: (text: string) => void, onOpenCase: (caseId: string) => void}} options
 *   onOpenCase shows a practice case in "Guess the grade"
 */
export function setupFix({ announce, onOpenCase }) {
  announceText = announce;
  openCase = onOpenCase;
  const saved = readJson(STORAGE_KEY);
  state.solved = saved?.version === STORAGE_VERSION ? cleanSolved(saved.solved) : [];
  $("fix-reset").addEventListener("click", () => {
    if (!window.confirm(t("learn.fix.resetConfirm"))) return;
    state.solved = [];
    save();
    renderProgress();
    show(0, { focus: true });
  });
  renderProgress();
  const firstOpen = CHALLENGES.findIndex((c) => !state.solved.includes(c.id));
  show(firstOpen >= 0 ? firstOpen : 0);
}

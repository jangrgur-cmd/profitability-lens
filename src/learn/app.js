// app.js: the Glossary & practice page (learn.html). UI only: the cases,
// the verdicts and the glossary come from the pure modules (cases.js,
// quiz.js, glossary.js and the rating engine), every text from the language
// files.
//
// Three tabs: "Guess the grade", "Fix the company" (view-fix.js) and
// "Glossary". The URL hash picks the tab: #fix opens the challenges,
// #glossary or #term-<id> (a glossary entry) the glossary, anything else the
// practice cases. Guesses and solved challenges are kept in localStorage only.

import { CASES, caseHash } from "./cases.js";
import { rateCase, judgeGuess, quizScore, cleanAnswers } from "./quiz.js";
import { GLOSSARY_BY_ID, CATEGORIES, searchGlossary } from "./glossary.js";
import { FIELDS, GROUPS } from "../rating/fields.js";
import { GRADES } from "../rating/rating.js";
import { INDUSTRY_BY_ID } from "../rating/benchmarks.js";
import { ratioStatusText } from "../rating/report.js";
import { gradeRing } from "../rating/view-results.js";
import { formatEurFull } from "../shared/format.js";
import { t } from "../shared/i18n.js";
import { h, replaceChildren } from "../shared/dom.js";
import { readJson, writeJson } from "../shared/prefs.js";
import { bandPill, severityPill, GRADE_TONES } from "../shared/status.js";
import { mountSiteHeader } from "../shared/site-header.js";
import { setupFix } from "./view-fix.js";

const $ = (id) => document.getElementById(id);
const STORAGE_KEY = "learn/quiz";
const STORAGE_VERSION = 1;

/** Each case's rating, worked out once: the right answers. */
const RATED = new Map(CASES.map((c) => [c.id, rateCase(c)]));
const gradeOf = (c) => RATED.get(c.id).grade.letter;

const state = {
  /** case id → guessed letter */
  answers: {},
  /** index into CASES of the case on show */
  active: 0,
  /** glossary filter */
  query: "",
  category: null,
};

const announce = (text) => { $("announcer").textContent = text; };

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

const TABS = ["practice", "fix", "glossary"];

/** Shows one tab; `focusPanel` moves focus to it (after a click, not on load). */
function showTab(id, { focusPanel = false } = {}) {
  for (const tab of TABS) {
    const button = $(`tab-${tab}`);
    const on = tab === id;
    button.setAttribute("aria-selected", String(on));
    button.tabIndex = on ? 0 : -1;
    $(`panel-${tab}`).hidden = !on;
  }
  if (focusPanel) $(`panel-${id}`).focus();
}

function setupTabs() {
  for (const tab of TABS) {
    const button = $(`tab-${tab}`);
    button.addEventListener("click", () => {
      history.replaceState(null, "", `#${tab}`);
      showTab(tab);
    });
    button.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
      event.preventDefault();
      const next = TABS[(TABS.indexOf(tab) + (event.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length];
      $(`tab-${next}`).focus();
      $(`tab-${next}`).click();
    });
  }
}

/** Follows the hash: #fix, #glossary, #term-<id> (scrolls to the entry) or the practice tab. */
function followHash() {
  const hash = decodeURIComponent(location.hash.replace(/^#/, ""));
  if (hash.startsWith("term-") && GLOSSARY_BY_ID[hash.slice(5)]) {
    showTab("glossary");
    const id = hash.slice(5);
    const visible = searchGlossary(state.query, { category: state.category }).some((e) => e.id === id);
    if (!visible) {
      state.query = "";
      state.category = null;
      $("glossary-search").value = "";
      renderGlossary();
    }
    const target = $(hash);
    target?.scrollIntoView({ block: "start" });
    target?.focus({ preventScroll: true });
    return;
  }
  showTab(hash === "glossary" || hash === "fix" ? hash : "practice");
}

// ---------------------------------------------------------------------------
// Guess the grade
// ---------------------------------------------------------------------------

function saveAnswers() {
  writeJson(STORAGE_KEY, { version: STORAGE_VERSION, answers: state.answers });
}

function scoreText() {
  const s = quizScore(state.answers, CASES, gradeOf);
  return s.answered === 0 ? t("learn.quiz.scoreNone", { total: s.total }) : t("learn.quiz.score", s);
}

function renderScore() {
  $("quiz-score").textContent = scoreText();
  $("quiz-reset").hidden = Object.keys(state.answers).length === 0;
}

/** The row of case buttons, each saying whether it was answered right. */
function renderCaseTabs() {
  replaceChildren($("quiz-cases"), h("ol", { class: "quiz-cases__list" }, CASES.map((c, i) => {
    const guess = state.answers[c.id];
    const status = !guess ? "open" : guess === gradeOf(c) ? "right" : "wrong";
    const icon = { open: "", right: "✓", wrong: "✕" }[status];
    const label = { open: t("learn.quiz.stateOpen"), right: t("learn.quiz.stateRight"), wrong: t("learn.quiz.stateWrong") }[status];
    return h("li", {},
      h("button", {
        type: "button", class: `quiz-case-tab quiz-case-tab--${status}`,
        "aria-current": i === state.active ? "step" : null,
        on: { click: () => showCase(i, { focus: true }) },
      },
      icon ? h("span", { class: "quiz-case-tab__icon", "aria-hidden": "true" }, icon) : null,
      t("learn.quiz.caseTab", { n: i + 1 }),
      h("span", { class: "sr-only" }, ` (${label})`)));
  })));
}

/** The case's figures, by statement section, as the Company rating form shows them. */
function figuresTable(c) {
  return h("div", { class: "case-figures" }, GROUPS.map((group) => h("table", { class: "case-figures__table" },
    h("caption", {}, group.label),
    h("tbody", {}, FIELDS.filter((f) => f.group === group.id).map((f) => {
      const value = c.values[f.id];
      const given = value !== null && value !== undefined;
      return h("tr", {},
        h("th", { scope: "row" }, f.label),
        h("td", { class: given ? (value < 0 ? "neg" : null) : "case-figures__none" }, given ? formatEurFull(value) : t("learn.quiz.notGiven")));
    })))));
}

/** The hint: the eight ratio values, without bands or scores. */
function hint(rating) {
  return h("details", { class: "case-hint" },
    h("summary", {}, t("learn.quiz.hintTitle")),
    h("p", { class: "case-hint__note" }, t("learn.quiz.hintNote")),
    h("ul", { class: "case-hint__list" }, rating.ratios.map((r) => h("li", {},
      h("span", {}, r.label), h("span", { class: "case-hint__value" }, ratioStatusText(r))))));
}

/** The five grade buttons; after a guess they stay to show the guess and the answer. */
function guessButtons(c) {
  const guess = state.answers[c.id];
  const answer = gradeOf(c);
  return h("div", { class: "guess", role: "group", "aria-labelledby": `guess-title-${c.id}` },
    GRADES.map((g) => {
      const marks = [];
      if (guess && g.letter === answer) marks.push("guess__button--answer");
      if (guess && g.letter === guess && guess !== answer) marks.push("guess__button--wrong");
      return h("button", {
        type: "button",
        class: ["guess__button", `tone-${GRADE_TONES[g.letter]}`, ...marks].join(" "),
        "aria-pressed": String(g.letter === guess),
        "aria-label": t("learn.quiz.guessSr", { letter: g.letter, label: g.label }),
        disabled: Boolean(guess),
        on: { click: () => makeGuess(c, g.letter) },
      }, h("span", { class: "guess__letter", "aria-hidden": "true" }, g.letter), h("span", { class: "guess__label", "aria-hidden": "true" }, g.label));
    }));
}

/** After the guess: the verdict, the engine's reasoning and the lesson. */
function reveal(c, rating) {
  const verdict = judgeGuess(state.answers[c.id], rating.grade.letter);
  const next = CASES.findIndex((x, i) => i > state.active && !state.answers[x.id]);
  const nextIndex = next >= 0 ? next : CASES.findIndex((x) => !state.answers[x.id]);
  const done = nextIndex < 0;
  const score = quizScore(state.answers, CASES, gradeOf);
  return h("section", { class: "case-reveal", "aria-labelledby": `answer-title-${c.id}` },
    h("p", { class: `case-verdict case-verdict--${verdict.correct ? "right" : "wrong"}`, role: "status" },
      h("span", { class: "case-verdict__icon", "aria-hidden": "true" }, verdict.correct ? "✓" : "✕"), verdict.text),
    h("h3", { id: `answer-title-${c.id}`, class: "case-section-title" }, t("learn.quiz.answerTitle")),
    h("div", { class: "case-answer" },
      gradeRing(rating),
      h("p", { class: "case-answer__summary" }, rating.summary)),
    h("h3", { class: "case-section-title" }, t("learn.quiz.ratiosTitle")),
    h("ul", { class: "case-ratios" }, rating.ratios.map((r) => h("li", {},
      h("span", { class: "case-ratios__name" }, r.label),
      h("span", { class: "case-ratios__value" }, ratioStatusText(r)),
      r.band ? bandPill(r.band) : null))),
    rating.flags.length > 0 ? [
      h("h3", { class: "case-section-title" }, t("rating.page.flagsTitle")),
      h("ul", { class: "flags card" }, rating.flags.map((f) => h("li", { class: `flag tone-${f.severity}` },
        severityPill(f.severity),
        h("div", {}, h("p", { class: "flag__title" }, f.title), h("p", { class: "flag__detail" }, f.detail))))),
    ] : null,
    h("div", { class: "case-lesson" },
      h("h3", { class: "case-section-title" }, t("learn.quiz.lessonTitle")),
      h("p", {}, c.lesson)),
    done ? h("p", { class: "case-done" }, t("learn.quiz.allDone", { total: score.total, correct: score.correct })) : null,
    h("div", { class: "case-actions" },
      h("a", { class: "button", href: `index.html${caseHash(c.id)}` }, t("learn.quiz.openInRating")),
      done ? null : h("button", { type: "button", class: "button button--primary", on: { click: () => showCase(nextIndex, { focus: true }) } }, t("learn.quiz.next"))));
}

function renderCase() {
  const c = CASES[state.active];
  const rating = RATED.get(c.id);
  const industry = INDUSTRY_BY_ID[c.industryId];
  replaceChildren($("quiz-case"), h("article", { class: "card case", "aria-labelledby": `case-title-${c.id}` },
    h("header", { class: "case__head" },
      h("p", { class: "case__eyebrow" }, t("learn.quiz.caseOf", { n: state.active + 1, total: CASES.length })),
      h("h2", { id: `case-title-${c.id}`, class: "case__title", tabindex: "-1" }, c.name, " ", h("span", { class: "chip__tag" }, t("common.fictional"))),
      h("p", { class: "case__industry" }, t("learn.quiz.industry", { industry: industry.label })),
      h("p", { class: "case__story" }, c.story)),
    h("h3", { class: "case-section-title" }, t("learn.quiz.figuresTitle")),
    figuresTable(c),
    hint(rating),
    h("h3", { id: `guess-title-${c.id}`, class: "case-section-title" }, t("learn.quiz.guessTitle")),
    state.answers[c.id] ? null : h("p", { class: "case-help" }, t("learn.quiz.guessHelp")),
    guessButtons(c),
    state.answers[c.id] ? reveal(c, rating) : null));
}

/** Shows a case; `focus` moves focus to its title (after a click). */
function showCase(index, { focus = false } = {}) {
  state.active = index;
  renderCaseTabs();
  renderCase();
  if (focus) $(`case-title-${CASES[index].id}`).focus();
}

function makeGuess(c, letter) {
  state.answers[c.id] = letter;
  saveAnswers();
  renderScore();
  renderCaseTabs();
  renderCase();
  announce(t("learn.quiz.announce", { feedback: judgeGuess(letter, gradeOf(c)).text, score: scoreText() }));
  document.querySelector(".case-verdict")?.scrollIntoView({ block: "nearest" });
}

function resetQuiz() {
  if (!window.confirm(t("learn.quiz.resetConfirm"))) return;
  state.answers = {};
  saveAnswers();
  renderScore();
  showCase(0, { focus: true });
}

function setupQuiz() {
  const saved = readJson(STORAGE_KEY);
  state.answers = saved?.version === STORAGE_VERSION ? cleanAnswers(saved.answers, CASES) : {};
  const firstOpen = CASES.findIndex((c) => !state.answers[c.id]);
  $("quiz-reset").addEventListener("click", resetQuiz);
  renderScore();
  showCase(firstOpen >= 0 ? firstOpen : 0);
}

// ---------------------------------------------------------------------------
// Glossary
// ---------------------------------------------------------------------------

function entryNode(e) {
  return h("article", { class: "term", id: `term-${e.id}`, tabindex: "-1", "aria-labelledby": `term-name-${e.id}` },
    h("h4", { class: "term__name", id: `term-name-${e.id}` }, e.term),
    e.alt !== e.term ? h("p", { class: "term__alt" }, `${t("learn.glossary.altLabel")}: `, h("span", { lang: e.altLang }, e.alt)) : null,
    e.formula ? h("p", { class: "term__formula" }, h("span", { class: "sr-only" }, `${t("learn.glossary.formula")}: `), e.formula) : null,
    h("p", { class: "term__def" }, e.definition),
    e.related.length > 0 ? h("p", { class: "term__related" }, `${t("learn.glossary.related")}: `,
      e.related.map((id, i) => [i > 0 ? t("common.listSeparator") : null, h("a", { href: `#term-${id}` }, GLOSSARY_BY_ID[id].term)])) : null);
}

function renderGlossary() {
  const results = searchGlossary(state.query, { category: state.category });
  $("glossary-count").textContent = results.length === 0
    ? t("learn.glossary.none", { query: state.query.trim() })
    : t("learn.glossary.count", { count: results.length });

  let body;
  if (state.query.trim()) {
    body = h("div", { class: "terms card" }, results.map(entryNode));
  } else {
    body = CATEGORIES.filter((cat) => results.some((e) => e.category === cat.id)).map((cat) => h("section", { class: "term-group", "aria-labelledby": `cat-${cat.id}` },
      h("h3", { class: "term-group__title", id: `cat-${cat.id}` }, cat.label),
      h("div", { class: "terms card" }, results.filter((e) => e.category === cat.id).map(entryNode))));
  }
  replaceChildren($("glossary-list"), results.length > 0 ? body : null);

  for (const chip of $("glossary-categories").children) {
    chip.setAttribute("aria-pressed", String((chip.dataset.category || null) === state.category));
  }
}

function setupGlossary() {
  const chips = [{ id: "", label: t("learn.glossary.all") }, ...CATEGORIES].map((cat) => h("button", {
    type: "button", class: "chip glossary-chip", dataset: { category: cat.id },
    on: { click: () => { state.category = cat.id || null; renderGlossary(); } },
  }, cat.label));
  replaceChildren($("glossary-categories"), chips);
  $("glossary-search").addEventListener("input", (event) => { state.query = event.target.value; renderGlossary(); });
  // "See also" links: follow them here, so a link to the entry already in the URL
  // (no hashchange) still clears a filter that hides it.
  $("glossary-list").addEventListener("click", (event) => {
    const link = event.target.closest('a[href^="#term-"]');
    if (!link) return;
    event.preventDefault();
    const href = link.getAttribute("href");
    if (location.hash !== href) history.pushState(null, "", href);
    followHash();
  });
  renderGlossary();
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

mountSiteHeader($("site-header"), { active: "learn", root: "./" });
setupTabs();
setupQuiz();
setupFix({
  announce,
  onOpenCase: (caseId) => {
    history.replaceState(null, "", "#practice");
    showTab("practice");
    showCase(CASES.findIndex((c) => c.id === caseId), { focus: true });
  },
});
setupGlossary();
followHash();
window.addEventListener("hashchange", followHash);

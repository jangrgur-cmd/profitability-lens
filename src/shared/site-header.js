// site-header.js: the header shared by both modules: brand, module
// navigation, the language switch (EN/HR), the Learn mode switch and the
// light/dark switch.
//
// Each page has an empty <header id="site-header"> and calls mountSiteHeader
// with its own position in the site, so the links work from any folder.

import { h } from "./dom.js";
import { currentTheme, isLearnMode, setLearnMode, setTheme } from "./prefs.js";
import { LANGUAGES, getLang, setLanguage, t, applyTranslations } from "./i18n.js";

/** The modules, in navigation order. Paths are relative to the site root. */
export const MODULES = [
  { id: "rating", labelKey: "header.navRating", path: "index.html" },
  { id: "segments", labelKey: "header.navSegments", path: "segments.html" },
  { id: "messaging", labelKey: "header.navMessaging", path: "modules/messaging/" },
  { id: "learn", labelKey: "header.navLearn", path: "learn.html" },
];

const SVG = "http://www.w3.org/2000/svg";

/** Builds an inline SVG icon from path data (decorative, hidden from screen readers). */
function icon(paths, { fill = "none" } = {}) {
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  for (const d of paths) {
    const path = document.createElementNS(SVG, "path");
    path.setAttribute("d", d);
    path.setAttribute("fill", fill);
    path.setAttribute("stroke", "currentColor");
    path.setAttribute("stroke-width", "2");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    svg.append(path);
  }
  return svg;
}

const LOGO = ["M4 20V10", "M10 20V4", "M16 20v-7", "M2.5 20h19", "M14 8.5l3-3 3 3"];
const SUN = ["M12 4V2", "M12 22v-2", "M4 12H2", "M22 12h-2", "M5.6 5.6 4.2 4.2", "M19.8 19.8l-1.4-1.4", "M5.6 18.4l-1.4 1.4", "M19.8 4.2l-1.4 1.4", "M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"];
const MOON = ["M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"];

/** The language switch: one button per language, the current one pressed. */
function languageSwitch() {
  const current = getLang();
  return h("div", { class: "lang-switch", role: "group", "aria-label": t("header.language") },
    LANGUAGES.map((lang) => h("button", {
      type: "button",
      lang: lang.id,
      "aria-pressed": String(lang.id === current),
      title: t("header.languageTitle", { language: lang.name }),
      on: { click: () => { if (lang.id !== current) setLanguage(lang.id); } },
    }, h("span", { "aria-hidden": "true" }, lang.short), h("span", { class: "sr-only" }, lang.name))));
}

/**
 * Renders the shared header into `container` and fills the page's static
 * texts (data-i18n attributes) in the current language.
 * @param {HTMLElement} container
 * @param {{active: "rating"|"segments"|"messaging"|"learn", root: string}} options
 *   root: path from the page to the site root, e.g. "./" or "../../"
 */
export function mountSiteHeader(container, { active, root }) {
  const learn = h("button", {
    type: "button", class: "switch", "aria-pressed": String(isLearnMode()),
    title: t("header.learnTitle"),
    on: { click: () => setLearnMode(!isLearnMode()) },
  }, h("span", { class: "switch__track", "aria-hidden": "true" }), h("span", {}, t("header.learn"), h("span", { class: "switch__label-long" }, t("header.learnLong"))));

  const theme = h("button", { type: "button", class: "icon-button", on: { click: () => setTheme(currentTheme() === "dark" ? "light" : "dark") } });
  const syncTheme = () => {
    const dark = currentTheme() === "dark";
    theme.replaceChildren(icon(dark ? SUN : MOON));
    theme.setAttribute("aria-label", t(dark ? "header.themeToLight" : "header.themeToDark"));
    theme.title = theme.getAttribute("aria-label");
  };
  syncTheme();
  window.addEventListener("themechange", syncTheme);
  window.addEventListener("learnmodechange", () => learn.setAttribute("aria-pressed", String(isLearnMode())));

  container.classList.add("site-header");
  container.replaceChildren(h("div", { class: "wrap site-header__inner" },
    h("a", { class: "brand", href: `${root}index.html` }, icon(LOGO), t("header.brand")),
    h("nav", { class: "module-nav", "aria-label": t("header.navLabel") },
      h("ul", {}, MODULES.map((m) => h("li", {},
        h("a", { href: root + m.path, "aria-current": m.id === active ? "page" : null }, t(m.labelKey)))))),
    h("div", { class: "site-tools" }, languageSwitch(), learn, theme),
  ));
  // On a narrow screen the navigation scrolls sideways: bring the current page's link into view.
  const nav = container.querySelector(".module-nav");
  const current = nav.querySelector('[aria-current="page"]');
  if (current && nav.scrollWidth > nav.clientWidth) nav.scrollLeft = current.offsetLeft - nav.offsetLeft - 8;
  applyTranslations(document);
}

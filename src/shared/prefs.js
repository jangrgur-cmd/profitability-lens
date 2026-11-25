// prefs.js: settings kept in this browser's localStorage, shared by both
// modules: the colour theme, Learn mode, and small JSON records (such as the
// Company rating form). Nothing is ever sent anywhere.
//
// Every storage call is wrapped in try/catch: private browsing, a full disk
// or blocked storage must never break the page; the setting then lasts only
// until the page is closed.

const PREFIX = "profitability-lens/";
const THEME_KEY = `${PREFIX}theme`;
const LEARN_KEY = `${PREFIX}learn`;

/** Reads a stored string, or null. */
export function readStored(key) {
  try {
    return window.localStorage.getItem(PREFIX + key);
  } catch {
    return null;
  }
}

/** Stores a string (null removes it). Returns false when storage is unavailable. */
export function writeStored(key, value) {
  try {
    if (value === null) window.localStorage.removeItem(PREFIX + key);
    else window.localStorage.setItem(PREFIX + key, value);
    return true;
  } catch {
    return false;
  }
}

/** Reads a stored JSON value, or null when missing or unreadable. */
export function readJson(key) {
  const text = readStored(key);
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Stores a JSON value. Returns false when storage is unavailable. */
export function writeJson(key, value) {
  return writeStored(key, JSON.stringify(value));
}

const root = document.documentElement;
const systemDark = window.matchMedia("(prefers-color-scheme: dark)");

function storedTheme() {
  try {
    const value = window.localStorage.getItem(THEME_KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
}

/** The theme in use: the user's choice, or else the system setting. */
export function currentTheme() {
  return root.dataset.theme ?? (systemDark.matches ? "dark" : "light");
}

/**
 * Sets the theme and remembers it. Fires "themechange" on window.
 * @param {"light"|"dark"} theme
 */
export function setTheme(theme) {
  root.dataset.theme = theme;
  try {
    window.localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Not stored: the choice lasts until the page is closed.
  }
  window.dispatchEvent(new CustomEvent("themechange", { detail: { theme } }));
}

/** True while Learn mode is on. */
export function isLearnMode() {
  return root.dataset.learn === "on";
}

/**
 * Turns Learn mode on or off and remembers it. Fires "learnmodechange" on window.
 * @param {boolean} on
 */
export function setLearnMode(on) {
  root.dataset.learn = on ? "on" : "off";
  try {
    window.localStorage.setItem(LEARN_KEY, on ? "on" : "off");
  } catch {
    // Not stored: the choice lasts until the page is closed.
  }
  window.dispatchEvent(new CustomEvent("learnmodechange", { detail: { on } }));
}

/** Applies the stored theme and Learn mode to <html>. Runs once on import. */
function applyStored() {
  const theme = storedTheme();
  if (theme) root.dataset.theme = theme;
  let learn = null;
  try {
    learn = window.localStorage.getItem(LEARN_KEY);
  } catch {
    // Storage unavailable: Learn mode starts off.
  }
  root.dataset.learn = learn === "on" ? "on" : "off";
  // Following the system: tell charts when the system theme flips.
  systemDark.addEventListener("change", () => {
    if (!root.dataset.theme) window.dispatchEvent(new CustomEvent("themechange", { detail: { theme: currentTheme() } }));
  });
}

applyStored();

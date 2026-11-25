// motion.js: small animations that show what changed when a page redraws.
//
// The pages redraw their results from scratch (replaceChildren). To keep the
// eye on what changed, captureMotion() notes the state of every element with
// a data-motion-key before the redraw, and playMotion() animates the new
// elements from that state: markers and bars glide to their new place, rings
// fill to their new score, numbers count to their new value, changed values
// light up briefly, and marked blocks that were not there before rise into
// place (all of them on the first draw, one after another).
//
// Nothing moves when the user prefers reduced motion: the CSS in theme.css
// switches its animations off, and these functions do nothing. UI only.

const EASE = "cubic-bezier(0.2, 0.7, 0.2, 1)";
/** Gliding and counting, in ms. */
const DURATION = 650;
/** Delay between blocks rising one after another, in ms. */
const STAGGER = 55;
/** At most this many blocks wait their turn; later ones rise with the last. */
const MAX_STAGGER = 8;

/** False when the user asked the system for reduced motion. */
export function motionAllowed() {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Marks an element so a redraw animates it.
 * @param {Element} el
 * @param {string} key the same element gets the same key in every draw
 * @param {{value?: number|null, format?: (n: number) => string, enter?: boolean, pop?: boolean, fill?: boolean}} [options]
 *   value and format: the number shown, so it can count from its old value;
 *   enter: rise into place when it was not there before; pop: a changed text scales up briefly;
 *   fill: a ring (stroke-dasharray) that is new fills from empty
 * @returns {Element} el
 */
export function motionKey(el, key, { value = null, format = null, enter = false, pop = false, fill = false } = {}) {
  if (!el) return el;
  el.dataset.motionKey = key;
  if (Number.isFinite(value) && format) {
    el.dataset.motionValue = String(value);
    el.motionFormat = format;
  }
  if (enter) el.dataset.motionEnter = "";
  if (pop) el.dataset.motionPop = "";
  if (fill) el.dataset.motionFill = "";
  return el;
}

/**
 * The state of every marked element under root, before a redraw.
 * @param {Element} root
 * @returns {Map<string, {left: string, width: string, dash: string|null, value: number|null, text: string}>}
 */
export function captureMotion(root) {
  const state = new Map();
  for (const el of root.querySelectorAll("[data-motion-key]")) {
    state.set(el.dataset.motionKey, {
      left: el.style.left,
      width: el.style.width,
      dash: el.getAttribute("stroke-dasharray"),
      value: el.dataset.motionValue === undefined ? null : Number(el.dataset.motionValue),
      text: el.textContent,
    });
  }
  return state;
}

/**
 * Animates the marked elements under root from the state captured before the redraw.
 * @param {Element} root
 * @param {ReturnType<typeof captureMotion>} before
 */
export function playMotion(root, before) {
  if (!motionAllowed()) return;
  let entering = 0;
  for (const el of root.querySelectorAll("[data-motion-key]")) {
    const old = before.get(el.dataset.motionKey);
    if (!old) {
      if (el.dataset.motionEnter !== undefined) rise(el, Math.min(entering++, MAX_STAGGER));
      if (el.dataset.motionFill !== undefined) glide(el, { dash: "0 1000" });
      continue;
    }
    glide(el, old);
    // A block that rises in when new is a container: its values light up on their own.
    if (el.dataset.motionEnter === undefined && old.text !== el.textContent) {
      countFrom(el, old.value);
      if (el.dataset.motionPop !== undefined) replay(el, "motion-pop");
      else flash(el);
    }
  }
}

/** Moves a marker or bar, or fills a ring, from where it was. */
function glide(el, old) {
  const frames = [{}, {}];
  if (old.left && old.left !== el.style.left) [frames[0].left, frames[1].left] = [old.left, el.style.left];
  if (old.width && old.width !== el.style.width) [frames[0].width, frames[1].width] = [old.width, el.style.width];
  const dash = el.getAttribute("stroke-dasharray");
  if (old.dash && dash && old.dash !== dash) [frames[0].strokeDasharray, frames[1].strokeDasharray] = [old.dash, dash];
  if (Object.keys(frames[1]).length > 0) el.animate(frames, { duration: DURATION, easing: EASE });
}

/** Counts a number from its old value to the one it shows now; the final text is the drawn one. */
function countFrom(el, from) {
  const to = Number(el.dataset.motionValue);
  const format = el.motionFormat;
  const node = el.firstChild;
  if (from === null || !Number.isFinite(to) || !format || from === to || !node || node.nodeType !== Node.TEXT_NODE) return;
  const final = node.nodeValue;
  const start = performance.now();
  const step = (now) => {
    const p = Math.min((now - start) / DURATION, 1);
    const eased = 1 - (1 - p) ** 3;
    node.nodeValue = p < 1 ? format(from + (to - from) * eased) : final;
    if (p < 1) requestAnimationFrame(step);
  };
  node.nodeValue = format(from);
  requestAnimationFrame(step);
}

/**
 * Restarts a CSS animation class on an element (removed again when it ends).
 * @param {Element|null} el
 * @param {string} className e.g. "motion-fade"
 */
export function replay(el, className) {
  if (!el || !motionAllowed()) return;
  // Clear any running animation (a tab panel already has one of the same name),
  // force a reflow, then add the class, so the animation starts again.
  el.classList.remove(className);
  el.style.animation = "none";
  void el.getBoundingClientRect();
  el.style.animation = "";
  el.classList.add(className);
  el.addEventListener("animationend", () => el.classList.remove(className), { once: true });
}

/** Lights an element up briefly: its value just changed. */
export function flash(el) {
  replay(el, "motion-changed");
}

/**
 * Lets an element rise into place.
 * @param {Element|null} el
 * @param {number} [order] its turn when several rise together
 */
export function rise(el, order = 0) {
  if (!el || !motionAllowed()) return;
  el.style.animationDelay = `${order * STAGGER}ms`;
  replay(el, "motion-rise");
  el.addEventListener("animationend", () => { el.style.animationDelay = ""; }, { once: true });
}

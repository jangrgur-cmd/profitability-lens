// dom.js: a tiny helper for building DOM elements without HTML strings, so
// text typed by the user (a company name, an imported file) is never parsed
// as HTML.

/**
 * Creates an element.
 *   h("p", { class: "note" }, "Hello ", h("strong", {}, "world"))
 * Props: `class`, `text`, `on: {event: handler}`, `dataset: {...}`; any other
 * key becomes an attribute (skipped when null, undefined or false; `true`
 * gives an empty attribute). Children may be nodes, strings, numbers,
 * arrays of these, or null/false (skipped).
 * @param {string} tag
 * @param {Record<string, any>} [props]
 * @param {...any} children
 * @returns {HTMLElement}
 */
export function h(tag, props = {}, ...children) {
  const el = tag.startsWith("svg:")
    ? document.createElementNS("http://www.w3.org/2000/svg", tag.slice(4))
    : document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === "class") el.setAttribute("class", value);
    else if (key === "text") el.textContent = value;
    else if (key === "on") for (const [event, handler] of Object.entries(value)) el.addEventListener(event, handler);
    else if (key === "dataset") Object.assign(el.dataset, value);
    else el.setAttribute(key, value === true ? "" : String(value));
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    if (Array.isArray(child)) append(el, child);
    else el.append(child instanceof Node ? child : String(child));
  }
}

/** Replaces all children of an element. */
export function replaceChildren(el, ...children) {
  el.replaceChildren();
  append(el, children);
}

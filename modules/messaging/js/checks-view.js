// checks-view.js: the Data checks tab (pass/fail list).

import { runDataChecks } from "./checks.js";
import { formatInteger } from "../../../src/shared/format.js";

const $ = (id) => document.getElementById(id);

/** Creates an element with optional class and text. */
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function createChecksView(model) {
  /** @param {object[]} rows rows after the global filters */
  function render(rows) {
    const results = runDataChecks(model, rows);
    const failed = results.filter((r) => !r.pass);
    $("checks-summary").textContent = failed.length === 0
      ? `All ${results.length} checks pass. Revenue reconciliations use the ${formatInteger(rows.length)} rows in the current selection; the other checks use all ${formatInteger(model.rows.length)} rows.`
      : `${failed.length} of ${results.length} checks fail: ${failed.map((r) => r.label).join("; ")}.`;

    $("checks-list").replaceChildren(...results.map((r) => {
      const li = el("li", `check ${r.pass ? "check--pass" : "check--fail"}`);
      const badge = el("span", "check-badge", r.pass ? "✓ Pass" : "✗ Fail");
      const body = el("div", "check-body");
      const head = el("div", "check-head");
      head.append(el("strong", "", r.label), el("span", "check-scope", r.scope === "selection" ? "Current selection" : "All data"));
      body.append(head, el("p", "check-detail", r.detail));
      li.append(badge, body);
      return li;
    }));
  }

  return { render };
}

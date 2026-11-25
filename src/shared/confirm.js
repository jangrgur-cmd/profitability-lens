// confirm.js: an in-page "are you sure?" dialog, used instead of window.confirm.
//
// Browsers can silence window.confirm (an embedded browser, a page whose
// dialogs the user has blocked): it then returns false at once, without
// showing anything, and the action silently does nothing. This dialog is part
// of the page, so it always shows. UI only.

import { h } from "./dom.js";
import { t } from "./i18n.js";

/** @type {HTMLDialogElement|null} */
let dialog = null;
let message;
let yes;
let no;

/** Creates the dialog once, on first use. */
function build() {
  if (dialog) return;
  message = h("p", { id: "confirm-message", class: "confirm__message" });
  no = h("button", { type: "submit", value: "no", class: "button" }, t("common.cancel"));
  yes = h("button", { type: "submit", value: "yes", class: "button button--primary" });
  dialog = h("dialog", { class: "confirm-dialog", role: "alertdialog", "aria-describedby": "confirm-message" },
    h("form", { method: "dialog", class: "confirm" },
      message,
      h("div", { class: "confirm__actions" }, no, yes)));
  dialog.setAttribute("aria-labelledby", "confirm-message");
  document.body.append(dialog);
}

/**
 * Asks before an action that loses data. Cancel, Esc and the cancel button
 * all mean no; focus goes back to the element that was focused before.
 * @param {string} question the question, in the current language
 * @param {{confirmLabel?: string}} [options] confirmLabel: the button that goes ahead, named after the action ("Clear")
 * @returns {Promise<boolean>} true when the user goes ahead
 */
export function confirmAction(question, { confirmLabel = t("common.confirm") } = {}) {
  build();
  if (dialog.open) return Promise.resolve(false);
  message.textContent = question;
  yes.textContent = confirmLabel;
  const opener = document.activeElement;
  return new Promise((resolve) => {
    dialog.addEventListener("close", () => {
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
      resolve(dialog.returnValue === "yes");
    }, { once: true });
    dialog.returnValue = "";
    dialog.showModal();
    no.focus(); // the safe choice is the default
  });
}

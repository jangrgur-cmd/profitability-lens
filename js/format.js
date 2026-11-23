// format.js: number formatting used everywhere in the UI.
// EUR amounts are abbreviated (€1.2M, €45.3k), percentages use one decimal,
// per-message figures use four decimals (0.0123 €/msg).

const MINUS = "−"; // typographic minus sign, same width as a digit

/** Adds a typographic minus for negative numbers. */
function signed(text, value) {
  return value < 0 ? MINUS + text : text;
}

/**
 * Formats a euro amount in short form.
 * 1 234 567 → "€1.2M", 45 300 → "€45.3k", 512 → "€512", −15 244 → "−€15.2k".
 * @param {number|null} value
 */
export function formatEur(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "n/a";
  const abs = Math.abs(value);
  let text;
  if (abs >= 1e9) text = `€${(abs / 1e9).toFixed(1)}B`;
  else if (abs >= 1e6) text = `€${(abs / 1e6).toFixed(1)}M`;
  else if (abs >= 1e3) text = `€${(abs / 1e3).toFixed(1)}k`;
  else text = `€${abs.toFixed(0)}`;
  return signed(text, value);
}

/**
 * Formats a share as a percentage with one decimal: 0.2214 → "22.1%".
 * null (for example margin on zero revenue) → "n/a".
 */
export function formatPct(share) {
  if (share === null || share === undefined || Number.isNaN(share)) return "n/a";
  return signed(`${Math.abs(share * 100).toFixed(1)}%`, share);
}

/** Formats a per-message amount: 0.012345 → "0.0123 €/msg". */
export function formatPerMessage(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "n/a";
  return signed(`${Math.abs(value).toFixed(4)} €/msg`, value);
}

/** Formats a message count in short form: 821 584 062 → "821.6M". */
export function formatCount(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "n/a";
  const abs = Math.abs(value);
  let text;
  if (abs >= 1e9) text = `${(abs / 1e9).toFixed(1)}B`;
  else if (abs >= 1e6) text = `${(abs / 1e6).toFixed(1)}M`;
  else if (abs >= 1e3) text = `${(abs / 1e3).toFixed(1)}k`;
  else text = abs.toFixed(0);
  return signed(text, value);
}

/** Formats a whole number with thousands separators: 1234567 → "1,234,567". */
export function formatInteger(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "n/a";
  return signed(Math.abs(Math.round(value)).toLocaleString("en-US"), value);
}

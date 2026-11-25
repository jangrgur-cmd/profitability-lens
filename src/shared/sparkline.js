// sparkline.js: geometry of a small trend line (one value per year).
// Pure: values in, SVG path data out; the page only draws it.

/**
 * @param {(number|null)[]} values oldest first; null leaves a gap
 * @param {{width?: number, height?: number, pad?: number}} [size]
 * @returns {{path: string, points: {x: number, y: number, value: number}[], last: {x: number, y: number}|null, zeroY: number|null}}
 *   path: "M…L…" segments (a null breaks the line); zeroY: the y of 0 when the range crosses it
 */
export function sparklineGeometry(values, { width = 96, height = 28, pad = 3 } = {}) {
  const known = values.filter((v) => v !== null && v !== undefined && Number.isFinite(v));
  if (known.length === 0) return { path: "", points: [], last: null, zeroY: null };
  let min = Math.min(...known);
  let max = Math.max(...known);
  if (min === max) { min -= 1; max += 1; }
  const step = values.length > 1 ? (width - 2 * pad) / (values.length - 1) : 0;
  const y = (v) => pad + (1 - (v - min) / (max - min)) * (height - 2 * pad);
  const round = (n) => Math.round(n * 10) / 10;
  const points = [];
  let path = "";
  let pen = false;
  values.forEach((v, i) => {
    if (v === null || v === undefined || !Number.isFinite(v)) { pen = false; return; }
    const p = { x: round(values.length > 1 ? pad + i * step : width / 2), y: round(y(v)), value: v };
    points.push(p);
    path += `${pen ? "L" : "M"}${p.x} ${p.y}`;
    pen = true;
  });
  const lastPoint = points.at(-1);
  return { path, points, last: lastPoint ? { x: lastPoint.x, y: lastPoint.y } : null, zeroY: min < 0 && max > 0 ? round(y(0)) : null };
}

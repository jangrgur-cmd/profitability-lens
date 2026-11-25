// tables.js: sortable data tables.
//
// A table is described by columns:
//   { key, label, type: "text" | "number", value(row), format(value, row), cell(row), className }
// - value(row): the raw value used for sorting and CSV (default: row[key])
// - format(value, row): text shown in the cell (default: the value as text)
// - cell(row): optional, returns a DOM node instead of plain text
// Clicking a column header sorts by it; clicking again reverses the order.

import { t } from "../../../src/shared/i18n.js";

/**
 * Sorts rows by one column. Text sorts A→Z, numbers small→large; "desc" reverses.
 * null values always go last. Ties keep their original order (stable sort).
 * @returns {object[]} a new, sorted array
 */
export function sortRows(rows, column, direction = "asc") {
  const valueOf = column.value ?? ((row) => row[column.key]);
  const sign = direction === "desc" ? -1 : 1;
  return rows
    .map((row, index) => ({ row, index, v: valueOf(row) }))
    .sort((a, b) => {
      if (a.v === null || a.v === undefined) return b.v === null || b.v === undefined ? a.index - b.index : 1;
      if (b.v === null || b.v === undefined) return -1;
      const diff = column.type === "number" ? a.v - b.v : String(a.v).localeCompare(String(b.v));
      return diff === 0 ? a.index - b.index : sign * diff;
    })
    .map((x) => x.row);
}

/**
 * Creates a sortable table inside `container`.
 * @param {HTMLElement} container
 * @param {{columns: object[], caption: string, sort: {key: string, direction: "asc"|"desc"},
 *          rowClass?: (row) => string, onRowClick?: (row) => void, rowLabel?: (row) => string,
 *          isSelected?: (row) => boolean}} options
 * @returns {{ render(rows: object[]): void, sortedRows(): object[] }}
 */
export function createSortableTable(container, options) {
  const { columns, caption } = options;
  let sort = { ...options.sort };
  let currentRows = [];

  const table = document.createElement("table");
  table.className = "data-table";
  const captionEl = document.createElement("caption");
  captionEl.className = "sr-only";
  captionEl.textContent = caption;
  const thead = document.createElement("thead");
  const tbody = document.createElement("tbody");
  table.append(captionEl, thead, tbody);
  const scroller = document.createElement("div");
  scroller.className = "table-scroll";
  scroller.tabIndex = 0;
  scroller.setAttribute("role", "region");
  scroller.setAttribute("aria-label", caption);
  scroller.append(table);
  container.replaceChildren(scroller);

  function renderHeader() {
    const tr = document.createElement("tr");
    for (const column of columns) {
      const th = document.createElement("th");
      th.scope = "col";
      th.className = column.type === "number" ? "num" : "";
      const active = sort.key === column.key;
      th.setAttribute("aria-sort", active ? (sort.direction === "asc" ? "ascending" : "descending") : "none");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "sort-button";
      button.textContent = column.label;
      const arrow = document.createElement("span");
      arrow.className = "sort-arrow";
      arrow.setAttribute("aria-hidden", "true");
      arrow.textContent = active ? (sort.direction === "asc" ? "▲" : "▼") : "";
      button.append(arrow);
      button.addEventListener("click", () => {
        const firstDirection = column.type === "number" ? "desc" : "asc";
        sort = active ? { key: column.key, direction: sort.direction === "asc" ? "desc" : "asc" } : { key: column.key, direction: firstDirection };
        render(currentRows);
      });
      th.append(button);
      tr.append(th);
    }
    thead.replaceChildren(tr);
  }

  function sortedRows() {
    const column = columns.find((c) => c.key === sort.key) ?? columns[0];
    return sortRows(currentRows, column, sort.direction);
  }

  function render(rows) {
    currentRows = rows;
    renderHeader();
    const body = sortedRows().map((row) => {
      const tr = document.createElement("tr");
      const extra = options.rowClass?.(row);
      if (extra) tr.className = extra;
      if (options.isSelected?.(row)) tr.setAttribute("aria-selected", "true");
      columns.forEach((column, i) => {
        const cell = document.createElement(i === 0 ? "th" : "td");
        if (i === 0) cell.scope = "row";
        if (column.type === "number") cell.className = "num";
        if (column.className) cell.classList.add(column.className);
        if (column.cell) {
          cell.append(column.cell(row));
        } else {
          const value = column.value ? column.value(row) : row[column.key];
          cell.textContent = column.format ? column.format(value, row) : String(value ?? "");
        }
        tr.append(cell);
      });
      if (options.onRowClick) {
        tr.classList.add("is-clickable");
        tr.addEventListener("click", (event) => {
          if (event.target.closest("button, a")) return; // the row button handles itself
          options.onRowClick(row);
        });
      }
      return tr;
    });
    if (body.length === 0) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = columns.length;
      td.className = "empty";
      td.textContent = options.emptyText ?? t("seg.noTraffic");
      tr.append(td);
      body.push(tr);
    }
    tbody.replaceChildren(...body);
  }

  return { render, sortedRows };
}

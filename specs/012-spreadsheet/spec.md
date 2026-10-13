# Feature: `c2-spreadsheet` — a small editable grid with basic formulas

**Status**: Design (not started)
**Roadmap**: row 91 (section G), `c2-spreadsheet`, P3.
**Related**: `c2-table` shows records with typed columns and stays read-only. `c2-spreadsheet` is a free-form grid where any cell can hold a value or a formula.

## Problem

Apps often need a small calculating grid inside a page: a budget, a quote with line items, a price list, a pay split, a grade sheet. Today the options are an embedded Google Sheet (an iframe, an account and no theming) or a full spreadsheet library (Handsontable, Univer, Jspreadsheet Pro), which costs hundreds of kilobytes and, for most of them, a commercial licence.

`c2-spreadsheet` is the small version: one sheet, up to a few thousand cells, about twenty functions, keyboard editing that feels like Sheets and Excel, and copy and paste that works with both. It does not try to replace a spreadsheet app.

## Research

Checked on 2026-10-13.

| Option                                                                                       | Formulas                     | Licence                                  | Fit                                                                                                               |
| -------------------------------------------------------------------------------------------- | ---------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| [HyperFormula](https://hyperformula.handsontable.com/docs/guide/licensing)                   | ~400, Excel-compatible       | GPLv3 or paid, `licenseKey` required     | Rejected. GPLv3 cannot ship inside an MIT/commercial component, and a paid key cannot be passed on to our users.  |
| [Jspreadsheet CE](https://bossanova.uk/jspreadsheet/blog/open-source-javascript-spreadsheet) | None (formulas are Pro only) | MIT (CE), Pro from about $2,400 per year | Rejected as a dependency. Useful as a model for the grid and its keyboard behaviour.                              |
| [fast-formula-parser](https://npmjs.com/package/fast-formula-parser)                         | ~280                         | MIT                                      | Rejected. Pulls in Chevrotain, and the project is moving to `@sheetxl/formulas`, so its future is unclear.        |
| [hot-formula-parser](https://npmjs.com/package/hot-formula-parser)                           | Excel set through formula.js | MIT                                      | Rejected. Unmaintained since 2021, and formula.js brings in far more functions than v1 needs.                     |
| Own evaluator                                                                                | The 20 listed below          | Ours                                     | **Chosen.** A recursive-descent parser and evaluator is a few hundred lines with no `eval`, roughly 4 kB gzipped. |

What the products agree on, and so what v1 copies:

- **Keyboard model** (Sheets, Excel, Numbers, Airtable): arrows move, typing replaces the cell, `Enter` / `F2` / double-click edits in place, `Enter` commits and moves down, `Tab` commits and moves right, `Escape` cancels, `Delete` clears, `Shift`+arrows extend the range, `Ctrl`/`⌘`+`C`/`X`/`V` copy, cut and paste, `Ctrl`/`⌘`+`Z`/`Y` undo and redo.
- **Clipboard as tab-separated text.** Excel, Sheets and Numbers all read and write TSV in `text/plain`, so a range copied from any of them pastes into the grid and back.
- **Formula bar and name box.** Every spreadsheet shows the active cell's address and its raw input above the grid. It is the only place a formula is visible without editing.
- **Selection summary.** Sheets, Excel and Numbers show Sum, Average and Count of the selected range in a corner. It is cheap and is the feature people use most after `SUM`.
- **Error values in the cell.** `#DIV/0!`, `#REF!`, `#NAME?`, `#VALUE!`, and a circular reference error, shown in the cell, with the message in a tooltip.

## Scope

**In v1**

- One sheet, `rows` × `columns` cells (defaults 20 × 8). No virtualisation; the target is up to about 5,000 cells.
- Values: numbers, text, booleans. A leading `=` makes a formula. A leading `'` forces text.
- Formulas: `+ - * / ^ &`, `= <> < > <= >=`, parentheses, unary minus, `%` suffix, `A1` references, `A1:B5` ranges, `$A$1` accepted (the `$` only matters for paste, below).
- Functions: `SUM`, `AVERAGE`, `MIN`, `MAX`, `COUNT`, `COUNTA`, `ROUND`, `ABS`, `IF`, `AND`, `OR`, `NOT`, `IFERROR`, `CONCAT`, `LEN`, `UPPER`, `LOWER`, `TRIM`, `TODAY`, `SUMIF`. Apps register more with `functions`.
- Recalculation through a dependency graph: changing a cell recalculates only the cells that depend on it. A cycle gives `#CIRC!` in each cell of the cycle.
- Column options: header label, width and a display `format` (`number`, `currency`, `percent`, `text`). The format changes the display only, never the stored value. A number typed as `10%` or `$12` keeps that look in its cell, whatever the column format.
- Optional formula bar, optional selection summary, `readonly`, undo and redo.
- Paste of a formula shifts its relative references, so pasting `=B2*C2` one row down gives `=B3*C3`. `$` pins a row or column.

**Later (not v1)**

- Fill handle (drag to fill a series or copy a formula). It is in the roadmap row. It comes in v1.1 because paste-with-shift already covers the common case.
- Insert and delete rows and columns, column resize by drag, sort, filter.
- Per-cell styling (bold, colours, alignment), merged cells, frozen rows and columns beyond the sticky headers.
- Several sheets, cross-sheet references, named ranges.
- XLSX import and export, charts, collaboration.
- Virtualised rendering for large sheets.

## Usage

```html
<c2-spreadsheet rows="8" columns="4" formula-bar summary></c2-spreadsheet>

<script type="module">
  import '@c2n/components/spreadsheet'

  const sheet = document.querySelector('c2-spreadsheet')
  sheet.columns = [
    { label: 'Item', width: 200 },
    { label: 'Qty', format: 'number' },
    { label: 'Unit price', format: 'currency' },
    { label: 'Total', format: 'currency' },
  ]
  sheet.data = [
    ['Flights', 4, 320, '=B1*C1'],
    ['Hotel (3 nights)', 2, 145, '=B2*C2*3'],
    ['Total', '', '', '=SUM(D1:D2)'],
  ]
  sheet.addEventListener('cell-change', (e) => console.log(e.detail.ref, e.detail.value))
</script>
```

## Public API

| Property     | Attribute     | Type                                  | Default | Purpose                                                                                                                       |
| ------------ | ------------- | ------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `data`       | `data`        | `CellInput[][]`                       | `[]`    | Raw inputs, row by row (`string \| number \| boolean \| null`; strings starting with `=` are formulas). JSON as an attribute. |
| `rows`       | `rows`        | `number`                              | `20`    | Row count. Grows to fit `data`.                                                                                               |
| `columns`    | —             | `number \| SpreadsheetColumn[]`       | `8`     | Column count, or one options object per column: `{ label?, width?, format?, align? }`. Labels default to A, B, C…             |
| `formulaBar` | `formula-bar` | `boolean`                             | `false` | Shows the name box and formula bar above the grid.                                                                            |
| `summary`    | `summary`     | `boolean`                             | `false` | Shows Sum, Average and Count of the selection below the grid.                                                                 |
| `readonly`   | `readonly`    | `boolean`                             | `false` | Selection and copy work; editing, paste and delete do not.                                                                    |
| `locale`     | `locale`      | `string`                              | page    | Number and currency formatting through `Intl.NumberFormat`. Formula syntax stays English (`,` separator).                     |
| `currency`   | `currency`    | `string`                              | `'USD'` | Currency code for the `currency` format.                                                                                      |
| `functions`  | —             | `Record<string, SpreadsheetFunction>` | —       | Extra functions, `(args: CellValue[]) => CellValue`. Names are upper-cased.                                                   |

Methods:

- `getValue(ref)` returns the computed value of a cell (`'D3'`). `getInput(ref)` returns its raw input.
- `setInput(ref, input)` writes one cell and recalculates. It is recorded in undo history.
- `select(range)` selects `'A1'` or `'A1:C4'` and scrolls it into view.
- `toCSV()` and `toTSV()` export computed values. `data` always holds the raw inputs.
- `undo()`, `redo()`.

Events:

| Event              | Detail                                           | Notes                                                                                                       |
| ------------------ | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `cell-change`      | `{ changes: { ref, input, value, previous }[] }` | One event per edit, paste, delete or undo, listing every cell the user changed (not the recalculated ones). |
| `selection-change` | `{ range: string, active: string }`              | Does not bubble, like every other `selection-change` in c2n.                                                |
| `input` / `change` | —                                                | Fired with `cell-change`, so generic two-way bindings see edits.                                            |

## Theming

All presentation is CSS variables, defaults in the `$theme` map, chosen from literals the theme generator already maps:

- `--c2-spreadsheet--border`, `--c2-spreadsheet--border-radius` (8px), `--c2-spreadsheet--font-size` (14px), `--c2-spreadsheet--max-height`.
- `--c2-spreadsheet__cell--height` (32px), `--c2-spreadsheet__cell--padding`, `--c2-spreadsheet__cell--min-width` (96px), `--c2-spreadsheet__cell--border-color` (`#e4e4e7`).
- `--c2-spreadsheet__header--background-color` (`#fafafa`), `--c2-spreadsheet__header--color` (`#71717a`), `--c2-spreadsheet__header__selected--background-color` (`#edf1fe`), `--c2-spreadsheet__header__selected--color` (`#0265dc`).
- `--c2-spreadsheet__active--border-color` (`#0265dc`), `--c2-spreadsheet__range--background-color` (`rgba(2, 101, 220, 0.08)`).
- `--c2-spreadsheet__error--color` (`#dc2626`), `--c2-spreadsheet__reference--color` (the colours that outline the cells a formula reads while it is edited).
- `--c2-spreadsheet__formula-bar--background-color`, `--c2-spreadsheet__formula-bar--font-family` (monospace), `--c2-spreadsheet__summary--color`.

## Accessibility

- The grid is `role="grid"` inside the shadow root, with `aria-rowcount`, `aria-colcount`, `row` / `columnheader` / `rowheader` / `gridcell` roles and `aria-selected` on selected cells. These attributes live on shadow elements, so the no-host-attribute rule is kept.
- One cell is focusable at a time (roving `tabindex`). `Tab` inside the grid moves between cells while editing and leaves the grid when not editing, so keyboard users are never trapped.
- Each cell's accessible name is its address and value (`D3, 1,280.00`). A formula cell adds its formula as the description.
- Editing uses a real `<input>` overlaid on the cell, labelled with the cell address.
- Errors are announced through a polite live region (`D4: division by zero`).

## Bundle

No runtime dependencies besides Lit and `@c2n/core`. The formula engine (`src/formula/{tokenize,parse,evaluate,functions}.ts`) is internal, has no DOM, and is unit-tested with `node --test`. Budget: under 12 kB gzipped for the entry.

## Test plan

- Engine: operator precedence, references and ranges, each function, errors (`#DIV/0!`, `#REF!`, `#NAME?`, `#VALUE!`), cycles, dependent-only recalculation, reference shift on paste.
- Browser: typing, `Enter` / `Tab` / `Escape` / `F2`, arrow and `Shift`+arrow selection, `Delete`, undo and redo, TSV copy and paste (with the clipboard events, not the permission API), `readonly`, `cell-change` detail, non-bubbling `selection-change`.
- Accessibility: axe on the default and editing states, roles and `aria-selected` on a range.

## Open questions

1. Should `data` also accept an object keyed by address (`{ A1: 'Item', D3: '=SUM(D1:D2)' }`) for sparse sheets?
2. Keep `SUMIF` in v1, or leave conditional functions for later?
3. Is the fill handle needed in v1 after all? It is the one roadmap feature left out.

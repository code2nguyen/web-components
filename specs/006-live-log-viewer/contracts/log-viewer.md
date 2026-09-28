# c2-log-viewer contract

- `tabular: boolean = true` (reflected attribute): columns with sticky shorter cell content bounded by the entry.
- `wrap: boolean = false` (reflected attribute): measured token wrapping; false permits horizontal scrolling.
- `columns: readonly string[] = []` (property only): display order; empty auto-discovers timestamp/level/source, other attributes, message.
- `appendEntries(LogEntry | readonly LogEntry[]): void`: atomic validated snapshots, required message; arbitrary string attributes accepted.
- `setFilter(LogFilter | null, mode: LogFilterMode = 'filter'): void`: replace criteria; filter mode shows only matches and returns to the beginning, highlight mode marks matches while preserving all entries and the reading position; retained data untouched. Exact case sensitive attributes, OR within arrays, AND between attributes/search. Missing values do not match. Search across all attributes uses a case insensitive substring.
- `clear(): void`: remove entries, preserve criteria.
- `scrollToEnd(): void`: tail and follow future appends.
- `entryCount: number`: readonly retained count.
- `filteredCount: number`: readonly matching count, current after updateComplete.

No public slots, filter/search controls, custom interaction events or statistics UI. Scroll region inherits accessible name from host aria-label with fallback Log content.

Parts: viewport, content, entry, cell, text, empty, highlight, token, copy-button, copy-icon. CSS defaults and properties are declared in source JSDoc and generated manifest.

Tests must cover varying heights, tall row sticky boundaries, bounded DOM at 10k entries, visible line slicing within one tall plain entry, first/last reachability, wrap/resize/font reflow, anchor stability, tail-follow, safe text, atomic validation, retained data during filtering, future appends and keyboard/axe accessibility.

`LogFilterMode` is exported as `filter | highlight`. `filteredCount` is the matching count in both modes. Invalid modes/criteria are atomic. null clears both criteria and highlights. Highlighting supports both display layouts, virtual scrolling, append and clear; clear retains the current mode and criteria.

Tabular attribute widths are measured from the widest explicit line across all retained entries plus cell padding. Message alone fills remaining viewport space, respecting its CSS minimum. Filter/highlight mode does not shrink column widths. Appends measure new attribute values and reflow when maxima grow. Unwrapped messages increase scroll extent without expanding attribute columns.

Visible entries include a hover/focus copy action (always available on touch), copying their full original message only. Source indexes resolve the correct message after filtering/virtualization. Clipboard success shows a temporary check mark and live status; failure announces a retry message. Button overlays do not change row/column measurements.

Message readability: automatic lightweight token colors in both layouts for standalone severity words, timestamps, quoted values, numbers, URLs and recognizable IDs. Ordinary prose is neutral. Logical lines touched by the rendered window are tokenized lazily and projected onto wrapped/visible fragments with safe Lit text spans; no full-code highlighting engine. Colors use the existing severity/timestamp variables and the documented token color variable; they do not affect virtual geometry or clipboard text. Filter highlight backgrounds remain independent.

When the viewport itself has focus, Home (with or without Ctrl/Command) jumps to the start and stops tail following; End jumps to the end and resumes following. PageUp/PageDown move by the viewport height minus one line; Up/Down move by one line. Vertical keyboard movements are immediate. Left/Right retain native horizontal scrolling, and copy-button keys are not intercepted.

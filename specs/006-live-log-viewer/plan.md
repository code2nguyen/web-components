# Implementation plan — revised 2026-09-26

Lit 3 / TypeScript / SCSS, existing package and documentation wiring. No added runtime dependencies.

## Architecture

- `log-model.ts`: atomic string-attribute snapshots, discovered column order, attribute/full text filter matching.
- `log-position.ts`: measured text line splitting and cumulative variable-height index with binary viewport lookup.
- `log-viewer.ts`: one keyboard scroll viewport. Visible rows plus 200px overscan. Tabular rows use an aligned CSS grid and stretch cells with sticky text bounded by each row. Plain mode renders visible line slices of concatenated entry text.
- Attribute columns measure their widest retained value plus padding; message alone uses remaining viewport width. New appends update width maxima from the suffix; filtering preserves widths.
- Canvas text measurement matches the documented font API. Wrapping inserts explicit newlines so computed heights and displayed text agree. Preserve newline/empty-line semantics; normalize tabs to four spaces.
- ResizeObserver monitors viewport and font probe. Reflow rebuilds the index; appends reuse unchanged layout and add only the suffix when layout parameters stay stable. No DOM measurement of every stored row.
- Preserve top source entry and fractional line offset during reflow. Follow appends at the tail; `scrollToEnd()` explicitly resumes following.
- Filter changes rescan retained entries and return to the beginning. Source entries remain in memory. Auto column discovery uses all stored entries, so filtering does not change the schema.

## Public API

`appendEntries`, `clear`, `setFilter`, `scrollToEnd`, readonly `entryCount` and `filteredCount`; behavioral properties `tabular`, `wrap`, `columns`. No slots or built-in filter/statistics chrome. Presentation uses documented CSS variables and parts.

## Verification

Pure model/index tests; focused repository component tests in Chromium, Firefox and WebKit for geometry, stickiness, variable-height virtualization, large-entry line slicing, filtering, appends, anchoring, wrapping, keyboard accessibility and CSS reflow. Build package/manifest/framework declarations, docs/app and theme; root lint/format/type/docs gates. Known unrelated Angular example build failure is recorded separately.

Message readability: automatic lightweight token colors in both layouts for standalone severity words, timestamps, quoted values, numbers, URLs and recognizable IDs. Ordinary prose is neutral. Only rendered text is tokenized with safe Lit text spans; no full-code highlighting engine. Colors use the existing severity/timestamp variables and the documented token color variable; they do not affect virtual geometry or clipboard text. Filter highlight backgrounds remain independent.

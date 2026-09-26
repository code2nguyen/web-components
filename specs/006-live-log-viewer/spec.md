# Feature: Virtual Log Content Viewer

**Status**: Implemented
**Completed**: 2026-09-26

## Scope revision — 2026-09-26

The latest user instruction supersedes the original slots, filter navigation, saved-filter UI, statistics bar, dual panes and nonvirtual rendering design. Focus exclusively on log content; expose filtering/search as functions for external components.

## User stories

1. Read a large live text log with variable-height virtual scrolling. Only a visible window plus overscan is rendered. Multiline entries and wrapped entries need different heights. Retain entries in memory; append batches atomically and safely display text.
2. Display attributes as aligned columns by default (`tabular=true`). A short attribute sticks while the tallest attribute in its entry scrolls; it stops at its own row boundary. Column order is configurable; arbitrary text attributes are accepted.
3. Disable tabular mode to display continuous text: concatenate visible attributes with spaces, entries with newlines. Virtualize visible text lines, including lines inside one exceptionally tall entry.
4. Applications call `setFilter` with exact attribute criteria and full text search. Criteria do not delete stored entries and apply to future appends. No built-in filter controls, slots or statistics UI.
5. Enable/disable wrapping, preserve reading position during layout changes, and follow live appends only when already at the tail. Provide keyboard scrolling and accessible viewport naming.

## Acceptance criteria

- Default tabular mode aligns columns across variable-height rows.
- Short cell contents stick at the top of the viewport until the row bottom pushes them out.
- At 10,000 variable-height entries, DOM row count stays bounded by the viewport plus overscan, and the first and last entries remain reachable.
- Plain mode slices large entries into visible text lines with accurate total scroll height.
- Measured glyph widths and explicit line breaks determine heights; no uniform row-height assumption.
- `wrap=false` allows horizontal scrolling; `wrap=true` breaks long tokens without losing text.
- `setFilter({ attributes, search })` uses OR inside attribute value arrays and AND across attributes/search. Attribute comparisons are case sensitive; full text substring search across every attribute is case insensitive. null restores retained entries.
- `appendEntries` and `setFilter` validate and snapshot inputs; invalid batches/criteria do not partially change state.
- Arbitrary string attributes and a required string message; no HTML interpretation.
- Reflow from width/font/wrap changes preserves the top source entry and relative offset unless following the tail.
- There are no slots, built-in filter/search controls, statistics or second result pane.

## Out of scope

Fetching, transport, persistence, retention policy, built-in filters/search fields, export and selection across unrendered text.

## Default appearance and examples — 2026-09-26 follow-up

The component must look polished without any consumer CSS overrides. Defaults provide monospace typography, compact metadata columns, readable cell spacing, subtle row dividers, muted timestamps/secondary attributes and distinct info/warning/error colors. Keep the terminal palette coherent when the shared site theme is loaded.

Docs prioritize virtual scrolling and sticky tabular attributes, using a 10,000-request server access stream and a commercial checkout incident with request context, stack trace, retry timeline and recovery. Primary examples use the built-in component styling. Gallery examples are wide enough to read their content and include a separate optional light theme.

## Filtering display modes — 2026-09-26 follow-up

`setFilter(criteria, mode)` supports `filter` (default; display matches only) and `highlight` (mark matching entries while retaining all other entries in view). Highlighting preserves reading context, works with both tabular and plain layouts, and applies to future appends. null clears criteria/highlights. Matching count remains independent of displayed count. Highlight colors and accent are documented CSS variables.

## Automatic attribute sizing — 2026-09-26 follow-up

Every non-message attribute column is sized from its widest retained value (the widest explicit line for multiline attributes), including cell padding. Only the message column takes remaining viewport width. Apply this sizing with wrap enabled or disabled. Filtering/highlighting keep widths stable; appending a wider attribute grows its column and reflows text while preserving the reading anchor. Long unwrapped messages add horizontal scroll extent without expanding the attribute columns. No fixed attribute-width CSS setting is required.

## Hover copy — 2026-09-26 follow-up

Visible entries expose a copy action on hover and keyboard focus; touch devices show the action directly. Copy the complete original message only, including unrendered text. Show success and announce success/failure. Copy works in tabular/plain and filter/highlight modes, remains available while reading a tall entry, and does not affect text measurements or column widths.

Message readability: automatic lightweight token colors in both layouts for standalone severity words, timestamps, quoted values, numbers, URLs and recognizable IDs. Ordinary prose is neutral. Only rendered text is tokenized with safe Lit text spans; no full-code highlighting engine. Colors use the existing severity/timestamp variables and the documented token color variable; they do not affect virtual geometry or clipboard text. Filter highlight backgrounds remain independent.

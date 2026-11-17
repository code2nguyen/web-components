---
spec: catalog-filter
direction: default
build: lab/apps/catalog-filter/default
target: catalog-filter
builder: agent (Claude Code, c2n MCP server)
date: 2026-11-17
---

# Build report: catalog-filter / default

Plain JavaScript and one HTML page, built from the spec with the c2n MCP server (`search_components`,
`get_component`, `validate_markup`: no problems). Lab run: every journey passed for every persona it applies to, twice
(T1–T7 as mouse, keyboard, dark and French, T7–T8 on a phone). The keyboard persona compared the focus ring on 78
controls and found none missing.

## Requirements

| Req | Outcome     | Components                                   | Notes                                                                                                                                                                                                                                                                                                                                           |
| --- | ----------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | met         | c2-search-field, c2-highlight                | `findMatches` (exported next to `c2-highlight`) filters with the same matcher the highlight marks with, accents ignored on both.                                                                                                                                                                                                                |
| R2  | workaround  | c2-facet-list                                | Every value carries Only and Exclude buttons (a Datadog log-search idiom) and there is no attribute to turn them off; a shop offers neither. Hidden with the documented `::part(action) { display: none }`. The app also has to handle `exclude` in case a value arrives excluded.                                                              |
| R3  | met         | c2-facet-list                                | The facet only displays counts; the app computes them with every other filter applied, which is the app's job.                                                                                                                                                                                                                                  |
| R4  | workaround  | c2-slider, c2-number-input                   | `c2-slider mode="range"` drags and steps but cannot be typed into, so two `c2-number-input`s sit under it and the app keeps the three in step (about 20 lines). The number inputs' stepper buttons are all named "Increase value" / "Decrease value", without the field's name.                                                                 |
| R5  | met         | c2-switch                                    |                                                                                                                                                                                                                                                                                                                                                 |
| R6  | met         | c2-chip, c2-chip-group                       | `removable` chips in an `expanded` `c2-chip-group`, which Chrome exposes as the group "Active filters"; one `remove` listener on the group serves every chip. The builder first missed `c2-chip-group` (`search_components` "filter chips removable" does not return it) and hand-wrote a `<div>`; the gap script's coverage list turned it up. |
| R7  | met         | c2-button                                    |                                                                                                                                                                                                                                                                                                                                                 |
| R8  | met         | c2-select, c2-list-item                      |                                                                                                                                                                                                                                                                                                                                                 |
| R9  | met         | c2-status-panel, c2-button                   | Found only by name: `search_components` "empty state no results" did not return `c2-status-panel`, whose description says "empty states".                                                                                                                                                                                                       |
| R10 | hand-rolled | (none)                                       | No component announces a changing count; searches for "live region", "announcer", "aria-live" return only tables. The count is a `<p role="status">`.                                                                                                                                                                                           |
| R11 | workaround  | c2-sheet, c2-button                          | No component is a sidebar on a wide screen and a drawer on a phone. The app moves the one filter panel between the `<aside>` and a `c2-sheet` on a `matchMedia` change, so there is still a single set of controls and one state.                                                                                                               |
| R12 | met         | c2-facet-list, c2-slider, c2-switch, c2-chip | Facet values read as checkboxes "Tents, 3"; the range thumbs as "Price, Minimum" / "Price, Maximum".                                                                                                                                                                                                                                            |
| R13 | met         | c2-format-number                             | "$249.00" and, under `lang="fr"`, "249,00 $US". In Chrome's accessibility tree the price is four text nodes ("$", "249", ".", "00"); whether a screen reader in browse mode reads them apart is still to be checked with one.                                                                                                                   |

## Friction outside the requirements

- `get_component` (MCP, markdown output) prints `[object Object]` in the Type column of every attribute and event of
  every component; the JSON output has the real types (`'count' | 'label' | 'none'`). A builder reading the markdown
  cannot see an attribute's allowed values, and had to ask for JSON to find `sort="none"`.
- `search_components` ranks the table family first for "empty state", "announcer", "format currency price": the
  description matches of `c2-status-panel` and `c2-format-number` came last or not at all, and "filter chips
  removable" does not return `c2-chip-group`.

## Missing components

- An **announcer** (a polite live region an app writes a message into, deduplicated and timed). Needed by R10 here and
  by any search, filter or save flow.
- A **responsive panel**: inline on a wide screen, a drawer on a small one, with the same children (R11). `c2-side-nav`
  does this for navigation only.

## Proposed capabilities

None.

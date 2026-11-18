---
spec: pricing-page
direction: default
build: lab/apps/pricing-page/default
target: pricing-page
builder: agent (Claude Code, c2n MCP server)
date: 2026-11-18
---

# Build report: pricing-page / default

Plain JavaScript and one HTML page, built from the spec with the c2n MCP server (`search_components`, `get_component`,
`validate_markup`: four unknown variables on the first pass, none after). Lab run: T1 as mouse, keyboard, dark and
French; T2 as mouse, keyboard, phone, dark and French; T3 on a phone, twice each. T4 (the brand) belongs to the juniper
directions, which are not built yet.

## Requirements

| Req | Outcome    | Components                            | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --- | ---------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | met        | c2-button-group, c2-button, c2-badge  | `appearance="segmented" selection="single"`, one `change` listener re-renders the cards. Keyboard: the group is a single Tab stop whose other item is reached only with the arrow keys, but it is exposed as a `group` of `button`s, so nothing tells a screen reader user to use them (filed, `c2-button-group` gap).                                                                                                                             |
| R2  | workaround | c2-format-number                      | `type="currency" maximum-fraction-digits="0"`. It follows the nearest `lang` before the browser's language, and the page is `lang="en"`, so the reader's locale has to be passed explicitly (`locale=${navigator.language}`) on every price. Right for text in the page's language, but a price list in the reader's locale is the common case.                                                                                                    |
| R3  | met        | c2-details                            | Five `c2-details name="faq"`; one open at a time. Find-in-page opening a closed answer is documented by the component but the lab's step language has no find-in-page step, so T2's second half is not checked by a journey.                                                                                                                                                                                                                       |
| R4  | met        | c2-table, c2-card                     | The comparison is a `c2-table` with the feature column `pinned="start"`: on a phone it scrolls sideways inside its frame with the feature column kept and the header row on top. Team first on a phone is the app's own `matchMedia` reorder of the DOM (CSS `order` would leave screen readers reading Starter first).                                                                                                                            |
| R5  | met        | c2-card, c2-button                    | Not applicable in this direction (the juniper build applies the brand); the shipped theme is used as is.                                                                                                                                                                                                                                                                                                                                           |
| R6  | met        | c2-table, c2-details, c2-button-group | Not applicable in this direction (juniper-dark); the default theme in dark mode passed the dark persona's contrast check.                                                                                                                                                                                                                                                                                                                          |
| R7  | workaround | c2-table, c2-table-column             | `renderCell` returns a check/minus icon plus a visually hidden "Included"/"Not included" carried on `part="sr-only"`, styled from the page through `c2-table::part()`. The hidden text first used `position: absolute` and escaped the table's clip (the page became 554px wide on a phone, and taps failed); the wrapper needs its own `part` with `position: relative`. `align="center"` did not centre a renderer's node: fixed in this change. |

## Friction outside the requirements

- `get_component c2-table-column` returned the whole `c2-table` description and was cut off at 12,000 characters
  before any column attribute (filed, `@c2n/mcp` docs).
- One highlighted card border took four `--c2-card--border-*` variables (filed, `c2-card` papercut).
- `c2-table` logged Lit's change-in-update warning on every load with a pinned column and a `renderCell`: the virtual
  scroll controller and the pinned-width measurement both re-rendered from `updated()` with virtualization off. Fixed
  in this change, with a test.
- The validator caught every guessed variable name (`--c2-button--background-color` is
  `--c2-button__container--background-color`).

## Missing components

None.

## Proposed capabilities

None.

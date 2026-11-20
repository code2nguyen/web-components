---
spec: appointment-booking
direction: default
build: lab/apps/appointment-booking/default
target: appointment-booking
builder: agent (Claude Code, c2n MCP server)
date: 2026-11-20
---

# Build report: appointment-booking / default

Plain JavaScript and one HTML page, built from the spec with the c2n MCP server (`search_components`, `get_component`
in JSON for the five focus components, `validate_markup`: no findings on the first pass). The free starts are computed
in the page from the spec's data (`data.js`), and the server is an in-page promise that answers after 500ms. Lab run: T1
as mouse, keyboard, phone and dark, and in French as its own journey (the day and time read differently); T2 as mouse,
keyboard and French; T3 and T5 as mouse, keyboard and phone; T4 as mouse and keyboard; twice each, every journey
passing.

## Requirements

| Req | Outcome    | Components                                 | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --- | ---------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | met        | c2-radio-group, c2-radio, c2-format-number | Three card-style `c2-radio`s (the radio's "Card" preset, through `--c2-radio__container*` variables) with the duration and a `c2-format-number` price in the `description` slot. Creating the radios from script logs Lit's change-in-update warning on the first click of another option (filed, `c2-radio-group` bug).                                                                                                                                                                                                                     |
| R2  | workaround | c2-date-strip, c2-date-selector            | The spec asks for a calendar, but `c2-date-selector` has no way to close single days (only `min`/`max`), so the day is a `c2-date-strip` (`min`, `max`, `disabled-dates` for the Sundays and 13 March), a week at a time. A disabled day gives no reason to a screen reader: each closed day also gets a `markers` entry whose label ("Closed on Sundays") is read with the day, and the dot is hidden with `--c2-date-strip__marker--color: transparent` (filed, `c2-date-strip` and `c2-date-selector` gaps).                              |
| R3  | workaround | c2-time-slot-picker, c2-date-strip         | The picker gets the chosen day's free starts only, with `date` set, and its own row of days is hidden with `::part(days) { display: none }`, since the day is picked above. Its strip could not be the day picker: it disables every day with no free start, so a closed Sunday and a Saturday that is full for a Cut & colour look the same, and T3's full day cannot be picked to be told so. A day with no free start hides the picker and shows the app's own "is full for cut & colour" status line (filed, `c2-time-slot-picker` gap). |
| R4  | met        | c2-phone-input                             | `country="FR"` with `preferred-countries`; the field reads "06 12 34 56 78" as `+33612345678` and checks the length against France's numbering plan.                                                                                                                                                                                                                                                                                                                                                                                         |
| R5  | met        | c2-form, c2-form-field, c2-text-field      | `required` on the controls, the labels on `c2-form-field`s; on "Confirm booking" both errors show and the error summary takes focus. `--c2-form--display: block` lets the page lay out its own two columns.                                                                                                                                                                                                                                                                                                                                  |
| R6  | met        | c2-form, c2-button, c2-phone-input         | `valid-submit` → `waitUntil(book(…))` with `running` on the button; the refused number is the promise's `{ phone: … }` rejection, which `c2-form` shows on the phone field. The confirmation is the page's own text in the summary card.                                                                                                                                                                                                                                                                                                     |
| R7  | met        | c2-format-date, c2-format-number           | `date-style="full" time-style="short" time-zone="Europe/Paris"` reads "Tuesday, March 3, 2026 at 9:30 AM" and "mardi 3 mars 2026 à 09:30"; prices are `type="currency"`.                                                                                                                                                                                                                                                                                                                                                                     |
| R8  | met        | c2-card, c2-form                           | The page's own grid: two columns from 960px with a sticky summary card, one column below. T1, T3 and T5 pass on a phone.                                                                                                                                                                                                                                                                                                                                                                                                                     |
| R9  | failed     | c2-time-slot-picker, c2-date-strip         | The days and the times both work with the arrow keys, but a time is read as "9:30 AM" in a list box named "Morning": its day is never part of what a screen reader hears, and nothing an app sets adds it (filed, `c2-time-slot-picker` gap). The picker's host is also announced as an invalid group on load, before anything was submitted (filed, `c2-time-slot-picker` bug).                                                                                                                                                             |

<!-- ai-readiness:start (generated by lab/scripts/readiness.mjs; do not edit) -->

## AI readiness

How the builder found its components, from the c2n MCP call log (`lab/reports/appointment-booking/default.calls.jsonl`): 16 calls (get_component 8, search_components 5, validate_markup 2, get_examples 1).

| Component                                | Requirements | Best search that returned it                                        | Rank | `get_component` |
| ---------------------------------------- | ------------ | ------------------------------------------------------------------- | ---: | :-------------: |
| c2-button                                | R6           | **none**                                                            |    — |      **✗**      |
| c2-card                                  | R8           | "pick a service option card radio with price and duration" (call 2) |    6 |      **✗**      |
| c2-date-selector                         | R2           | "calendar to pick a day with disabled days" (call 1)                |    9 |        ✓        |
| c2-date-strip                            | R2, R3       | "calendar to pick a day with disabled days" (call 1)                |    2 |        ✓        |
| c2-description-item, c2-description-list | —            | **none**                                                            |    — |      **✗**      |
| c2-form                                  | R5, R6, R8   | "form validation submit with errors on fields" (call 4)             |    1 |        ✓        |
| c2-form-field                            | R5           | "form validation submit with errors on fields" (call 4)             |    2 |        ✓        |
| c2-format-date                           | R7           | "calendar to pick a day with disabled days" (call 1)                |   10 |        ✓        |
| c2-format-number                         | R1, R7       | "price as currency" (call 14)                                       |    4 |      **✗**      |
| c2-phone-input                           | R4, R6       | "phone number input with country" (call 3)                          |    1 |        ✓        |
| c2-radio, c2-radio-group                 | R1           | "pick a service option card radio with price and duration" (call 2) |    1 |        ✓        |
| c2-text-field                            | R5           | "form validation submit with errors on fields" (call 4)             |    7 |      **✗**      |
| c2-textarea                              | —            | **none**                                                            |    — |      **✗**      |
| c2-time-slot-picker                      | R3           | "calendar to pick a day with disabled days" (call 1)                |    1 |        ✓        |

No search returned `button`, `description-list`, `textarea`: the builder knew the name or found it another way (a `c2n://` resource read or `get_examples` is not recorded as a search). If a requirement needed it, its words are a discovery gap. A `list_components` listing never counts as the search that found a component.

Used without `get_component`: `button`, `card`, `description-list`, `format-number`, `text-field`, `textarea` (its API was written from memory or from an example).

`validate_markup` while building: 2 calls, 0 errors reported.

`validate_markup` on the build now (against the workspace registry, which lab apps import): no findings.

<!-- ai-readiness:end -->

## Friction outside the requirements

- `c2-date-strip` and `c2-time-slot-picker` read the clock for "today" (the marked day, and the picker's first day),
  with no attribute to fix it. The spec fixes "now" at 2 March 2026; here it did not matter because the real today is
  outside the bookable range, but a demo or a test with a fixed date gets a wrong "today" mark.
- `@c2n/theme` has an error colour but no success colour, so "Booking confirmed" takes a `light-dark()` pair of
  literals; the first version used a `var(--c2-theme--color-success, #15803d)` that does not exist and failed contrast
  in dark mode (filed, `@c2n/theme` gap).
- The searches found every focus component on the first query, but "calendar to pick a day with disabled days" ranked
  `c2-date-selector` ninth, below `c2-time-range-picker` and the heatmap chart.
- The lab's keyboard persona reported the phone number as unreachable: from the country button, which sits in the same
  `c2-phone-input`, it walked with the arrow keys and opened the country list. Fixed in the lab (`isTabStop` in
  `personas.mjs`): a target with its own tab stop is reached with Tab.
- The six components listed above as used without `get_component` (button, card, description list, format number, text
  field, textarea) were read from their `custom-elements.json` in the workspace instead, to save the long MCP answers:
  the attribute names were looked up, not guessed, but the log cannot show it.

## Missing components

None.

## Proposed capabilities

None.

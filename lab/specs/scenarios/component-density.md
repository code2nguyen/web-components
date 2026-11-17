---
id: component-density
title: The cost of one instance of each component
size: scenario
focus:
  [
    c2-avatar,
    c2-badge,
    c2-button,
    c2-card,
    c2-checkbox,
    c2-chip,
    c2-feather-check,
    c2-format-number,
    c2-highlight,
    c2-icon-button,
    c2-list-item,
    c2-progress,
    c2-radio,
    c2-relative-time,
    c2-select,
    c2-switch,
    c2-text-field,
  ]
directions: [default]
---

## Purpose

Every c2n component is a custom element: each instance runs JavaScript, builds a shadow root and is styled and laid
out on its own. A page with a hundred of them does not notice; a list with a badge, an icon and a checkbox on each of
1,000 rows does. A **performance** scenario that measures what one instance of each common component costs, next to a
plain HTML element as the control, so a component that grows heavier shows up in the weekly replay.

## Screens

One measuring page, not an app: `?tag=<element>&n=<count>` loads that component's module (or nothing, for `plain`), says
"Ready: <element>", and on the M key creates `n` instances at once. When every instance and every component nested in
it has finished its first update and two frames have painted, it says "Mounted <n> <element>".

## Data

One instance of each, as a person would write it:

| Element            | Instance                                                       |
| ------------------ | -------------------------------------------------------------- |
| `plain` (control)  | `<span>New</span>`                                             |
| `c2-avatar`        | `name="Ada Moreau"`                                            |
| `c2-badge`         | text "New"                                                     |
| `c2-button`        | text "Save"                                                    |
| `c2-card`          | text "A card"                                                  |
| `c2-checkbox`      | text "Accept"                                                  |
| `c2-chip`          | text "Tents"                                                   |
| `c2-feather-check` | no content                                                     |
| `c2-format-number` | `value="1234.5"`                                               |
| `c2-highlight`     | `query="res"`, text "Search result"                            |
| `c2-icon-button`   | `aria-label="Edit"`                                            |
| `c2-list-item`     | text "An item"                                                 |
| `c2-progress`      | `value="40"`, `aria-label="Upload"`                            |
| `c2-radio`         | text "Option"                                                  |
| `c2-relative-time` | `date="2026-01-01T00:00:00Z"`                                  |
| `c2-select`        | `aria-label="Size"`, `value="s"`, three `c2-list-item` options |
| `c2-switch`        | text "Wi-Fi"                                                   |
| `c2-text-field`    | `aria-label="Name"`                                            |

## Measurement

1,000 instances at once, under 4× CPU throttling at 1280×800, the median of 3 runs, from a production build (`vite
build` + `vite preview`). The module is loaded before the measurement starts, so the numbers are the cost per instance,
not of downloading the code. On the lab's machine 1,000 plain spans take about 20 ms; divide any result by 1,000 for
one instance.

## Requirements

- R1 [perf.load] 1,000 instances of each component render within 500 ms (0.5 ms each), the control excepted.
- R2 [perf.memory] 1,000 instances of each component add at most 5 MB of heap (5 KB each).
- R3 [perf.load] The control, 1,000 plain spans, renders within 100 ms: a slower control means the machine or the
  measurement changed, not the components, and the run is not compared.

## Tasks

### T1 · Measure each component (R1, R2, R3)

- For each element in the table: when I open `?tag=<element>&n=1000` and press M
- Then "Mounted 1000 <element>" shows within the budget, and memory grew within the budget

## Builder rules

The rules in [`../README.md`](../README.md#builder-rules), and: build every instance with `document.createElement`
and attributes (no HTML strings), append them in one go, and wait for each element's `updateComplete` before reporting.

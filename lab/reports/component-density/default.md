---
spec: component-density
direction: default
build: lab/apps/component-density/default
target: component-density
builder: agent (Claude Code, c2n MCP server)
date: 2026-11-17
---

# Build report: component-density / default

A measuring page in plain JavaScript (one HTML page, `?tag=&n=`), served from a production build. Lab run: 18 journeys,
3 repeats each, at 4× CPU; numbers below are medians for 1,000 instances (divide by 1,000 for one). The control (plain
spans) took 45–73 ms.

| Element          | 1,000 instances | Heap   |     | Element               | 1,000 instances | Heap       |
| ---------------- | --------------- | ------ | --- | --------------------- | --------------- | ---------- |
| c2-feather-check | 191–202 ms      | 1.0 MB |     | c2-relative-time      | 564–634 ms      | 1.4 MB     |
| c2-icon-button   | 185–224 ms      | 1.2 MB |     | c2-text-field         | 590–623 ms      | 4.1 MB     |
| c2-highlight     | 319–360 ms      | 2.0 MB |     | c2-avatar             | 649–677 ms      | 2.4 MB     |
| c2-badge         | 336–424 ms      | 2.1 MB |     | c2-switch             | 697–779 ms      | 2.8 MB     |
| c2-button        | 351–433 ms      | 1.8 MB |     | c2-radio              | 743–778 ms      | 2.6–2.9 MB |
| c2-format-number | 357–420 ms      | 2.1 MB |     | c2-checkbox           | 1,050–1,107 ms  | 3.5 MB     |
| c2-list-item     | 393–468 ms      | 2.4 MB |     | c2-select (3 options) | 5,096–6,001 ms  | 14.2 MB    |
| c2-progress      | 413–421 ms      | 3.0 MB |     |                       |                 |            |
| c2-card          | 422–445 ms      | 2.8 MB |     |                       |                 |            |
| c2-chip          | 437–446 ms      | 2.8 MB |     |                       |                 |            |

## Requirements

| Req | Outcome | Components                                                                              | Notes                                                                                                                                                                                                                                                       |
| --- | ------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | failed  | c2-select, c2-checkbox, c2-radio, c2-switch, c2-avatar, c2-text-field, c2-relative-time | Seven of the 17 components take more than 0.5 ms per instance; c2-select takes 5–6 ms (it is six components: its closed popup's overlay and list are built anyway). Profiles and measured fixes for c2-select and c2-checkbox are in COMPONENT-FEEDBACK.md. |
| R2  | failed  | c2-select                                                                               | 14.2 KB per select, three times any other component; every other component stays under 4.2 KB.                                                                                                                                                              |
| R3  | met     |                                                                                         | The control stayed at 45–73 ms over every run.                                                                                                                                                                                                              |

## Friction outside the requirements

- Measuring needed a page that loads one module, then creates instances on a key press: the lab's `mark`/`watch`/`budget`
  steps time it from the browser's side, so the module download is not counted.
- On the dev server the same numbers are not comparable (unbundled modules, debug logging); the target builds and
  previews a production build into `test-results/`.

## Missing components

None.

## Proposed capabilities

None.

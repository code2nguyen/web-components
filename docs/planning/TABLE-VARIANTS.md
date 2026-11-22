# Table variants

How the features of `@c2n/table` were sorted into the grid, its variants and gallery examples, measured on 2026-11-14,
and how the table rows of `COMPONENT-ACTION-PLAN.md` were classified. The rule itself ("Variants are companion
elements") is in `docs/agents/component-foundation.md`.

## Audit of what is shipped

Each feature's share of the entry was measured as the gzip size of `table.ts` + `table.scss` (or `group-table.*`) with
and without its code, comments stripped, on 2026-11-14. `table.ts` + `table.scss` came to 28.2 kB this way.

### `c2-table`

| Feature                                            | Entry share | Verdict                                                                                                                                      |
| -------------------------------------------------- | ----------: | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Summary row (`summary`, targets, spans)            |      1.4 kB | Grid. Totals are generic.                                                                                                                    |
| Row detail (`renderDetail`, `expanded-details`)    |      1.1 kB | Grid. It is a candidate for lazy loading, since it draws nothing until a row opens, but `expanded-details` from markup draws on first paint. |
| Grid keyboard                                      |      1.0 kB | Grid.                                                                                                                                        |
| Data source (blocks, `getRows`)                    |      1.0 kB | Grid.                                                                                                                                        |
| Editing hooks (module lazy, 5.6 kB)                |      0.9 kB | Grid, already lazy.                                                                                                                          |
| Filters hook (module lazy, 1.6 kB)                 |      0.9 kB | Grid, already lazy.                                                                                                                          |
| Selection                                          |      0.8 kB | Grid.                                                                                                                                        |
| Baseline compare (`baseline`, `compare`, variance) |      0.6 kB | Grid. It is a column format usable by any period table (payroll, budget, KPI).                                                               |
| Series columns (`series`, `series-keys`, …)        |      0.6 kB | **Variant: moves to `c2-flowsheet`.** It fixes columns = times and derives them from the data.                                               |
| Range flags (`reference-range`, `critical-range`)  |      0.6 kB | Grid. It is a column format: lab lists, KPI thresholds and flowsheets all use it.                                                            |
| Realtime hook (module lazy, 1.5 kB)                |      0.6 kB | Grid, already lazy.                                                                                                                          |
| Paging                                             |      0.5 kB | Grid.                                                                                                                                        |
| Status format + `tally` + `count-value`            |      0.4 kB | Grid. `count-value` only serves a status matrix, but it is 0.1 kB and a matrix is plain columns.                                             |
| Column resize                                      |      0.3 kB | Grid.                                                                                                                                        |
| Running totals (`running`, `opening`)              |      0.3 kB | Grid. A balance column fits any statement.                                                                                                   |

### `c2-group-table`

| Feature                                          | Entry share | Verdict                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------ | ----------: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Grouping (`group-by`, group rows, sticky groups) |      3.2 kB | Variant (it is `c2-group-table`).                                                                                                                                                                                                                                                                                                       |
| Tree (`children-field`, lazy children, rollups)  |      1.4 kB | **Variant: split out as `c2-tree-table`** (`table-11`, signed off). A tree and grouping never combine, so each page paid for the other. `c2-group-table` loses `children-field`, `expanded-rows`, `tree-expanded`, `loadChildren`, `expandRow`/`collapseRow` and the `row-toggle`/`children-error` events, which `c2-tree-table` keeps. |

## Rows still waiting

| Row                   | Step     | Verdict                                                                                                                                                                                                                                                            |
| --------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Flowsheet #419        | table-7  | **Variant `c2-flowsheet`**: measure rows, time columns from observations, day labels, `addTime()`. Done in #464.                                                                                                                                                   |
| Allocation grid #306  | table-8  | **Done: variant `c2-allocation-grid`** (people × periods, capacity tone, totals per person and period), sharing `table-series.ts` with the flowsheet for its period columns. It is more than a card: capacity per row and cell tone by threshold are domain rules. |
| Goal tree #358        | table-8  | Done, example: tree rows with a progress `renderCell` and `rollup`.                                                                                                                                                                                                |
| Gradebook #422        | table-8  | Done as an example (`cellPart` for the marks), while it is scores with statuses and column statistics. It becomes a variant `c2-gradebook` if weighted categories and the final grade are computed by the component.                                               |
| Bulk select #244      | table-9  | Done, grid feature (selection scope on the header checkbox).                                                                                                                                                                                                       |
| MITRE matrix #411     | kanban-2 | **Moved: not a table.** Tactics are columns of techniques of different lengths, with no rows across them. It is a board (`c2-kanban`-like) and should move to that track.                                                                                          |
| Dose grid #424        | table-10 | Done, example of `c2-flowsheet`: items × time slots with the status format, plus a "now" column, which the flowsheet now offers (`now`).                                                                                                                           |
| Requirement tree #433 | table-10 | Done, example: tree rows with a status column and a count `renderCell`.                                                                                                                                                                                            |

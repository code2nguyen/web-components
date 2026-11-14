# Table variants

`@c2n/table` holds one data grid and the variants built on it. This file says which features belong to the grid and
which make a variant, audits the features shipped so far against that rule, and classifies the table rows still waiting
in `COMPONENT-ACTION-PLAN.md`.

## The rule

A request for a table is one of three things.

1. **A grid feature** goes in `c2-table`. Any table might need it: sorting, selection, pinning, a summary row, filters,
   editing, row detail, paging, a data source, or a column format that draws a value differently (status, running
   balance, change from a baseline, a range flag). If it is not needed for the first paint, it loads lazily, as
   editing, filters and realtime updates do.
2. **A variant** is a companion element in the same package. It extends `c2-table` or `c2-group-table`, has its own
   source file, Vite entry, `exports` subpath, docs page and gallery, and is listed in `c2n.separateEntries` so the
   umbrella gives it an entry of its own. A request is a variant when it **fixes what the rows and the columns mean**
   and brings what a generic grid does not need:
   - a data shape of its own, such as a flowsheet's observations becoming one row per measure and one column per time;
   - columns derived from the data rather than declared;
   - computations specific to the domain, such as a weighted final grade or a capacity per person and week;
   - chrome specific to the domain, such as a day label over the times or a "now" column.

   The base keeps only generic hooks that a variant overrides: `resolvedColumns` expansion, `sourceRows`,
   `cellValue`, `renderLine`. It never holds variant code. Code that two variants share lives in a module both import
   (`table-series.ts`), not in `c2-table`.

3. **An example** is a gallery card. It is a request that a grid feature or an existing variant already covers with
   markup, a `renderCell` or a preset of CSS variables, such as a goal tree or a requirement tree.

A variant can be removed without touching any other page, and `c2-table` pages never pay for it. This is why a feature
that only one variant uses moves out of the grid even when it is small.

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

## Checklist for a new table row

1. Does it fix what the rows and columns mean, or bring its own data shape, derived columns, domain computation or
   domain chrome? Then it is a variant: a companion element, its own entry, docs page and gallery.
2. Otherwise, would a table in another domain want it? Then it is a grid feature. It goes lazy unless the first paint
   needs it.
3. Otherwise it is an example: a gallery card on the page of the grid or variant that covers it.
4. Code two variants need goes in a shared module they import, never in `c2-table`.

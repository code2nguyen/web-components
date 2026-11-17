# Specs

What the lab builds. A spec describes a product, or one screen of one, as requirements tagged with the capabilities in
[`../capabilities.md`](../capabilities.md) and tasks written in what a person sees. Builds are disposable: rebuild from
the spec whenever you like. Start a new spec from [`TEMPLATE.md`](TEMPLATE.md).

| Size     | Spec                                                        | What it exercises                                                                      |
| -------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| scenario | [catalog-filter](scenarios/catalog-filter.md)               | facets with counts, a price range, active-filter chips, sort, empty state              |
| scenario | [orders-table](scenarios/orders-table.md)                   | a 2,000-row table from a paged server source: sort, inline edit, bulk selection        |
| scenario | [appointment-booking](scenarios/appointment-booking.md)     | a date with closed days, time slots, a phone number                                    |
| scenario | [pricing-page](scenarios/pricing-page.md)                   | a strong brand, dark mode, a billing-period switch, an FAQ (three directions)          |
| scenario | [document-upload](scenarios/document-upload.md)             | a checklist of documents, upload progress, refusal and retry                           |
| scenario | [hundred-thousand-rows](scenarios/hundred-thousand-rows.md) | **performance:** 100,000 rows in memory: load, scroll, sort, filter, keyboard, memory  |
| scenario | [live-market-board](scenarios/live-market-board.md)         | **performance:** 300 prices ticking 5× a second: smoothness, input, pausing off-screen |
| scenario | [overlay-churn](scenarios/overlay-churn.md)                 | **performance:** every overlay opened and closed 30 times: leaks and opening speed     |
| feature  | [account-settings](features/account-settings.md)            | validation, error summary, async save, unsaved changes, secrets (two directions)       |
| feature  | [checkout](features/checkout.md)                            | steps, a country-aware address, a payment card, a promo code, a declined payment       |
| feature  | [project-board](features/project-board.md)                  | a kanban board, keyboard moves, a WIP limit, a card drawer with rich text, comments    |
| feature  | [long-claim-form](features/long-claim-form.md)              | **performance:** 300 form fields: typing, sections, validating all on submit           |
| app      | [support-inbox](apps/support-inbox.md)                      | a list and thread, a validated composer, a drawer, toasts with undo                    |
| app      | [analytics-dashboard](apps/analytics-dashboard.md)          | KPIs, trend and comparison charts, a date range, a sortable table, a sidebar           |
| app      | [crm-contacts](apps/crm-contacts.md)                        | 500 contacts, a command palette, breadcrumbs, inline edits, notes, an activity feed    |
| app      | [workspace-home](apps/workspace-home.md)                    | **performance:** first load: LCP, script size, lazy below-the-fold parts, no shifts    |

## Builder rules

Every spec follows these, plus any rules of its own under its "Builder rules" heading.

- Use `c2-*` components and `@c2n/theme` for every control and widget. Find them with the c2n MCP server
  (`search_components`, then `get_component`, in JSON for the exact attribute types), look at the docs gallery
  (`get_examples`) before writing CSS, and run `validate_markup` on what you wrote.
- Plain HTML only where no component fits, with a `<!-- dogfood-exempt: reason -->` comment. The requirement it serves
  is then `hand-rolled` in the build report.
- Style only through `--c2-theme--*` tokens, component `--c2-*` variables and documented `::part()` hooks. Never reach
  into a component's shadow root or override its internals: needing to is a `workaround`.
- Simulated servers live in the page, answer after the delay the spec gives, and never touch the network.
- Use the sample data exactly as written, so the lab journeys can expect exact values.
- A performance spec states its **measurement** conditions (CPU throttling, network, production build, repeats) in a
  section of that name, and every performance requirement carries a number. Its journeys use the `mark`/`budget` steps
  of [`../README.md`](../README.md#performance).
- Any framework, or none, unless the spec says otherwise. Build into `lab/apps/<id>/<direction>/`, served by
  `npx vite lab/apps/<id>/<direction>` from the repository root.

---
id: hundred-thousand-rows
title: A table of 100,000 rows held in memory
size: scenario
focus: [c2-table, c2-search-field]
directions: [default]
---

## Purpose

The transaction ledger of a finance back office, as in Stripe's balance history or a bank's export viewer: all
100,000 rows are already in the browser (a CSV the user opened), and the person scrolls, sorts and filters them
instantly. A **performance** scenario: it checks that `c2-table` stays fast with a large in-memory dataset, where
`orders-table` checks a paged server source.

## Screens

One page: the title "Ledger", the row count ("100,000 transactions"), a search field that filters by name or city,
and the table: Transaction, Name, City, Amount, filling the rest of the window. Name, City and Amount sort.

## Data

Generated in the page, so every build has the same rows. For `i` from 0 to 99,999:

- **Transaction:** `R-` followed by `100000 + i` (R-100000 … R-199999).
- **Name:** first name item `i % 20` of Ada, Bruno, Chloé, Dmitri, Elena, Farid, Grace, Hugo, Ines, Jonas, Kaito,
  Lucía, Mateo, Nadia, Oskar, Paula, Quentin, Rosa, Samir, Tess, and last name item `(i × 7) % 25` of Moreau, Silva,
  Novak, Okafor, Lindqvist, Rossi, Haddad, Tanaka, Kowalski, Dubois, Nguyen, Fischer, Costa, Ivanova, Bakker, Murphy,
  Schmidt, Laurent, Yilmaz, Andersen, Petrov, Garcia, Byrne, Sato, Weber.
- **City:** item `i % 15` of Lisbon, Lyon, Berlin, Oslo, Austin, Osaka, Lima, Accra, Krakow, Porto, Denver, Seoul,
  Dublin, Turin, Quito.
- **Amount:** `((i × 7919) mod 100000) / 100` euros, from €0.00 to €999.99.

Values the tasks rely on: sorted by amount ascending, R-100000 (€0.00) then R-117679 (€0.01); descending, R-182321
(€999.99). 4,000 names contain "Tanaka"; 6,667 rows are in Lisbon. The last row is R-199999, Tess Yilmaz, Porto, €920.81.

## Measurement

Measured by the lab under 4× CPU throttling at 1280×800, as the mouse persona, the median of 3 runs. Budgets are what
a person notices, with room for the throttling: 200 ms is when an answer stops feeling immediate, 50 ms the longest a
task may run without delaying input.

## Requirements

- R1 [perf.load, list.large] The first rows show within 1,500 ms of opening the page, with no task longer than 400 ms.
- R2 [perf.scroll] Scrolling 20,000 px with the wheel keeps the 95th percentile frame under 34 ms and has at most 3
  frames over 50 ms.
- R3 [perf.interaction, table.sort] Sorting by Amount answers the click within 200 ms, and the sorted rows show within
  1,000 ms.
- R4 [perf.interaction, search.text] Typing "tanaka" answers every keystroke within 100 ms; "4,000 transactions" shows
  within 1,000 ms of the last key.
- R5 [perf.memory] After a warm-up, ten more sorts and searches add at most 5 MB of heap and 200 DOM nodes.
- R6 [perf.layout-shift] Nothing shifts while the table loads or sorts (layout shift at most 0.05).
- R7 [a11y.keyboard] Moving down 100 rows with the arrow key answers each press within 100 ms.

## Tasks

### T1 · Open the ledger (R1, R6)

- When I open the page
- Then R-100000 is the first row and "100,000 transactions" shows

### T2 · Scroll far (R2)

- When I scroll the table 20,000 px down with the wheel
- Then the scrolling stays smooth and rows are always drawn

### T3 · Sort by amount (R3, R6)

- When I sort by Amount
- Then R-100000 (€0.00) is first
- When I sort by Amount again
- Then R-182321 (€999.99) is first

### T4 · Filter by name (R4)

- When I type "tanaka" in the search
- Then "4,000 transactions" shows and every row's name contains Tanaka

### T5 · Repeat without growing (R5)

- Given I have sorted and searched once
- When I sort and clear the search ten more times
- Then memory and DOM nodes stay within the budget

### T6 · Walk the rows (R7)

- When I focus the first row and press the down arrow 100 times
- Then each press moves the focus within the budget

## Builder rules

The rules in [`../README.md`](../README.md#builder-rules), and:

- Generate the rows in the page and hand the whole array to the table (`rows`), not a `dataSource`: this scenario is
  about the in-memory path.
- Measure a production build: serve it with `vite build` and `vite preview`, never the dev server.

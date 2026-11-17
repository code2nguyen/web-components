---
id: orders-table
title: The orders table of a store's back office
size: scenario
focus: [c2-table, c2-table-column, c2-inline-edit, c2-select, c2-button]
directions: [default]
---

## Purpose

The order list of a store's admin, as in Shopify, Stripe or a warehouse back office. Staff scroll 2,000 orders that
a server sends a page at a time, sort them, change an order's status in place, and act on several orders at once. It
exercises a large table on a remote source: virtual scrolling, server-side sorting, loading states, inline editing
with a save that can fail, and bulk selection.

## Screens

One page.

- **Header:** the title "Orders" and the total ("2,000 orders").
- **Toolbar** (above the table): while rows are selected, "<n> selected", a "Mark shipped" action and "Clear
  selection"; otherwise nothing.
- **Table:** a checkbox column, then Order, Customer, Status, Total and Created. Order, Customer, Total and Created
  sort; Status is edited in place. The header stays visible while the table scrolls.
- **Phone:** the table scrolls sideways inside its own frame; the page itself never does.

## Data

The orders are generated, so every build has the same 2,000. For `i` from 1 to 2000:

- **Order:** `SO-` followed by `10000 + i` (SO-10001 … SO-12000).
- **Customer:** item `i % 8` of: Acme Corp, Birch & Co, Cobalt Labs, Dune Outfitters, Ember Studio, Fjord Foods,
  Granite Health, Harbor Logistics.
- **Status:** item `i % 4` of: Pending, Paid, Shipped, Refunded (500 of each).
- **Total:** `((i × 37) mod 500) + 20` US dollars, from $20.00 to $519.00.
- **Created:** 1 January 2026 plus `(i × 7) mod 300` days.

A few values the tasks rely on: SO-10001 is Birch & Co, Paid, $57.00; SO-10002 is Cobalt Labs, Shipped, $94.00;
SO-10013 is Fjord Foods, Paid, $501.00. Sorted by total ascending, SO-10500 ($20.00) comes first; descending, SO-10027
($519.00). Ties keep order-number order. Sorted by customer ascending, SO-10008 (Acme Corp) comes first.

**The server** is simulated in the page. `getOrders({ start, count, sort })` answers after 400ms with the rows of that
window in that sort, and the total; the page never holds all 2,000 at once. `saveStatus(id, status)` answers after
300ms and fails for SO-10013 with "Order SO-10013 is locked by a pending refund".

## Requirements

- R1 [list.large, data.async-source] The table scrolls through all 2,000 orders smoothly, asking the server for pages
  of 50 as they come into view.
- R2 [list.loading] Before the first page arrives the table shows a loading state; rows of a page still on its way
  show placeholders, not blanks.
- R3 [table.sort] Order, Customer, Total and Created sort ascending, then descending, then back to unsorted, on the
  server; the header shows the direction.
- R4 [table.inline-edit] A Status cell is changed in place: activating it opens a choice of the four statuses; Enter
  or a pick commits, Escape cancels. The row shows that it is saving, then the new status.
- R5 [form.async-submit] When the save fails, the status returns to its old value and the error is shown next to the
  row and announced.
- R6 [list.selection] Rows are selected with their checkbox; the header checkbox selects every loaded row; the toolbar
  shows the count and "Mark shipped" sets every selected order to Shipped.
- R7 [i18n.format] Totals are currency and Created a date, both in the reader's locale.
- R8 [a11y.keyboard, a11y.screen-reader] The table is a grid a keyboard user moves through cell by cell; the sort
  direction and the selection count are announced.
- R9 [layout.responsive] On a phone the table scrolls sideways in its frame and the page does not.

## Tasks

### T1 · Open the list (R1, R2, R7)

- When the page loads
- Then a loading state shows, then SO-10001, Birch & Co, Paid, $57.00 is the first row and the header says "2,000
  orders"

### T2 · Sort by total (R3)

- When I sort by Total
- Then SO-10500 ($20.00) is first
- When I sort by Total again
- Then SO-10027 ($519.00) is first

### T3 · Scroll to the end (R1, R2)

- When I scroll to the bottom of the table
- Then the last row is SO-12000

### T4 · Change a status (R4)

- When I change SO-10002's status from Shipped to Refunded
- Then the row shows it is saving, then reads Refunded

### T5 · A save that fails (R5)

- When I change SO-10013's status from Paid to Shipped
- Then it returns to Paid and "Order SO-10013 is locked by a pending refund" is shown

### T6 · Ship several orders (R6)

- When I select SO-10001, SO-10003 and SO-10005
- Then the toolbar says "3 selected"
- When I choose "Mark shipped"
- Then all three read Shipped and the selection is cleared

## Builder rules

The rules in [`../README.md`](../README.md#builder-rules), and: the page must not load all 2,000 orders into the table
at once; go through the simulated server.

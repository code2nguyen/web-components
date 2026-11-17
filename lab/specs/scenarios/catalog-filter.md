---
id: catalog-filter
title: The filter sidebar of an online shop's product listing
size: scenario
focus: [c2-facet-list, c2-chip, c2-slider, c2-select, c2-search-field, c2-switch, c2-sheet]
directions: [default]
---

## Purpose

The product listing page of an outdoor-gear shop, as on REI, Decathlon or Bergfreunde. A shopper narrows twelve
products down by search, category, brand, price and stock, sees what they filtered by, and sorts the result. It
exercises the filtering components together: facets with counts, a range, toggles, active-filter chips, sorting and the
empty state.

## Screens

One page.

- **Header:** the page title "Outdoor gear", the result count ("12 products") and the sort control.
- **Filter sidebar** (left, about 260px): search, then the Category facet, the Brand facet, the price range and the
  "In stock only" toggle, then a "Clear filters" action.
- **Active filters:** above the results, one removable chip per active filter (a facet value, the price range when
  narrowed, "In stock").
- **Results:** a grid of product cards (name, brand, price, "Out of stock" when it is). On a phone, a single column.
- **Phone (under 720px):** the sidebar moves into a drawer opened by a "Filters" button that shows how many filters are
  active ("Filters (2)"). The results update as the shopper picks, behind the drawer.

## Data

Twelve products, shown in this order by default ("Featured"). Prices in US dollars.

| #   | Name             | Category      | Brand     | Price | In stock |
| --- | ---------------- | ------------- | --------- | ----- | -------- |
| 1   | Ridge 2 Tent     | Tents         | Alpenfox  | 249   | yes      |
| 2   | Summit 3 Tent    | Tents         | Northwind | 389   | no       |
| 3   | Trail 1 Tent     | Tents         | Alpenfox  | 179   | yes      |
| 4   | Down 0° Bag      | Sleeping bags | Northwind | 329   | yes      |
| 5   | Synthetic 5° Bag | Sleeping bags | Alpenfox  | 149   | yes      |
| 6   | Quilt 10°        | Sleeping bags | Kestrel   | 219   | no       |
| 7   | Daypack 22       | Backpacks     | Kestrel   | 89    | yes      |
| 8   | Thru-hiker 55    | Backpacks     | Northwind | 239   | yes      |
| 9   | Ultralight 40    | Backpacks     | Alpenfox  | 199   | no       |
| 10  | Rolltop 30       | Backpacks     | Kestrel   | 129   | yes      |
| 11  | Canister Stove   | Stoves        | Kestrel   | 59    | yes      |
| 12  | Twin Burner      | Stoves        | Northwind | 139   | yes      |

Counts with no filter: Tents 3, Sleeping bags 3, Backpacks 4, Stoves 2; Alpenfox 4, Northwind 4, Kestrel 4; 9 in stock.
The price range runs from 0 to 400 in steps of 10.

## Requirements

- R1 [search.text, search.highlight] Typing in the search box keeps the products whose name contains the text, ignoring
  case and accents; the matched part of each name is marked.
- R2 [filter.multi-value, filter.counts] The Category facet lists the four categories with their counts; several can be
  checked at once and a product matches any checked one.
- R3 [filter.multi-value, filter.counts] The Brand facet works the same way. Its counts take every other active filter
  into account (with Tents checked: Alpenfox 2, Northwind 1, Kestrel 0).
- R4 [filter.range] The price range narrows by a minimum and a maximum, set by dragging, by the arrow keys, or by typing.
- R5 [filter.toggle] "In stock only" hides the products that are out of stock.
- R6 [filter.chips] Each active filter shows as a chip above the results; removing the chip removes that filter.
- R7 [filter.clear-all] "Clear filters" resets search, facets, price and stock in one action.
- R8 [sort.choice] Sort by Featured, Price: low to high, Price: high to low, or Name.
- R9 [list.empty-state] When nothing matches, the results say so and offer "Clear filters".
- R10 [feedback.live-announce] The result count ("5 products") is announced to screen readers when it changes.
- R11 [layout.responsive, overlay.drawer] On a phone the filters live in a drawer opened by "Filters (n)".
- R12 [a11y.keyboard, a11y.screen-reader] Every filter works with the keyboard alone, and each facet value is read as a
  checkbox with its name and count.
- R13 [i18n.format] Prices are formatted for the reader's locale ("$249.00" in English, "249,00 $US" in French).

## Tasks

### T1 · Search by name (R1, R10)

- When I type "tent" in the search box
- Then 3 products are listed and the header says "3 products"
- And "Tent" is marked in each name

### T2 · Pick two categories (R2, R3)

- When I check Tents and Stoves in the Category facet
- Then 5 products are listed
- And the Brand facet reads Alpenfox 2, Northwind 2, Kestrel 1

### T3 · Cap the price (R4)

- When I lower the maximum price to 150
- Then 5 products are listed, the dearest being Synthetic 5° Bag at $149.00

### T4 · Backpacks in stock (R2, R5)

- When I check Backpacks and turn on "In stock only"
- Then Daypack 22, Thru-hiker 55 and Rolltop 30 are listed

### T5 · Remove a filter from its chip (R6)

- Given Tents is checked and "In stock only" is on
- Then chips read "Tents" and "In stock"
- When I remove the "Tents" chip
- Then Tents is unchecked and 9 products are listed

### T6 · Nothing matches, start over (R7, R9)

- When I check Stoves and lower the maximum price to 50
- Then the results say no product matches and offer "Clear filters"
- When I choose "Clear filters"
- Then all 12 products are listed

### T7 · Sort by price (R8)

- When I sort by "Price: low to high"
- Then Canister Stove ($59.00) is first and Summit 3 Tent ($389.00) is last

### T8 · Filter on a phone (R11)

- Given a phone-sized screen
- When I open "Filters", check Backpacks and close the drawer
- Then 4 products are listed and the button reads "Filters (1)"

## Builder rules

- Use `c2-*` components and `@c2n/theme` for every control and widget. Find them with the c2n MCP server
  (`search_components`, `get_component`, `get_examples`) and validate with `validate_markup`.
- Plain HTML only where no component fits, with a `<!-- dogfood-exempt: reason -->` comment. The requirement it serves
  is then `hand-rolled` in the build report.
- Never reach into a component's shadow root or override its internals. Needing to is a `workaround`.
- Plain JavaScript and one HTML page are enough: no framework.

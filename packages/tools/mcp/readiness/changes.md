# AI readiness — changes since 53d4708

Full run: every component scored; the 7 whose result moved are listed. Full report: [report.md](report.md).

**AI readiness 97.9/100** (0) · component readiness 97.9 (0) · discovery 94.5 · held-out 67 (0) · agent 100 · lab requirements 61.4 (0, 23 requirements)

| Component | Score | Change | Got better | Got worse |
| --- | ---: | ---: | --- | --- |
| highlight | 100 A | +0.1 | validation/examples-clean | — |
| autocomplete | 98.3 A | +0.5 | validation/examples-clean | — |
| side-nav | 100 A | +0.9 | validation/examples-clean | — |
| switch | 98.2 A | +1 | validation/examples-clean | — |
| swipe-action | 100 A | +1.1 | validation/examples-clean | — |
| tooltip | 99.2 A | +1.9 | validation/examples-clean | — |
| overlay | 99.2 A | +2 | validation/examples-clean | — |

## What is still missing

### autocomplete — 98.3 (A)

- **API documentation · Property-only API typed** (80%): 1/5 missing: selectedItem
- **Composition knowledge · Named slots used in an example** (88%): 1/8 missing: c2-autocomplete[error]

### switch — 98.2 (A)

- **API documentation · Attribute defaults stated** (67%): 3/9 missing: aria-label, aria-labelledby, aria-describedby
- **Usage examples · Attributes demonstrated in examples** (74%): 44% shown; not: name, value, required, aria-labelledby, aria-describedby

### tooltip — 99.2 (A)

- **API documentation · Property-only API typed** (50%): 1/2 missing: showing

### overlay — 99.2 (A)

- **Usage examples · Attributes demonstrated in examples** (83%): 50% shown; not: open, offset, cross-offset, disabled-cross-axis

## Lab requirements

The requirements the component lab's builds met with c2n components (`lab/specs` for the words, `lab/reports` for the components the build used), searched the same way: **61.4/100** (hit@1 52%, hit@3 74% over 23 requirements). Not part of the headline: nobody tuned the search for these words, so a miss here is a word developers use that the docs do not.

| Requirement | Build used | Rank | Top 3 |
| --- | --- | ---: | --- |
| appointment-booking/R1: The three services are shown at once and one is picked; each shows its duration and price. | radio, format-number | — | countdown, toast, indicator |
| appointment-booking/R2: The calendar offers 2 to 15 March only; Sundays, 13 March and past days cannot be picked and say why to a screen reader. | date-strip, date-selector | 2 | time-range-picker, date-strip, date-selector |
| appointment-booking/R5: Name and phone are required; the errors show on the fields when "Confirm booking" is chosen. | form, form-field, text-field | 8 | phone-input, confirm-dialog, time-slot-picker |
| appointment-booking/R6: Confirming shows progress, then the confirmation; a refused number shows its error on the phone field. | form, phone-input | 3 | confirm-dialog, popconfirm, phone-input |
| appointment-booking/R8: On a phone the steps stack and the summary follows them. | card, form | — | steps, details, master-detail |
| catalog-filter/R3: The Brand facet works the same way. Its counts take every other active filter into account (with Tents checked: Alpenfox 2, Northwind 1, Kestrel 0). | facet-list | 2 | highlight, facet-list, camera-capture |
| catalog-filter/R5: "In stock only" hides the products that are out of stock. | switch | — | candlestick-chart, treemap-chart, overlap-chart |
| catalog-filter/R7: "Clear filters" resets search, facets, price and stock in one action. | button | — | facet-list, candlestick-chart, autocomplete |
| catalog-filter/R8: Sort by Featured, Price: low to high, Price: high to low, or Name. | select | — | candlestick-chart, order-book, table |
| catalog-filter/R9: When nothing matches, the results say so and offer "Clear filters". | status-panel | 3 | search-field, flowsheet, status-panel |
| pricing-page/R1: Monthly and Yearly are two options shown at once; switching updates every price and billing note. | button-group | 3 | recurrence-editor, view-options, button-group |

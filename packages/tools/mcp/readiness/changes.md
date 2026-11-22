# AI readiness — changes since 7461b31

Full run: every component scored; the 10 whose result moved are listed. Full report: [report.md](report.md).

**AI readiness 97.9/100** (+0.1) · component readiness 97.9 (+0.1) · discovery 94.5 · held-out 67 (0) · agent 100 · lab requirements 61.4 (+1.1, 23 requirements)

| Component | Score | Change | Got better | Got worse |
| --- | ---: | ---: | --- | --- |
| description-list | 98.6 A | +0.3 | validation/examples-valid, validation/examples-clean | — |
| time-slot-picker | 97.9 A | +0.3 | examples/attributes-shown | — |
| choice-matrix | 99.5 A | +0.7 | validation/examples-valid, validation/examples-clean | — |
| gauge-chart | 97.3 A | +0.7 | validation/examples-valid, validation/examples-clean | — |
| depth-chart | 97.1 A | +0.8 | validation/examples-valid, validation/examples-clean | — |
| scorecard | 99.7 A | +0.9 | validation/examples-valid, validation/examples-clean | — |
| app-shell | 98.6 A | +1 | validation/examples-valid, validation/examples-clean | — |
| candlestick-chart | 94.6 A | +1 | validation/examples-valid, validation/examples-clean | — |
| scatter-chart | 96.3 A | +1 | validation/examples-valid, validation/examples-clean | — |
| page-header | 98.4 A | +1.4 | validation/examples-valid, validation/examples-clean | — |

## What is still missing

### description-list — 98.6 (A)

- **API documentation · get_component answers in full in one response** (50%): shortened to fit: descriptions or CSS tables left out

### time-slot-picker — 97.9 (A)

- **Usage examples · Attributes demonstrated in examples** (95%): 57% shown; not: min, max, name, required, disabled, label
- **Composition knowledge · CSS parts described** (88%): 1/8 missing: slot

### choice-matrix — 99.5 (A)

- **Composition knowledge · CSS parts described** (90%): 1/10 missing: table

### gauge-chart — 97.3 (A)

- **API documentation · get_component answers in full in one response** (50%): shortened to fit: descriptions or CSS tables left out
- **API documentation · Attributes typed** (98%): 1/42 missing: aria-label
- **API documentation · Attribute defaults stated** (98%): 1/42 missing: aria-label
- **Usage examples · Attributes demonstrated in examples** (69%): 41% shown; not: start-angle, end-angle, progress, renderer, revision, series

### depth-chart — 97.1 (A)

- **API documentation · get_component answers in full in one response** (50%): shortened to fit: descriptions or CSS tables left out
- **API documentation · Attributes typed** (97%): 1/36 missing: aria-label
- **API documentation · Attribute defaults stated** (97%): 1/36 missing: aria-label
- **Usage examples · Attributes demonstrated in examples** (65%): 39% shown; not: mid, mirror, price-precision, size-precision, y-min, y-max

### scorecard — 99.7 (A)

- **Composition knowledge · CSS parts described** (94%): 1/17 missing: table

### app-shell — 98.6 (A)

- **Usage examples · Attributes demonstrated in examples** (83%): 50% shown; not: navigation-opened, desktop-mode, aside-opened, navigation-label, storage-key, label
- **Composition knowledge · Named slots used in an example** (89%): 1/9 missing: c2-app-shell[skip-link]

### candlestick-chart — 94.6 (A)

- **API documentation · get_component answers in full in one response** (50%): shortened to fit: descriptions or CSS tables left out
- **API documentation · Attributes typed** (97%): 1/37 missing: aria-label
- **API documentation · Attribute defaults stated** (97%): 1/37 missing: aria-label
- **Usage examples · Every element appears in an example** (75%): 1/4 missing: c2-chart-series
- **Usage examples · Attributes demonstrated in examples** (37%): 22% shown; not: open-field, close-field, low-field, high-field, renderer, revision

### scatter-chart — 96.3 (A)

- **API documentation · get_component answers in full in one response** (50%): shortened to fit: descriptions or CSS tables left out
- **API documentation · Attributes typed** (97%): 1/36 missing: aria-label
- **API documentation · Attribute defaults stated** (97%): 1/36 missing: aria-label
- **Usage examples · Attributes demonstrated in examples** (48%): 29% shown; not: large, large-threshold, renderer, revision, series, label-field

### page-header — 98.4 (A)

- **Usage examples · Attributes demonstrated in examples** (67%): 40% shown; not: parent-href, parent-label, more-actions-label

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

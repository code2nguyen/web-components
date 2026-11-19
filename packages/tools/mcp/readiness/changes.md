# AI readiness — changes since a212a45

Full run: every component scored; the 0 whose result moved are listed. Full report: [report.md](report.md).

**AI readiness 97.3/100** (0) · component readiness 97.7 (0) · discovery 92.2 · agent 100 · lab requirements 56.7 (0, 15 requirements)

| Component | Score | Change | Got better | Got worse |
| --- | ---: | ---: | --- | --- |

## What is still missing

## Lab requirements

The requirements the component lab's builds met with c2n components (`lab/specs` for the words, `lab/reports` for the components the build used), searched the same way: **56.7/100** (hit@1 47%, hit@3 67% over 15 requirements). Not part of the headline: nobody tuned the search for these words, so a miss here is a word developers use that the docs do not.

| Requirement | Build used | Rank | Top 3 |
| --- | --- | ---: | --- |
| catalog-filter/R3: The Brand facet works the same way. Its counts take every other active filter into account (with Tents checked: Alpenfox 2, Northwind 1, Kestrel 0). | facet-list | 3 | highlight, table, facet-list |
| catalog-filter/R5: "In stock only" hides the products that are out of stock. | switch | — | treemap-chart, candlestick-chart, overlap-chart |
| catalog-filter/R7: "Clear filters" resets search, facets, price and stock in one action. | button | — | facet-list, autocomplete, tree-select |
| catalog-filter/R8: Sort by Featured, Price: low to high, Price: high to low, or Name. | select | — | phosphor-icons, order-book, table |
| catalog-filter/R9: When nothing matches, the results say so and offer "Clear filters". | status-panel | 6 | flowsheet, search-field, autocomplete |
| pricing-page/R1: Monthly and Yearly are two options shown at once; switching updates every price and billing note. | button-group | — | recurrence-editor, view-options, depth-chart |
| pricing-page/R2: Prices are currency in the reader's locale. | format-number | 2 | money-input, format-number, depth-chart |
| pricing-page/R4: On a phone the cards stack, Team first, and the comparison table scrolls sideways in its frame with the feature column kept visible. | table, card | 2 | phosphor-icons, table, group-table |

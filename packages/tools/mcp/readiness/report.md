# AI readiness — c2n 1.0.28

> Given a user requirement, can an AI independently find the correct c2n component, understand its API, generate valid code and use it correctly?

## AI readiness: 97.3/100 (A)

Component readiness 50% · discovery 20% · agent run 30%.

**Component readiness: 97.7/100 (A)** over 269 components · **Discovery: 92.2/100** (hit@1 89%, hit@3 94% over 85 requirements) · **Agent: 100/100** (28/28 tasks)

## Dimensions

| Dimension | Weight | Score | |
| --- | ---: | ---: | --- |
| Identity and purpose — Does the AI understand what the component does and when to use it? | 15% | 99 | `████████████████████` |
| API documentation — Are properties, types, defaults, slots, events and CSS variables documented? | 25% | 98.3 | `████████████████████` |
| Usage examples — Are there valid, realistic code examples covering the API? | 20% | 94.6 | `███████████████████░` |
| Composition knowledge — Does the AI understand compatible children, slots and related components? | 15% | 96.4 | `███████████████████░` |
| Framework integration — Does it know how to import, configure and use the component in each framework? | 15% | 100 | `████████████████████` |
| Validation — Can generated usage be checked against the real API and compiled? | 10% | 99.2 | `████████████████████` |

Grades: A 261 · B 6 · C 2 · D 0 · F 0

## Where the points go

Library points lost per check (averaged over components). Fix the top rows first.

| Dimension | Check | Components | Points lost |
| --- | --- | ---: | ---: |
| Usage examples | Attributes demonstrated in examples | 96 | 0.5 |
| Composition knowledge | Named slots used in an example | 22 | 0.3 |
| Usage examples | Usage examples in the docs | 21 | 0.27 |
| Usage examples | Every element appears in an example | 19 | 0.18 |
| Composition knowledge | CSS parts described | 31 | 0.18 |
| API documentation | get_component answers in full in one response | 42 | 0.17 |
| Usage examples | Gallery of styled variants | 8 | 0.13 |
| Identity and purpose | Explains how it works and when to use it | 7 | 0.09 |
| Composition knowledge | Other components it is shown with are named in its docs | 4 | 0.06 |
| API documentation | Property-only API typed | 16 | 0.06 |
| API documentation | CSS variables whose name is not a CSS property are described | 2 | 0.04 |
| API documentation | Public methods described | 16 | 0.04 |

## Discovery misses

Requirements where `search_components` did not rank an expected component first.

| Requirement | Expected | Rank | Top 3 |
| --- | --- | ---: | --- |
| Show a menu when the user right-clicks a file in the list | context-menu | 3 | tree, file-browser, context-menu |
| An on/off setting for email notifications | switch, checkbox | 4 | symbols, choice-matrix, notification-center |
| Plot daily revenue over the last 30 days as a line | line-chart, area-chart | 10 | aging-table, scatter-chart, heatmap-chart |
| An arrow-right icon at the end of a 'Continue' button | feather-icons, phosphor-icons, button | 3 | button-group, toggletip, phosphor-icons |
| Show the initials of each team member in a circle | avatar | 6 | phosphor-icons, overlap-chart, chord-chart |
| Editable grid of invoices with filtering and CSV-like cells | table, spreadsheet | 2 | phosphor-icons, table, allocation-grid |
| Two-factor authentication code entry | otp-input, totp-code | 6 | symbols, phosphor-icons, diff-viewer |
| KPI card with this month's signups and the change versus last month | stat, delta | 2 | sankey-chart, delta, bullet-chart |
| Double-check with the user before they cancel their subscription | confirm-dialog, popconfirm, modal | — | phosphor-icons, floating-panel, group-table |

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

## Agent run

default model, 2026-11-19. A task passes when the code uses an expected tag and attribute and `validate_markup` finds no error.

| Task | Found | Valid | Correct | c2n tool calls | Notes |
| --- | :-: | :-: | :-: | ---: | --- |
| data-grid | ✓ | ✓ | ✓ | 6 |  |
| toast | ✓ | ✓ | ✓ | 10 |  |
| country-combobox | ✓ | ✓ | ✓ | 6 |  |
| simple-select | ✓ | ✓ | ✓ | 9 |  |
| kanban | ✓ | ✓ | ✓ | 7 |  |
| row-actions | ✓ | ✓ | ✓ | 10 |  |
| right-click | ✓ | ✓ | ✓ | 10 |  |
| wizard | ✓ | ✓ | ✓ | 7 |  |
| empty-state | ✓ | ✓ | ✓ | 8 |  |
| price | ✓ | ✓ | ✓ | 4 |  |
| stars | ✓ | ✓ | ✓ | 13 |  |
| folder-tree | ✓ | ✓ | ✓ | 12 |  |
| llm-answer | ✓ | ✓ | ✓ | 7 |  |
| chat-composer | ✓ | ✓ | ✓ | 6 |  |
| upload-progress | ✓ | ✓ | ✓ | 3 |  |
| hint | ✓ | ✓ | ✓ | 7 |  |
| copy | ✓ | ✓ | ✓ | 5 |  |
| tabs | ✓ | ✓ | ✓ | 4 |  |
| faq | ✓ | ✓ | ✓ | 6 |  |
| toggle | ✓ | ✓ | ✓ | 4 |  |
| revenue-trend | ✓ | ✓ | ✓ | 6 |  |
| user-avatar | ✓ | ✓ | ✓ | 4 |  |
| status-pill | ✓ | ✓ | ✓ | 4 |  |
| slider | ✓ | ✓ | ✓ | 4 |  |
| segmented | ✓ | ✓ | ✓ | 6 |  |
| arrow-icon | ✓ | ✓ | ✓ | 4 |  |
| form-validation | ✓ | ✓ | ✓ | 5 |  |
| schema-form | ✓ | ✓ | ✓ | 8 |  |

## Components (lowest first)

| Component | Score | Identity | API | Usage | Composition | Framework | Validation |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| chatbot | 71.7 C | 44 | 100 | 0 | 100 | 100 | 100 |
| feather-icons | 78.3 C | 56 | 67 | 67 | 100 | 100 | 100 |
| task-icons | 82.2 B | 78 | 100 | 28 | 100 | 100 | 100 |
| symbols | 85.9 B | 78 | 100 | 46 | 100 | 100 | 100 |
| phosphor-icons | 86.4 B | 56 | 91 | 77 | 100 | 100 | 100 |
| color-select | 87.3 B | 78 | 77 | 82 | 100 | 100 | 100 |
| virtual-list | 88.2 B | 100 | 99 | 98 | 25 | 100 | 100 |
| in-view | 89.1 B | 100 | 95 | 52 | 100 | 100 | 100 |
| audio-visualizer | 90 A | 100 | 100 | 100 | 33 | 100 | 100 |
| mat-icon | 90.1 A | 78 | 100 | 77 | 100 | 100 | 80 |
| shortcut | 90.7 A | 100 | 100 | 54 | 100 | 100 | 100 |
| image | 91.7 A | 100 | 98 | 98 | 50 | 100 | 100 |
| selection-toolbar | 92.6 A | 100 | 100 | 75 | 83 | 100 | 100 |
| context-menu | 92.8 A | 100 | 97 | 75 | 90 | 100 | 100 |
| markdown | 93.1 A | 100 | 99 | 96 | 60 | 100 | 100 |
| import-mapper | 93.3 A | 100 | 100 | 100 | 55 | 100 | 100 |
| card-input | 93.6 A | 100 | 100 | 96 | 63 | 100 | 100 |
| pan-zoom | 93.6 A | 100 | 97 | 100 | 63 | 100 | 100 |
| tour | 93.6 A | 100 | 100 | 68 | 100 | 100 | 100 |
| candlestick-chart | 93.7 A | 100 | 95 | 80 | 100 | 100 | 90 |
| beacon | 93.8 A | 100 | 100 | 69 | 100 | 100 | 100 |
| butterfly-chart | 94 A | 100 | 95 | 76 | 100 | 100 | 100 |
| tabs | 94 A | 100 | 100 | 100 | 60 | 100 | 100 |
| chord-chart | 94.3 A | 100 | 95 | 78 | 100 | 100 | 100 |
| sankey-chart | 94.3 A | 100 | 95 | 78 | 100 | 100 | 100 |
| working-indicator | 94.4 A | 100 | 100 | 100 | 63 | 100 | 100 |
| waterfall-chart | 94.5 A | 100 | 95 | 79 | 100 | 100 | 100 |
| tier-editor | 94.7 A | 100 | 100 | 98 | 68 | 100 | 100 |
| toast | 94.7 A | 100 | 93 | 82 | 100 | 100 | 100 |
| pyramid-chart | 94.8 A | 100 | 95 | 80 | 100 | 100 | 100 |
| boxplot-chart | 94.9 A | 100 | 95 | 81 | 100 | 100 | 100 |
| document-checklist | 94.9 A | 100 | 100 | 74 | 100 | 100 | 100 |
| treemap-chart | 94.9 A | 100 | 95 | 81 | 100 | 100 | 100 |
| code-viewer | 95 A | 100 | 100 | 100 | 67 | 100 | 100 |
| dashboard | 95 A | 100 | 93 | 84 | 100 | 100 | 100 |
| histogram-chart | 95 A | 100 | 95 | 81 | 100 | 100 | 100 |
| radial-bar-chart | 95 A | 100 | 95 | 81 | 100 | 100 | 100 |
| index-bar | 95.1 A | 100 | 100 | 75 | 100 | 100 | 100 |
| inline-edit | 95.2 A | 100 | 100 | 100 | 68 | 100 | 100 |
| sunburst-chart | 95.3 A | 100 | 95 | 82 | 100 | 100 | 100 |
| scatter-chart | 95.4 A | 100 | 95 | 88 | 100 | 100 | 90 |
| bubble-chart | 95.5 A | 100 | 95 | 84 | 100 | 100 | 100 |
| view-options | 95.5 A | 100 | 97 | 100 | 75 | 100 | 100 |
| bullet-chart | 95.6 A | 100 | 95 | 84 | 100 | 100 | 100 |
| map-chart | 95.8 A | 100 | 95 | 85 | 100 | 100 | 100 |
| search-field | 95.8 A | 100 | 100 | 98 | 75 | 100 | 100 |
| change-review | 95.9 A | 100 | 100 | 86 | 92 | 100 | 100 |
| color-area | 95.9 A | 100 | 92 | 90 | 100 | 100 | 100 |
| color-slider | 95.9 A | 78 | 100 | 96 | 100 | 100 | 100 |
| menubar | 96 A | 100 | 99 | 82 | 100 | 100 | 100 |
| text-field | 96 A | 100 | 94 | 88 | 100 | 100 | 100 |
| menu | 96.1 A | 100 | 94 | 92 | 100 | 100 | 93 |
| mind-map | 96.1 A | 100 | 100 | 86 | 93 | 100 | 100 |
| allocation-grid | 96.2 A | 100 | 96 | 90 | 100 | 100 | 93 |
| comparison-bar | 96.3 A | 100 | 100 | 100 | 75 | 100 | 100 |
| depth-chart | 96.3 A | 100 | 95 | 92 | 100 | 100 | 92 |
| group-table | 96.3 A | 100 | 96 | 87 | 100 | 100 | 100 |
| payment-card | 96.3 A | 100 | 100 | 100 | 75 | 100 | 100 |
| wheel-picker | 96.3 A | 100 | 100 | 100 | 75 | 100 | 100 |
| share-sheet | 96.4 A | 100 | 100 | 86 | 95 | 100 | 100 |
| trace-waterfall | 96.4 A | 100 | 100 | 86 | 95 | 100 | 100 |
| flowsheet | 96.5 A | 100 | 96 | 88 | 100 | 100 | 100 |
| visually-hidden | 96.5 A | 100 | 100 | 82 | 100 | 100 | 100 |
| area-chart | 96.7 A | 100 | 95 | 90 | 100 | 100 | 100 |
| gauge-chart | 96.7 A | 100 | 95 | 93 | 100 | 100 | 93 |
| masonry | 96.7 A | 100 | 100 | 83 | 100 | 100 | 100 |
| heatmap-chart | 96.8 A | 100 | 100 | 84 | 100 | 100 | 100 |
| sparkline | 96.8 A | 100 | 95 | 90 | 100 | 100 | 100 |
| tree | 96.8 A | 100 | 96 | 97 | 90 | 100 | 100 |
| pie-chart | 96.9 A | 100 | 95 | 91 | 100 | 100 | 100 |
| tree-table | 96.9 A | 100 | 96 | 90 | 100 | 100 | 100 |
| bar-chart | 97 A | 100 | 95 | 91 | 100 | 100 | 100 |
| page-header | 97 A | 100 | 100 | 92 | 100 | 100 | 85 |
| overlap-chart | 97.1 A | 100 | 95 | 92 | 100 | 100 | 100 |
| overlay | 97.2 A | 100 | 100 | 96 | 100 | 100 | 80 |
| radar-chart | 97.2 A | 100 | 95 | 92 | 100 | 100 | 100 |
| scroll-progress | 97.2 A | 100 | 100 | 86 | 100 | 100 | 100 |
| skip-link | 97.2 A | 100 | 100 | 86 | 100 | 100 | 100 |
| switch | 97.2 A | 100 | 98 | 94 | 100 | 100 | 91 |
| video-player | 97.2 A | 100 | 100 | 86 | 100 | 100 | 100 |
| overflow-list | 97.3 A | 100 | 100 | 86 | 100 | 100 | 100 |
| tooltip | 97.3 A | 100 | 97 | 100 | 100 | 100 | 81 |
| checkbox-group | 97.4 A | 100 | 99 | 99 | 86 | 100 | 100 |
| line-chart | 97.4 A | 100 | 95 | 93 | 100 | 100 | 100 |
| navigation-menu | 97.4 A | 100 | 94 | 94 | 100 | 100 | 100 |
| emoji-picker | 97.5 A | 100 | 100 | 88 | 100 | 100 | 100 |
| list-item | 97.5 A | 100 | 96 | 100 | 91 | 100 | 100 |
| modal | 97.5 A | 100 | 95 | 93 | 100 | 100 | 100 |
| quick-time-menu | 97.5 A | 100 | 100 | 88 | 100 | 100 | 100 |
| transcript | 97.5 A | 100 | 100 | 100 | 83 | 100 | 100 |
| app-shell | 97.6 A | 100 | 100 | 96 | 96 | 100 | 90 |
| flow | 97.6 A | 100 | 94 | 96 | 100 | 100 | 100 |
| spreadsheet | 97.6 A | 100 | 94 | 96 | 100 | 100 | 100 |
| time-slot-picker | 97.6 A | 100 | 100 | 98 | 88 | 100 | 100 |
| attachment | 97.7 A | 100 | 98 | 100 | 88 | 100 | 100 |
| carousel | 97.7 A | 100 | 100 | 89 | 100 | 100 | 100 |
| image-cropper | 97.7 A | 100 | 94 | 96 | 100 | 100 | 100 |
| autocomplete | 97.8 A | 100 | 99 | 100 | 91 | 100 | 95 |
| form | 97.8 A | 100 | 100 | 98 | 88 | 100 | 100 |
| audio-player | 97.9 A | 100 | 94 | 100 | 96 | 100 | 100 |
| icon-button | 97.9 A | 100 | 100 | 90 | 100 | 100 | 100 |
| key-value-editor | 97.9 A | 100 | 100 | 100 | 86 | 100 | 100 |
| label | 97.9 A | 100 | 92 | 100 | 100 | 100 | 100 |
| link-button | 97.9 A | 100 | 95 | 96 | 100 | 100 | 100 |
| pivot-table | 97.9 A | 100 | 100 | 100 | 86 | 100 | 100 |
| tab-nav | 97.9 A | 100 | 100 | 90 | 100 | 100 | 100 |
| kbd | 98 A | 100 | 100 | 100 | 100 | 100 | 80 |
| date-strip | 98.1 A | 100 | 100 | 100 | 88 | 100 | 100 |
| barcode-scanner | 98.2 A | 100 | 100 | 91 | 100 | 100 | 100 |
| bar-list | 98.3 A | 100 | 100 | 100 | 89 | 100 | 100 |
| checkbox | 98.3 A | 100 | 98 | 94 | 100 | 100 | 100 |
| description-list | 98.3 A | 100 | 95 | 100 | 100 | 100 | 97 |
| input-matrix | 98.3 A | 100 | 100 | 100 | 89 | 100 | 100 |
| json-form | 98.3 A | 100 | 98 | 94 | 100 | 100 | 100 |
| chip-group | 98.4 A | 100 | 100 | 92 | 100 | 100 | 100 |
| image-annotator | 98.4 A | 100 | 99 | 100 | 92 | 100 | 100 |
| otp-input | 98.4 A | 100 | 94 | 100 | 100 | 100 | 100 |
| select | 98.4 A | 100 | 94 | 100 | 100 | 100 | 100 |
| chat-message-list | 98.5 A | 100 | 94 | 100 | 100 | 100 | 100 |
| date-input | 98.5 A | 100 | 94 | 100 | 100 | 100 | 100 |
| hover-card | 98.5 A | 100 | 94 | 100 | 100 | 100 | 100 |
| number-input | 98.5 A | 100 | 94 | 100 | 100 | 100 | 100 |
| time-input | 98.5 A | 100 | 94 | 100 | 100 | 100 | 100 |
| pagination | 98.6 A | 100 | 100 | 94 | 100 | 100 | 100 |
| questionnaire | 98.6 A | 100 | 100 | 100 | 91 | 100 | 100 |
| record-merge | 98.6 A | 100 | 100 | 99 | 92 | 100 | 100 |
| json-viewer | 98.7 A | 100 | 98 | 100 | 95 | 100 | 100 |
| money-input | 98.7 A | 100 | 97 | 97 | 100 | 100 | 100 |
| table | 98.7 A | 100 | 96 | 100 | 100 | 100 | 99 |
| choice-matrix | 98.8 A | 100 | 100 | 100 | 97 | 100 | 93 |
| quantity-picker | 98.8 A | 100 | 95 | 100 | 100 | 100 | 100 |
| scorecard | 98.8 A | 100 | 100 | 100 | 98 | 100 | 91 |
| text-annotator | 98.8 A | 100 | 100 | 94 | 100 | 100 | 100 |
| bottom-nav | 98.9 A | 100 | 100 | 94 | 100 | 100 | 100 |
| command | 98.9 A | 100 | 96 | 100 | 100 | 100 | 100 |
| mask-input | 98.9 A | 100 | 96 | 100 | 100 | 100 | 100 |
| notepad | 98.9 A | 100 | 96 | 100 | 100 | 100 | 100 |
| sheet | 98.9 A | 100 | 96 | 100 | 100 | 100 | 100 |
| steps | 98.9 A | 100 | 96 | 100 | 100 | 100 | 100 |
| swipe-action | 98.9 A | 100 | 100 | 100 | 100 | 100 | 89 |
| breadcrumb | 99 A | 100 | 96 | 100 | 100 | 100 | 100 |
| card | 99 A | 100 | 96 | 100 | 100 | 100 | 100 |
| comment-thread | 99 A | 100 | 100 | 100 | 93 | 100 | 100 |
| date-time-picker | 99 A | 100 | 96 | 100 | 100 | 100 | 100 |
| delta | 99 A | 100 | 100 | 95 | 100 | 100 | 100 |
| log-viewer | 99 A | 100 | 100 | 100 | 93 | 100 | 100 |
| tag-input | 99 A | 100 | 99 | 100 | 96 | 100 | 100 |
| tree-select | 99 A | 100 | 100 | 95 | 100 | 100 | 100 |
| schema-tree | 99.1 A | 100 | 96 | 100 | 100 | 100 | 100 |
| side-nav | 99.1 A | 100 | 100 | 100 | 100 | 100 | 91 |
| cascader | 99.2 A | 100 | 100 | 96 | 100 | 100 | 100 |
| image-uploader | 99.2 A | 100 | 100 | 96 | 100 | 100 | 100 |
| mermaid | 99.2 A | 100 | 100 | 96 | 100 | 100 | 100 |
| promo-code-field | 99.2 A | 100 | 100 | 96 | 100 | 100 | 100 |
| totp-code | 99.2 A | 100 | 100 | 96 | 100 | 100 | 100 |
| chip | 99.3 A | 100 | 97 | 100 | 100 | 100 | 100 |
| confirm-dialog | 99.3 A | 100 | 97 | 100 | 100 | 100 | 100 |
| date-fields | 99.3 A | 100 | 100 | 100 | 95 | 100 | 100 |
| keypad | 99.3 A | 100 | 100 | 100 | 95 | 100 | 100 |
| toggletip | 99.3 A | 100 | 100 | 100 | 95 | 100 | 100 |
| notification-center | 99.4 A | 100 | 100 | 100 | 96 | 100 | 100 |
| theme-select | 99.4 A | 100 | 100 | 98 | 100 | 100 | 100 |
| button | 99.5 A | 100 | 100 | 98 | 100 | 100 | 100 |
| chat-message | 99.5 A | 100 | 100 | 100 | 96 | 100 | 100 |
| details | 99.5 A | 100 | 98 | 100 | 100 | 100 | 100 |
| org-chart | 99.5 A | 100 | 100 | 100 | 97 | 100 | 100 |
| scheduler | 99.5 A | 100 | 98 | 100 | 100 | 100 | 100 |
| state-timeline | 99.5 A | 100 | 100 | 100 | 97 | 100 | 100 |
| unit-input | 99.5 A | 100 | 98 | 100 | 100 | 100 | 100 |
| file-preview | 99.6 A | 100 | 98 | 100 | 100 | 100 | 100 |
| google-map | 99.6 A | 100 | 100 | 98 | 100 | 100 | 100 |
| split-button | 99.6 A | 100 | 99 | 100 | 100 | 100 | 100 |
| streaming-text | 99.6 A | 100 | 98 | 100 | 100 | 100 | 100 |
| time-range-picker | 99.6 A | 100 | 98 | 100 | 100 | 100 | 100 |
| aging-table | 99.7 A | 100 | 100 | 100 | 98 | 100 | 100 |
| citation | 99.7 A | 100 | 100 | 98 | 100 | 100 | 100 |
| file-browser | 99.7 A | 100 | 99 | 100 | 100 | 100 | 100 |
| kanban | 99.7 A | 100 | 100 | 98 | 100 | 100 | 100 |
| page-editor | 99.7 A | 100 | 100 | 98 | 100 | 100 | 100 |
| radio | 99.7 A | 100 | 99 | 100 | 100 | 100 | 100 |
| button-group | 99.8 A | 100 | 99 | 100 | 100 | 100 | 100 |
| gantt | 99.8 A | 100 | 100 | 100 | 98 | 100 | 100 |
| password-field | 99.8 A | 100 | 99 | 100 | 100 | 100 | 100 |
| phone-input | 99.8 A | 100 | 99 | 100 | 100 | 100 | 100 |
| popconfirm | 99.8 A | 100 | 100 | 99 | 100 | 100 | 100 |
| reorder-list | 99.8 A | 100 | 99 | 100 | 100 | 100 | 100 |
| slider | 99.8 A | 100 | 99 | 100 | 100 | 100 | 100 |
| floating-panel | 99.9 A | 100 | 100 | 99 | 100 | 100 | 100 |
| highlight | 99.9 A | 100 | 100 | 100 | 100 | 100 | 99 |
| accordion | 100 A | 100 | 100 | 100 | 100 | 100 | 100 |
| action-bar | 100 A | 100 | 100 | 100 | 100 | 100 | 100 |
| address-field | 100 A | 100 | 100 | 100 | 100 | 100 | 100 |
| angle-slider | 100 A | 100 | 100 | 100 | 100 | 100 | 100 |
| avatar | 100 A | 100 | 100 | 100 | 100 | 100 | 100 |
| backdrop | 100 A | 100 | 100 | 100 | 100 | 100 | 100 |
| badge | 100 A | 100 | 100 | 100 | 100 | 100 | 100 |
| banner | 100 A | 100 | 100 | 100 | 100 | 100 | 100 |
| barcode | 100 A | 100 | 100 | 100 | 100 | 100 | 100 |
| beam | 100 A | 100 | 100 | 100 | 100 | 100 | 100 |
| border-beam | 100 A | 100 | 100 | 100 | 100 | 100 | 100 |
| camera-capture | 100 A | 100 | 100 | 100 | 100 | 100 | 100 |
| celebration | 100 A | 100 | 100 | 100 | 100 | 100 | 100 |
| chat-input | 100 A | 100 | 100 | 100 | 100 | 100 | 100 |
| citation-list | 100 A | 100 | 100 | 100 | 100 | 100 | 100 |
| code-editor | 100 A | 100 | 100 | 100 | 100 | 100 | 100 |
| copy-button | 100 A | 100 | 100 | 100 | 100 | 100 | 100 |
| countdown | 100 A | 100 | 100 | 100 | 100 | 100 | 100 |
| date-selector | 100 A | 100 | 100 | 100 | 100 | 100 | 100 |
| device-frame | 100 A | 100 | 100 | 100 | 100 | 100 | 100 |
| diff-viewer | 100 A | 100 | 100 | 100 | 100 | 100 | 100 |
| distribution-bar | 100 A | 100 | 100 | 100 | 100 | 100 | 100 |
| duration-input | 100 A | 100 | 100 | 100 | 100 | 100 | 100 |
| facet-list | 100 A | 100 | 100 | 100 | 100 | 100 | 100 |
| fieldset | 100 A | 100 | 100 | 100 | 100 | 100 | 100 |
| filter-builder | 100 A | 100 | 100 | 100 | 100 | 100 | 100 |
| float-button | 100 A | 100 | 100 | 100 | 100 | 100 | 100 |
| form-field | 100 A | 100 | 100 | 100 | 100 | 100 | 100 |
| format-date | 100 A | 100 | 100 | 100 | 100 | 100 | 100 |
| format-number | 100 A | 100 | 100 | 100 | 100 | 100 | 100 |
| fx-converter | 100 A | 100 | 100 | 100 | 100 | 100 | 100 |
| header | 100 A | 100 | 100 | 100 | 100 | 100 | 100 |
| image-compare | 100 A | 100 | 100 | 100 | 100 | 100 | 100 |
| indicator | 100 A | 100 | 100 | 100 | 100 | 100 | 100 |
| list | 100 A | 100 | 100 | 100 | 100 | 100 | 100 |
| loading-overlay | 100 A | 100 | 100 | 100 | 100 | 100 | 100 |
| marker | 100 A | 100 | 100 | 100 | 100 | 100 | 100 |
| marquee | 100 A | 100 | 100 | 100 | 100 | 100 | 100 |
| master-detail | 100 A | 100 | 100 | 100 | 100 | 100 | 100 |
| math | 100 A | 100 | 100 | 100 | 100 | 100 | 100 |
| matrix-board | 100 A | 100 | 100 | 100 | 100 | 100 | 100 |
| meter | 100 A | 100 | 100 | 100 | 100 | 100 | 100 |
| month-picker | 100 A | 100 | 100 | 100 | 100 | 100 | 100 |
| month-planner | 100 A | 100 | 100 | 100 | 100 | 100 | 100 |
| native-select | 100 A | 100 | 100 | 100 | 100 | 100 | 100 |
| navigation-progress | 100 A | 100 | 100 | 100 | 100 | 100 | 100 |
| order-book | 100 A | 100 | 100 | 100 | 100 | 100 | 100 |
| progress | 100 A | 100 | 100 | 100 | 100 | 100 | 100 |
| qr-code | 100 A | 100 | 100 | 100 | 100 | 100 | 100 |
| query-input | 100 A | 100 | 100 | 100 | 100 | 100 | 100 |
| range-indicator | 100 A | 100 | 100 | 100 | 100 | 100 | 100 |
| rate | 100 A | 100 | 100 | 100 | 100 | 100 | 100 |
| reaction-bar | 100 A | 100 | 100 | 100 | 100 | 100 | 100 |
| recurrence-editor | 100 A | 100 | 100 | 100 | 100 | 100 | 100 |
| relative-time | 100 A | 100 | 100 | 100 | 100 | 100 | 100 |
| rich-text-editor | 100 A | 100 | 100 | 100 | 100 | 100 | 100 |
| save-bar | 100 A | 100 | 100 | 100 | 100 | 100 | 100 |
| scroll-area | 100 A | 100 | 100 | 100 | 100 | 100 | 100 |
| secret-field | 100 A | 100 | 100 | 100 | 100 | 100 | 100 |
| separator | 100 A | 100 | 100 | 100 | 100 | 100 | 100 |
| shortcut-sheet | 100 A | 100 | 100 | 100 | 100 | 100 | 100 |
| signature-pad | 100 A | 100 | 100 | 100 | 100 | 100 | 100 |
| skeleton | 100 A | 100 | 100 | 100 | 100 | 100 | 100 |
| spinner | 100 A | 100 | 100 | 100 | 100 | 100 | 100 |
| split-panel | 100 A | 100 | 100 | 100 | 100 | 100 | 100 |
| stat | 100 A | 100 | 100 | 100 | 100 | 100 | 100 |
| status-light | 100 A | 100 | 100 | 100 | 100 | 100 | 100 |
| status-panel | 100 A | 100 | 100 | 100 | 100 | 100 | 100 |
| sticky | 100 A | 100 | 100 | 100 | 100 | 100 | 100 |
| table-of-contents | 100 A | 100 | 100 | 100 | 100 | 100 | 100 |
| terminal | 100 A | 100 | 100 | 100 | 100 | 100 | 100 |
| text-effect | 100 A | 100 | 100 | 100 | 100 | 100 | 100 |
| textarea | 100 A | 100 | 100 | 100 | 100 | 100 | 100 |
| timeline | 100 A | 100 | 100 | 100 | 100 | 100 | 100 |
| todo-list | 100 A | 100 | 100 | 100 | 100 | 100 | 100 |
| truncate | 100 A | 100 | 100 | 100 | 100 | 100 | 100 |
| upload | 100 A | 100 | 100 | 100 | 100 | 100 | 100 |
| video-grid | 100 A | 100 | 100 | 100 | 100 | 100 | 100 |
| video-tile | 100 A | 100 | 100 | 100 | 100 | 100 | 100 |
| week-planner | 100 A | 100 | 100 | 100 | 100 | 100 | 100 |

## Details (lowest 25)

### chatbot — 71.7 (C)

- **Identity and purpose · One-line description says what it is** (0%): description shorter than 8 words
- **Identity and purpose · Found by search from its need (description minus its own name)** (0%): not in the top 10 for its own description
- **Usage examples · Usage examples in the docs** (0%): 0 usage example(s)
- **Usage examples · Gallery of styled variants** (0%): no gallery page
- **Usage examples · Every element appears in an example** (0%): 1/1 missing: c2-chatbot
- **Usage examples · Attributes demonstrated in examples** (0%): 0% shown; not: name

### feather-icons — 78.3 (C)

- **Identity and purpose · Explains how it works and when to use it** (0%): no intro or element description of 25+ words
- **Identity and purpose · Every element has a description** (0%): 1/1 missing: c2-feather-{name}
- **API documentation · CSS variables whose name is not a CSS property are described** (0%): 1/1 missing: --c2-feather-icon--size
- **Usage examples · Gallery of styled variants** (0%): no gallery page

### task-icons — 82.2 (B)

- **Identity and purpose · Explains how it works and when to use it** (0%): no intro or element description of 25+ words
- **Usage examples · Usage examples in the docs** (60%): 2 usage example(s)
- **Usage examples · Gallery of styled variants** (0%): no gallery page
- **Usage examples · Attributes demonstrated in examples** (0%): 0% shown; not: label

### symbols — 85.9 (B)

- **Identity and purpose · Explains how it works and when to use it** (0%): no intro or element description of 25+ words
- **Usage examples · Gallery of styled variants** (0%): no gallery page
- **Usage examples · Attributes demonstrated in examples** (0%): 0% shown; not: label

### phosphor-icons — 86.4 (B)

- **Identity and purpose · Explains how it works and when to use it** (0%): no intro or element description of 25+ words
- **Identity and purpose · Every element has a description** (0%): 1/1 missing: c2-phosphor-{name}
- **API documentation · CSS variables whose name is not a CSS property are described** (0%): 1/1 missing: --c2-phosphor-icon--size
- **Usage examples · Gallery of styled variants** (0%): no gallery page

### color-select — 87.3 (B)

- **Identity and purpose · Explains how it works and when to use it** (0%): no intro or element description of 25+ words
- **API documentation · Attribute defaults stated** (50%): 1/2 missing: color
- **API documentation · Property-only API described (renderers, data sources)** (0%): 2/2 missing: colorArea, tinyColor
- **API documentation · Public methods described** (0%): 1/1 missing: dispatchChangeEvent()
- **Usage examples · Usage examples in the docs** (60%): 2 usage example(s)
- **Usage examples · Attributes demonstrated in examples** (83%): 50% shown; not: placement

### virtual-list — 88.2 (B)

- **API documentation · Public methods described** (86%): 1/7 missing: clearSelection()
- **Usage examples · Attributes demonstrated in examples** (93%): 56% shown; not: search, search-fields, min-search-length, search-debounce, virtual, overscan
- **Composition knowledge · Named slots used in an example** (0%): 9/9 missing: c2-virtual-list[search], c2-virtual-list[toolbar], c2-virtual-list[footer], c2-virtual-list[empty], c2-virtual-list[no-results], c2-virtual-list[loading], …

### in-view — 89.1 (B)

- **API documentation · Attributes described** (75%): 1/4 missing: disabled
- **Usage examples · Usage examples in the docs** (30%): 1 usage example(s)
- **Usage examples · Attributes demonstrated in examples** (0%): 0% shown; not: threshold, root-margin, once, disabled

### audio-visualizer — 90 (A)

- **Composition knowledge · CSS parts described** (33%): 2/3 missing: bar, orb

### mat-icon — 90.1 (A)

- **Identity and purpose · Explains how it works and when to use it** (0%): no intro or element description of 25+ words
- **Usage examples · Gallery of styled variants** (0%): no gallery page
- **Validation · Validator knows its properties (property bindings checkable)** (0%): 1/1 missing: c2-mat-icon

### shortcut — 90.7 (A)

- **Usage examples · Usage examples in the docs** (30%): 1 usage example(s)
- **Usage examples · Gallery of styled variants** (0%): no gallery page
- **Usage examples · Attributes demonstrated in examples** (83%): 50% shown; not: disabled

### image — 91.7 (A)

- **API documentation · Attributes described** (91%): 1/11 missing: src
- **Usage examples · Attributes demonstrated in examples** (91%): 55% shown; not: srcset, sizes, placeholder-src, referrerpolicy, crossorigin
- **Composition knowledge · Named slots used in an example** (33%): 2/3 missing: c2-image[fallback], c2-image[load-label]

### selection-toolbar — 92.6 (A)

- **Usage examples · Usage examples in the docs** (60%): 2 usage example(s)
- **Usage examples · Attributes demonstrated in examples** (56%): 33% shown; not: min-length, disabled, label, prompting
- **Composition knowledge · Named slots used in an example** (67%): 1/3 missing: c2-selection-toolbar[result]

### context-menu — 92.8 (A)

- **API documentation · Public methods described** (50%): 1/2 missing: hide()
- **Usage examples · Usage examples in the docs** (60%): 2 usage example(s)
- **Usage examples · Attributes demonstrated in examples** (56%): 33% shown; not: disabled, long-press-duration
- **Composition knowledge · Other components it is shown with are named in its docs** (75%): 1/4 missing: c2-table-column

### markdown — 93.1 (A)

- **API documentation · Attribute defaults stated** (90%): 1/10 missing: value
- **Usage examples · Attributes demonstrated in examples** (83%): 50% shown; not: reveal, image-origins, math, heading-anchors, code
- **Composition knowledge · CSS parts described** (60%): 4/10 missing: heading, paragraph, link, table

### import-mapper — 93.3 (A)

- **Composition knowledge · Named slots used in an example** (40%): 3/5 missing: c2-import-mapper[empty], c2-import-mapper[loading], c2-import-mapper[error]

### card-input — 93.6 (A)

- **Usage examples · Attributes demonstrated in examples** (83%): 50% shown; not: name, required, readonly
- **Composition knowledge · Named slots used in an example** (50%): 1/2 missing: c2-card-input[brand-visa]

### pan-zoom — 93.6 (A)

- **API documentation · Attributes typed** (86%): 2/14 missing: max-zoom, zoom-step
- **API documentation · Attribute defaults stated** (86%): 2/14 missing: zoom, view
- **Composition knowledge · Named slots used in an example** (50%): 1/2 missing: c2-pan-zoom[minimap]

### tour — 93.6 (A)

- **Usage examples · Usage examples in the docs** (60%): 2 usage example(s)
- **Usage examples · Attributes demonstrated in examples** (24%): 14% shown; not: open, current, storage-key, autostart, skip-limit, skip-delay

### candlestick-chart — 93.7 (A)

- **API documentation · get_component answers in full in one response** (50%): shortened to fit: descriptions or CSS tables left out
- **API documentation · Attributes typed** (97%): 1/36 missing: aria-label
- **API documentation · Attribute defaults stated** (97%): 1/36 missing: aria-label
- **Usage examples · Every element appears in an example** (75%): 1/4 missing: c2-chart-series
- **Usage examples · Attributes demonstrated in examples** (38%): 23% shown; not: open-field, close-field, low-field, high-field, renderer, revision
- **Validation · Examples pass validate_markup without errors** (88%): 1/8 missing: Realtime replay: Unknown attribute `size` on `<c2-button>`
- **Validation · Examples pass without warnings** (88%): 1/8 missing: Realtime replay: Unknown attribute `size` on `<c2-button>`

### beacon — 93.8 (A)

- **Usage examples · Usage examples in the docs** (30%): 1 usage example(s)
- **Usage examples · Attributes demonstrated in examples** (74%): 44% shown; not: open, current, autostart, skip-limit, skip-delay

### butterfly-chart — 94 (A)

- **API documentation · get_component answers in full in one response** (50%): shortened to fit: descriptions or CSS tables left out
- **API documentation · Attributes typed** (97%): 1/31 missing: aria-label
- **API documentation · Attribute defaults stated** (97%): 1/31 missing: aria-label
- **Usage examples · Every element appears in an example** (50%): 2/4 missing: c2-chart-legend, c2-chart-tooltip
- **Usage examples · Attributes demonstrated in examples** (50%): 30% shown; not: renderer, revision, series, x-field, x-type, legend-action

### tabs — 94 (A)

- **Composition knowledge · Other components it is shown with are named in its docs** (0%): 1/1 missing: c2-code-viewer

### chord-chart — 94.3 (A)

- **API documentation · get_component answers in full in one response** (50%): shortened to fit: descriptions or CSS tables left out
- **API documentation · Attributes typed** (97%): 1/31 missing: aria-label
- **API documentation · Attribute defaults stated** (97%): 1/31 missing: aria-label
- **Usage examples · Every element appears in an example** (33%): 2/3 missing: c2-chart-legend, c2-chart-tooltip
- **Usage examples · Attributes demonstrated in examples** (72%): 43% shown; not: renderer, revision, series, x-field, label-field, x-type

### sankey-chart — 94.3 (A)

- **API documentation · get_component answers in full in one response** (50%): shortened to fit: descriptions or CSS tables left out
- **API documentation · Attributes typed** (97%): 1/33 missing: aria-label
- **API documentation · Attribute defaults stated** (97%): 1/33 missing: aria-label
- **Usage examples · Every element appears in an example** (33%): 2/3 missing: c2-chart-legend, c2-chart-tooltip
- **Usage examples · Attributes demonstrated in examples** (73%): 44% shown; not: renderer, revision, series, x-field, label-field, x-type


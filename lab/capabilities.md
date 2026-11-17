# Capabilities

The shared vocabulary for tagging requirements. Every requirement in a spec carries one or more of these tags. Because
the tags are shared, build reports from different specs add up in the gap matrix (`node lab/scripts/gaps.mjs`).

Keep the list small. A builder may propose a new tag in its build report under "Proposed capabilities". A person adds it
here in review, or maps it to an existing tag. `gaps.mjs` warns about any tag that is not listed here.

Each entry reads `` `tag` `` followed by a description.

## Filtering and search

- `filter.multi-value`: pick several values of one attribute (categories, statuses) and see only matching items
- `filter.counts`: each filter value shows how many items it would match
- `filter.range`: narrow by a numeric or date range (price, created between)
- `filter.toggle`: an on/off filter (in stock only, unread only)
- `filter.chips`: the active filters are shown as removable chips
- `filter.clear-all`: reset every filter in one action
- `search.text`: free-text search over the items
- `search.highlight`: the matched text is marked in the results
- `sort.choice`: the user picks the sort order

## Collections

- `list.selection`: pick one or several items from a list
- `list.empty-state`: a helpful state when nothing matches, with a way out
- `list.loading`: a loading state while data arrives
- `list.large`: hundreds or thousands of items stay smooth
- `table.sort`: sort a table by a column
- `table.inline-edit`: edit a value in place in a row
- `list.reorder`: move items by drag or keyboard, within a list or between lists
- `data.async-source`: data comes from a paged or remote source

## Inputs

- `input.choice`: pick one of a few options shown at once (a segmented control, option cards)
- `input.date`: pick one date, with dates that cannot be picked
- `input.date-range`: pick a start and an end date, or a preset range
- `input.time-slot`: pick one of the available times of a day
- `input.number`: enter a number within limits (a quantity, a percentage), by typing or stepping
- `input.money`: enter or show an amount of money
- `input.payment-card`: enter a card number, expiry and security code
- `input.address`: enter a postal address that follows the country
- `input.phone`: enter a phone number with its country
- `input.file-upload`: choose files, see their progress, retry or remove them
- `input.rich-text`: write formatted text (bold, links, lists)

## Forms

- `form.validation`: fields check their value and say what is wrong
- `form.error-summary`: the errors are summarised and lead to their fields
- `form.dirty-guard`: unsaved changes are protected from being lost
- `form.async-submit`: submit waits for a server, shows progress and server errors
- `form.conditional`: fields appear or change based on other answers
- `form.secret`: a value is masked, revealed, copied or regenerated

## Overlays and feedback

- `overlay.drawer`: a side panel over the page
- `overlay.confirm`: a confirmation before a destructive action
- `feedback.toast`: a short confirmation message
- `feedback.undo`: a just-done action can be undone
- `feedback.live-announce`: a change is announced to screen readers (result counts, saved)

## Navigation and layout

- `nav.tabs`: sections switched with tabs
- `nav.sidebar`: a side navigation that collapses on small screens
- `nav.steps`: a flow of several steps that shows where the user is and lets them go back
- `nav.breadcrumb`: the path to the current page, each level a link
- `nav.command-palette`: a keyboard-opened palette to jump anywhere or run a command
- `layout.disclosure`: sections that expand and collapse (an FAQ, settings groups)
- `layout.responsive`: the layout changes for a phone, not just shrinks

## Charts

- `chart.kpi`: headline numbers with their change against a previous period
- `chart.trend`: a value over time
- `chart.compare`: categories compared with each other, or shares of a whole

## Planning and collaboration

- `planning.board`: items in columns by status, moved between them
- `collab.comments`: people comment on an item and see each other's comments
- `collab.activity`: a timeline of what happened to an item, newest first

## Theming and language

- `theme.brand`: the app's own colours, type and radius, set without reaching into components
- `theme.dark`: a dark mode that reads well
- `theme.density`: a compact or a roomy density
- `i18n.translate`: the components' built-in text in another language
- `i18n.format`: dates, numbers and money in the reader's locale

## Accessibility

- `a11y.keyboard`: everything works with the keyboard alone
- `a11y.screen-reader`: names, roles and states read correctly

# @c2n/log-viewer

Text-only virtual log viewport with variable entry heights. Tabular mode is enabled by default; short cells stick within their row while long cells scroll. Plain mode concatenates attributes and entries into continuous text and virtualizes visible lines.

```ts
import '@c2n/log-viewer'

const viewer = document.querySelector('c2-log-viewer')!
viewer.appendEntries({ message: 'Failed\nRetry scheduled', level: 'error', requestId: '42' })
viewer.columns = ['level', 'requestId', 'message']
viewer.wrap = true
viewer.setFilter({ attributes: { level: ['error', 'warn'] }, search: 'retry' })
viewer.setFilter({ attributes: { level: ['error', 'warn'] } }, 'highlight')
viewer.setFilter(null)
```

## API

- `appendEntries(entry | entries)`: validate and copy a batch atomically; `message` required, arbitrary string attributes accepted.
- `setFilter({ attributes?, search? } | null, mode = 'filter')`: `filter` displays only matches; `highlight` keeps all entries visible and marks matches. exact, case sensitive attribute matches; OR within value arrays, AND between attributes; case insensitive substring search across all attributes. Criteria preserve stored entries and apply to future appends.
- `clear()`: remove entries, preserve criteria.
- `scrollToEnd()`: jump to the end and follow later appends.
- `entryCount`, `filteredCount`: read-only counts; wait for `updateComplete` for matching count, including in highlight mode.
- `tabular`: default true. Set `tabular="false"` for continuous text.
- `wrap`: default false. Measured wrapping breaks long tokens and retains explicit newlines.
- `columns`: property-only string array; empty auto-discovers timestamp/level/source, other attributes, message. Controls display order, not searchable attributes.

Each visible entry has a copy-message button revealed on hover or keyboard focus (always visible on touch devices). It copies the complete original message, including unrendered lines, and announces success or failure. Clipboard access requires a secure context.

No slots, toolbar, filter editor, statistics bar, fetching, persistence or built-in retention policy. Controls belong to the application.

## Default appearance

The built-in dark terminal palette, compact metadata columns, colored log levels, generous cell spacing and subtle row dividers require no CSS overrides. `info`, `warn`/`warning`, and `error`/`fatal` levels receive distinct colors (case insensitive). Timestamp and other metadata use subdued colors while message text remains prominent. All colors and spacing remain customizable.

## Layout

Each attribute column measures the widest value in all retained entries, including cell padding. Only the message column fills the remaining viewport width. Filtering keeps column widths stable. Wider attributes appended later grow their column and recalculate wrapping while preserving the reading anchor. With wrapping disabled, long messages scroll horizontally without stretching metadata columns.

Cumulative row offsets and binary lookup select a visible window plus overscan. Rows can have different heights. Font and width measurement determine wrapped lines. Plain mode also slices the visible lines inside a large entry. The keyboard scroll region accepts an accessible name from `aria-label` (default “Log content”). Appends follow only when already at the end. Layout changes preserve the entry being read. Tabs display as four spaces.

CSS custom properties: `--c2-log-viewer--height`, `--background`, `--color`, `--font-family`, `--font-size`, `--line-height`, `--border`, `--border-radius`; `--c2-log-viewer__message--min-width`, `--c2-log-viewer__cell--padding`, `--c2-log-viewer__text--inset`, `--c2-log-viewer__empty--padding`, `--c2-log-viewer__empty--color`, `--c2-log-viewer__timestamp--color`, `--c2-log-viewer__attribute--color`, `--c2-log-viewer__level--color`, `--c2-log-viewer__level__info--color`, `--c2-log-viewer__level__warning--color`, `--c2-log-viewer__level__error--color`, `--c2-log-viewer__entry--box-shadow`, `--c2-log-viewer__entry__hover--background`, `--c2-log-viewer__entry__highlighted--background`, `--c2-log-viewer__entry__highlighted--box-shadow`, `--c2-log-viewer__viewport__focus--outline`; `--c2-log-viewer__copy--size`, `--inset`, `--background`, `--color`, `--border`, `--border-radius`, `--c2-log-viewer__copy__hover--background`, `--c2-log-viewer__copy__focus--outline`. See generated manifest for defaults.

Parts: `viewport`, `content`, `entry`, `cell`, `text`, `empty`, `highlight`, `copy-button`. Avoid changing measured geometry via parts; use the documented font and column variables.

Virtual content supports only selection/find/printing within the rendered window. Application data should power complete export and search.

# @c2n/log-viewer

Text-only virtual log viewport with variable entry heights. Tabular mode is enabled by default; short cells stick within their row while long cells scroll. Plain mode concatenates attributes and entries into continuous text and virtualizes visible lines.

Use it for large application/server logs, live streams and multiline incident traces. For small static snippets with programming-language syntax highlighting, use `c2-code-viewer`. The application owns fetching, controls, retention and complete exports.

## Installation

```bash
npm install @c2n/log-viewer
```

## Usage

```html
<c2-log-viewer wrap aria-label="Checkout service logs"></c2-log-viewer>
```

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

Each visible entry has a transparent copy-message icon revealed when the pointer moves over the entry or through keyboard focus (always visible on touch devices). Scrolling hides pointer actions until the pointer moves again, so actions do not jump between messages under a stationary cursor. Hovering the icon adds a subtle background. It copies the complete original message, including unrendered lines, and announces success or failure. Clipboard access requires a secure context.

No slots, toolbar, filter editor, statistics bar, fetching, persistence or built-in retention policy. Controls belong to the application.

Exports: `LogViewer`, `LogEntry`, `LogFilter`, and `LogFilterMode` (`filter | highlight`).

## Default appearance

The built-in dark terminal palette, compact metadata columns, colored log levels, generous cell spacing and subtle row dividers require no CSS overrides. `info`, `warn`/`warning`, and `error`/`fatal` levels receive distinct colors (case insensitive). Timestamp and other metadata use subdued colors while message text remains prominent. All colors and spacing remain customizable.

Message text automatically highlights standalone ERROR/FATAL in rose, WARN/WARNING in amber, INFO in green, and DEBUG/TRACE and timestamps in muted gray. Quoted values, numbers, URLs and recognizable IDs use soft blue. Ordinary prose stays neutral. Token colors use the severity/timestamp variables and `--c2-log-viewer__token--color`; filter highlights use separate background/accent variables. Wrapped fragments and visible slices retain their logical token colors. Copy returns the unchanged original message.

## Layout

Each attribute column measures the widest value in all retained entries, including cell padding. Only the message column fills the remaining viewport width. Filtering keeps column widths stable. Wider attributes appended later grow their column and recalculate wrapping while preserving the reading anchor. With wrapping disabled, long messages scroll horizontally without stretching metadata columns.

Cumulative row offsets and binary lookup select a visible window plus overscan. Rows can have different heights. Font and width measurement determine wrapped lines. Plain mode also slices the visible lines inside a large entry. The keyboard scroll region accepts an accessible name from `aria-label` (default “Log content”). Appends follow only when already at the end. Layout changes preserve the entry being read. Tabs display as four spaces.

## Styling reference

All variables have usable defaults. Change colors, typography and measured spacing through these hooks. The `--c2-log-viewer__copy--icon-size` and `--c2-log-viewer__copy--stroke-width` variables affect both the copy and success icons.

| CSS custom property                               | Default                   | Purpose                                                       |
| ------------------------------------------------- | ------------------------- | ------------------------------------------------------------- |
| `--c2-log-viewer--height`                         | `480px`                   | Viewport height                                               |
| `--c2-log-viewer--background`                     | `#0b1220`                 | Terminal surface                                              |
| `--c2-log-viewer--color`                          | `#d3deee`                 | Text color                                                    |
| `--c2-log-viewer--font-family`                    | `ui-monospace, monospace` | Text font                                                     |
| `--c2-log-viewer--font-size`                      | `13px`                    | Text size                                                     |
| `--c2-log-viewer--line-height`                    | `1.65`                    | Line spacing                                                  |
| `--c2-log-viewer--border`                         | `1px solid #263449`       | Outer edge                                                    |
| `--c2-log-viewer--border-radius`                  | `12px`                    | Outer corners                                                 |
| `--c2-log-viewer__message--min-width`             | `240px`                   | Minimum primary column width                                  |
| `--c2-log-viewer__cell--padding`                  | `8px 12px`                | Attribute cell inset included in row measurements             |
| `--c2-log-viewer__text--inset`                    | `12px`                    | Horizontal inset for continuous text                          |
| `--c2-log-viewer__empty--padding`                 | `24px`                    | Empty state inset                                             |
| `--c2-log-viewer__empty--color`                   | `#94a3b8`                 | Empty state text                                              |
| `--c2-log-viewer__viewport__focus--outline`       | `2px solid #60a5fa`       | Keyboard focus indicator                                      |
| `--c2-log-viewer__timestamp--color`               | `#94a3b8`                 | Timestamp text                                                |
| `--c2-log-viewer__attribute--color`               | `#a5b4cc`                 | Secondary attribute text                                      |
| `--c2-log-viewer__level--color`                   | `#c4b5fd`                 | Unclassified level text                                       |
| `--c2-log-viewer__level__info--color`             | `#6ee7b7`                 | Info level text                                               |
| `--c2-log-viewer__level__warning--color`          | `#fcd34d`                 | Warn and warning level text                                   |
| `--c2-log-viewer__level__error--color`            | `#fda4af`                 | Error and fatal level text                                    |
| `--c2-log-viewer__entry--box-shadow`              | `inset 0 -1px 0 #1b293d`  | Subtle row divider without changing measured geometry         |
| `--c2-log-viewer__entry__hover--background`       | `#142238`                 | Hovered row surface                                           |
| `--c2-log-viewer__entry__highlighted--background` | `#17304c`                 | Matching entry surface in highlight mode                      |
| `--c2-log-viewer__entry__highlighted--box-shadow` | `inset 3px 0 0 #60a5fa`   | Matching entry accent without changing measured geometry      |
| `--c2-log-viewer__copy--size`                     | `28px`                    | Copy button size                                              |
| `--c2-log-viewer__copy--icon-size`                | `55%`                     | Copy and success icon width and height                        |
| `--c2-log-viewer__copy--stroke-width`             | `1.8`                     | Copy and success SVG stroke width                             |
| `--c2-log-viewer__copy--inset`                    | `8px`                     | Copy button offset from viewport edges                        |
| `--c2-log-viewer__copy--padding-top`              | `4px`                     | Space above the copy button within an entry                   |
| `--c2-log-viewer__copy--background`               | `transparent`             | Copy button surface                                           |
| `--c2-log-viewer__copy--color`                    | `#dbeafe`                 | Copy icon color                                               |
| `--c2-log-viewer__copy--border`                   | `none`                    | Copy button edge                                              |
| `--c2-log-viewer__copy--border-radius`            | `6px`                     | Copy button corners                                           |
| `--c2-log-viewer__copy__hover--background`        | `#2a4263`                 | Hovered copy button surface                                   |
| `--c2-log-viewer__copy__focus--outline`           | `2px solid #60a5fa`       | Copy button keyboard focus                                    |
| `--c2-log-viewer__token--color`                   | `#93c5fd`                 | Quoted values, numbers, URLs and recognizable IDs in log text |

### CSS parts

- `token`: Colored log token; severity and timestamp tokens use the existing level and timestamp colors.
- `copy-icon`: Copy and success SVG icon.
- `copy-button`: Copy the complete message of a visible entry; revealed on hover, tap or keyboard focus.
- `highlight`: Matching visible entry or plain text slice in highlight mode.
- `viewport`: Keyboard accessible scroll surface.
- `content`: Virtual content and its total scroll extent.
- `entry`: Visible tabular entry.
- `cell`: Attribute column containing its sticky text.
- `text`: Plain text content.
- `empty`: Empty state.

Avoid changing measured text geometry via parts; use the documented font, cell padding and text inset variables. Log tokens change color only and inherit text metrics.

## Accessibility and limits

The viewport is a keyboard-focusable named region; set `aria-label` to describe your stream. After focusing it, Home jumps to the first entry and End jumps to the latest entry and resumes following appends. Ctrl/Command with Home or End works too. PageUp/PageDown move by a viewport with one line of overlap; Up/Down move by one measured text line. Vertical keyboard movement is immediate, and Left/Right retain native horizontal scrolling. Copy buttons are keyboard accessible and announce success/failure through a live status region. The copy icon part and variables style both action and success states. No animation is required for state changes.

Virtual content supports only selection/find/printing within the rendered window. Application data should power complete export and search.

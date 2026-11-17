---
id: live-market-board
title: A market board updating several times a second
size: scenario
focus: [c2-table, c2-sparkline, c2-line-chart, c2-switch]
directions: [default]
---

## Purpose

The watchlist of a trading or crypto app, as on Binance, Robinhood or a Bloomberg monitor: 300 instruments whose
prices tick several times a second, each with a sparkline, and a chart of the instrument the person selected. A
**performance** scenario: the page must stay smooth and answer input while it updates, and stop working when nobody
is looking.

## Screens

- **Board:** a table of Symbol, Price, Change (% since open, green or red), a sparkline of the last 60 prices, and
  Volume, with `animate-updates` style highlighting of changed prices; a search field that filters by symbol; a
  "Live updates" switch (on by default).
- **Detail:** beside the board on a wide screen (under it on a phone), a line chart of the selected instrument's last
  300 prices, one point added per second.
- **News:** below the board, a long column of static market news (40 articles of three paragraphs), so the board can be
  scrolled out of view.

## Data

300 instruments, generated. For `i` from 0 to 299, with the letters A–Z as `L`:

- **Symbol:** `L[i % 26]`, `L[⌊i / 26⌋ % 26]` and `L[(i × 7) % 26]` joined (`AAA`, `BAH`, `CAO`, …): the first two
  letters are unique for every `i`, so all 300 symbols are.
- **Opening price:** `10 + ((i × 37) mod 490)` dollars. **Volume** at open: `1000 × (1 + (i × 13) mod 97)`.

**The feed** is simulated in the page and deterministic. Every 200 ms it emits tick `t` (from 1), which updates the
instruments with `(t + i) mod 5 = 0` (60 per tick): the price moves by `(((t × 31 + i × 17) mod 21) − 10) / 1000` of
itself, rounded to the cent, and the volume grows by `(t × i) mod 50`. While "Live updates" is off, the feed holds its
ticks and the page applies none.

Instrument 0 is `AAA` at $10.00 on open, and the instrument selected when the page opens. 48 symbols contain "C".

## Measurement

Measured by the lab under 4× CPU throttling at 1280×800, as the mouse persona, the median of 3 runs, served from a
production build (`vite build` + `vite preview`). Updates run throughout unless a task turns them off.

## Requirements

- R1 [perf.update, list.large] While the feed runs, a 10-second window keeps the 95th percentile frame under 34 ms,
  at most 5 frames over 50 ms, and at most 300 ms of total blocking time.
- R2 [perf.interaction, search.text] While the feed runs, typing in the search answers each keystroke within 150 ms,
  and the board shows only the matching symbols within 500 ms.
- R3 [perf.interaction, list.selection, chart.trend] While the feed runs, selecting a row answers within 150 ms and the
  detail chart shows that instrument within 500 ms, then gains one point per second.
- R4 [perf.background] With the board scrolled out of view, or the tab hidden, 5 seconds cost at most 100 ms of script:
  updates pause, and catch up with the latest prices when the board is visible again.
- R5 [perf.memory] After 30 seconds of warm-up, 60 more seconds of updates add at most 10 MB of heap, 300 DOM nodes and
  no event listeners.
- R6 [perf.layout-shift] Updates never shift the layout (layout shift at most 0.01 over the 10-second window).
- R7 [filter.toggle, a11y.screen-reader] "Live updates" pauses and resumes the feed; price changes are not announced one
  by one to screen readers.

## Tasks

### T1 · Watch the board (R1, R6)

- When the board has been updating for 10 seconds
- Then it has stayed smooth within the budget and nothing moved

### T2 · Filter while it ticks (R2)

- When I type "C" in the search while prices update
- Then the keystroke answers within the budget and 48 symbols remain
- When I clear the search
- Then all 300 are back, within the same budget

### T3 · Select an instrument (R3)

- When I select the third row while prices update
- Then the detail chart shows that instrument, and has one more point a second later

### T4 · Scroll away (R4)

- When I scroll the board out of view for 5 seconds, then back
- Then the page did almost no work meanwhile, and the prices are current again

### T5 · Leave it running (R5)

- When the board updates for 90 seconds
- Then the last 60 seconds stayed within the memory budget

### T6 · Pause (R7)

- When I turn "Live updates" off
- Then no price changes for 2 seconds; when I turn it on, prices move again

## Builder rules

The rules in [`../README.md`](../README.md#builder-rules), and: give the table the whole new `rows` array on every
tick (the way an app receiving snapshots does), and serve a production build.

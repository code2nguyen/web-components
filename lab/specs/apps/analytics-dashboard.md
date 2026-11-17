---
id: analytics-dashboard
title: A web analytics dashboard
size: app
focus: []
directions: [default]
---

## Purpose

The dashboard of a privacy-friendly web analytics product, as in Plausible, Fathom or Vercel Analytics. A site owner
reads how many people visited, how that compares with the period before, where they came from and what they read,
for a range of dates they choose. It exercises a dense read-only screen: KPI tiles with deltas, a trend chart, bar
and share comparisons, a sortable table, a date-range control, per-card loading, a collapsible sidebar and dark mode.

## Screens

- **Sidebar:** the site name "trailnotes.blog", then Overview (current), Pages, Sources, Goals and Settings; collapses
  to icons on a narrow window and into a drawer on a phone.
- **Header:** the page title "Overview" and the date range (Last 7 days, Last 30 days, Custom range…).
- **KPIs:** four tiles: Visitors, Pageviews, Bounce rate, Visit duration, each with its value and the change against
  the previous period of the same length (green when better, red when worse; for bounce rate lower is better).
- **Visitors over time:** a line chart, one point per day, with a tooltip giving the date, visitors and pageviews.
- **Top pages:** a table of path, visitors and share of visitors, sortable by each, 8 rows.
- **Sources:** a horizontal bar list of the five sources with their visitors.
- **Devices:** a share of Desktop, Mobile and Tablet.
- **Loading:** every card shows its own loading state while its data arrives (the simulated server takes 600ms per
  card, and again whenever the range changes).

## Data

**Now** is Tuesday 31 March 2026. Days run from 31 January 2026 (day 0) to 31 March 2026 (day 59). For day `d`:

- visitors = `1000 + ((d × 37) mod 400)`, minus 250 on a Saturday or Sunday;
- pageviews = `visitors × 3 − (d mod 7) × 20`.

| Range                                    | Visitors | Before | Change | Pageviews | Before | Change |
| ---------------------------------------- | -------- | ------ | ------ | --------- | ------ | ------ |
| Last 30 days (2–31 Mar, vs 31 Jan–1 Mar) | 34,195   | 32,795 | +4.3%  | 100,805   | 96,685 | +4.3%  |
| Last 7 days (25–31 Mar, vs 18–24 Mar)    | 7,804    | 7,991  | −2.3%  | 22,992    | 23,553 | −2.4%  |

In the last 30 days the busiest day is Thursday 26 March (1,398 visitors, 4,094 pageviews) and the quietest Saturday
28 March (822 visitors). Saturday 14 March had 1,104 visitors.

**Bounce rate and visit duration** (not derived): last 30 days 41% (before 44%, −3 points, better) and 2m 48s (before
2m 31s, +11%); last 7 days 46% (before 43%, +3 points, worse) and 2m 20s (before 2m 41s, −13%).

**Top pages, last 30 days** (visitors): `/` 9,120 · `/blog/ultralight-packing-list` 6,480 · `/blog/best-tents-2026`
5,210 · `/blog/winter-camping` 3,940 · `/gear/stoves` 2,870 · `/about` 2,160 · `/blog/trail-food` 1,830 ·
`/newsletter` 1,105. Share = visitors ÷ 34,195, one decimal (`/` is 26.7%). For the last 7 days, each page's visitors
are its 30-day figure × 0.23, rounded.

**Sources, last 30 days:** Google 14,950 · Direct 9,870 · Reddit 4,120 · Newsletter 3,105 · DuckDuckGo 2,150.

**Devices, last 30 days:** Desktop 58%, Mobile 37%, Tablet 5%.

A custom range uses the same daily formula, compared with the same number of days just before it.

## Requirements

- R1 [chart.kpi] Each KPI shows its value and its change; the change's colour and wording say whether it is better or
  worse, not only up or down.
- R2 [chart.trend] Visitors over time draws one point per day of the range, with a tooltip reachable by keyboard and
  a table or text alternative for screen readers.
- R3 [chart.compare] Sources and Devices compare categories, each value labelled.
- R4 [input.date-range] The range offers Last 7 days, Last 30 days and a custom range picked on a calendar (no dates
  after today); changing it reloads every card.
- R5 [table.sort] Top pages sort by path, visitors and share.
- R6 [list.loading, data.async-source] Every card shows its own loading state, and the rest of the page stays usable.
- R7 [nav.sidebar, layout.responsive] The sidebar collapses to icons on a narrow window and becomes a drawer on a
  phone; the KPIs go from four across to two to one.
- R8 [theme.dark] The dark theme reads well, the charts included.
- R9 [i18n.format] Numbers group by locale ("34,195", "34 195"), durations read naturally, dates follow the locale.
- R10 [a11y.keyboard, a11y.screen-reader] Everything works with the keyboard; KPI changes are read as "up 4.3% from
  32,795".

## Tasks

### T1 · The default view (R1, R6, R9)

- When the page loads
- Then each card shows its loading state, then Visitors reads 34,195 with +4.3%, and Bounce rate 41% as better

### T2 · Last 7 days (R1, R4)

- When I choose Last 7 days
- Then Visitors reads 7,804 with −2.3% shown as worse, and the chart has 7 points

### T3 · Read the busiest day (R2)

- When I move through the chart's points with the keyboard to 26 March
- Then the tooltip reads Thursday, March 26, 1,398 visitors, 4,094 pageviews

### T4 · Sort the pages (R5)

- When I sort Top pages by path
- Then `/` is first and `/newsletter` last
- When I sort by visitors ascending
- Then `/newsletter` (1,105) is first

### T5 · A custom range (R4)

- When I choose a custom range from 14 March to 14 March
- Then Visitors reads 1,104 and the chart has one point; 1 April cannot be picked

### T6 · On a phone (R7)

- Given a phone-sized screen
- Then the sidebar is closed behind a menu button and the KPIs are one per row

## Builder rules

The rules in [`../README.md`](../README.md#builder-rules).

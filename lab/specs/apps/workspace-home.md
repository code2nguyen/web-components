---
id: workspace-home
title: The signed-in home of a work app, loaded fast
size: app
focus: []
directions: [default]
---

## Purpose

The first page a person sees after signing in to a work app, as in Asana, Notion or Linear's home: a greeting, their
tasks, a calendar strip, recent documents, activity, and a few charts further down. It uses many kinds of component,
and most of them are not needed until the person scrolls or clicks. A **performance** app about loading: what the
page downloads first, how soon it is usable, and whether heavy parts wait until they are needed.

## Screens

- **Shell:** a sidebar (Home, My tasks, Inbox, Projects, Calendar, Settings), a header with search (⌘K) and the
  person's avatar menu.
- **Above the fold:** "Good morning, Ada", a date strip of this week, "My tasks" (8 tasks with checkboxes, due dates
  and project badges) and "Recent documents" (6 cards).
- **Below the fold:** "Activity" (a timeline of 20 events), "Workload" (a bar chart of tasks per weekday), "Project
  progress" (5 progress rows), "Time tracked" (a line chart of 30 days) and "Team" (12 avatars with status).
- **Overlays:** the avatar menu, a task drawer opened from a task, and the ⌘K palette, none of them needed at load.

## Data

Ada Moreau's home on Monday 9 March 2026, 08:40.

- **Tasks:** "Review Q1 roadmap" (Roadmap, due today), "Reply to legal on DPA" (Ops, today), "Prepare all-hands
  slides" (Company, Wed), "Interview: senior designer" (Hiring, Wed), "Merge pricing experiment" (Growth, Thu), "Budget
  check-in with finance" (Ops, Fri), "Write onboarding guide" (Docs, next Mon), "Plan team offsite" (Company, next Wed).
- **Documents:** Q1 roadmap, Pricing experiment results, Onboarding guide draft, All-hands slides, Hiring plan 2026,
  Offsite ideas.
- **Activity:** 20 events of the form "<person> <did> <thing>", by Lena, Omar, Priya and Tom, newest first, spaced 25
  minutes apart from 08:35 back.
- **Workload:** tasks due Monday to Friday: 2, 2, 3, 1, 1. **Project progress:** Roadmap 62%, Growth 40%, Hiring 75%,
  Docs 20%, Company 55%. **Time tracked:** day `d` of the last 30 has `4 + ((d × 37) mod 50) / 10` hours, none on weekends.
- **Team:** 12 people named Person 1 to Person 12; statuses online for odd numbers, away for even.

## Measurement

Measured by the lab under 4× CPU throttling and the "Fast 4G" network preset at 1280×800, as the mouse persona, the
median of 3 runs, always from a production build (`vite build` + `vite preview`), the browser cache empty.

## Requirements

- R1 [perf.load] The largest content (the greeting or the task list) paints within 2,500 ms, and no task while loading
  is longer than 300 ms.
- R2 [perf.bundle] The first load downloads at most 150 KB of JavaScript (compressed).
- R3 [perf.bundle] The charts, the timeline and every overlay are loaded only when they are about to be seen or opened:
  scrolling to the bottom and opening the drawer, the menu and the palette downloads them then.
- R4 [perf.layout-shift] Nothing moves while the page loads, or when a below-the-fold section loads its code (layout
  shift at most 0.05 for the whole visit).
- R5 [perf.interaction, list.selection] Checking a task answers within 100 ms; opening its drawer answers within
  150 ms, the first time included.
- R6 [perf.scroll, chart.compare, chart.trend] Scrolling from the top to the bottom keeps the 95th percentile frame
  under 34 ms, while the charts load.
- R7 [nav.sidebar, nav.command-palette, layout.responsive] The sidebar and the ⌘K palette work as in any app; on a phone
  the sidebar is a drawer.

## Tasks

### T1 · Load the home (R1, R2, R4)

- When I open the page with an empty cache
- Then "Good morning, Ada" and my 8 tasks show within the budget, from at most 150 KB of script

### T2 · Scroll everything into view (R3, R4, R6)

- When I scroll to the bottom
- Then the charts, the timeline and the team load as they come into view, smoothly and without shifting the page

### T3 · Work with a task (R5)

- When I check "Review Q1 roadmap" and open "Reply to legal on DPA"
- Then each answers within the budget, and the drawer's code was only fetched then

### T4 · Jump with the palette (R3, R7)

- When I press Ctrl+K and type "onb"
- Then "Onboarding guide draft" is offered, and the palette's code was only fetched then

## Builder rules

The rules in [`../README.md`](../README.md#builder-rules), and: import each component from its own entry
(`@c2n/components/<name>`), load below-the-fold sections and overlays with dynamic `import()`, and serve a production
build.

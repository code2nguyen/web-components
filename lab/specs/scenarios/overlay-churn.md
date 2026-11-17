---
id: overlay-churn
title: Opening and closing every kind of overlay, many times
size: scenario
focus: [c2-modal, c2-sheet, c2-menu, c2-tooltip, c2-select, c2-date-time-picker, c2-toast, c2-command]
directions: [default]
---

## Purpose

A settings screen of any SaaS app, where a person opens dialogs, drawers, menus, tooltips and pickers all day without
reloading. A **performance** scenario about leaks: every overlay must give back what it took when it closes (DOM nodes,
event listeners, memory), and open fast every time, not only the first.

## Screens

One page with a row of triggers, each opening one overlay:

- **Edit profile:** a modal with a form of three fields and Save / Cancel.
- **Filters:** a sheet from the right with eight checkboxes.
- **Row actions:** a menu of six items under an icon button.
- **Help:** an icon button with a tooltip ("Keyboard shortcuts").
- **Country:** a select of 250 countries.
- **Meeting time:** a date-and-time picker.
- **Notify:** a button that shows a toast "Saved" for 2 seconds.
- **Command palette:** ⌘K / Ctrl+K opens a command list of 40 commands with search.

## Data

The 250 countries are any ISO 3166 list in English. The 40 commands are "Go to <section>" for 20 sections named
Section 1 to Section 20, and "Create <thing>" for 20 things named Thing 1 to Thing 20.

## Measurement

Measured by the lab under 4× CPU throttling at 1280×800, as the mouse persona, the median of 3 runs. Every leak budget
is taken after a warm-up of 5 open/close cycles, so caches filled on first use are not counted.

## Requirements

- R1 [perf.memory, overlay.confirm] 30 open/close cycles of the modal add at most 20 DOM nodes, no event listeners and
  at most 1 MB of heap.
- R2 [perf.memory, overlay.drawer] The same for 30 cycles of the sheet.
- R3 [perf.memory] The same for 30 cycles of the menu, of the tooltip (hover in and out), of the select (open, pick,
  close), and of the date-and-time picker.
- R4 [perf.memory, feedback.toast] 30 toasts, each left to dismiss itself, leave no DOM nodes or listeners behind.
- R5 [perf.memory, nav.command-palette] 30 cycles of the command palette, each typing "sec" and closing with Escape,
  stay within the same budget.
- R6 [perf.interaction] Every overlay opens within 100 ms of its trigger, on the 30th time as on the first.
- R7 [perf.layout-shift] Opening and closing overlays never shifts the page behind them (layout shift at most 0.01).

## Tasks

### T1 · Modal churn (R1, R6, R7)

- When I open and cancel "Edit profile" 35 times
- Then the last 30 stay within the budget and each opened fast

### T2 · Sheet churn (R2, R6)

- When I open and close "Filters" 35 times
- Then the last 30 stay within the budget

### T3 · Small overlays (R3, R6)

- When I open and close the menu, the tooltip, the select and the picker 35 times each
- Then each set of 30 stays within the budget

### T4 · Toasts (R4)

- When I show 35 toasts and let each disappear
- Then nothing is left behind

### T5 · Command palette (R5, R6)

- When I open the palette with Ctrl+K, type "sec" and press Escape, 35 times
- Then the last 30 stay within the budget

## Builder rules

The rules in [`../README.md`](../README.md#builder-rules). Build every overlay from the library's own component for
it; an overlay the library lacks is `hand-rolled` in the report and left out of the churn.

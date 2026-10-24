# Feature: `c2-overflow-list` — show what fits, fold the rest into one menu

**Status**: Implemented (`packages/components/overflow-list`)
**Roadmap**: #62, section D, P2
**Research**: [research.md](./research.md)
**Mock**: [c2-overflow-list mock](https://claude.ai/artifact/En3FymwBtxZeS14L5kAma2) — interactive prototype (container width, collapse direction, trigger look, priorities, menu-only rows, focus hand-off, event log), anatomy and item → row mapping, four in-context screens (mail toolbar, repository tabs with a folded current page, editor toolbar with groups, path folding from the start), API sketch.
**Related**: `c2-menu` / `c2-menu-item` (the menu), `c2-chip-group` (same measuring technique, `+N` instead of a menu), `c2-button-group toolbar`, `c2-page-header` (spec 016).

## Problem

Page header actions, mail and editor toolbars and repository tabs all show as many controls as fit and put the rest behind "More". Apps rebuild it each time and get the same things wrong: the row flickers while it measures, the trigger appears and disappears in a loop at the threshold, the menu items are a second copy of the actions that drifts out of sync, a focused action that folds drops focus on `body`, and the current tab disappears into the menu without a trace.

## Goals

1. Plain markup in, menu out: the children are the actions; the menu rows are built from them and activating a row clicks the child. No render callback, no duplicated items.
2. One fit pass per change, from sizes already known: folded children stay laid out out of sight, so nothing is un-hidden to be measured and nothing flashes.
3. Folding order: `collapse-from` end (default) or start; `data-overflow-priority` and `data-overflow="pinned"` on children; `min-visible`, `max-visible`.
4. Separators (`hr`, `c2-separator`) divide groups in the row and the menu, never at an edge or doubled.
5. Focus is never lost: a focused child that folds hands focus to the trigger.
6. The trigger is counted ("3 more items") and says when the current item is folded; text is localisable.
7. Nothing written on the host or the children (manual slot assignment, `ElementInternals`), with the `slot`-attribute fallback for a declarative shadow root.

Non-goals (v1): multi-row overflow (Mantine `maxRows`), label-first collapse (Spectrum `buttonLabelBehavior`), roving focus inside the list, a disclosure (non-menu) popup for navigation links, vertical orientation.

## Usage

```html
<c2-overflow-list aria-label="Issue actions">
  <c2-button data-overflow="pinned"><c2-feather-edit-2 slot="prefix-icon"></c2-feather-edit-2>Edit</c2-button>
  <c2-button data-overflow-priority="2">Assign</c2-button>
  <c2-button>Label</c2-button>
  <c2-icon-button toggle selected aria-label="Star"><c2-feather-star></c2-feather-star></c2-icon-button>
  <hr />
  <c2-button>Duplicate</c2-button>
  <c2-button data-overflow-label="Archive issue">Archive</c2-button>
  <c2-button disabled>Delete</c2-button>
  <c2-menu-item slot="menu" value="copy-link">Copy link</c2-menu-item>
</c2-overflow-list>

<c2-overflow-list collapse-from="start" aria-label="Path">…</c2-overflow-list>
```

```js
list.addEventListener('overflow-change', (e) => console.log(e.detail.visibleCount, e.detail.hiddenCount))
list.hiddenItems // the folded children, document order
```

## Anatomy

```
host (block, role group via internals)
├─ .sizer                        zero-height block: the room the row has (ResizeObserver)
├─ .row  part="row"              flex, nowrap, gap; clipped sideways before the first fit
│   ├─ <slot> (manual)           the shown children
│   └─ c2-menu.more-menu         before the slot when collapsing from the start
│       ├─ <button part="more">  menu trigger; <slot name="more"> with a ⋯ icon fallback
│       ├─ c2-menu-item × folded children (generated), <hr> between groups
│       ├─ <hr> (when both folded rows and menu rows)
│       └─ <slot name="menu">    author rows
└─ .measure (0×0, hidden, inert) <slot name="c2-overflow-list-hidden"> the folded children at natural width
```

While nothing is folded and there are no `menu` rows, the menu is `position: absolute; visibility: hidden` and disabled: out of the row and the Tab order, but its trigger still has a measured width.

## Fit

On a resize of the sizer, the trigger or any child (ResizeObserver, border-box inline size), a child list change, a change of `slot` / `data-overflow*` on a child, `document.fonts.ready`, or a change of `collapse-from` / `min-visible` / `max-visible`, coalesced per microtask:

1. Folding order: non-pinned children by ascending priority, ties from the collapse edge.
2. Starting with nothing folded, fold the next child while there are more than `max-visible` shown, or while the row (shown children + separators that have shown children on both sides + gaps + the trigger and a gap if anything is folded or there are `menu` rows) is wider than the sizer and more than `min-visible` are shown.
3. If the set changed: when the active element is (inside) a newly folded child, focus the trigger after the update; fire `overflow-change` when the folded count changed.

A list with zero width (not rendered) keeps its last fit.

## Public API

| Attribute / property      | Type               | Default | Notes                                                                    |
| ------------------------- | ------------------ | ------- | ------------------------------------------------------------------------ |
| `collapse-from`           | `'end' \| 'start'` | `'end'` | The trigger sits on that edge.                                           |
| `min-visible`             | number             | `0`     | Children kept even when they overflow.                                   |
| `max-visible`             | number             | unset   | Cap whatever the room.                                                   |
| `placement`               | `Placement`        | unset   | Menu placement; defaults to `bottom-end`, `bottom-start` from the start. |
| `hiddenItems` (read-only) | `Element[]`        |         | Folded children, document order, separators excluded.                    |

Per child, read and never written: `data-overflow="pinned"`, `data-overflow-priority="<number>"`, `data-overflow-label`.

Slots: default (children), `menu` (`c2-menu-item` rows always listed), `more` (trigger content).

Event: `overflow-change` — `CustomEvent<{ visibleCount, hiddenCount }>`, does not bubble. `menu-select` from `menu` rows bubbles unchanged; generated rows stop their `menu-select` and `click`, and the folded child receives a click instead. Clicks on the trigger bubble like any button's.

Custom states: `:state(overflowing)`, `:state(current-hidden)`.

### Item → menu row

| Child                                                        | Row                                                                                                                            |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| any                                                          | Label: `data-overflow-label` → `aria-label` → `label` → `tooltip` → `title` → own text                                         |
| has `[slot=prefix-icon]`, or is a `c2-icon-button`           | A copy of that icon as the row's `prefix-icon`                                                                                 |
| `disabled` / `aria-disabled="true"`                          | Disabled row                                                                                                                   |
| `toggle` / `aria-pressed`                                    | Checkbox row, checked while `selected` / `aria-pressed="true"` (re-read on every open)                                         |
| `aria-current` (not `false`), or `selected` without `toggle` | Row in bold (`--c2-overflow-list__current-item--font-weight`), `aria-current` on it; the trigger says "including current item" |
| `hr`, `c2-separator`, `role="separator"`                     | `<hr>` between two folded children                                                                                             |

Activation clicks the native `button` / `a[href]` inside the child's open shadow root when it has one (so a `c2-button type="submit"` submits), otherwise the child itself (a light-DOM link navigates). The app keeps owning a toggle's state, as it does in the row.

## Styling

`--c2-overflow-list--gap` (8px, part of the fit), `--c2-overflow-list--align-items`, and the trigger: `--c2-overflow-list__more--{height, min-width, padding-left, padding-right, gap, border, border-radius, background-color, color, font-family, font-size, font-weight, icon-size}`, `__more__hover--{background-color, border}` (also while open), `__more__focus--{outline, outline-offset}`, `__more__current--{color, border}`, and `--c2-overflow-list__separator--{color, margin}` for `hr` children. Defaults are the library literals (36px height like `c2-button`, `1px solid #bcbcc6`, 6px radius) so `@c2n/theme` maps them. The menu rows take the `--c2-menu*` variables set on the list.

## Rendering constraints

- Manual slot assignment for every slot (default, `more`, `menu`, the measuring slot); in a declarative shadow root the folded children get `slot="c2-overflow-list-hidden"`, the one attribute the list ever writes, and only in that case.
- Before the first fit (server-rendered paint) the row is `overflow-x: clip` with a 4px clip margin, so it never widens the page.
- Icon copies are cached per child and re-cloned only when the source icon element changes.

## Tests (`packages/components/overflow-list/test/`)

Fixed-width children (80px, 8px gap, 36px trigger) make every fit exact: all fit with no trigger and nothing written on host or children; fold from the end and come back, with the `overflow-change` sequence; the trigger appears only when the last child cannot fit without it; menu rows in order with a disabled row, keyboard activation, click delivered to the child only; a folded `c2-button` and a toggle `c2-icon-button` from the menu (icon copy, checkbox row following `selected`); `collapse-from="start"`; pinned and priority; `min-visible` / `max-visible`; focus hand-off; Tab order skips folded children; separators at edges and in the menu; `menu` rows keep the trigger and their `menu-select`, generated rows do not leak theirs; folded current item (name, state, axe); French via `lang`; slotted `more` content (axe with the menu open).

## Open questions

1. Roving focus (`toolbar` attribute, one Tab stop with arrow keys across the shown children and the trigger), as `c2-button-group toolbar` does. Today an app nests the list in nothing and gets one Tab stop per child.
2. A disclosure popup with real links for navigation lists, instead of menu rows that click the link.
3. Label-first collapse (icon-only children before folding) through a container query hook.
4. Moving `c2-page-header`'s "More actions" onto this element (spec 016, decision 2).

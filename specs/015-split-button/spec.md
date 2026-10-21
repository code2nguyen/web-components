# Feature: `c2-split-button` — a main action with a caret menu of alternates

**Status**: Design (not started)
**Roadmap**: #121, section L, P1 (wave 1)
**Research**: [research.md](./research.md)
**Mock**: [c2-split-button mock](https://claude.ai/artifact/HJ5edEDyBAv81KUJng64Mg) — anatomy, looks × states, the three menu modes, in-context screens (composer, PR merge box, meeting bar, page header) and an interactive prototype with an event log.
**Related**: `c2-button` (look, `running`, form submit), `c2-button-group` (joined seam technique), `c2-menu` / `c2-menu-item` (the whole menu). `c2-follow-button` (#139) and `c2-recording-controls` (#133) can build on it later.

## Problem

"Send ▾", "Merge pull request ▾", "New ▾" and the meeting mic with its device menu are one control made of two: the action people usually want, and a caret for the alternatives. Today an app builds it from `c2-button-group` + `c2-menu` + `c2-button`, and gets these wrong every time:

- the menu is anchored to the caret instead of the whole control, and is narrower than it;
- the caret has no accessible name, or a generic one ("More options") that does not say options of what;
- the halves' inner corners, the divider, and focus rings overlapping the neighbour;
- the open state (pressed caret, turned chevron);
- the "remember my choice" variant (GitHub's merge method), which needs radio semantics and a primary whose name changes;
- disabling only the primary (empty draft: "Send" is disabled, "Schedule send" is not).

## Goals

1. One element, two native buttons in its shadow root, two tab stops. The caret follows the APG menu button pattern, reusing `c2-menu` for everything inside the menu.
2. The menu is positioned against the whole host (`bottom-end` by default), is never narrower than it, and flips.
3. Two modes: **fixed** (default; the main action never changes) and **choice** (menu items are radios; the checked one becomes the main action and the control's `value`).
4. Looks are CSS: filled by default; outlined, tonal, subtle and destructive are presets on `--c2-split-button__*` variables, mapped to theme tokens. The seam is a variable: joined with a 1px divider (default, like `c2-button-group`) or split with a gap (Material 3).
5. Behaviour states as attributes: `disabled`, `main-disabled`, `running`, `toggle` + `selected` (icon-only mic/camera).
6. Form-associated like `c2-button`: `type="submit"` submits, `name`/`value` take part.
7. Server-renders with no host attributes written; all built-in text localisable.

Non-goals: a single-tab-stop variant; a menu button without a main action (that is `c2-menu` with a `c2-button` trigger); persistence of the choice (the app stores `value`).

## Usage

```html
<!-- fixed: Gmail -->
<c2-split-button>
  Send
  <c2-menu-item slot="menu" value="schedule">Schedule send<span slot="description">Pick a date and time</span></c2-menu-item>
  <c2-menu-item slot="menu" value="archive">Send and archive</c2-menu-item>
  <hr slot="menu" />
  <c2-menu-item slot="menu" value="template">Save as template</c2-menu-item>
</c2-split-button>

<!-- choice: GitHub merge box -->
<c2-split-button mode="choice" value="squash" class="success">
  <c2-menu-item slot="menu" value="merge">Create a merge commit</c2-menu-item>
  <c2-menu-item slot="menu" value="squash">Squash and merge</c2-menu-item>
  <c2-menu-item slot="menu" value="rebase">Rebase and merge</c2-menu-item>
</c2-split-button>

<!-- icon-only toggle: meeting mic -->
<c2-split-button toggle label="Mute microphone" caret-label="Microphone settings" placement="top">
  <c2-feather-mic slot="prefix-icon"></c2-feather-mic>
  <h3 slot="menu">Microphone</h3>
  <c2-menu-item slot="menu" type="radio" name="mic" value="builtin" checked>MacBook Pro Microphone</c2-menu-item>
  …
</c2-split-button>
```

```js
splitButton.addEventListener('action', (e) => send(e.detail.value)) // main half only
splitButton.addEventListener('menu-select', (e) => run(e.detail.value)) // fixed mode: an item was picked
splitButton.addEventListener('change', () => savePreference(splitButton.value)) // choice mode
```

## Anatomy

```
┌──────────────── host (inline-flex, height, radius, seam) ────────────────┐
│ [prefix-icon] label (default slot)   ┊   [caret-icon ▾]                  │
│ <button part="main">                 ┊   <button part="caret"            │
│                                      ┊     aria-haspopup="menu">         │
└──────────────────────────────────────┴───────────────────────────────────┘
                 ┌─ c2-menu (shadow), anchor = host, trigger = caret ─┐
                 │ <slot name="menu">  (c2-menu-item, hr, h1–h6)      │
                 └────────────────────────────────────────────────────┘
```

Render: two native `<button>`s and a `c2-menu` in the shadow root. The caret is the menu's slotted `trigger` (it gets `aria-haspopup`/`aria-expanded`, the opening keys and focus back), and `menu.anchor = this` (position and minimum width). `c2-menu` reads rows with `assignedElements({ flatten: true })`, so `<slot name="menu">` re-slots the author's items. No change to `c2-menu` positioning is required; choice mode needs one small `c2-menu-item` addition (below). Native buttons, not nested `c2-button`s: no child-variable remapping, no second hydration boundary, and `aria-*` stays inside one shadow root.

## Public API

| Property       | Attribute       | Type                              | Default        | Purpose                                                                                                                                |
| -------------- | --------------- | --------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `mode`         | `mode`          | `'fixed' \| 'choice'`             | `'fixed'`      | `choice`: items act as radios, the checked one is the main action.                                                                     |
| `value`        | `value`         | `string`                          | `''`           | Fixed: submitted with the form when the main half submits (like a submit button). Choice: the chosen item's `value`; drives the label. |
| `name`         | `name`          | `string`                          | `''`           | Form field name.                                                                                                                       |
| `type`         | `type`          | `'button' \| 'submit' \| 'reset'` | `'button'`     | What the main half does in a form.                                                                                                     |
| `label`        | `label`         | `string`                          | `''`           | Accessible name of the main half when it has no text (icon only). Otherwise the slotted text is the name.                              |
| `caretLabel`   | `caret-label`   | `string`                          | `''`           | Accessible name of the caret. Empty: the message "More {label} options", or "More options" without a label.                            |
| `disabled`     | `disabled`      | `boolean`                         | `false`        | Both halves. Also set by a disabled `<fieldset>` (`formDisabledCallback`).                                                             |
| `mainDisabled` | `main-disabled` | `boolean`                         | `false`        | Only the main half; the menu stays reachable. Uses `aria-disabled` so it stays focusable and announced.                                |
| `running`      | `running`       | `boolean`                         | `false`        | The main half shows the `running-icon` spinner and is `aria-busy`; activation is ignored. The caret still works.                       |
| `toggle`       | `toggle`        | `boolean`                         | `false`        | The main half is a toggle (`aria-pressed`), e.g. mute.                                                                                 |
| `selected`     | `selected`      | `boolean`                         | `false`        | Pressed state of a toggle main half.                                                                                                   |
| `open`         | `open`          | `boolean`                         | `false`        | Menu open. Reflects; settable.                                                                                                         |
| `placement`    | `placement`     | floating-ui `Placement`           | `'bottom-end'` | Passed to `c2-menu`; flips automatically.                                                                                              |

Methods: `show(focus?: 'first' | 'last' | 'none')`, `hide()`, `toggleMenu()` (not `toggle()`, which clashes with the property), `focus(options)` (main half; `focusCaret()` for the caret).

Getter: `menuItems` — the slotted `c2-menu-item`s.

Events:

| Event         | Detail                     | Bubbles / composed | Notes                                                                                                                                                                                  |
| ------------- | -------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `action`      | `{ value: string }`        | yes / yes          | The main half was activated (pointer or keyboard), and is not disabled or running. Fires before a form submit; cancelable, which also cancels the submit. The listener most apps need. |
| `menu-select` | `{ value, checked, data }` | yes / yes          | From `c2-menu-item`, unchanged. In choice mode, `preventDefault()` keeps the current choice.                                                                                           |
| `change`      | —                          | yes / yes          | Choice mode, after a user pick changed `value`. `input` fires first. Not on programmatic changes.                                                                                      |
| `toggle`      | native `ToggleEvent`       | no                 | Re-dispatched from the menu.                                                                                                                                                           |
| `click`       | native                     | yes                | Not a reliable signal: clicks on slotted menu items bubble through the host. Documented; use `action`. The caret's own click is stopped inside the shadow root.                        |

Slots: default (label), `prefix-icon`, `running-icon`, `caret-icon` (default: a chevron down), `menu` (`c2-menu-item`, `<hr>`, `<h1>`–`<h6>`).

Parts: `main`, `caret`.

### Choice mode

- On connect and on slot change, every `slot="menu"` `c2-menu-item` is marked as a choice through a new non-reflecting `c2-menu-item` property (`choice: { checked: boolean } | undefined`, `attribute: false`, the same pattern as `reserveIndicator`, which `c2-menu` already sets). It draws the radio check and switches the row's internal role to `menuitemradio` with `ariaChecked`. The item's own `type`/`checked`/`name` are **not** touched: they reflect, so setting them would write attributes on author light DOM and cause a hydration mismatch.
- With `value` empty, the first enabled item is the choice.
- The main half's label is the checked item's `label` (or its text without the `description` slot). The default slot is ignored in this mode; an author `label` still names an icon-only main.
- Picking an item closes the menu and does not run it. Rationale and precedent in research §2; the mock's prototype shows the event order.
- The caret's description (`aria-describedby` to an internal element) is "Current: {label}", so "Choose merge method, Current: Squash and merge, menu button, collapsed".

## Styling

Defaults are `c2-button`'s literals so the theme generator maps them to the same tokens (`color-primary`, `color-primary-hover`, `radius-md`, `focus-ring`, `disabled-opacity`).

| Variable                                                    | Default                                                     | Notes                                                                                                                               |
| ----------------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `--c2-split-button--height`                                 | `36px`                                                      | Sizes 28 / 36 / 44 in the docs are presets.                                                                                         |
| `--c2-split-button--width`                                  | `auto`                                                      | `100%` makes the main half grow (mock: "Pay $1,240.00").                                                                            |
| `--c2-split-button--border-radius`                          | `6px`                                                       | Outer corners. `999px` gives the pill.                                                                                              |
| `--c2-split-button--gap`                                    | `0`                                                         | `0` joined with a divider; `2px` the Material 3 split. Inner radius is derived as in `c2-button-group`: `min(radius, gap * 10000)`. |
| `--c2-split-button--inner-border-radius`                    | derived                                                     | Override the derived inner corners.                                                                                                 |
| `--c2-split-button--font-size` / `--font-weight`            | `14px` / `500`                                              |                                                                                                                                     |
| `--c2-split-button__main--padding-left` / `--padding-right` | `16px`                                                      |                                                                                                                                     |
| `--c2-split-button__main--gap`                              | `8px`                                                       | Icon to label.                                                                                                                      |
| `--c2-split-button__main--background-color` / `--color`     | `#0265dc` / `#ffffff`                                       |                                                                                                                                     |
| `--c2-split-button__main--border`                           | `1px solid transparent`                                     |                                                                                                                                     |
| `--c2-split-button__main__hover--background-color`          | `rgb(1, 84, 184)`                                           | Also `__active`, `__selected` (toggle on).                                                                                          |
| `--c2-split-button__caret--min-width`                       | `36px`                                                      | ≥44px under `(pointer: coarse)` through `--c2-split-button__caret--min-width-coarse`.                                               |
| `--c2-split-button__caret--background-color` / `--color`    | `#0265dc` / `#ffffff`                                       | Separate from the main half so a two-tone look (mic muted) is possible.                                                             |
| `--c2-split-button__caret__hover--background-color`         | `rgb(1, 84, 184)`                                           | Also `__active`.                                                                                                                    |
| `--c2-split-button__caret__open--background-color`          | `rgb(1, 70, 154)`                                           | Pressed look while the menu is open.                                                                                                |
| `--c2-split-button__caret__icon--size`                      | `16px`                                                      |                                                                                                                                     |
| `--c2-split-button__caret__icon__open--rotate`              | `180deg`                                                    | `0` for a slotted icon that should not turn.                                                                                        |
| `--c2-split-button__caret__open--border-radius`             | inherits inner/outer                                        | Set to the outer radius for the M3 "morph to pill" when split.                                                                      |
| `--c2-split-button__divider--width` / `--color`             | `1px` / `color-mix(in srgb, currentColor 40%, transparent)` | Drawn as an inset `box-shadow` on the caret. Hidden when `gap > 0`. `ButtonText` under `forced-colors`.                             |
| `--c2-split-button__focus--outline` / `--outline-offset`    | `2px solid rgba(2, 101, 220, 0.4)` / `2px`                  | The focused half is raised (`z-index`) so its ring is not covered by the neighbour.                                                 |
| `--c2-split-button__disabled--opacity`                      | `0.38`                                                      | Whole control, or the main half alone under `main-disabled`.                                                                        |
| `--c2-split-button__menu--min-width`                        | `anchor width`                                              | Passed to `--c2-menu--min-width`.                                                                                                   |
| `--c2-split-button__transition--duration`                   | `150ms`                                                     | Chevron turn and colours; 0 under `prefers-reduced-motion`.                                                                         |

Gallery presets (CSS only, mock board 1): Filled, Outlined (halves share one border: the main half's right border is dropped), Tonal (`color-primary-container`), Subtle / toolbar (transparent, divider inset 8px top and bottom), Destructive, Success (merge), Pill, Split (gap 2px), Dark block (meeting bar, `color-dark-surface-container`), Full width.

Dark theme, checked by rendering a draft of these cards in the docs site: text on the filled halves must use `color-on-primary` (dark navy in dark mode, since the primary lightens), never a literal white. Destructive needs the same treatment: `color-error` lightens to `#f87171` in dark mode, where white text fails 4.5:1, so its text is `light-dark(#ffffff, #450a0a)` and its hover `light-dark(#b91c1c, #fca5a5)`. The divider follows the text instead of a literal white: `color-mix(in srgb, currentColor 40%, transparent)`, so it stays visible when the fill lightens and the text turns dark. That is also the default of `--c2-split-button__divider--color` (see the styling table).

## Rendering constraints

- No attribute written on the host. Role-free host (it is a group of two buttons; `internals.role = 'group'` only if `label` is set, giving the pair a name). State for styling through `internals.states`: `open`, `running`, `main-disabled`, `choice`.
- No attribute written on author items. `c2-menu-item` reflects `value`, `disabled`, `type`, `checked`, `name`, `destructive`, `label` and `expanded` (`menu-item.ts:115-148`). Choice mode only reads `value`, `label` and `disabled`, and writes nothing but the new non-reflecting `choice` property above. That is the one change this component needs outside its own package (in `@c2n/menu`, with a test there).
- Server rendering: the menu is closed, so the SSR output is the two buttons plus an empty overlay; the chosen label in choice mode is computed from light-DOM items during the server render (they are available as children).
- Localised messages (`src/messages.ts`, `defineMessages('split-button', en)`): `caretLabel: (label) => \`More ${label} options\``, `caretLabelPlain: 'More options'`, `currentChoice: (label) => \`Current: ${label}\``.
- Imports `customElement` from `@c2n/core/element-helper.js` and `property` from `@c2n/core/lit-helper.js`; exports `SplitButtonEventMap` merged through `TypedAddEventListener`.
- Depends on `@c2n/menu` (and through it `@c2n/overlay`). The `menu` package's `:build` goes in the package's wireit `type-check` dependencies.

## Accessibility

- Main: `<button>`; name from text or `label`; `aria-pressed` with `toggle`; `aria-disabled="true"` (not `disabled`) under `main-disabled` so it stays in the tab order and is announced; `aria-busy` while running.
- Caret: `<button aria-haspopup="menu" aria-expanded>`, set by `c2-menu`; name from `caret-label` or the message. `aria-controls` is not added (optional in APG, and the menu lives in the same shadow root, so it would resolve, but screen readers make little use of it).
- Two tab stops. Keys on the caret, inside the menu, Escape and Tab-out are `c2-menu`'s (mock board 2 has the table). On open the checked item is focused in choice mode, else the first.
- Visible focus ring on the focused half only, raised above the other half.
- Forced colours: both halves get `ButtonText` borders and the divider is drawn in `ButtonText`.

## Tests (`packages/components/split-button/test/`)

- Rendering: two buttons, two tab stops, no attributes on the host after upgrade (`toHaveHostAria` for internals).
- Main activation fires `action` (pointer, Enter, Space); not under `disabled`, `main-disabled`, `running`; `type="submit"` submits with `name=value`; cancelling `action` cancels the submit.
- Caret: Enter / Space / ↓ open on the first item, ↑ on the last; Escape and a pick return focus to the caret; `aria-expanded` follows; chevron rotation state.
- Menu is positioned against the host (left edge aligned at `bottom-end` within 1px) and is at least as wide as the host.
- Fixed mode: `menu-select` bubbles out with the item's `value`; the main label never changes.
- Choice mode: `value` → label; a pick fires `input` then `change` and updates the label and the caret description; `preventDefault()` on `menu-select` keeps the old value; programmatic `value` fires nothing; empty `value` picks the first enabled item.
- `main-disabled` keeps the caret usable; disabled `<fieldset>` disables both.
- Toggle: `aria-pressed` and `selected` follow the main half.
- Localisation: caret name in a second language from `test/translations.ts`; `lang` switch redraws.
- SSR / hydration: no mismatch when the server rendered choice mode with a `value`.
- Form-field matrix: not a field control (no `FieldContextConsumer`); confirm it is not listed there.
- Umbrella: registered tag check comes for free.

## Docs and wiring (from the `new-component` skill)

- Doc page `apps/ui/src/content/components/split-button.mdx` (category: Buttons, next to button-group): Import, one Usage block with rows "Fixed", "Remember choice", "Icon toggle", and a "When to use" note (only when one action is clearly the most common; otherwise a `c2-button-group` or a `c2-menu` with a button trigger).
- Gallery: the preset list above, one fence each, authored as fence-local `<style>` on a class with theme-token neutrals.
- `component-previews.ts` preview (the "Send ▾" filled), `component-modules.ts` import, manifest registration, umbrella size budget (`npm run size:add -w packages/umbrella`).
- `button-group.mdx` and `menu.mdx` get a one-line pointer to the new component.

## Open questions

1. **`action` vs `click`.** A dedicated `action` event is the only clean signal, because item clicks bubble through the host. Fluent and Polaris use `onClick` on the primary instead, but they are React components with separate props per half. Keep `action`?
2. **Choice mode name**: `mode="choice"` vs a boolean `remember-choice`. A mode leaves room for a later third mode (e.g. `"toggle"` for the mic, if `toggle` + `selected` proves awkward).
3. **Short main label in choice mode.** The spec uses `c2-menu-item`'s existing `label` property when the author sets it ("Squash") and the row text otherwise. A `label` on the item also changes typeahead, which is usually what you want. Is that acceptable, or should there be a separate `main-label`?

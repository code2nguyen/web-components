# Feature: `c2-float-button` — a floating action button that expands into a speed dial

**Status**: Implemented (`packages/components/float-button`)
**Roadmap**: #67, section D, P2
**Related**: `c2-icon-button` (slotted icon sizing), `c2-menu` (roving focus, `toggle` event), `c2-split-button` (`open` reflected, `ToggleEvent`).

## Problem

"Compose", "New task", "Chat with us" and the mobile "+" that fans out into "Photo / Note / Link" are one control: a raised round button pinned to a corner of the viewport, sometimes with a short list of related actions that springs out of it. Apps build it from a fixed-position `c2-icon-button` and a hand-positioned list, and get these wrong:

- the actions stay in the tab order (and the accessibility tree) while hidden;
- no `aria-expanded` on the trigger, no menu semantics on the actions, no Escape or arrow keys;
- labels next to the mini buttons are positioned for one corner only and clip in the others;
- the `+` → `×` turn, the stagger and the reduced-motion fallback;
- an outside click or Tab away leaves the dial open.

## Goals

1. Two elements: `c2-float-button` (the FAB, optionally the speed-dial owner) and `c2-float-button-action` (one mini button with a label chip). With no actions, `c2-float-button` is a plain FAB whose `click` the app handles.
2. Speed-dial semantics: the trigger is a native `<button>` with `aria-haspopup="menu"`, `aria-expanded` and `aria-controls` pointing at a `role="menu"` container in the same shadow root; each action's host is a `menuitem` set through `ElementInternals`, with a roving `tabindex`.
3. Behaviour as attributes: `open` (reflected), `direction` (`up` | `down` | `left` | `right`, default `up`), `trigger` (`click` | `hover`), `disabled`, `label`.
4. Looks as CSS only: position (fixed by default, `inset` bottom-right 24px), size, colours, radius, shadow, the open-icon rotation, the label chip and its side. The "extended" FAB (icon + visible text) is `--c2-float-button__label--display: inline`, not an attribute: the label is rendered either way, and a circle becomes a pill because the button's width is its padding plus content.
5. Keyboard: Enter/Space on the trigger opens and focuses the first action; the arrow key pointing away from the button (ArrowUp for `up`, ArrowLeft for `left`, …) moves to the next action and the opposite one moves back, past the first action to the button; a horizontal dial also takes ArrowDown/ArrowUp. Home/End; Escape closes and returns focus; Tab out or a click outside closes. Actions carry `tabindex="-1"`, so Tab never stops on them.
6. No host attribute written except the reflected `open`; nothing written on the light-DOM actions. Stagger, label side and hidden state are applied from the owner's shadow styles through `::slotted()` and inherited private custom properties.
7. Localisable built-in text (the trigger's fallback name).

Non-goals: a backdrop scrim (an app can place a `c2-modal`-style scrim itself), badges on the FAB (compose `c2-badge` in the `icon` slot), circle/quarter-circle layouts, back-to-top behaviour.

## Anatomy

```
                 ┌──────────────┐  ┌────┐
   label chip →  │ Upload file  │  │ ⬆  │ ← c2-float-button-action (40px, surface)
                 └──────────────┘  └────┘
                 ┌──────────────┐  ┌────┐
                 │   New note   │  │ ✎  │
                 └──────────────┘  └────┘
                                 ┌────────┐
                                 │   ＋   │ ← c2-float-button (56px, primary); + turns to ×
                                 └────────┘
```

## Usage

```html
<!-- plain FAB -->
<c2-float-button label="Compose"><c2-feather-edit-2 slot="icon"></c2-feather-edit-2></c2-float-button>

<!-- speed dial -->
<c2-float-button label="Create">
  <c2-float-button-action label="Upload file" value="upload"><c2-feather-upload></c2-feather-upload></c2-float-button-action>
  <c2-float-button-action label="New note" value="note"><c2-feather-file-text></c2-feather-file-text></c2-float-button-action>
</c2-float-button>

<!-- extended FAB -->
<c2-float-button label="New chat" class="extended"></c2-float-button>
<style>
  .extended {
    --c2-float-button__label--display: inline;
  }
</style>
```

```js
fab.addEventListener('action-select', (e) => router.go(e.detail.value))
fab.addEventListener('toggle', (e) => console.log(e.newState))
```

## API

### `c2-float-button`

| Attribute   | Type                                | Default | Notes                                                                       |
| ----------- | ----------------------------------- | ------- | --------------------------------------------------------------------------- |
| `label`     | string                              | `''`    | Accessible name; also the visible text of an extended FAB.                  |
| `open`      | boolean, reflected                  | `false` | Speed dial expanded. Ignored without actions.                               |
| `direction` | `up` \| `down` \| `left` \| `right` | `up`    | Where the actions fan out.                                                  |
| `trigger`   | `click` \| `hover`                  | `click` | `hover` also opens on pointer enter and closes on leave; click still works. |
| `disabled`  | boolean, reflected                  | `false` |                                                                             |

Slots: `icon` (default: a plus that turns 45° when open), `open-icon` (shown instead while open), default (the `c2-float-button-action` children).

Events: `toggle` (`ToggleEvent`, `newState` `open`/`closed`), `action-select` (`CustomEvent<{ value: string; action: FloatButtonAction }>`, cancelable — `preventDefault()` keeps the dial open). A plain FAB just fires the native `click`.

CSS variables (`--c2-float-button…`): `--position`, `--inset`, `--z-index`; `__button--{size,padding-inline,gap,border-radius,background-color,color,box-shadow}`, `__button__hover--{background-color,box-shadow}`, `__focus--{outline,outline-offset}`, `__disabled--opacity`; `__icon--size`, `__icon__open--transform`; `__label--{display,font-size,font-weight}`; `__actions--gap`, `__actions--offset`; `--transition-duration`, `__actions--stagger`.

### `c2-float-button-action`

| Attribute  | Type    | Default | Notes                                    |
| ---------- | ------- | ------- | ---------------------------------------- |
| `label`    | string  | `''`    | Accessible name and the label chip text. |
| `value`    | string  | `''`    | Reported in `action-select`.             |
| `disabled` | boolean | `false` | Skipped by the arrow keys, never fires.  |

Slot: default (the icon). CSS variables (`--c2-float-button-action…`): `__button--{size,border-radius,background-color,color,box-shadow}`, `__button__hover--background-color`, `__focus--outline`, `__icon--size`, `__label--{display,background-color,color,font-size,font-weight,padding,border-radius,box-shadow,inset,transform}`.

## Design decisions

- **Actions centre on the FAB.** The action host is only its round button; the label chip is absolutely positioned beside it. The actions container is exactly as wide (or tall) as the FAB, so mini buttons line up on its axis whatever the label length, in every direction.
- **Label side follows the direction.** For `up`/`down` the chip sits at the inline start (left of a bottom-right FAB); for `left`/`right` above the button. The owner sets this through inherited private properties on `::slotted()`; an author's `--c2-float-button-action__label--inset` on the action still wins (outer cascade context), which is how a bottom-left FAB puts the chips on the right.
- **Horizontal dials show one chip at a time.** Mini buttons 12px apart leave no room for side-by-side labels, so a `left`/`right` dial shows the chip of the hovered or focused action only (Material's horizontal speed dial does the same with tooltips).
- **Actions may be wrapped.** A framework can put each child in a wrapper element (Astro islands, `display: contents` component roots), so actions are found among descendants that no nested float button owns, and their open animation runs inside each action from inherited private properties rather than from `::slotted()` rules, which would land on the wrapper.
- **Hidden actions are unreachable.** While closed the container is `visibility: hidden` and `inert`; visibility inherits through the flat tree, so slotted actions leave the tab order and the accessibility tree without the owner touching them.
- **Stagger without writing on children.** `::slotted(:nth-child(n))` sets an inherited delay property for the first eight actions.
- **Motion.** Durations read `--c2-theme--motion-scale` through the shared animation helpers; `prefers-reduced-motion` drops the transforms.

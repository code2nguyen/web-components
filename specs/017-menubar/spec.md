# Feature: `c2-menubar` — desktop-style File / Edit / View menus

**Status**: Implemented (`packages/components/menubar`)
**Roadmap**: #61, section D, P2
**Research**: [research.md](./research.md)
**Mock**: [c2-menubar mock](https://claude.ai/artifact/NyfGoAa6vRShtwFJMLtjQi)
**Related**: `c2-menu` / `c2-menu-item` (everything inside a menu), `c2-split-button` (same re-slotting technique), `c2-navigation-menu` (site navigation, not commands).

## Goals

1. A bar of menus with one Tab stop and the WAI-ARIA menubar keyboard contract, including moving the open menu with ArrowLeft/Right from inside a menu and with the pointer once a menu is open.
2. Each menu is a `c2-menu` unchanged in behaviour: every row type, submenus, `menu-select`.
3. Looks are CSS: the bar's frame (`--c2-menubar--*`) and the triggers (`--c2-menubar-menu__trigger--*`, `__hover`, `__open`, `__focus`, `__disabled`), mapped to theme tokens.
4. Nothing written on either host; server-renders.

Non-goals: Alt-key mnemonics, a hover-only open mode, collapsing into a hamburger on narrow screens (roadmap #62 `c2-overflow-list`).

## Usage

```html
<c2-menubar aria-label="Editor">
  <strong slot="start">Notes</strong>
  <c2-menubar-menu label="File">
    <c2-menu-item value="new">New file<span slot="shortcut">⌘N</span></c2-menu-item>
    <c2-menu-item value="recent">
      Open recent
      <c2-menu slot="submenu">
        <c2-menu-item value="report">report.md</c2-menu-item>
      </c2-menu>
    </c2-menu-item>
    <hr />
    <c2-menu-item value="close">Close</c2-menu-item>
  </c2-menubar-menu>
  <c2-menubar-menu label="View">
    <c2-menu-item type="checkbox" value="ruler" checked keep-open>Show ruler</c2-menu-item>
  </c2-menubar-menu>
  <span slot="end">Saved</span>
</c2-menubar>
```

```js
menubar.addEventListener('menu-select', (e) => run(e.detail.value))
```

## Anatomy

```
c2-menubar (flex, wraps)
├─ <slot name="start">
├─ <div part="menus" role="menubar" aria-label>
│   └─ <slot>  ← c2-menubar-menu (host role none, via ElementInternals)
│        └─ shadow: <c2-menu>
│              ├─ <button slot="trigger" part="trigger" role="menuitem" tabindex=0|-1>label</button>
│              └─ <slot>  ← the author's rows
└─ <slot name="end">
```

## API

`c2-menubar`: `aria-label`; `menus`, `openMenu`, `close()`, `focus()`; slots default/`start`/`end`; part `menus`; event `menu-select` (bubbles from rows).

`c2-menubar-menu`: `label`, `open`, `disabled`, `placement` (`bottom-start`), `menu-label`; `show(focus)`, `hide()`, `focus()`; part `trigger`; events `menu-select`, `toggle`.

## Behaviour notes

- Roving tab stop: every trigger starts as a tab stop (works before upgrade and under SSR); the bar keeps one once it runs, following focus.
- Switching menus hides the open one, then opens the next with the requested focus (`first` from the keyboard inside a menu, `trigger` from a trigger or the pointer). Focus is applied on the new menu's `toggle`, after the old menu has handed focus back to its own trigger.
- A framework wrapper around each menu (an Astro island) is unwrapped, as `c2-menu` does for its rows.

## Tests

`packages/components/menubar/test/menubar.spec.ts`: semantics and one Tab stop with axe; arrows/Home/End/typeahead skipping disabled menus; opening keys and Escape; ArrowLeft/Right inside menus; submenu ArrowLeft/ArrowRight; click, hover switch and second click; `menu-select`; disabled; RTL; `start`/`end` outside the role; wrapped menus.

# @c2n/theme-select

Colour-theme switcher built with Lit: the trigger shows the icon of the mode in effect, clicking it steps to the next one, and from three modes up hovering it opens a menu to pick any mode directly.

```bash
npm install @c2n/theme-select
```

```html
<script type="module">
  import '@c2n/theme-select'
</script>

<!-- system → light → dark, applied to <html> and remembered -->
<c2-theme-select></c2-theme-select>

<!-- a plain light/dark toggle: two modes, so no menu -->
<c2-theme-select modes="light,dark" show-label></c2-theme-select>
```

- **Modes**: `modes="system,light,dark"` (comma- or semicolon-separated) or, from script, `{ value, label, scheme }` objects so a mode can carry its own name and still resolve to `light` or `dark`. `value` is the mode in effect; `select(value)` and `next()` change it from code.
- **Click**: advances to the next mode and wraps around, whether or not the menu is open.
- **Menu**: shown on hover, on focus with <kbd>↓</kbd>/<kbd>↑</kbd>, from three modes up — `menu="always"` forces it, `menu="never"` withholds it. It is a `role="menu"` of `menuitemradio` rows on the top layer (positioned by `@c2n/overlay`, so it is never clipped), with Arrow/Home/End navigation, Enter to pick and Escape to close. `open-delay` / `close-delay` tune the hover, `placement` the side.
- **Applying**: by default the resolved scheme is written to `data-theme` on `<html>` — the attribute `@c2n/theme` reads for dark mode. `target` points it at another element instead, `theme-attribute` renames the attribute, and `manual` turns all of it off so the host applies the theme itself from the event.
- **Persistence**: the chosen mode is saved in `localStorage` under `storage-key` (`c2n-theme` by default, empty to disable) and restored on the next load. While `system` is selected the OS `prefers-color-scheme` is followed live, and a change in another tab is picked up through the `storage` event.
- **Event**: `theme-change` carries `{ value, theme }` — the mode and the scheme it resolves to. It fires when a mode is picked and when the OS preference moves while `system` is selected, since that changes the scheme in effect without changing the mode. It does not bubble, so listen on the element; assigning `value` from script is silent.
- **Icons**: every mode shows its icon in the trigger and in its own menu row. `system-icon`, `light-icon` and `dark-icon` replace the built-in monitor/sun/moon, and a custom mode takes its icon from `<value>-icon`; `check` replaces the mark on the selected row.

Theme the trigger (`--c2-theme-select__trigger--*`: size, padding, radius, border, background, hover/active/open fills, focus ring), the icons (`--c2-theme-select__icon--size`), the dropdown (`--c2-theme-select__menu--*`) and its rows (`--c2-theme-select__menu-item--*`, `--c2-theme-select__check--*`). The full list is in `custom-elements.json` and on the docs site.

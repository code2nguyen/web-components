# Floating Panel

`c2-floating-panel` is a window inside the page that the user drags, resizes, minimises and maximises: a support chat, an
inspector beside a canvas, a tool palette, a call's mini window. It is not modal; the page around it stays usable.

It ships in the single `@c2n/components` package.

```bash
npm install @c2n/components
```

```js
import '@c2n/components/floating-panel'
```

```html
<c2-floating-panel open storage-key="support-chat">
  <svg slot="icon" viewBox="0 0 16 16">…</svg>
  <span slot="title">Support chat</span>
  <p>How can we help?</p>
  <div slot="footer">…</div>
</c2-floating-panel>
```

## Place and size

- CSS sets where the panel first appears and how big it is: `--c2-floating-panel--inset` (`auto 24px 24px auto`, the
  bottom-right corner), `--width` (360px), `--height` (`auto`), `--min-width`, `--min-height`, `--max-width` and
  `--max-height`.
- Once the user moves or resizes it, `rect` (`{ x, y, width, height }` in boundary pixels) holds the result. Set it, as
  a JSON attribute or a property, to restore a place; `null` is the CSS place.
- `storage-key` keeps `rect` and `state` in `localStorage` and restores them after the first render, so a
  server-rendered page hydrates at the CSS place.
- `boundary="viewport"` (the default) keeps the panel inside the window with `position: fixed`; `boundary="parent"`
  keeps it inside its nearest positioned ancestor with `position: absolute`. The panel is pulled back inside when the
  boundary or the window shrinks (`rect-change` with `reason: "boundary"`).

## Attributes

| Attribute                                                        | Description                                                                                      |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `open`                                                           | Shows the panel. `show()` also moves focus into it.                                              |
| `state`                                                          | `normal`, `minimized` or `maximized`.                                                            |
| `boundary`                                                       | `viewport` or `parent`.                                                                          |
| `rect`                                                           | The user's place and size, JSON.                                                                 |
| `storage-key`                                                    | Keeps `rect` and `state` in `localStorage`.                                                      |
| `minimize`                                                       | `dock` (to the bottom edge, lined up from the right) or `collapse` (to the title bar, in place). |
| `label`                                                          | The accessible name, and the title when the `title` slot is empty.                               |
| `no-drag`, `no-resize`, `no-minimize`, `no-maximize`, `no-close` | Opt-outs.                                                                                        |

Methods: `show()`, `close()`, `minimize()`, `maximize()`, `restore()`, `bringToFront()`, `moveTo(x, y)`,
`resizeTo(width, height)` and `resetRect()`.

Events (none bubble): `open`, `before-close` (cancelable), `close`, `state-change` (`{ state, previous }`) and
`rect-change` (`{ rect, reason }`).

Slots: `title`, `icon`, `actions` (extra title-bar buttons), the default slot (the body, which scrolls) and `footer`.

## Interaction

- Drag the title bar to move the panel; a double-click maximises and restores it. Drag an edge or a corner to resize it.
- The title bar is a focusable handle: the Arrow keys move the panel by 10px (Shift: 50px), Home puts it back at its CSS
  place. The corner grip resizes it the same way. Escape restores a maximised panel and never closes it.
- A press or focus brings a panel to the front of the other panels in its boundary, from `--c2-floating-panel--z-index`
  (100) up.
- Moves, resizes and state changes are announced in a polite live region.

## Styling

The host is `display: contents` and the component writes nothing on it. Style its state with the custom states
`:state(active)` (the front panel), `:state(minimized)`, `:state(maximized)` and `:state(dragging)` (a drag or a resize
in progress), and its look with the `--c2-floating-panel…` variables listed on the API page: the box (`--background`,
`--border`, `--border-radius`, `--box-shadow`, `__inactive--box-shadow`), the title bar (`__header--*`, `__title--*`,
`__icon--*`), the window buttons (`__button--*`, `__close-button__hover--*`), the body and footer, the grip, the docked
bar (`__docked--inset`, `--width`, `--gap`) and `__maximized--inset`.

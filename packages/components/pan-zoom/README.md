# Pan Zoom

`c2-pan-zoom` is a viewport that pans and zooms whatever is slotted in it: an image, an SVG diagram, a floor plan, a
board. It ships in the single `@c2n/components` package.

```bash
npm install @c2n/components
```

```js
import '@c2n/components/pan-zoom'
```

```html
<c2-pan-zoom label="Office floor plan, level 3" controls minimap max-zoom="6">
  <img src="floor-plan.svg" alt="" width="1600" height="1000" />
</c2-pan-zoom>
```

The content is laid out at its natural size, so give it one (`width` and `height` on an `<img>` or `<svg>`, or a sized
box). The host takes its container's width and `--c2-pan-zoom--height` (400px).

## Attributes

| Attribute              | Default       | Meaning                                                                                                                                                                                               |
| ---------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `zoom`                 | —             | The current zoom (1 = 100%). Setting it zooms around the centre, without an event.                                                                                                                    |
| `view`                 | —             | `{"x":…,"y":…,"zoom":…}` (JSON): the content point at the top-left corner and the zoom. No event, no jump.                                                                                            |
| `min-zoom`, `max-zoom` | `0.25`, `4`   | Zoom limits. `min-zoom="fit"` stops zooming out at the fitted view.                                                                                                                                   |
| `zoom-step`            | `1.2`         | Factor of one button or key press.                                                                                                                                                                    |
| `fit` (`fitMode`)      | `contain`     | First view and `reset()`: `contain`, `cover`, `width` (starts at the top) or `none` (100%, centred).                                                                                                  |
| `bounds`               | `content`     | `content` keeps the content in view; `none` is a free canvas.                                                                                                                                         |
| `gestures`             | `cooperative` | `cooperative`: a plain wheel and one finger scroll the page, a hint shows. `pan`: the wheel and one finger pan. `zoom`: the wheel zooms to the pointer, one finger pans. `none`: no pointer gestures. |
| `controls`             | off           | Toolbar: zoom out, zoom percent (resets to 100%), zoom in, fit.                                                                                                                                       |
| `minimap`              | off           | Overview in the bottom-left corner while the content overflows.                                                                                                                                       |
| `no-inertia`           | off           | A released drag stops at once.                                                                                                                                                                        |
| `no-double-click-zoom` | off           | A double-click or double tap does not zoom.                                                                                                                                                           |
| `no-keyboard`          | off           | The viewport is not a tab stop and has no role.                                                                                                                                                       |
| `label`                | —             | Accessible name of the viewport.                                                                                                                                                                      |

A fitted view never zooms past 100%, so a small image stays sharp.

## Gestures and keys

A primary-button drag pans (not when it starts on a link, button, form control, `[contenteditable]`,
`[draggable="true"]`, `[data-pan-zoom="ignore"]`, or when a content listener called `preventDefault()` on its
`pointerdown`); Space + drag and a middle-button drag pan from anywhere, even from those. `gestures="none"` turns every
pointer gesture off, these included: only the toolbar, the minimap, the keys and the methods move the view. Ctrl/⌘ + wheel, a trackpad pinch and two fingers zoom
to the pointer, a double-click zooms in one step (Shift + double-click zooms out) and a released drag glides. With focus
on the viewport the arrows pan 48px (a quarter of the box with Shift), `+` / `=` and `-` zoom, `0` goes back to the
`fit` view and `1` to 100%; keys pressed inside the content are left to it. Focus moving to content out of view pans it
into view. Under `prefers-reduced-motion` nothing glides or eases.

## Methods

- `zoomIn()`, `zoomOut()`, `zoomTo(zoom, { origin?, animate? })` — `origin` is a viewport point.
- `fit(mode?)`, `reset()`.
- `panBy(dx, dy, { animate? })` — `dx`, `dy` are viewport CSS pixels (positive shows content further right and down).
- `centerOn({ x, y }, { zoom?, animate? })` — `x`, `y` are a content point, in the content's own pixels.
- `zoomToElement(element | rect, { padding?, maxZoom?, animate? })` frames the target: it fits it with `padding` round
  it, which can change the zoom (up to `maxZoom`).
- `reveal(element | rect, { padding?, animate? })` pans the least distance that brings the target into view and keeps
  the zoom.
- A rect passed to either is in content pixels.
- `toContentPoint(clientX, clientY)` — the content point under a pointer.

Calls made before the element can measure itself (hidden, not yet laid out) wait for its first measurement.

## Events

Neither bubbles.

- `view-change` — `{ x, y, zoom, reason }` once per frame while the view moves; `reason` is `gesture`, `wheel`,
  `keyboard`, `controls`, `fit`, `resize` or `api`.
- `view-settle` — the same detail once a move and its glide end. Save `view` here.

## Slots

- default: the content;
- `minimap`: custom minimap content, drawn at the content's aspect ratio (without it the minimap copies a single slotted
  `<img>`, `<svg>` or `<canvas>`, else draws a plain rectangle; it never clones custom elements);
- `controls`: extra buttons appended to the toolbar.

## Inside another component

A component that draws its own content (a mind map, a board) can put `c2-pan-zoom` in its shadow root with its items as
the pan-zoom's children there:

```html
<c2-pan-zoom gestures="pan" bounds="none" no-keyboard no-double-click-zoom>…items…</c2-pan-zoom>
```

`reveal(item)`, `zoomToElement(item)` and `centerOn(point)` take elements from that shadow root, and follow-focus
reads the deepest element of `composedPath()`. Mark items that handle their own drag with `data-pan-zoom="ignore"`, or
call `preventDefault()` on their `pointerdown`.

The shared view math (`zoomAround`, `fitRect`, `clampView`, `revealRect`, inertia and pinch trackers) is in
`@c2n/core/pan-zoom.js`.

## Styling

Every look is a CSS custom property: the box (`--c2-pan-zoom--height`, `--background`, `--border`, `--border-radius`),
the dot grid (`__grid--display: block`, `__grid--color`, `__grid--gap`), the cursors, the animation
(`--transition-duration`), the fit padding, the toolbar (`__controls--*`, `__button--*`), the minimap (`__minimap--*`,
`__minimap-frame--*`) and the hint (`__hint--*`, `__scrim--background`). The API page of the docs lists them all.

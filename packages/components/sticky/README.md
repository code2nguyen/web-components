# Sticky

Pins content to the top or bottom edge of its scroll container and reports when it is stuck, optionally sliding it out of view while the reader scrolls down.

`c2-sticky` ships in the single `@c2n/components` package.

```bash
npm install @c2n/components
```

```js
import '@c2n/components/sticky'
```

```html
<c2-sticky hide-on-scroll>
  <div class="toolbar">…</div>
</c2-sticky>
```

- `edge="top" | "bottom"` — the edge to stick to (default `top`).
- `hide-on-scroll` — slide out of view while scrolling down, back in on the way up or when focus moves inside.
- `:state(stuck)` / `:state(retracted)`, the `stuck` and `retracted` properties, and the non-bubbling `stuck-change` and `retract-change` events report the state.
- `--c2-sticky--offset`, `--c2-sticky--position` (`static` turns pinning off), `--c2-sticky__stuck--background`, `--c2-sticky__stuck--box-shadow` and `--c2-sticky__stuck--backdrop-filter` style it.

The behaviour lives in `StickyController` (`@c2n/core/controllers/sticky.js`), which `c2-header` uses for its `sticky` mode too.

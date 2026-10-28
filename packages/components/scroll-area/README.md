# Scroll Area

`c2-scroll-area` ships in the single `@c2n/components` package.

```bash
npm install @c2n/components
```

```js
import '@c2n/components/scroll-area'
```

```html
<c2-scroll-area label="Members" style="--c2-scroll-area--max-height: 240px">…</c2-scroll-area>
```

A scroll container with themed scrollbars and shadows on the edges with more content beyond them.

- Native scrolling; the scrollbar is themed with CSS (`scrollbar-width`, `scrollbar-color`, WebKit pseudo-elements), and its thumb can fade in on hover.
- Shadows (or a fade) on each edge with content beyond it; `scroll-edge` fires when a scroll reaches an edge.
- A named region with a tab stop; `viewport`, `scrollTo()` and `scrollToEdge()` for code.
- Themed through `--c2-scroll-area*` custom properties; see the API page of the docs site.

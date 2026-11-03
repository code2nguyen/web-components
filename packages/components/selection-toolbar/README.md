# Selection Toolbar

`c2-selection-toolbar` ships in the single `@c2n/components` package.

```bash
npm install @c2n/components
```

```js
import '@c2n/components/selection-toolbar'
```

```html
<c2-selection-toolbar>
  <article>…</article>
  <c2-button slot="toolbar" data-action="comment">Comment</c2-button>
</c2-selection-toolbar>
```

A toolbar over the text a reader selects in the wrapped content, like the selection bubbles of Notion and Medium.

- Shows once a selection is complete, above it (or below with `placement="bottom"`), in the top layer.
- Pressing a control keeps the selection; a control with `data-action` fires `selection-action` with the text.
- Alt+F10 moves focus into it, the arrow keys move between controls, Escape returns focus.
- Themed through `--c2-selection-toolbar*` custom properties; see the API page of the docs site.

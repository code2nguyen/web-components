# Action Bar

`c2-action-bar` ships in the single `@c2n/components` package.

```bash
npm install @c2n/components
```

```js
import '@c2n/components/action-bar'
```

A floating bar for the current selection: "3 selected", the bulk actions, and a clear button. Place it after the collection it acts on, in the same scroll container; it sticks to the bottom and floats over the content.

```html
<c2-action-bar count="3">
  <c2-button>Archive</c2-button>
  <c2-button>Delete</c2-button>
</c2-action-bar>
```

The app owns the selection: set `count` from it (the bar shows while it is above zero) and empty the selection on `clear`, which the clear button and Escape fire.

```js
bar.addEventListener('clear', () => table.clearSelection())
table.addEventListener('selection-change', (event) => (bar.count = event.detail.value.length))
```

The attributes, slots, events and CSS custom properties are listed on the API tab of the docs page and in `custom-elements.json`.

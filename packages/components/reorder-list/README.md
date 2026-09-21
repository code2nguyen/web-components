# Reorder List

Drag-and-drop collection for changing the order of consumer-owned items.

```html
<c2-reorder-list editable>
  <div>Backlog</div>
  <div>In progress</div>
  <div>Done</div>
  <div slot="placeholder">Drop here</div>
  <div slot="dragging-item">Moving item</div>
</c2-reorder-list>
```

The component assigns ordinary children to a dynamic numeric slot family. Style those consumer-owned children directly. Use `::part(item)` for their repeated placement wrappers, `::part(placeholder)` for the drop position and fallback, and `::part(dragging-item)` for the conditional drag preview.

# Image Compare

`c2-image-compare` ships in the single `@c2n/components` package.

```bash
npm install @c2n/components
```

```js
import '@c2n/components/image-compare'
```

A before/after slider: two layers on top of each other, the after layer cut at a divider the reader drags.

```html
<c2-image-compare before-label="Before" after-label="After">
  <img slot="before" src="old.jpg" alt="Kitchen before the renovation" width="1200" height="800" />
  <img slot="after" src="new.jpg" alt="Kitchen after the renovation" width="1200" height="800" />
</c2-image-compare>
```

- `before` and `after` slots take any element; the before layer sets the size.
- `position` (0–100, default 50) is the share of the before layer shown; `orientation="vertical"` stacks the layers.
- `hover` makes the divider follow the pointer without a press.
- `before-label` / `after-label` draw corner chips, cut with their layer by the divider.
- `input` fires while the divider moves and `change` once it settles; read `position`.
- The handle is a `slider` named by `label` or by the layers' alternative text; arrows move it 1%, Page Up/Down 10%, Home/End to the edges.

Style it through its `--c2-image-compare*` CSS variables; the docs list them on the API tab.

# Beam

`c2-beam` draws an animated line between two elements, for data-flow and integration diagrams. Place it in the positioned container that holds both elements and name them by `id`.

```bash
npm install @c2n/components
```

```js
import '@c2n/components/beam'
```

```html
<div style="position: relative; display: flex; justify-content: space-between">
  <div id="app">App</div>
  <div id="api">API</div>
  <c2-beam from="app" to="api" curvature="24"></c2-beam>
</div>
```

Attributes: `from`, `to`, `curvature` (pixels), `reverse`. Call `redraw()` after moving an element without resizing anything. Colours, thickness, the light's length and its timing are CSS variables.

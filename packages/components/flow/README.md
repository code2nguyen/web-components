# @c2n/flow

`c2-flow` draws a pipeline or dependency graph on a pannable, zoomable canvas: steps with a status, smooth edges, a
built-in auto layout, draggable nodes saved to `localStorage`, a hover card and a context menu.

```html
<c2-flow
  storage-key="pipeline:ci"
  nodes='[{"id":"build","label":"Build","status":"success"},{"id":"test","label":"Test","status":"running"}]'
  edges='[{"source":"build","target":"test"}]'
></c2-flow>
```

- **Data:** `nodes` (`id`, `label`, `status`, `description`, `meta`, `details`, `data`) and `edges` (`source`,
  `target`), as properties or JSON attributes. Statuses: `pending`, `current`, `running`, `success`, `warning`,
  `error`, `skipped`. Edges take their style from the statuses at both ends.
- **Layout:** layered auto layout along `direction` (`LR` or `TB`); cycles are allowed and drawn as back edges.
  Dragging (or Alt+arrow) makes a custom layout, saved with the direction under `storage-key`. A saved layout is
  merged into a changed graph: kept nodes stay, new ones are placed next to their neighbours. `getLayout()`,
  `setLayout()`, `resetLayout()`; `locked` turns dragging off.
- **Context menu:** right-click, long-press or Shift+F10 for zoom in / out, fit view, direction, auto layout and lock
  layout, plus **Show details** on a node. `renderContextMenu({ node, defaultItems })` replaces or extends the rows;
  added rows fire `flow-menu-select`. `no-context-menu` turns it off.
- **Hover card:** status, description and `details` of the hovered or focused node, after `open-delay`. `renderCard` or a
  `card:<id>` slot replaces it; `no-card` turns it off.
- **Custom nodes:** `renderNode(context)` returns a Lit template, a node or a string; or render into the `node:<id>` slot.
- **Events:** `node-click`, `selection-change`, `layout-change`, `flow-menu-select` (none bubble).
- **Keyboard:** arrows follow edges, Enter selects, Alt+arrow moves, Ctrl/⌘ + `+` / `-` zoom and Ctrl/⌘ + `0` fits while focus is in the flow. Ctrl/⌘ + wheel zooms.
- Theme it with the `--c2-flow--*` variables: canvas, dot grid, rank and node gaps, node box, edges, status colours and
  card.

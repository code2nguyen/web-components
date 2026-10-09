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

- **Data:** `nodes` (`id`, `label`, `status`, `description`, `meta`, `details`, `position`, `data`) and `edges` (`source`,
  `target`, `label`, `sourceSide`, `targetSide`), as properties or JSON attributes. Statuses: `pending`, `current`, `running`, `success`, `warning`,
  `error`, `skipped`. Edges take their style from the statuses at both ends.
- **Sides:** an edge runs from the outgoing side of the `direction` to the incoming one, unless it names a `sourceSide`
  or `targetSide` (`top`, `right`, `bottom`, `left`): it then leaves and arrives perpendicular to those sides, in
  either `edge-type`. A side left out keeps its default; the auto layout ignores sides.
- **Layout:** layered auto layout along `direction` (`LR` or `TB`); cycles are allowed and drawn as back edges.
  Dragging (or Alt+arrow) makes a custom layout, saved with the direction under `storage-key`. A saved layout is
  merged into a changed graph: kept nodes stay, new ones are placed next to their neighbours. `getLayout()`,
  `setLayout()`, `resetLayout()`; `locked` turns dragging off.
- **View:** fitting (first render, `fitView()`, a resize or new data before the user pans or zooms) scales the graph
  to the box, never above 100% nor below `fit-min-zoom` (default 0.25, held to 0.25–1). A flow too large at that
  zoom shows its start: the first rank at the left (`LR`) or top (`TB`) edge, centred across when it fits. Zooming by
  hand still goes from 25% to 200%.
- **Context menu:** right-click, long-press or Shift+F10 for zoom in / out, fit view, direction, auto layout and lock
  layout, plus **Show details** on a node. `renderContextMenu({ node, defaultItems })` replaces or extends the rows;
  added rows fire `flow-menu-select`. `no-context-menu` turns it off.
- **Hover card:** status, description and `details` of the hovered or focused node, after `open-delay`. `renderCard` or a
  `card:<id>` slot replaces it; `no-card` turns it off.
- **Custom nodes:** `renderNode(context)` returns a Lit template, a node or a string; or render into the `node:<id>` slot.
- **Editing:** `editable` lets the user draw the diagram, and the app applies each change (the flow never edits
  `nodes`/`edges` itself). Double-click empty canvas or press `N` → `node-add { position, source? }`; double-click a
  node, F2, or Enter on the selected node → inline editor → `node-edit { id, label }`; drag one of the four handles
  on a node's sides onto another node → `edge-add { source, target, sourceSide, targetSide }` (the target side is the
  handle dropped on, else the side nearest the pointer; no self-loops, no duplicates), onto empty canvas → `node-add`
  with `source`, `sourceSide` and `targetSide`; `C` then arrows/Tab and Enter connects from the keyboard, outgoing
  side to incoming side; Delete/Backspace → `node-delete { id }`, or
  `edge-delete { source, target }` for an edge selected by a click or `E`. Give the new node `position` to put it
  where the user asked; in an editable flow the other nodes never move when the graph changes. `editLabel(id)`
  opens the editor from script.
- **Events:** `node-click`, `selection-change`, `layout-change`, `flow-menu-select`, and in editable mode `node-add`,
  `node-edit`, `node-delete`, `edge-add`, `edge-delete` (none bubble).
- **Keyboard:** arrows follow edges, Enter selects, Alt+arrow moves, Ctrl/⌘ + `+` / `-` zoom and Ctrl/⌘ + `0` fits while focus is in the flow. Ctrl/⌘ + wheel zooms.
- Theme it with the `--c2-flow--*` variables: canvas, dot grid, rank and node gaps, node box, edges, status colours and
  card.

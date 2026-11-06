# Mind Map

`c2-mind-map` is an idea tree laid out around a central topic, with keyboard editing as in XMind and Miro. It ships in
the single `@c2n/components` package.

```bash
npm install @c2n/components
```

```js
import '@c2n/components/mind-map'
```

```html
<c2-mind-map
  label="Q3 launch plan"
  editable
  controls
  data='{"id":"root","label":"Q3 launch","children":[
    {"id":"mkt","label":"Marketing","children":[{"id":"ads","label":"Paid ads"},{"id":"seo","label":"SEO"}]},
    {"id":"eng","label":"Engineering","side":"left","children":[{"id":"api","label":"Public API"}]}]}'
></c2-mind-map>
```

## Data

`data` is one root node. A node is `{ id, label, children?, collapsed?, side?, color?, icon? }`; unknown fields are
kept, so an app can store its own data on a node.

- `side` (`left` or `right`) is read on first-level topics. Without it, `layout="both"` balances the sides by branch
  size.
- `collapsed` hides the subtopics of any topic but the central one, which cannot fold. Folding is saved with the map,
  because it is part of the document.
- A missing or repeated `id` is replaced by one made from the node's path (`topic-0-2`), the same on the server and in
  the browser.
- `color` on a first-level topic colours its whole branch. Without it, branches take the branch colours in turn.
- `icon` is an emoji or a short text drawn before the label. It is decorative, not part of the topic's name.

The map edits its own copy. Each edit fires a cancelable `before-change` (`preventDefault()` vetoes it), then makes a
new `data` object and fires `change` with `{ data, action }`, which is where the app saves it. Setting `data` again
replaces the map and clears the undo history.

`toOutline(node)`, `fromOutline(text)` and `parseOutline(text)` convert to and from an indented Markdown list, and
`layoutMindMap()` is the tidy-tree layout itself; all are exported from the package.

## Attributes

| Attribute  | Default | Meaning                                                                                               |
| ---------- | ------- | ----------------------------------------------------------------------------------------------------- |
| `data`     | —       | The map, as JSON (or the `data` property).                                                            |
| `label`    | —       | Accessible name of the map. Default: "Mind map".                                                      |
| `layout`   | `both`  | `both` puts branches on both sides; `left` and `right` on one side, as a logic chart.                 |
| `editable` | off     | The user adds, edits, moves and deletes topics. Navigation and folding work either way.               |
| `no-drag`  | off     | No drag to reparent: a drag on a topic pans, like a drag on the canvas.                               |
| `controls` | off     | The zoom toolbar of the canvas.                                                                       |
| `minimap`  | off     | An overview while the map overflows: one box per drawn topic (not folded ones), in its branch colour. |

## Keyboard

The map is one tab stop and an ARIA tree. Navigation works in read-only maps too:

- the arrows follow the drawing: on the right side → goes to the first subtopic (unfolding a folded topic) and ← to
  the parent, mirrored on the left; from the central topic → and ← go to the first branch on that side; ↑ and ↓ go to
  the previous and next sibling, then on to the nearest topic on the same level;
- Home goes to the central topic, Space folds and unfolds, Enter fires `node-click` in a read-only map;
- Ctrl/⌘ + `+`, `-` and `0` zoom and fit.

While `editable`:

- Tab or Insert adds a subtopic; Enter adds a sibling after it (a subtopic on the central topic), Shift+Enter one
  before. The new topic opens in the editor;
- F2 edits the label, and typing a character starts editing with it;
- Delete or Backspace removes the topic and its subtopics (focus moves to the previous sibling, else the parent);
- Alt+↑ and Alt+↓ reorder among siblings; Alt + the arrow toward the centre makes the topic a sibling of its parent,
  Alt + the arrow away from it makes it the last subtopic of its previous sibling;
- Ctrl/⌘+Z undoes and Ctrl/⌘+Shift+Z (or Ctrl+Y) redoes, up to 100 steps;
- copy puts the topic and its subtopics on the clipboard as an indented list, and pasting an indented list adds it
  as subtopics.

**Because Tab adds a subtopic, it does not leave an editable map.** Escape moves focus to the canvas, and from there Tab
leaves as usual; Insert is the alternative to Tab. Both are in the map's description.

In the editor, Enter commits, Shift+Enter adds a line break, Tab commits and adds a subtopic, Escape cancels and
leaving the field commits. A blank label is not saved.

## Pointer

A click selects a topic and a double-click edits it. The selected topic of an editable map shows a round "+" that adds
a subtopic, and a topic with subtopics shows a fold dot on its outer side, which counts the hidden topics while
folded. Dragging a topic onto another makes it that topic's last subtopic; onto the upper or lower edge of one, it goes
before or after it. A dashed line and a highlight show where it lands, and Escape cancels. A drag on empty canvas
pans, the wheel pans and Ctrl/⌘ + wheel zooms.

## Methods

`addChild(id?)`, `addSibling(id?, before?)` (both return the new id), `edit(id?)`, `removeTopic(id?)`, `select(id)`,
`fold(id?, folded?)`, `setColor(id?, color)`, `undo()`, `redo()` and `fit()`; `id` is the selected topic by default.
`setColor()` colours a whole branch: on a deeper topic it sets the colour of its first-level ancestor, and on the
central topic it does nothing.
`getNode(id)` and `selectedNode` read the map, and `panZoom` is the inner `c2-pan-zoom`, for `zoomTo()`, `centerOn()`
or `view-change`. (`removeTopic` is not called `remove` because `Element.remove()` takes the element out of the page.)

## Events

- `before-change` — `{ action }`, cancelable.
- `change` — `{ data, action }`. `action` is `{ type, node, parent, index }` (plus `from` for a move and `nodes` for a
  paste); `type` is `add`, `edit`, `delete`, `move`, `collapse`, `expand`, `color`, `paste`, `undo` or `redo`.
- `selection-change` — `{ node }` when the user selects another topic. Does not bubble.
- `node-click` — `{ node }` on a click, and on Enter in a read-only map.

A polite live region reads every edit: "Added a subtopic of Marketing", "Deleted Social media and 3 subtopics. Ctrl+Z
to undo", "Moved Paid ads into Growth", "Folded, 5 topics hidden".

## Server rendering

The server cannot measure text, so it renders the topics as an indented outline, with the same `treeitem` markup. The
browser lays the map out in its second render, so the first client render matches the server's.

## Styling

The main styling is done with CSS custom properties: the canvas (`--c2-mind-map--height` 480px, `--background`, `--border`, the dot
grid), the eight branch colours (`__branch-1--color` … `__branch-8--color`, the chart series colours), the central
topic (`__root--*`), first-level topics (`__topic--*`, with `__topic--tint` the share of the branch colour in their
background and `__topic--max-width` where labels wrap), deeper topics (`__subtopic--*`), the connectors
(`__connector--width`, `--taper`), the spacing (`__level--gap`, `__sibling--gap`), the states, the fold dot, the add
button and the editor. The zoom toolbar and the minimap take `c2-pan-zoom`'s own variables. The API page of the docs
lists them all.

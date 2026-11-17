# Shortcut

`@c2n/components/shortcut` provides `c2-shortcut`, a render-nothing element that holds every keyboard shortcut of an application
(or of one region) and turns each key press into an action.

```html
<script type="module">
  import '@c2n/components/shortcut'

  document.querySelector('c2-shortcut').addEventListener('shortcut', (event) => {
    if (event.detail.action === 'save') save()
  })
</script>

<c2-shortcut
  bindings='[
    { "keys": "mod+k, mod+/", "for": "open-search" },
    { "keys": "mod+s", "action": "save" },
    { "keys": "alt+g alt+d", "action": "go-dashboard" },
    { "keys": "escape", "action": "close", "scope": ".side-panel", "allowInInputs": true }
  ]'
></c2-shortcut>
```

`mod` is ⌘ on Apple platforms and Ctrl elsewhere; commas separate alternatives and spaces separate the strokes of a
sequence. Every key must hold Ctrl, ⌘ or Alt; only Escape and F1–F24 may be bound on their own, and those are ignored
while the user types in a field. `for` clicks (or, for a text field, focuses) the
element with that id. The parser, matcher and formatter live in `@c2n/core/shortcut-helper.js` for components that
need shortcuts without the element.

## Shortcut sheet

`@c2n/components/shortcut/shortcut-sheet` provides `c2-shortcut-sheet`, the "?" dialog that lists every binding with a
`description`, grouped by its `group`, with a search field. It loads its dialog the first time it opens.

```html
<c2-shortcut-sheet id="shortcut-sheet" keys="mod+/"></c2-shortcut-sheet> <c2-button commandfor="shortcut-sheet" command="--show">Keyboard shortcuts</c2-button>
```

# Visually Hidden

`@c2n/components/visually-hidden` provides `c2-visually-hidden`, content for screen readers only: it stays in the accessibility tree but takes no space and draws nothing.

```bash
npm install @c2n/components
```

```html
<script type="module">
  import '@c2n/components/visually-hidden'
</script>

<c2-icon-button><c2-feather-trash-2></c2-feather-trash-2><c2-visually-hidden>Delete invoice</c2-visually-hidden></c2-icon-button>

<h2><c2-visually-hidden>Filters</c2-visually-hidden></h2>

<c2-visually-hidden role="status" aria-live="polite">3 results</c2-visually-hidden>

<c2-visually-hidden focusable><a href="#comments">Skip to comments</a></c2-visually-hidden>
```

Add `focusable` to show the content while focus is inside it. The element has no CSS variables: its hiding rules are fixed, and revealed it applies no styles of its own.

A page rendered on the server paints before the module loads: hide `c2-visually-hidden:not(:defined)` with the same rules in the app's stylesheet so the text never flashes.
